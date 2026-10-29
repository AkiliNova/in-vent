<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MpesaC2bTransaction;
use App\Models\Order;
use App\Services\Notify\Telegram;
use App\Services\OrderService;
use App\Services\Payments\MpesaGateway;
use App\Services\WalletService;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * C2B (buyer pays the paybill directly) and B2C (organiser withdrawal)
 * callbacks.
 *
 * Safaricom signs none of these, so each request must carry the secret path
 * token and come from a Safaricom address. A forged B2C failure would refund
 * money that was actually sent; a forged C2B confirmation would issue free
 * tickets.
 */
class DarajaCallbackController extends Controller
{
    public function __construct(
        protected OrderService $orders,
        protected WalletService $wallet,
    ) {}

    /** Always accept — the confirmation is where matching happens. */
    public function c2bValidate(Request $request, string $token): JsonResponse
    {
        $this->guard($request, $token);

        return response()->json(['ResultCode' => '0', 'ResultDesc' => 'Accepted']);
    }

    public function c2bConfirm(Request $request, string $token): JsonResponse
    {
        $this->guard($request, $token);

        $payload = $request->all();
        Log::info('C2B confirmation', ['payload' => $payload]);

        try {
            $this->recordC2b($payload);
        } catch (\Throwable $e) {
            // Still acknowledge: a non-200 only makes Safaricom retry a
            // payment we have already logged above.
            report($e);
        }

        return response()->json(['ResultCode' => '0', 'ResultDesc' => 'Accepted']);
    }

    public function b2cResult(Request $request, string $token): JsonResponse
    {
        $this->guard($request, $token, strictIp: false);

        $payload = $request->all();
        Log::info('B2C result', ['payload' => $payload]);

        try {
            $this->wallet->applyB2cResult((new MpesaGateway)->parseB2cResult($payload), $payload);
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json(['ResultCode' => '0', 'ResultDesc' => 'Accepted']);
    }

    /**
     * The request sat in Safaricom's queue too long. Whether it was paid is
     * unknown, so nothing is refunded here — the payout stays "processing"
     * for an admin to confirm against the M-Pesa statement.
     */
    public function b2cTimeout(Request $request, string $token): JsonResponse
    {
        $this->guard($request, $token, strictIp: false);

        Log::warning('B2C queue timeout', ['payload' => $request->all()]);

        return response()->json(['ResultCode' => '0', 'ResultDesc' => 'Accepted']);
    }

    protected function recordC2b(array $payload): void
    {
        $c2b = (new MpesaGateway)->parseC2b($payload);

        if ($c2b['trans_id'] === '') {
            return;
        }

        TenantContext::withoutScoping(function () use ($c2b, $payload) {
            $transaction = MpesaC2bTransaction::firstOrCreate(
                ['trans_id' => $c2b['trans_id']],
                $c2b + ['raw' => $payload, 'status' => 'unmatched']
            );

            // A retried confirmation for a payment already handled.
            if (! $transaction->wasRecentlyCreated) {
                return;
            }

            $ref = $c2b['bill_ref_number'];
            $order = $ref === '' ? null : Order::query()
                ->where('pay_code', $ref)
                ->orWhere('reference', $ref)
                ->first();

            if (! $order) {
                return; // Stays "unmatched" for an admin to resolve.
            }

            $transaction->order_id = $order->id;

            if ($order->isPaid()) {
                $transaction->status = 'duplicate';
            } elseif ($c2b['amount'] + 0.001 < (float) $order->total) {
                $transaction->status = 'underpaid';
            } else {
                $this->orders->markPaid($this->orders->reinstate($order), 'mpesa_c2b', [
                    'receipt' => $c2b['trans_id'],
                    'amount' => $c2b['amount'],
                    'phone' => $c2b['msisdn'],
                ]);
                $transaction->status = 'matched';
            }

            $transaction->save();
        });
    }

    /**
     * @param  bool  $strictIp  false for B2C results: Safaricom's published IP
     *                          list is not guaranteed complete, and dropping a
     *                          real result leaves money sent but unrecorded. The
     *                          secret token still has to match.
     */
    protected function guard(Request $request, string $token, bool $strictIp = true): void
    {
        $expected = (string) config('services.mpesa.c2b_token');

        abort_if($expected === '' || ! hash_equals($expected, $token), 404);

        if (config('services.mpesa.enforce_callback_ips')
            && ! in_array($request->ip(), config('services.mpesa.callback_ips'), true)) {
            Log::warning('Daraja callback from unexpected address', ['ip' => $request->ip(), 'path' => $request->path()]);

            if ($strictIp) {
                abort(403);
            }

            Telegram::send('🔎 M-Pesa callback from an unlisted address '.Telegram::e($request->ip())
                .' — accepted (token valid). Add it to MPESA_CALLBACK_IPS if it is Safaricom.', dedupeKey: 'ip:'.$request->ip(), dedupeMinutes: 1440);
        }
    }
}
