<?php

namespace App\Mail;

use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Models\Event;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Headers;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\URL;

class CampaignMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $subjectLine,
        public string $body,
        public ?string $imagePath = null,
        public ?Event $featuredEvent = null,
        public ?string $ctaLabel = null,
        public ?string $ctaUrl = null,
        public ?string $unsubscribeUrl = null,
        public ?string $senderName = null,
        // For the message log (LogSentEmail).
        public ?int $campaignId = null,
        public ?int $tenantId = null,
        // Personal "Add my phone number" link (campaigns with ask_phone).
        public ?string $phoneUrl = null,
    ) {}

    public static function forCampaign(Campaign $campaign, string $subjectLine, string $body, ?string $unsubscribeUrl, ?string $phoneUrl = null): self
    {
        return new self(
            subjectLine: $subjectLine,
            body: $body,
            imagePath: $campaign->image_path,
            featuredEvent: $campaign->featuredEvent,
            ctaLabel: $campaign->cta_label,
            ctaUrl: $campaign->cta_url,
            unsubscribeUrl: $unsubscribeUrl,
            senderName: self::senderName($campaign),
            campaignId: $campaign->id,
            tenantId: $campaign->tenant_id,
            phoneUrl: $phoneUrl,
        );
    }

    /** Signed per recipient like unsubscribe: no email in the link, can't be edited to reach someone else. */
    public static function phoneUrl(CampaignRecipient $recipient): string
    {
        return rtrim((string) config('app.url'), '/')
            .URL::signedRoute('campaign.phone', ['recipient' => $recipient->id], absolute: false);
    }

    /**
     * Platform campaigns go out as "Tikooh"; an organiser's as "Their Org via
     * Tikooh", so people recognise who is writing to them.
     */
    public static function senderName(Campaign $campaign): string
    {
        $platform = 'Tikooh';
        $org = ($campaign->audience_filter['source'] ?? null) === 'platform'
            ? null
            : $campaign->tenant?->organization_name;

        return $org ? "{$org} via {$platform}" : $platform;
    }

    /**
     * Signed and keyed by recipient row, so the link carries no email address
     * and cannot be edited to unsubscribe someone else. Relative signature:
     * the API sits behind a proxy whose scheme/host Laravel may not see.
     */
    public static function unsubscribeUrl(CampaignRecipient $recipient): string
    {
        return rtrim((string) config('app.url'), '/')
            .URL::signedRoute('campaign.unsubscribe', ['recipient' => $recipient->id], absolute: false);
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            from: new Address((string) config('mail.from.address'), $this->senderName ?? (string) config('mail.from.name')),
            subject: $this->subjectLine,
        );
    }

    /** One-click unsubscribe — Gmail and Yahoo require it for bulk senders. */
    public function headers(): Headers
    {
        return new Headers(text: $this->unsubscribeUrl ? [
            'List-Unsubscribe' => '<'.$this->unsubscribeUrl.'>',
            'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click',
        ] : []);
    }

    public function content(): Content
    {
        $event = $this->featuredEvent;
        $frontend = rtrim((string) config('app.frontend_url'), '/');

        return new Content(
            view: 'mail.campaign',
            with: [
                'subjectLine' => $this->subjectLine,
                'body' => $this->body,
                'imagePath' => $this->imagePath,
                'event' => $event,
                'eventUrl' => $event ? $frontend.'/e/'.$event->uuid : null,
                'eventStarts' => $event?->start_date?->copy()->timezone($event->timezone ?: config('app.timezone')),
                'eventFrom' => $event ? $this->lowestPrice($event) : null,
                'ctaLabel' => $this->ctaLabel,
                'ctaUrl' => $this->ctaUrl,
                'unsubscribeUrl' => $this->unsubscribeUrl,
                'phoneUrl' => $this->phoneUrl,
                'senderName' => $this->senderName ?? config('mail.from.name'),
            ],
        );
    }

    protected function lowestPrice(Event $event): ?string
    {
        $prices = $event->ticketTiers()->where('is_active', true)->pluck('price')->map(fn ($p) => (float) $p);

        if ($prices->isEmpty()) {
            return null;
        }

        $min = $prices->min();

        return $min <= 0 ? 'Free' : 'From '.$event->currency.' '.number_format($min);
    }
}
