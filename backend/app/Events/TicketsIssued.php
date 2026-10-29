<?php

namespace App\Events;

use App\Models\Attendee;
use App\Models\Order;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;

/**
 * Fired once an order is confirmed paid. Listeners send the confirmation
 * email/SMS and generate the badge — none of which should block the payment
 * callback, so they all run on the queue.
 */
class TicketsIssued
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Order $order,
        public Attendee $attendee,
        public Collection $tickets,
    ) {}
}
