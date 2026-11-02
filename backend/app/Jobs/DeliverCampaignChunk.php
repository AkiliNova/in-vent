<?php

namespace App\Jobs;

use App\Mail\CampaignMail;
use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Models\MessageLog;
use App\Services\Sms\Sms;
use Illuminate\Bus\Batchable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/** Delivers up to 100 recipients of one campaign. */
class DeliverCampaignChunk implements ShouldQueue
{
    use Batchable, Queueable;

    public int $tries = 3;

    public array $backoff = [30, 120];

    /** @param array<int,int> $recipientIds */
    public function __construct(public int $campaignId, public array $recipientIds) {}

    public function handle(): void
    {
        if ($this->batch()?->cancelled()) {
            return;
        }

        $campaign = Campaign::withoutGlobalScope('tenant')->find($this->campaignId);

        if (! $campaign) {
            return;
        }

        $recipients = CampaignRecipient::with('attendee')
            ->whereIn('id', $this->recipientIds)
            ->where('status', 'queued')
            ->get();

        if ($recipients->isEmpty()) {
            return;
        }

        $campaign->channel === 'sms'
            ? $this->sendSms($campaign, $recipients)
            : $this->sendEmail($campaign, $recipients);
    }

    protected function sendSms(Campaign $campaign, $recipients): void
    {
        $client = Sms::client($campaign->tenant_id)->about('campaign', 'campaign', $campaign->id);

        // Personalise per recipient, so each goes out as its own request.
        foreach ($recipients as $recipient) {
            $body = $this->personalise($campaign->body, $recipient);

            $outcome = $client->send([$recipient->destination], $body);

            $recipient->update($outcome['sent'] > 0
                ? [
                    'status' => 'sent',
                    'sent_at' => now(),
                    'provider_reference' => data_get($outcome, 'results.0.reference'),
                ]
                : [
                    'status' => 'failed',
                    'error' => data_get($outcome, 'failed.0.error', 'Delivery failed'),
                ]);
        }
    }

    protected function sendEmail(Campaign $campaign, $recipients): void
    {
        $campaign->loadMissing('featuredEvent', 'tenant');

        foreach ($recipients as $i => $recipient) {
            // Resend allows ~2 requests a second; stay under it.
            if ($i > 0) {
                usleep(600_000);
            }

            try {
                Mail::to($recipient->destination)->send(CampaignMail::forCampaign(
                    $campaign,
                    subjectLine: $this->personalise($campaign->subject ?? $campaign->name, $recipient),
                    body: $this->personalise($campaign->body, $recipient),
                    unsubscribeUrl: CampaignMail::unsubscribeUrl($recipient),
                ));

                $recipient->update(['status' => 'sent', 'sent_at' => now()]);
            } catch (\Throwable $e) {
                Log::error('Campaign email failed', [
                    'recipient' => $recipient->id,
                    'error' => $e->getMessage(),
                ]);

                $recipient->update(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 500)]);

                MessageLog::record([
                    'tenant_id' => $campaign->tenant_id, 'channel' => 'email', 'type' => 'campaign',
                    'to' => $recipient->destination, 'subject' => $campaign->subject ?? $campaign->name, 'status' => 'failed',
                    'error' => $e->getMessage(), 'related_type' => 'campaign', 'related_id' => $campaign->id,
                ]);
            }
        }
    }

    protected function personalise(string $text, CampaignRecipient $recipient): string
    {
        $attendee = $recipient->attendee;
        $first = $recipient->first_name ?: $attendee?->first_name;
        $last = $recipient->last_name ?: $attendee?->last_name;

        return strtr($text, [
            '{{first_name}}' => $first ?: 'there',
            '{{last_name}}' => $last ?? '',
            '{{name}}' => trim($first.' '.$last) ?: 'there',
            '{{company}}' => $attendee?->company ?? '',
            '{{category}}' => $attendee?->category ?? '',
        ]);
    }
}
