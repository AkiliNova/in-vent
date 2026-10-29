<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\MpesaC2bTransaction;
use App\Models\Payout;
use App\Models\WalletEntry;
use App\Services\Payments\MpesaGateway;
use App\Services\WalletService;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class WalletController extends Controller
{
    public function __construct(protected WalletService $wallet) {}

    public function show(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;

        return response()->json([
            'summary' => $this->wallet->summary($tenant->id),
            'fee_percent' => $tenant->feePercent(),
            'payout_phone' => $tenant->payout_phone ? WalletService::maskPhone($tenant->payout_phone) : null,
            'payout_name' => $tenant->payout_name,
            'min_withdrawal' => (float) config('tikooh.min_withdrawal'),
            'withdrawals_paused' => MpesaGateway::initiatorLock() !== null,
            'entries' => WalletEntry::query()
                ->with('event:id,uuid,title')
                ->latest('id')
                ->limit(100)
                ->get(['id', 'event_id', 'order_id', 'payout_id', 'type', 'amount', 'currency', 'description', 'created_at']),
            'payouts' => Payout::query()
                ->latest('id')
                ->limit(50)
                ->get(['id', 'net_amount', 'currency', 'destination_account', 'status', 'mpesa_receipt', 'result_desc', 'paid_at', 'created_at'])
                ->map(fn (Payout $p) => array_merge($p->toArray(), [
                    'destination_account' => WalletService::maskPhone((string) $p->destination_account),
                ])),
            'by_event' => WalletEntry::query()
                ->whereNotNull('event_id')
                ->with('event:id,uuid,title,start_date')
                ->selectRaw('event_id, SUM(CASE WHEN type = ? THEN amount ELSE 0 END) as gross, SUM(CASE WHEN type = ? THEN -amount ELSE 0 END) as fees, SUM(amount) as net', [WalletEntry::SALE, WalletEntry::PLATFORM_FEE])
                ->groupBy('event_id')
                ->get(),
        ]);
    }

    /**
     * Sends money to the organiser's registered payout number — never to a
     * number given in the request — and requires the account password, so a
     * stolen session token alone cannot drain a wallet.
     */
    public function withdraw(Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'password' => ['required', 'string'],
        ]);

        $user = $request->user();
        $tenant = $user->tenant;

        if (! $user->password || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['password' => ['Your password is incorrect.']]);
        }

        if (! $tenant->payout_phone) {
            throw ValidationException::withMessages(['amount' => ['Add your M-Pesa payout number first.']]);
        }

        $payout = $this->wallet->withdraw($tenant, $user, (float) $data['amount'], $tenant->payout_phone);

        ActivityLog::record('withdrawal_requested', $payout, "Withdrawal of KES {$payout->net_amount}");

        return response()->json([
            'payout' => $payout->only(['id', 'net_amount', 'status', 'created_at']),
            'balance' => $this->wallet->balance($tenant->id),
            'message' => 'Withdrawal sent. You will receive an M-Pesa message shortly.',
        ], 201);
    }

    /** Platform view of paybill payments that did not match an order cleanly. */
    public function unmatchedC2b(): JsonResponse
    {
        return response()->json(TenantContext::withoutScoping(fn () => MpesaC2bTransaction::query()
            ->where('status', '!=', 'matched')
            ->latest('id')
            ->paginate(50)));
    }

    /** Platform view of payouts still waiting on Safaricom. */
    public function pendingPayouts(): JsonResponse
    {
        return response()->json([
            'initiator_lock' => MpesaGateway::initiatorLock(),
            'payouts' => TenantContext::withoutScoping(fn () => Payout::query()
                ->with('tenant:id,organization_name')
                ->where('status', 'processing')
                ->oldest('id')
                ->get()),
        ]);
    }
}
