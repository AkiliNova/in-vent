<?php

namespace App\Listeners;

use App\Events\TicketsIssued;
use App\Jobs\GenerateBadge;
use App\Mail\TicketConfirmation;
use App\Models\Suppression;
use App\Services\Sms\AdvantaSmsClient;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Everything that happens after a successful payment: confirmation email, SMS,
 * and the attendee's badge. Queued so a slow mail server never delays the
 * payment provider's callback.
 */
class SendTicketConfirmation implements ShouldQueue
{
    public function handle(TicketsIssued $event): void
    {
        $order = $event->order;
        $attendee = $event->attendee;

        try {
            Mail::to($order->buyer_email)->send(new TicketConfirmation(
                order: $order->loadMissing('event', 'items'),
                tickets: $event->tickets,
            ));
        } catch (\Throwable $e) {
            Log::error('Ticket confirmation email failed', [
                'order' => $order->reference,
                'error' => $e->getMessage(),
            ]);
        }

        $phone = AdvantaSmsClient::normalise($order->buyer_phone ?? '');

        if ($phone && ! Suppression::blocks($order->tenant_id, 'sms', $phone)) {
            try {
                (new AdvantaSmsClient($order->tenant_id))->send(
                    [$phone],
                    sprintf(
                        'Your %s ticket is confirmed. Ref %s. Show this code at the gate: %s',
                        $order->event->title,
                        $order->reference,
                        $event->tickets->first()?->code ?? $order->reference
                    )
                );
            } catch (\Throwable $e) {
                Log::warning('Ticket confirmation SMS failed', [
                    'order' => $order->reference,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        GenerateBadge::dispatch($attendee);
    }
}
