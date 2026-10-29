<?php

namespace App\Services;

use App\Events\TicketsIssued;
use App\Models\Attendee;
use App\Models\Event;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PromoCode;
use App\Models\Ticket;
use App\Models\TicketTier;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Checkout and ticket issuance.
 *
 * Capacity is enforced with a row lock at reservation time, so two buyers
 * racing for the last seat cannot both succeed — the old Firestore flow
 * incremented a `sold` counter client-side after payment, which could oversell.
 */
class OrderService
{
    public function __construct(protected WalletService $wallet) {}

    /**
     * Reserves stock and creates a pending order.
     *
     * @param  array<int,array{ticket_tier_id:int,quantity:int}>  $items
     */
    public function createPendingOrder(
        Event $event,
        array $items,
        array $buyer,
        ?string $promoCode = null
    ): Order {
        return DB::transaction(function () use ($event, $items, $buyer, $promoCode) {
            $subtotal = 0.0;
            $lines = [];

            foreach ($items as $item) {
                $tier = TicketTier::where('event_id', $event->id)
                    ->lockForUpdate()
                    ->findOrFail($item['ticket_tier_id']);

                $quantity = (int) $item['quantity'];

                if ($quantity < $tier->min_per_order || $quantity > $tier->max_per_order) {
                    throw ValidationException::withMessages([
                        'items' => ["{$tier->name}: order between {$tier->min_per_order} and {$tier->max_per_order} tickets."],
                    ]);
                }

                if (! $tier->isOnSale()) {
                    throw ValidationException::withMessages([
                        'items' => ["{$tier->name} is not on sale."],
                    ]);
                }

                if ($tier->remaining() < $quantity) {
                    throw ValidationException::withMessages([
                        'items' => ["Only {$tier->remaining()} left for {$tier->name}."],
                    ]);
                }

                // Held, not sold — released if the order expires unpaid.
                $tier->increment('reserved', $quantity);

                $lineTotal = round((float) $tier->price * $quantity, 2);
                $subtotal += $lineTotal;

                $lines[] = [
                    'ticket_tier_id' => $tier->id,
                    'tier_name' => $tier->name,
                    'quantity' => $quantity,
                    'unit_price' => $tier->price,
                    'subtotal' => $lineTotal,
                ];
            }

            [$discount, $promo] = $this->resolveDiscount($event, $promoCode, $subtotal, $buyer['email']);

            $order = Order::create([
                'tenant_id' => $event->tenant_id,
                'event_id' => $event->id,
                'promo_code_id' => $promo?->id,
                'buyer_name' => $buyer['name'],
                'buyer_email' => strtolower($buyer['email']),
                'buyer_phone' => $buyer['phone'] ?? null,
                'subtotal' => $subtotal,
                'discount_amount' => $discount,
                'total' => max(0, round($subtotal - $discount, 2)),
                'currency' => $event->currency,
                'status' => 'pending',
                'expires_at' => now()->addMinutes(20),
            ]);

            $order->items()->createMany($lines);

            // Free orders never touch a payment provider.
            if ((float) $order->total <= 0) {
                $this->markPaid($order, 'free', null);
            }

            return $order->fresh('items');
        });
    }

