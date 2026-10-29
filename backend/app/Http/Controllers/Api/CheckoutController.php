<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\Order;
use App\Models\PromoCode;
use App\Services\OrderService;
use App\Services\Payments\MpesaGateway;
use App\Services\Payments\PesapalGateway;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public checkout. No auth — buyers are anonymous until they pay — so every
 * lookup here is by uuid/reference and the response never exposes another
 * buyer's data.
 */
class CheckoutController extends Controller
{
    public function __construct(protected OrderService $orders) {}

    /** Validates a promo code before the buyer commits to paying. */
    public function checkPromo(Request $request, string $eventUuid): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64'],
            'amount' => ['required', 'numeric', 'min:0'],
            'email' => ['nullable', 'email'],
        ]);

        $event = $this->event($eventUuid);

        $promo = TenantContext::withoutScoping(fn () => PromoCode::query()
            ->where('tenant_id', $event->tenant_id)
            ->where('code', strtoupper(trim($data['code'])))
            ->first());

        if (! $promo) {
            return response()->json(['valid' => false, 'message' => 'That code is not valid.'], 422);
        }

        $check = $promo->validateFor($event, (float) $data['amount'], $data['email'] ?? null);

        if (! $check['valid']) {
            return response()->json(['valid' => false, 'message' => $check['reason']], 422);
        }

        return response()->json([
            'valid' => true,
            'discount' => $promo->discountFor((float) $data['amount']),
            'discount_type' => $promo->discount_type,
        ]);
    }

    /** Reserves stock and returns a pending order the buyer then pays for. */
    public function createOrder(Request $request, string $eventUuid): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.ticket_tier_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            'buyer.name' => ['required', 'string', 'max:255'],
            'buyer.email' => ['required', 'email', 'max:255'],
            'buyer.phone' => ['nullable', 'string', 'max:32'],
            'promo_code' => ['nullable', 'string', 'max:64'],
        ]);

        $event = $this->event($eventUuid);

        $order = TenantContext::withoutScoping(fn () => $this->orders->createPendingOrder(
            $event,
            $data['items'],
            $data['buyer'],
            $data['promo_code'] ?? null
        ));

        return response()->json([
            'reference' => $order->reference,
            'pay_code' => $order->pay_code,
            'paybill' => config('tikooh.paybill'),
            'total' => $order->total,
            'currency' => $order->currency,
            'status' => $order->status,
            'expires_at' => $order->expires_at,
        ], 201);
    }

    /** Starts a Pesapal checkout and returns the URL to redirect the buyer to. */
    public function payWithPesapal(Request $request, string $reference): JsonResponse
    {
        $order = $this->pendingOrder($reference);

        $url = TenantContext::withoutScoping(fn () => (new PesapalGateway($order->tenant_id))
            ->createOrder($order, config('app.frontend_url').'/payment-response'));

        return response()->json(['redirect_url' => $url]);
    }

    /** Triggers the M-Pesa prompt on the buyer's phone. */
    public function payWithMpesa(Request $request, string $reference): JsonResponse
    {
        $data = $request->validate(['phone' => ['required', 'string', 'max:32']]);

        $order = $this->pendingOrder($reference);

        $result = TenantContext::withoutScoping(fn () => (new MpesaGateway($order->tenant_id))
            ->stkPush($order, $data['phone'], route('webhooks.mpesa')));

        return response()->json($result);
    }

    /**
     * Polled by the payment-response page. Confirms with the provider rather
     * than trusting whatever the redirect carried.
     */
    public function status(string $reference): JsonResponse
    {
        $order = TenantContext::withoutScoping(fn () => Order::query()
            ->with('event:id,uuid,title,start_date', 'items')
            ->where('reference', $reference)
            ->firstOrFail());

        if ($order->status === 'pending' && $order->provider_reference) {
            $this->reconcile($order);
            $order->refresh();
        }

        return response()->json([
            'reference' => $order->reference,
            'pay_code' => $order->pay_code,
            'paybill' => config('tikooh.paybill'),
            'status' => $order->status,
            'total' => $order->total,
            'currency' => $order->currency,
            'event' => $order->event->only(['uuid', 'title', 'start_date']),
            'tickets' => $order->status === 'paid'
                ? $order->tickets()->get(['code', 'holder_name', 'status'])
                : [],
        ]);
    }

    /** Buyer self-service ticket lookup by email. */
    public function myTickets(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);

        $orders = TenantContext::withoutScoping(fn () => Order::query()
            ->with('event:id,uuid,title,start_date,location_name,city', 'tickets:id,order_id,code,status,holder_name')
            ->where('buyer_email', strtolower($data['email']))
            ->where('status', 'paid')
            ->orderByDesc('paid_at')
            ->limit(50)
            ->get());

        return response()->json(['orders' => $orders]);
    }

    protected function reconcile(Order $order): void
    {
        try {
            if ($order->provider === 'pesapal') {
                $result = (new PesapalGateway($order->tenant_id))->verify($order->provider_reference);
            } elseif ($order->provider === 'mpesa') {
                $result = (new MpesaGateway($order->tenant_id))->query($order->provider_reference);
            } else {
                return;
            }

            if ($result['status'] === 'completed') {
                TenantContext::withoutScoping(fn () => $this->orders->markPaid($order, $order->provider, $result));
            } elseif ($result['status'] === 'failed') {
                $order->update(['status' => 'failed']);
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    protected function event(string $uuid): Event
    {
        return TenantContext::withoutScoping(fn () => Event::query()
            ->publiclyVisible()
            ->where('uuid', $uuid)
            ->firstOrFail());
    }

    protected function pendingOrder(string $reference): Order
    {
        $order = TenantContext::withoutScoping(fn () => Order::query()
            ->with('event')
            ->where('reference', $reference)
            ->firstOrFail());

        abort_if($order->status !== 'pending', 422, 'This order is no longer awaiting payment.');

        return $order;
    }
}
