<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Payout;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WalletEntry;
use App\Services\Notify\Telegram;
use App\Services\Payments\MpesaGateway;
use App\Support\TenantContext;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Organiser wallets.
 *
 * Every shilling is a row in `wallet_entries`; the balance is their sum. A
 * withdrawal debits the wallet *before* B2C is called, so two concurrent
 * requests cannot both spend the same balance, and a failed payout is undone
 * with a reversal row rather than by editing history.
 */
class WalletService
{
    public function balance(int $tenantId): float
    {
        return round((float) WalletEntry::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->sum('amount'), 2);
    }

    /** Totals for the wallet screen. */
    public function summary(int $tenantId): array
    {
        $byType = WalletEntry::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->selectRaw('type, SUM(amount) as total')
            ->groupBy('type')
            ->pluck('total', 'type')
            ->map(fn ($v) => round((float) $v, 2));

        $payouts = fn (array $statuses) => round((float) Payout::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->whereIn('status', $statuses)
            ->sum('net_amount'), 2);

        return [
            'balance' => $this->balance($tenantId),
            'gross_sales' => $byType[WalletEntry::SALE] ?? 0.0,
            'platform_fees' => -($byType[WalletEntry::PLATFORM_FEE] ?? 0.0),
            'withdrawn' => $payouts(['paid']),
            // Held from the balance, waiting to be sent.
            'in_flight' => $payouts(['requested', 'processing']),
        ];
    }

    /**
     * Credits a paid order to its organiser, net of the platform fee. Runs
     * inside OrderService::markPaid's transaction; the unique index on
     * (order_id, type) makes it idempotent.
     */
    public function creditSale(Order $order): void
    {
        $gross = round((float) $order->total, 2);

        // Cash taken at the door is already in the organiser's hand; crediting
        // it would let them withdraw it a second time.
        if (in_array($order->provider, ['cash', 'complimentary'], true)) {
            return;
        }

        if ($gross <= 0 || WalletEntry::withoutGlobalScope('tenant')->where('order_id', $order->id)->exists()) {
            return;
        }

        $tenant = Tenant::find($order->tenant_id);
        $fee = round($gross * ($tenant?->feePercent() ?? 0) / 100, 2);

        $base = [
            'tenant_id' => $order->tenant_id,
            'event_id' => $order->event_id,
            'order_id' => $order->id,
            'currency' => $order->currency,
        ];

        WalletEntry::create($base + [
            'type' => WalletEntry::SALE,
            'amount' => $gross,
            'description' => "Order {$order->reference}",
        ]);

        if ($fee > 0) {
            WalletEntry::create($base + [
                'type' => WalletEntry::PLATFORM_FEE,
                'amount' => -$fee,
                'description' => "Platform fee ({$tenant->feePercent()}%) on {$order->reference}",
            ]);
        }
    }

    /**
     * Step 1 — the merchant asks. The amount is held (debited) at once so it
     * cannot be spent twice, and the request gets a due time: the window the
     * platform has to move money from the C2B paybill to the B2C shortcode.
     */
    public function requestWithdrawal(Tenant $tenant, User $user, float $amount, string $phone): Payout
    {
        $amount = round($amount, 2);
        $min = (float) config('tikooh.min_withdrawal');
        $max = (float) config('tikooh.max_withdrawal');

        if ($amount < $min || $amount > $max) {
            throw ValidationException::withMessages([
                'amount' => ["Withdraw between KES {$min} and KES ".number_format($max).'.'],
            ]);
        }

        // B2C only moves whole shillings.
        if (floor($amount) != $amount) {
            throw ValidationException::withMessages(['amount' => ['Withdraw a whole number of shillings.']]);
        }

        $payout = DB::transaction(function () use ($tenant, $user, $amount, $phone) {
            // Serialises withdrawals per tenant: the balance read below cannot
            // be raced by a second request.
            Tenant::whereKey($tenant->id)->lockForUpdate()->first();

            if ($this->balance($tenant->id) < $amount) {
                throw ValidationException::withMessages(['amount' => ['That is more than your available balance.']]);
            }

            $payout = Payout::create([
                'tenant_id' => $tenant->id,
                'gross_amount' => $amount,
                'platform_fee' => 0,
                'net_amount' => $amount,
                'currency' => 'KES',
                'destination_type' => 'mpesa',
                'destination_account' => $phone,
                'status' => 'requested',
                'due_at' => now()->addHours((int) config('tikooh.payout_hours')),
                'requested_by' => $user->id,
            ]);

            WalletEntry::create([
                'tenant_id' => $tenant->id,
                'payout_id' => $payout->id,
                'type' => WalletEntry::WITHDRAWAL,
                'amount' => -$amount,
                'description' => 'Withdrawal to '.self::maskPhone($phone),
            ]);

            return $payout;
        });

        Telegram::send(
            "💸 <b>Withdrawal requested</b>\n"
            .Telegram::e($tenant->organization_name).' wants <b>KES '.number_format($amount)."</b>\n"
            .'To '.self::maskPhone($phone).($tenant->payout_name ? ' ('.Telegram::e($tenant->payout_name).')' : '')."\n"
            .'Due by '.$payout->due_at->timezone('Africa/Nairobi')->format('D j M, H:i')."\n"
            .'Fund B2C from the paybill, then approve on the admin payouts page.'
        );

        return $payout;
    }

