<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Event;
use App\Models\Order;
use App\Services\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Organiser-side registration: walk-ins at the door, VIPs, guest lists.
 * Goes through the normal order flow so every guest gets a real ticket the
 * scanner accepts (and the SMS/email confirmation), but the money is never
 * credited to the wallet — complimentary is free, and door cash is already
 * in the organiser's hand.
 */
class RegistrationController extends Controller
{
    public function __construct(protected OrderService $orders) {}

    public function store(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'ticket_tier_id' => ['required', 'integer'],
            'quantity' => ['nullable', 'integer', 'min:1', 'max:20'],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'payment' => ['required', 'in:complimentary,cash'],
        ]);

        // Walk-ins often have no email; the attendee record still needs a key.
        $email = $data['email'] ?? 'guest+'.now()->format('YmdHis').random_int(100, 999).'@door.tikooh.com';

        $order = DB::transaction(function () use ($event, $data, $email) {
            $order = $this->orders->createPendingOrder(
                $event,
                [['ticket_tier_id' => $data['ticket_tier_id'], 'quantity' => $data['quantity'] ?? 1]],
                ['name' => $data['name'], 'email' => $email, 'phone' => $data['phone'] ?? null],
            );

            if ($order->isPaid()) {
                return $order; // a free tier is paid on creation
            }

            if ($data['payment'] === 'complimentary') {
                $order->update(['discount_amount' => $order->subtotal, 'total' => 0]);
            }

            $order->update(['metadata' => ['registered_by' => request()->user()->id, 'channel' => 'door']]);

            return $this->orders->markPaid($order, $data['payment'], ['reference' => 'door-'.$order->reference]);
        });

        ActivityLog::record('registered_guest', $order, "{$data['payment']} registration for {$data['name']}");

        return response()->json([
            'reference' => $order->reference,
            'total' => $order->total,
            'payment' => $data['payment'],
            'tickets' => $order->tickets()->get(['code', 'holder_name']),
        ], 201);
    }

    /** Today's door registrations for the event, newest first. */
    /**
     * Door registrations, a page at a time, with totals over all of them,
     * not just the page, so "cash collected" is the real figure.
     */
    public function index(Request $request, Event $event): JsonResponse
    {
        $door = fn () => Order::query()->where('event_id', $event->id)->whereIn('provider', ['cash', 'complimentary']);

        $page = $door()
            ->when(trim($request->string('search')->toString()), fn ($q, $s) => $q->where(fn ($w) => $w
                ->where('buyer_name', 'like', "%{$s}%")->orWhere('buyer_phone', 'like', "%{$s}%")->orWhere('reference', 'like', "%{$s}%")))
            ->latest('id')
            ->withCount('tickets')
            ->paginate($request->integer('per_page', 25), ['id', 'reference', 'buyer_name', 'buyer_phone', 'total', 'provider', 'paid_at']);

        return response()->json($page->toArray() + [
            'summary' => [
                'count' => $door()->count(),
                'cash_total' => (float) $door()->where('provider', 'cash')->sum('total'),
                'cash_count' => $door()->where('provider', 'cash')->count(),
                'comp_count' => $door()->where('provider', 'complimentary')->count(),
            ],
        ]);
    }
}
