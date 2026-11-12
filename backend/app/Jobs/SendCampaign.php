<?php

namespace App\Jobs;

use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Services\CampaignAudience;
use App\Services\Sms\AfricasTalkingSmsClient;
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

        $sms = $campaign->channel === 'sms';
        $queued = 0;
        $rows = [];
        $flush = function () use (&$rows) {
            if ($rows !== []) {
                CampaignRecipient::insert($rows);
                $rows = [];
            }
        };

        // The sender's confirmation copies go in first, so they're sent first.
        foreach (CampaignAudience::monitors($campaign) as $m) {
            $rows[] = [
                'campaign_id' => $campaign->id,
                'attendee_id' => null,
                'is_monitor' => true,
                'destination' => $m['destination'],
                'first_name' => $m['first_name'],
                'last_name' => $m['last_name'],
                'status' => 'queued',
                'error' => null,
                'segments' => min(255, max(1, $m['segments'])),
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }
        $flush();

        foreach (CampaignAudience::scan($campaign) as $person) {
            $send = $person['state'] === 'ok';

            // SMS numbers we know can't receive are kept on the report as
            // "skipped" with the reason, so the organiser can fix their list.
            // Duplicates, opt-outs and blanks are just noise there.
            if (! $send && ! ($sms && in_array($person['state'], ['invalid', 'unsupported', 'blocked'], true))) {
                continue;
            }

            $rows[] = [
                'campaign_id' => $campaign->id,
                'attendee_id' => $person['attendee_id'],
                'is_monitor' => false,
                'destination' => mb_substr((string) ($person['destination'] ?? $person['raw']), 0, 255),
                'first_name' => $person['first_name'],
                'last_name' => $person['last_name'],
                'status' => $send ? 'queued' : 'skipped',
                'error' => $send ? null : $person['reason'],
                'segments' => $send ? min(255, max(1, $person['segments'])) : 0,
                'created_at' => now(),
                'updated_at' => now(),
            ];

            $queued += $send ? 1 : 0;

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
        // Confirmation copies get a chunk of their own at the front, so the
        // sender's phone buzzes within seconds, whatever the audience size.
        $queuedIds = fn (bool $monitor) => CampaignRecipient::where('campaign_id', $campaign->id)
            ->where('status', 'queued')->where('is_monitor', $monitor)->orderBy('id')->pluck('id');

        $jobs = collect([$queuedIds(true)])
            ->filter(fn ($ids) => $ids->isNotEmpty())
            ->merge($queuedIds(false)->chunk($campaign->channel === 'email' ? 25 : 100))
            ->map(fn ($ids) => new DeliverCampaignChunk($campaign->id, $ids->values()->all()))
            ->values()
            ->all();

        Bus::batch($jobs)
            ->name("campaign:{$campaign->id}")
            ->allowFailures()
            ->finally(function () use ($campaign) {
                AfricasTalkingSmsClient::forgetBalance();

                $campaign->fresh()?->update([
                    'status' => 'sent',
                    'completed_at' => now(),
                    // Audience only: the sender's own copies are reported separately.
                    'sent_count' => CampaignRecipient::where('campaign_id', $campaign->id)->where('is_monitor', false)
                        ->whereIn('status', ['sent', 'delivered'])->count(),
                    'failed_count' => CampaignRecipient::where('campaign_id', $campaign->id)->where('is_monitor', false)
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
