<?php

namespace App\Jobs;

use App\Mail\CampaignMail;
use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Services\Sms\AdvantaSmsClient;
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
        $client = new AdvantaSmsClient($campaign->tenant_id);

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
        foreach ($recipients as $recipient) {
            try {
                Mail::to($recipient->destination)->send(new CampaignMail(
                    subject: $this->personalise($campaign->subject ?? $campaign->name, $recipient),
                    body: $this->personalise($campaign->body, $recipient),
                    imagePath: $campaign->image_path,
                ));

                $recipient->update(['status' => 'sent', 'sent_at' => now()]);
            } catch (\Throwable $e) {
                Log::error('Campaign email failed', [
                    'recipient' => $recipient->id,
                    'error' => $e->getMessage(),
                ]);

                $recipient->update(['status' => 'failed', 'error' => 'Delivery failed']);
            }
        }
    }

    protected function personalise(string $text, CampaignRecipient $recipient): string
    {
        $attendee = $recipient->attendee;

        return strtr($text, [
            '{{first_name}}' => $attendee?->first_name ?? 'there',
            '{{last_name}}' => $attendee?->last_name ?? '',
            '{{name}}' => $attendee?->full_name ?? 'there',
            '{{company}}' => $attendee?->company ?? '',
            '{{category}}' => $attendee?->category ?? '',
        ]);
    }
}
