<?php

namespace App\Listeners;

use App\Events\TicketsIssued;
use App\Jobs\GenerateBadge;
use App\Mail\TicketConfirmation;
use App\Models\Attendee;
use App\Models\MessageLog;
use App\Models\Suppression;
use App\Services\Sms\AdvantaSmsClient;
use App\Services\Sms\Sms;
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

        // Walk-ins without an email have a placeholder address; the SMS below reaches them.
        if (! Attendee::isPlaceholderEmail($order->buyer_email)) try {
            Mail::to($order->buyer_email)->send(new TicketConfirmation(
                order: $order->loadMissing('event', 'items'),
                tickets: $event->tickets,
            ));
        } catch (\Throwable $e) {
            MessageLog::record([
                'tenant_id' => $order->tenant_id, 'channel' => 'email', 'type' => 'ticket_confirmation',
                'to' => (string) $order->buyer_email, 'subject' => 'Ticket confirmation', 'status' => 'failed',
                'error' => $e->getMessage(), 'related_type' => 'order', 'related_id' => $order->id,
            ]);

            Log::error('Ticket confirmation email failed', [
                'order' => $order->reference,
                'error' => $e->getMessage(),
            ]);
        }

        $phone = AdvantaSmsClient::normalise($order->buyer_phone ?? '');

        if ($phone && ! Suppression::blocks($order->tenant_id, 'sms', $phone)) {
            try {
                Sms::client($order->tenant_id)->about('ticket_confirmation', 'order', $order->id)->send(
                    [$phone],
                    // The link opens the QR codes — most buyers never open the email.
                    strtr((string) config('tikooh.templates.ticket_sms'), [
                        '{count}' => (string) $event->tickets->count(),
                        '{event}' => \Illuminate\Support\Str::limit($order->event->title, 40),
                        '{first_name}' => trim(explode(' ', (string) $order->buyer_name)[0]) ?: 'there',
                        '{link}' => rtrim((string) config('app.frontend_url'), '/').'/payment-response?reference='.$order->reference,
                    ])
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