    /**
     * Step 2 — an admin, having funded the B2C shortcode, sends it. A B2C
     * failure here leaves the request queued (not refunded): the merchant
     * still wants the money, and the admin can retry or pay manually.
     */
    public function sendWithdrawal(Payout $payout, User $admin): Payout
    {
        $payout = DB::transaction(function () use ($payout, $admin) {
            $payout = Payout::withoutGlobalScope('tenant')->whereKey($payout->id)->lockForUpdate()->firstOrFail();

            if ($payout->status !== 'requested') {
                throw ValidationException::withMessages(['payout' => ["This withdrawal is already {$payout->status}."]]);
            }

            // A fresh id per attempt: Safaricom treats it as an idempotency key.
            $payout->update([
                'status' => 'processing',
                'originator_conversation_id' => (string) Str::uuid(),
                'conversation_id' => null,
                'approved_by' => $admin->id,
                'approved_at' => now(),
                'payment_method' => 'b2c',
            ]);

            return $payout;
        });

        try {
            $result = (new MpesaGateway)->b2c(
                $payout->destination_account,
                (int) $payout->net_amount,
                $payout->originator_conversation_id,
                route('webhooks.daraja.b2c.result', ['token' => config('services.mpesa.c2b_token')]),
                route('webhooks.daraja.b2c.timeout', ['token' => config('services.mpesa.c2b_token')]),
                'Tikooh payout #'.$payout->id
            );
        } catch (ConnectionException $e) {
            // The request may have reached Safaricom; re-queueing now could
            // pay out twice. Leave it processing for the result callback.
            report($e);
            $payout->update(['result_desc' => 'Awaiting confirmation from M-Pesa']);

            return $payout->fresh();
        } catch (\Throwable $e) {
            $this->requeue($payout, 'not_sent', $e->getMessage());

            throw ValidationException::withMessages(['payout' => [$e->getMessage()]]);
        }

        if (! $result['accepted']) {
            Log::warning('B2C not accepted', ['payout' => $payout->id, 'raw' => $result['raw']]);
            $this->requeue($payout, 'rejected', $result['description']);

            throw ValidationException::withMessages(['payout' => ['M-Pesa did not accept it: '.$result['description']]]);
        }

        $payout->update(['conversation_id' => $result['conversation_id']]);

        return $payout->fresh();
    }

    /** The admin paid outside B2C (e.g. while B2C is paused) and records it. */
    public function markPaidManually(Payout $payout, User $admin, string $receipt): Payout
    {
        return DB::transaction(function () use ($payout, $admin, $receipt) {
            $payout = Payout::withoutGlobalScope('tenant')->whereKey($payout->id)->lockForUpdate()->firstOrFail();

            if (! in_array($payout->status, ['requested', 'processing'], true)) {
                throw ValidationException::withMessages(['payout' => ["This withdrawal is already {$payout->status}."]]);
            }

            $payout->update([
                'status' => 'paid',
                'paid_at' => now(),
                'mpesa_receipt' => strtoupper(trim($receipt)),
                'payment_method' => 'manual',
                'approved_by' => $admin->id,
                'approved_at' => $payout->approved_at ?? now(),
                'result_desc' => 'Paid manually',
            ]);

            return $payout;
        });
    }

