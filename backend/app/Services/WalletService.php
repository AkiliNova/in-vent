<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Payout;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WalletEntry;
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

        $withdrawn = -($byType[WalletEntry::WITHDRAWAL] ?? 0) - ($byType[WalletEntry::WITHDRAWAL_REVERSAL] ?? 0);

        return [
            'balance' => $this->balance($tenantId),
            'gross_sales' => $byType[WalletEntry::SALE] ?? 0.0,
            'platform_fees' => -($byType[WalletEntry::PLATFORM_FEE] ?? 0.0),
            'withdrawn' => round($withdrawn, 2),
            'in_flight' => round((float) Payout::withoutGlobalScope('tenant')
                ->where('tenant_id', $tenantId)
                ->where('status', 'processing')
                ->sum('net_amount'), 2),
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
     * Debits the wallet and sends the money by B2C. The debit commits first;
     * if Safaricom will not even queue the payment, it is reversed at once.
     */
    public function withdraw(Tenant $tenant, User $user, float $amount, string $phone): Payout
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
                'originator_conversation_id' => (string) Str::uuid(),
                'status' => 'processing',
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

        try {
            $result = (new MpesaGateway)->b2c(
                $phone,
                (int) $amount,
                $payout->originator_conversation_id,
                route('webhooks.daraja.b2c.result', ['token' => config('services.mpesa.c2b_token')]),
                route('webhooks.daraja.b2c.timeout', ['token' => config('services.mpesa.c2b_token')]),
                'Payout '.$tenant->slug
            );
        } catch (ConnectionException $e) {
            // The request may have reached Safaricom; refunding now could pay
            // out twice. Leave it processing for the result callback, or for
            // an admin to resolve.
            report($e);
            $payout->update(['result_desc' => 'Awaiting confirmation from M-Pesa']);

            return $payout->fresh();
        } catch (\Throwable $e) {
            report($e);
            $this->failWithdrawal($payout, 'not_sent', $e->getMessage());

            throw ValidationException::withMessages(['amount' => [$e->getMessage()]]);
        }

        if (! $result['accepted']) {
            Log::warning('B2C not accepted', ['payout' => $payout->id, 'raw' => $result['raw']]);
            $this->failWithdrawal($payout, 'rejected', $result['description']);

            throw ValidationException::withMessages([
                'amount' => ['M-Pesa did not accept the withdrawal. Your balance has been restored.'],
            ]);
        }

        $payout->update(['conversation_id' => $result['conversation_id']]);

        return $payout->fresh();
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

                return $payout;
            }

            // 2001 = initiator information invalid, 8006 = credential locked.
            if (in_array($result['result_code'], ['2001', '8006'], true)) {
                MpesaGateway::lockInitiator($result['result_code'], $result['result_desc']);
            }

            $payout->update(['raw_result' => $raw]);
            $this->failWithdrawal($payout, $result['result_code'], $result['result_desc']);

            return $payout->fresh();
        });
    }

    /** Marks a payout failed and gives the money back. */
    public function failWithdrawal(Payout $payout, ?string $code, ?string $description): void
    {
        DB::transaction(function () use ($payout, $code, $description) {
            $payout = Payout::withoutGlobalScope('tenant')->whereKey($payout->id)->lockForUpdate()->first();

            if ($payout->status !== 'processing') {
                return;
            }

            $payout->update([
                'status' => 'rejected',
                'result_code' => $code,
                'result_desc' => Str::limit((string) $description, 250),
            ]);

            try {
                WalletEntry::create([
                    'tenant_id' => $payout->tenant_id,
                    'payout_id' => $payout->id,
                    'type' => WalletEntry::WITHDRAWAL_REVERSAL,
                    'amount' => $payout->net_amount,
                    'description' => 'Withdrawal failed — refunded to wallet',
                ]);
            } catch (UniqueConstraintViolationException) {
                // Already reversed.
            }
        });
    }

    public static function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';

        return strlen($digits) > 6 ? substr($digits, 0, 4).'***'.substr($digits, -3) : $phone;
    }
}
