<?php

namespace App\Listeners;

use App\Mail\CampaignMail;
use App\Mail\PayoutMail;
use App\Mail\TicketConfirmation;
use App\Models\MessageLog;
use Illuminate\Mail\Events\MessageSent;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\Part\DataPart;

/** Records every email Laravel hands to the mail server, with its rendered HTML. */
class LogSentEmail
{
    public function handle(MessageSent $event): void
    {
        $message = $event->sent->getOriginalMessage();

        if (! $message instanceof Email) {
            return;
        }

        $data = $event->data;
        [$type, $tenantId, $relatedType, $relatedId] = self::describe($data);

        foreach ($message->getTo() as $to) {
            MessageLog::record([
                'tenant_id' => $tenantId,
                'channel' => 'email',
                'type' => $type,
                'to' => $to instanceof Address ? $to->getAddress() : (string) $to,
                'subject' => $message->getSubject(),
                'body' => self::inlineImages($message),
                'status' => config('mail.default') === 'log' ? 'logged' : 'sent',
                'provider' => (string) config('mail.default') === 'smtp' ? (string) config('mail.mailers.smtp.host') : (string) config('mail.default'),
                'provider_message_id' => $event->sent->getMessageId(),
                'related_type' => $relatedType,
                'related_id' => $relatedId,
            ]);
        }
    }

    /**
     * Embedded images (ticket QR codes) are cid: attachments, which a browser
     * can't show from the log. Swap them for data URIs in the stored copy.
     */
    protected static function inlineImages(Email $message): ?string
    {
        $html = $message->getHtmlBody();

        if (! is_string($html)) {
            return $message->getTextBody();
        }

        foreach ($message->getAttachments() as $part) {
            if (! $part instanceof DataPart || ! $part->hasContentId()) {
                continue;
            }

            $html = str_replace(
                'cid:'.$part->getContentId(),
                'data:'.$part->getMediaType().'/'.$part->getMediaSubtype().';base64,'.base64_encode($part->getBody()),
                $html
            );
        }

        return $html;
    }

    /** @return array{0: string, 1: ?int, 2: ?string, 3: ?int} */
    public static function describe(array $data): array
    {
        return match ($data['__laravel_mailable'] ?? null) {
            TicketConfirmation::class => ['ticket_confirmation', $data['order']?->tenant_id ?? null, 'order', $data['order']?->id ?? null],
            CampaignMail::class => ['campaign', $data['tenantId'] ?? null, $data['campaignId'] ?? null ? 'campaign' : null, $data['campaignId'] ?? null],
            PayoutMail::class => ['payout', $data['payout']?->tenant_id ?? null, 'payout', $data['payout']?->id ?? null],
            null => ['test', null, null, null],
            default => ['other', null, null, null],
        };
    }
}
