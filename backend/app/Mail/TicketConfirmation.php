<?php

namespace App\Mail;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
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
            subject: "Your tickets for {$this->order->event->title}",
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.ticket-confirmation',
            with: [
                'order' => $this->order,
                'event' => $this->order->event,
                'tickets' => $this->tickets,
            ],
        );
    }
}
