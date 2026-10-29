<?php

namespace App\Jobs;

use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Models\Suppression;
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
        $campaign = $this->campaign->fresh();

        if (! in_array($campaign->status, ['draft', 'scheduled'], true)) {
            return;
        }

        $campaign->update(['status' => 'sending', 'started_at' => now()]);

        $field = $campaign->channel === 'email' ? 'email' : 'phone';
        $segments = $campaign->channel === 'sms'
            ? AdvantaSmsClient::segmentCount($campaign->body)
            : 1;

        $queued = 0;

        $campaign->audienceQuery()->chunkById(500, function ($attendees) use ($campaign, $field, $segments, &$queued) {
            $rows = [];

            foreach ($attendees as $attendee) {
                $destination = $campaign->channel === 'sms'
                    ? AdvantaSmsClient::normalise($attendee->{$field} ?? '')
                    : strtolower(trim($attendee->{$field} ?? ''));

                if (! $destination) {
                    continue;
                }

                if (Suppression::blocks($campaign->tenant_id, $campaign->channel, $destination)) {
                    continue;
                }

                $rows[] = [
                    'campaign_id' => $campaign->id,
                    'attendee_id' => $attendee->id,
                    'destination' => $destination,
                    'status' => 'queued',
                    'segments' => $segments,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            if ($rows !== []) {
                CampaignRecipient::insert($rows);
                $queued += count($rows);
            }
        });

        $campaign->update(['recipient_count' => $queued]);

        if ($queued === 0) {
            $campaign->update(['status' => 'sent', 'completed_at' => now()]);

            return;
        }

        // Chunked so one provider hiccup fails a batch of 100, not the whole send.
        $jobs = CampaignRecipient::where('campaign_id', $campaign->id)
            ->where('status', 'queued')
            ->pluck('id')
            ->chunk(100)
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
        $this->campaign->fresh()?->update(['status' => 'failed']);
    }
}
