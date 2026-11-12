<?php

namespace App\Jobs;

use App\Mail\CampaignMail;
use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Models\MessageLog;
use App\Services\Sms\Sms;
use App\Services\Sms\SmsMessage;
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
        foreach ($recipients as $i => $recipient) {
            $body = $this->personalise($campaign->body, $recipient);

            $outcome = $client->send([$recipient->destination], $body);

            $recipient->update($outcome['sent'] > 0
                ? [
                    'status' => 'sent',
                    'sent_at' => now(),
                    'provider_reference' => data_get($outcome, 'results.0.reference'),
                    'cost' => $this->amount(data_get($outcome, 'results.0.cost')),
                ]
                : [
                    'status' => 'failed',
                    'error' => data_get($outcome, 'failed.0.error', 'Delivery failed'),
                ]);

            // Out of credit: every further request would fail the same way.
            if (data_get($outcome, 'failed.0.code') === 'InsufficientBalance') {
                // The whole campaign, not just this chunk: the batch is
                // cancelled, so other chunks won't get to theirs.
                CampaignRecipient::where('campaign_id', $campaign->id)
                    ->where('status', 'queued')
                    ->update(['status' => 'failed', 'error' => 'InsufficientBalance', 'updated_at' => now()]);

                $this->batch()?->cancel();

                Log::warning('Campaign stopped: SMS balance exhausted', ['campaign' => $campaign->id]);

                return;
            }
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
                    phoneUrl: $campaign->ask_phone ? CampaignMail::phoneUrl($recipient) : null,
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

        // Same fill as the credit estimate, so the count matches what's billed.
        return SmsMessage::personalise(
            $text,
            $recipient->first_name ?: $attendee?->first_name,
            $recipient->last_name ?: $attendee?->last_name,
            $attendee?->company,
            $attendee?->category,
        );
    }

    /** "KES 0.8000" → 0.8 */
    protected function amount(mixed $cost): float
    {
        return preg_match('/(-?[\d.]+)/', (string) $cost, $m) ? (float) $m[1] : 0.0;
    }
}
