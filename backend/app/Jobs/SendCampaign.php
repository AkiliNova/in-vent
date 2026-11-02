<?php

namespace App\Jobs;

use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Services\CampaignAudience;
use App\Services\Sms\AdvantaSmsClient;
use Illuminate\Bus\Batchable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Bus;

/**
 * Fans a campaign out into per-recipient rows, then dispatches batched send
 * jobs. The old flow posted every number in one browser request and reported
 * whatever came back; this records each recipient so delivery is reconcilable.
 */
class SendCampaign implements ShouldQueue
{
    use Batchable, Queueable;

    public int $timeout = 600;

    public function __construct(public Campaign $campaign) {}

    public function handle(): void
    {
        // Claim the campaign atomically: a double-clicked Send, or the
        // scheduler firing while a send is queued, must not deliver twice.
        $claimed = Campaign::withoutGlobalScope('tenant')
            ->whereKey($this->campaign->id)
            ->whereIn('status', ['draft', 'scheduled', 'queued'])
            ->update(['status' => 'sending', 'started_at' => now()]);

        if ($claimed === 0) {
            return;
        }

        $campaign = Campaign::withoutGlobalScope('tenant')->find($this->campaign->id);

        $segments = $campaign->channel === 'sms'
            ? AdvantaSmsClient::segmentCount($campaign->body)
            : 1;

        $queued = 0;
        $rows = [];
        $flush = function () use (&$rows, &$queued) {
            if ($rows !== []) {
                CampaignRecipient::insert($rows);
                $queued += count($rows);
                $rows = [];
            }
        };

        foreach (CampaignAudience::each($campaign) as $person) {
            $rows[] = [
                'campaign_id' => $campaign->id,
                'attendee_id' => $person['attendee_id'],
                'destination' => $person['destination'],
                'first_name' => $person['first_name'],
                'last_name' => $person['last_name'],
                'status' => 'queued',
                'segments' => $segments,
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if (count($rows) >= 500) {
                $flush();
            }
        }

        $flush();

        $campaign->update(['recipient_count' => $queued]);

        if ($queued === 0) {
            $campaign->update(['status' => 'sent', 'completed_at' => now()]);

            return;
        }

        // Chunked so one provider hiccup fails a small batch, not the whole
        // send. Email chunks are small because they are paced to the mail
        // provider's rate limit and must finish well inside the worker timeout.
        $jobs = CampaignRecipient::where('campaign_id', $campaign->id)
            ->where('status', 'queued')
            ->pluck('id')
            ->chunk($campaign->channel === 'email' ? 25 : 100)
            ->map(fn ($ids) => new DeliverCampaignChunk($campaign->id, $ids->all()))
            ->all();

        Bus::batch($jobs)
            ->name("campaign:{$campaign->id}")
            ->allowFailures()
            ->finally(function () use ($campaign) {
                $campaign->fresh()?->update([
                    'status' => 'sent',
                    'completed_at' => now(),
                    'sent_count' => CampaignRecipient::where('campaign_id', $campaign->id)
                        ->whereIn('status', ['sent', 'delivered'])->count(),
                    'failed_count' => CampaignRecipient::where('campaign_id', $campaign->id)
                        ->whereIn('status', ['failed', 'bounced'])->count(),
                ]);
            })
            ->dispatch();
    }

    public function failed(\Throwable $e): void
    {
        Campaign::withoutGlobalScope('tenant')->find($this->campaign->id)?->update(['status' => 'failed']);
    }
}
