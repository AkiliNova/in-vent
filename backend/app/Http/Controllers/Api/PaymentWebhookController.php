<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\OrderService;
use App\Services\Payments\MpesaGateway;
use App\Services\Payments\PesapalGateway;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Provider callbacks. These are unauthenticated endpoints, so nothing in the
 * request body is trusted: the order is looked up by our own reference and the
 * payment is re-confirmed with the provider's API before anything is marked paid.
 */
class PaymentWebhookController extends Controller
{
    public function __construct(protected OrderService $orders) {}

    /** Pesapal IPN. */
    public function pesapal(Request $request): JsonResponse
    {
        $trackingId = $request->input('OrderTrackingId');
        $reference = $request->input('OrderMerchantReference');

        Log::info('Pesapal IPN', ['reference' => $reference, 'tracking' => $trackingId]);

        $order = TenantContext::withoutScoping(fn () => Order::where('reference', $reference)->first());

        if (! $order || ! $trackingId) {
            // Always 200 — a non-2xx makes Pesapal retry a callback we can never satisfy.
            return response()->json(['orderNotificationType' => 'IPNCHANGE', 'status' => 200]);
        }

        try {
            $result = (new PesapalGateway($order->tenant_id))->verify($trackingId);

            if ($result['status'] === 'completed' && ! $order->isPaid()) {
                TenantContext::withoutScoping(fn () => $this->orders->markPaid($order, 'pesapal', $result['raw']));
            } elseif (in_array($result['status'], ['failed', 'reversed'], true)) {
                $order->update(['status' => $result['status'] === 'reversed' ? 'refunded' : 'failed']);
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json([
            'orderNotificationType' => 'IPNCHANGE',
            'orderTrackingId' => $trackingId,
            'orderMerchantReference' => $reference,
            'status' => 200,
        ]);
    }

    /** Safaricom Daraja STK callback. */
    public function mpesa(Request $request): JsonResponse
    {
        $payload = $request->all();

        Log::info('M-Pesa callback', ['payload' => $payload]);

        $order = null;

        try {
            $parsed = (new MpesaGateway)->parseCallback($payload);

            $order = TenantContext::withoutScoping(fn () => Order::query()
                ->where('provider_reference', $parsed['checkout_request_id'])
                ->first());

            if ($order && $parsed['status'] === 'completed' && ! $order->isPaid()) {
                // Re-query rather than trusting the posted body.
                $confirmed = (new MpesaGateway($order->tenant_id))
                    ->query($parsed['checkout_request_id']);

                if ($confirmed['status'] === 'completed') {
                    TenantContext::withoutScoping(fn () => $this->orders->markPaid($order, 'mpesa', $parsed));
                }
            } elseif ($order && $parsed['status'] === 'failed') {
                $order->update(['status' => 'failed']);
                $this->orders->expire($order);
            }
        } catch (\Throwable $e) {
            report($e);
        }

        // Daraja expects this exact acknowledgement shape.
        return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
    }
}