    /**
     * Converts a paid order into attendees and tickets. Idempotent: providers
     * retry callbacks, and a duplicate must not issue a second set of tickets.
     */
    public function markPaid(Order $order, string $provider, ?array $providerPayload = null): Order
    {
        return DB::transaction(function () use ($order, $provider, $providerPayload) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($order->isPaid()) {
                return $order;
            }

            $order->update([
                'status' => 'paid',
                'provider' => $provider,
                'paid_at' => now(),
            ]);

            if ($providerPayload !== null) {
                Payment::create([
                    'order_id' => $order->id,
                    'provider' => $provider,
                    'provider_reference' => data_get($providerPayload, 'receipt')
                        ?? data_get($providerPayload, 'reference'),
                    'amount' => $order->total,
                    'currency' => $order->currency,
                    'status' => 'completed',
                    'raw_response' => $providerPayload,
                    'confirmed_at' => now(),
                ]);
            }

            $attendee = $this->attendeeFor($order);
            $tickets = [];

            foreach ($order->items as $item) {
                $tier = $item->ticketTier;

                // Convert the hold into a sale.
                $tier?->decrement('reserved', min($item->quantity, $tier->reserved));
                $tier?->increment('sold', $item->quantity);

                for ($i = 0; $i < $item->quantity; $i++) {
                    $tickets[] = Ticket::create([
                        'tenant_id' => $order->tenant_id,
                        'event_id' => $order->event_id,
                        'order_id' => $order->id,
                        'ticket_tier_id' => $item->ticket_tier_id,
                        // Only the first ticket is bound to the buyer; the rest
                        // stay unassigned until the buyer names their guests.
                        'attendee_id' => ($i === 0) ? $attendee->id : null,
                        'holder_name' => ($i === 0) ? $order->buyer_name : null,
                        'holder_email' => ($i === 0) ? $order->buyer_email : null,
                        'price_paid' => $item->unit_price,
                    ]);
                }
            }

            $order->promoCode?->increment('used_count');

            $this->wallet->creditSale($order);

            $attendee->update(['amount_paid' => $attendee->amount_paid + (float) $order->total]);

            TicketsIssued::dispatch($order->fresh('items'), $attendee, collect($tickets));

            return $order->fresh();
        });
    }

    /**
     * Puts a lapsed order back to pending so a late payment can be honoured.
     * Paybill (C2B) buyers can take longer than the 20-minute hold, and once
     * their money has arrived, issuing the tickets beats a manual refund —
     * even if that means the tier goes slightly over capacity.
     */
    public function reinstate(Order $order): Order
    {
        return DB::transaction(function () use ($order) {
            $order = Order::withoutGlobalScope('tenant')->whereKey($order->id)->lockForUpdate()->firstOrFail();

            if (! in_array($order->status, ['expired', 'failed', 'cancelled'], true)) {
                return $order;
            }

            foreach ($order->items as $item) {
                $item->ticketTier?->increment('reserved', $item->quantity);
            }

            $order->update(['status' => 'pending']);

            return $order;
        });
    }

    /** Releases held stock for orders that were never paid. */
    public function expire(Order $order): void
    {
        DB::transaction(function () use ($order) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($order->status !== 'pending') {
                return;
            }

            foreach ($order->items as $item) {
                $tier = $item->ticketTier;
                $tier?->decrement('reserved', min($item->quantity, $tier->reserved));
            }

            $order->update(['status' => 'expired']);
        });
    }

    /** @return array{0: float, 1: ?PromoCode} */
    protected function resolveDiscount(Event $event, ?string $code, float $subtotal, string $email): array
    {
        if (! $code) {
            return [0.0, null];
        }

        $promo = PromoCode::withoutGlobalScope('tenant')
            ->where('tenant_id', $event->tenant_id)
            ->where('code', strtoupper(trim($code)))
            ->first();

        if (! $promo) {
            throw ValidationException::withMessages(['promo_code' => ['That code is not valid.']]);
        }

        $check = $promo->validateFor($event, $subtotal, strtolower($email));

        if (! $check['valid']) {
            throw ValidationException::withMessages(['promo_code' => [$check['reason']]]);
        }

        return [$promo->discountFor($subtotal), $promo];
    }

    /** One attendee record per email per event; repeat buyers reuse theirs. */
    protected function attendeeFor(Order $order): Attendee
    {
        $names = preg_split('/\s+/', trim($order->buyer_name), 2) ?: [];

        return Attendee::withoutGlobalScope('tenant')->firstOrCreate(
            ['event_id' => $order->event_id, 'email' => $order->buyer_email],
            [
                'tenant_id' => $order->tenant_id,
                'first_name' => $names[0] ?? 'Guest',
                'last_name' => $names[1] ?? '',
                'phone' => $order->buyer_phone,
                'category' => $order->items->first()?->ticketTier?->attendee_category ?? 'General',
                'status' => 'registered',
                'registered_at' => now(),
            ]
        );
    }
}