    /** Admin refuses the request; the money goes back to the wallet. */
    public function rejectWithdrawal(Payout $payout, User $admin, string $reason): Payout
    {
        return $this->refund($payout, 'rejected', $reason, $admin);
    }

    /** The merchant withdraws their own request before it is sent. */
    public function cancelWithdrawal(Payout $payout): Payout
    {
        return $this->refund($payout, 'cancelled', 'Cancelled by you');
    }

    /** Applies the asynchronous B2C result. Safe to call more than once. */
    public function applyB2cResult(array $result, array $raw): ?Payout
    {
        return TenantContext::withoutScoping(function () use ($result, $raw) {
            $payout = Payout::query()
                ->where('originator_conversation_id', $result['originator_conversation_id'])
                ->when($result['conversation_id'], fn ($q, $c) => $q->orWhere('conversation_id', $c))
                ->first();

            if (! $payout || $payout->status !== 'processing') {
                return $payout;
            }

            if ($result['result_code'] === '0') {
                $payout->update([
                    'status' => 'paid',
                    'paid_at' => now(),
                    'mpesa_receipt' => $result['receipt'],
                    'result_code' => '0',
                    'result_desc' => $result['result_desc'],
                    'raw_result' => $raw,
                ]);

                Telegram::send('✅ Payout #'.$payout->id.' sent — KES '.number_format((float) $payout->net_amount)
                    .' · '.Telegram::e($result['receipt']));

                return $payout;
            }

            // 2001 = initiator information invalid, 8006 = credential locked.
            if (in_array($result['result_code'], ['2001', '8006'], true)) {
                MpesaGateway::lockInitiator($result['result_code'], $result['result_desc']);
            }

            $payout->update(['raw_result' => $raw]);
            $this->requeue($payout, $result['result_code'], $result['result_desc']);

            return $payout->fresh();
        });
    }

    /** A send attempt failed: back to the queue, merchant's money still held. */
    protected function requeue(Payout $payout, ?string $code, ?string $description): void
    {
        Payout::withoutGlobalScope('tenant')->whereKey($payout->id)->where('status', 'processing')->update([
            'status' => 'requested',
            'result_code' => $code,
            'result_desc' => Str::limit((string) $description, 250),
        ]);

        Telegram::send(
            '⚠️ <b>Payout #'.$payout->id.' failed</b> (KES '.number_format((float) $payout->net_amount).")\n"
            .Telegram::e(($code ? "[{$code}] " : '').$description)."\n"
            .'Back in the queue — retry after funding B2C, or pay manually.'
        );
    }

    /** Ends a request without paying and returns the held money. */
    protected function refund(Payout $payout, string $status, string $reason, ?User $admin = null): Payout
    {
        return DB::transaction(function () use ($payout, $status, $reason, $admin) {
            $payout = Payout::withoutGlobalScope('tenant')->whereKey($payout->id)->lockForUpdate()->firstOrFail();

            if ($payout->status !== 'requested') {
                throw ValidationException::withMessages([
                    'payout' => $payout->status === 'processing'
                        ? ['This withdrawal is already being sent and can no longer be stopped.']
                        : ["This withdrawal is already {$payout->status}."],
                ]);
            }

            $payout->update([
                'status' => $status,
                'result_desc' => Str::limit($reason, 250),
                'approved_by' => $admin?->id ?? $payout->approved_by,
            ]);

            try {
                WalletEntry::create([
                    'tenant_id' => $payout->tenant_id,
                    'payout_id' => $payout->id,
                    'type' => WalletEntry::WITHDRAWAL_REVERSAL,
                    'amount' => $payout->net_amount,
                    'description' => $status === 'cancelled' ? 'Withdrawal cancelled — returned to wallet' : 'Withdrawal declined — returned to wallet',
                ]);
            } catch (UniqueConstraintViolationException) {
                // Already reversed.
            }

            return $payout;
        });
    }


    public static function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';

        return strlen($digits) > 6 ? substr($digits, 0, 4).'***'.substr($digits, -3) : $phone;
    }
}
