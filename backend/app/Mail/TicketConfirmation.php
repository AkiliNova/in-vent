<?php

namespace App\Mail;

use App\Models\Event;
use App\Models\Order;
use BaconQrCode\Renderer\GDLibRenderer;
use BaconQrCode\Writer;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class TicketConfirmation extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Order $order,
        public Collection $tickets,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->fill((string) config('tikooh.templates.ticket_subject')),
        );
    }

    /** Fills the admin-editable wording (Settings → Templates). */
    public function fill(string $template): string
    {
        $frontend = rtrim((string) config('app.frontend_url'), '/');

        return strtr($template, [
            '{first_name}' => trim(explode(' ', (string) $this->order->buyer_name)[0]) ?: 'there',
            '{event}' => $this->order->event->title,
            '{count}' => (string) $this->tickets->count(),
            '{link}' => $frontend.'/payment-response?reference='.urlencode($this->order->reference),
        ]);
    }

    public function content(): Content
    {
        $event = $this->order->event;
        $frontend = rtrim((string) config('app.frontend_url'), '/');

        return new Content(
            view: 'mail.ticket-confirmation',
            with: [
                'intro' => $this->fill((string) config('tikooh.templates.ticket_intro')),
                'signoff' => $this->fill((string) config('tikooh.templates.ticket_signoff')),
                'order' => $this->order,
                'event' => $event,
                'tickets' => $this->tickets,
                'starts' => $this->local($event, $event->start_date),
                'ends' => $event->end_date ? $this->local($event, $event->end_date) : null,
                'where' => $this->venueLine($event),
                'ticketsUrl' => $frontend.'/payment-response?reference='.urlencode($this->order->reference),
                'eventUrl' => $frontend.'/e/'.$event->uuid,
                'calendarUrl' => $this->googleCalendarUrl($event),
            ],
        );
    }

    /** An .ics file so Apple/Outlook users get a one-tap "add to calendar". */
    public function attachments(): array
    {
        return [
            Attachment::fromData(fn () => $this->ics(), 'event.ics')->withMime('text/calendar'),
        ];
    }

    /**
     * PNG, not SVG: Gmail and Outlook strip SVG images. The payload is the
     * bare ticket code, exactly what the door scanner resolves.
     */
    public static function qrPng(string $code): string
    {
        return (new Writer(new GDLibRenderer(420, 2)))->writeString($code);
    }

    protected function local(Event $event, Carbon $at): Carbon
    {
        return $at->copy()->timezone($event->timezone ?: config('app.timezone'));
    }

    protected function venueLine(Event $event): string
    {
        $place = $event->venue?->name ?? $event->location_name ?? 'Venue to be announced';

        return $event->city && ! str_contains($place, $event->city) ? "{$place}, {$event->city}" : $place;
    }

    /** Events without an end time get a three-hour slot in calendars. */
    protected function span(Event $event): array
    {
        $start = $event->start_date->copy()->utc();
        $end = ($event->end_date ?? $event->start_date->copy()->addHours(3))->copy()->utc();

        return [$start, $end];
    }

    protected function googleCalendarUrl(Event $event): string
    {
        [$start, $end] = $this->span($event);

        return 'https://calendar.google.com/calendar/render?'.http_build_query([
            'action' => 'TEMPLATE',
            'text' => $event->title,
            'dates' => $start->format('Ymd\THis\Z').'/'.$end->format('Ymd\THis\Z'),
            'location' => $this->venueLine($event),
            'details' => 'Your Tikooh booking '.$this->order->reference.'. Show your QR code at the gate.',
        ]);
    }

    protected function ics(): string
    {
        $event = $this->order->event;
        [$start, $end] = $this->span($event);
        $esc = fn (string $s) => addcslashes(str_replace(["\r\n", "\n"], '\n', $s), ',;\\');

        return implode("\r\n", [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Tikooh//Tickets//EN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:'.$this->order->reference.'@tikooh.com',
            'DTSTAMP:'.now()->utc()->format('Ymd\THis\Z'),
            'DTSTART:'.$start->format('Ymd\THis\Z'),
            'DTEND:'.$end->format('Ymd\THis\Z'),
            'SUMMARY:'.$esc($event->title),
            'LOCATION:'.$esc($this->venueLine($event)),
            'DESCRIPTION:'.$esc('Booking '.$this->order->reference.'. Show your QR code at the gate.'),
            'END:VEVENT',
            'END:VCALENDAR',
            '',
        ]);
    }
}
