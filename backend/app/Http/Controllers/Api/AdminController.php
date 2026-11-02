<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\CheckIn;
use App\Models\Event;
use App\Models\MpesaC2bTransaction;
use App\Models\Order;
use App\Models\Payout;
use App\Models\Tenant;
use App\Models\Ticket;
use App\Models\User;
use App\Models\WalletEntry;
use App\Services\Payments\MpesaGateway;
use App\Services\Sms\AdvantaSmsClient;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The platform owner's view: money across every organiser, growth, the
 * payout liability, and the health of the M-Pesa rails. Super admins only
 * (route middleware); every query runs across tenants.
 */
class AdminController extends Controller
{
    public function overview(Request $request): JsonResponse
    {
        $days = min(365, max(7, $request->integer('days', 30)));
        $from = now('Africa/Nairobi')->startOfDay()->subDays($days - 1)->utc();
        $prevFrom = $from->copy()->subDays($days);

        return TenantContext::withoutScoping(function () use ($days, $from, $prevFrom) {
            $paid = fn () => Order::query()->where('status', 'paid');
            $inRange = fn ($q, $start, $end = null) => $q->where('paid_at', '>=', $start)->when($end, fn ($w) => $w->where('paid_at', '<', $end));

            $gmv = (float) $inRange($paid(), $from)->sum('total');
            $gmvPrev = (float) $inRange($paid(), $prevFrom, $from)->sum('total');
            $fees = -(float) WalletEntry::where('type', WalletEntry::PLATFORM_FEE)->where('created_at', '>=', $from)->sum('amount');
            $feesPrev = -(float) WalletEntry::where('type', WalletEntry::PLATFORM_FEE)->whereBetween('created_at', [$prevFrom, $from])->sum('amount');
            $orders = $inRange($paid(), $from)->count();
            $ordersPrev = $inRange($paid(), $prevFrom, $from)->count();

            return response()->json([
                'range' => ['days' => $days, 'from' => $from->toIso8601String()],
                'money' => [
                    'gmv' => $gmv,
                    'gmv_prev' => $gmvPrev,
                    'fees' => round($fees, 2),
                    'fees_prev' => round($feesPrev, 2),
                    'orders' => $orders,
                    'orders_prev' => $ordersPrev,
                    'avg_order' => $orders ? round($gmv / $orders, 2) : 0,
                    // What Tikooh holds for organisers: balances plus held withdrawals.
                    'owed_to_organisers' => round((float) WalletEntry::sum('amount'), 2),
                    'payouts_waiting' => round((float) Payout::whereIn('status', ['requested', 'processing'])->sum('net_amount'), 2),
                    'payouts_overdue' => Payout::whereIn('status', ['requested', 'processing'])->where('due_at', '<=', now())->count(),
                    'paid_out' => round((float) Payout::where('status', 'paid')->where('paid_at', '>=', $from)->sum('net_amount'), 2),
                    'fee_all_time' => round(-(float) WalletEntry::where('type', WalletEntry::PLATFORM_FEE)->sum('amount'), 2),
                ],
                'growth' => [
                    'organisers' => Tenant::whereNull('legacy_id')->count(),
                    'organisers_new' => Tenant::whereNull('legacy_id')->where('created_at', '>=', $from)->count(),
                    'organisers_selling' => Order::where('status', 'paid')->where('paid_at', '>=', $from)->distinct()->count('tenant_id'),
                    'organisers_onboarded' => Tenant::whereNull('legacy_id')->whereNotNull('onboarded_at')->count(),
                    'events_upcoming' => Event::whereIn('status', ['published', 'live'])->where('start_date', '>=', now())->count(),
                    'events_this_week' => Event::whereIn('status', ['published', 'live'])->whereBetween('start_date', [now(), now()->addWeek()])->count(),
                    'events_drafts' => Event::where('status', 'draft')->count(),
                    'tickets_sold' => Ticket::where('created_at', '>=', $from)->whereNotNull('order_id')->count(),
                    'checkins' => CheckIn::where('created_at', '>=', $from)->where('result', 'accepted')->count(),
                ],
                'daily' => $this->daily($from, $days),
                'top_organisers' => Order::query()
                    ->where('status', 'paid')->where('paid_at', '>=', $from)
                    ->selectRaw('tenant_id, SUM(total) as gmv, COUNT(*) as orders')
                    ->groupBy('tenant_id')->orderByDesc('gmv')->limit(8)
                    ->with('tenant:id,organization_name')
                    ->get()
                    ->map(fn ($r) => ['tenant_id' => $r->tenant_id, 'name' => $r->tenant?->organization_name, 'gmv' => (float) $r->gmv, 'orders' => (int) $r->orders]),
                'top_events' => Order::query()
                    ->where('status', 'paid')->where('paid_at', '>=', $from)
                    ->selectRaw('event_id, SUM(total) as gmv, COUNT(*) as orders')
                    ->groupBy('event_id')->orderByDesc('gmv')->limit(8)
                    ->with('event:id,uuid,title,start_date,tenant_id', 'event.tenant:id,organization_name')
                    ->get()
                    ->map(fn ($r) => [
                        'uuid' => $r->event?->uuid, 'title' => $r->event?->title, 'organiser' => $r->event?->tenant?->organization_name,
                        'start_date' => $r->event?->start_date, 'gmv' => (float) $r->gmv, 'orders' => (int) $r->orders,
                    ]),
                'recent_orders' => Order::query()
                    ->where('status', 'paid')->latest('paid_at')->limit(10)
                    ->with('event:id,uuid,title', 'tenant:id,organization_name')
                    ->get(['id', 'reference', 'tenant_id', 'event_id', 'buyer_name', 'total', 'provider', 'paid_at'])
                    ->map(fn (Order $o) => [
                        'reference' => $o->reference, 'buyer' => $o->buyer_name, 'total' => (float) $o->total, 'provider' => $o->provider,
                        'event' => $o->event?->title, 'organiser' => $o->tenant?->organization_name, 'paid_at' => $o->paid_at,
                    ]),
                'recent_signups' => Tenant::whereNull('legacy_id')->latest('id')->limit(8)
                    ->withCount('events')
                    ->get(['id', 'organization_name', 'business_type', 'payout_phone', 'onboarded_at', 'suspended', 'created_at'])
                    ->map(fn (Tenant $t) => [
                        'id' => $t->id, 'name' => $t->organization_name, 'type' => $t->business_type, 'events' => $t->events_count,
                        'payout_set' => (bool) $t->payout_phone, 'onboarded' => (bool) $t->onboarded_at, 'suspended' => $t->suspended, 'created_at' => $t->created_at,
                    ]),
                'health' => [
                    'b2c_lock' => MpesaGateway::initiatorLock(),
                    'c2b_unmatched' => MpesaC2bTransaction::where('status', '!=', 'matched')->count(),
                    'failed_jobs' => DB::table('failed_jobs')->count(),
                    'queue_waiting' => DB::table('jobs')->count(),
                    'pending_orders' => Order::where('status', 'pending')->where('created_at', '>=', now()->subDay())->count(),
                ],
            ]);
        });
    }

    public function organisers(Request $request): JsonResponse
    {
        $search = $request->string('search')->toString();

        return TenantContext::withoutScoping(fn () => response()->json(
            Tenant::query()
                ->when(! $request->boolean('include_legacy'), fn ($q) => $q->whereNull('legacy_id'))
                ->when($search, fn ($q) => $q->where(fn ($w) => $w->where('organization_name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")))
                ->when($request->string('filter')->toString(), fn ($q, $f) => match ($f) {
                    'suspended' => $q->where('suspended', true),
                    'no_payout' => $q->whereNull('payout_phone'),
                    'selling' => $q->whereHas('events', fn ($e) => $e->whereIn('status', ['published', 'live'])->where('start_date', '>=', now())),
                    default => $q,
                })
                ->withCount('events')
                ->addSelect([
                    'gmv' => Order::selectRaw('COALESCE(SUM(total), 0)')->whereColumn('tenant_id', 'tenants.id')->where('status', 'paid'),
                    'balance' => WalletEntry::selectRaw('COALESCE(SUM(amount), 0)')->whereColumn('tenant_id', 'tenants.id'),
                    'owner_email' => User::select('email')->whereColumn('tenant_id', 'tenants.id')->orderBy('id')->limit(1),
                    'last_sale_at' => Order::select('paid_at')->whereColumn('tenant_id', 'tenants.id')->where('status', 'paid')->latest('paid_at')->limit(1),
                ])
                ->orderByDesc('gmv')->orderByDesc('id')
                ->paginate($request->integer('per_page', 50), [
                    'tenants.id', 'organization_name', 'business_type', 'email', 'phone', 'payout_phone', 'payout_name',
                    'platform_fee_percent', 'suspended', 'onboarded_at', 'created_at',
                ])
        ));
    }

    /**
     * Everything about one organiser on one screen: profile, how each event
     * performed, money in and out, messaging and who did what.
     */
    public function organiser(int $tenant): JsonResponse
    {
        return TenantContext::withoutScoping(function () use ($tenant) {
            $t = Tenant::findOrFail($tenant);
            $paid = fn () => Order::where('tenant_id', $t->id)->where('status', 'paid');

            $events = Event::where('tenant_id', $t->id)
                ->withCount([
                    'attendees as attendees_count' => fn ($q) => $q->whereNot('status', 'cancelled'),
                    'attendees as checked_in_count' => fn ($q) => $q->whereNotNull('checked_in_at'),
                ])
                ->addSelect([
                    'revenue' => Order::selectRaw('COALESCE(SUM(total), 0)')->whereColumn('event_id', 'events.id')->where('status', 'paid'),
                    'orders_count' => Order::selectRaw('COUNT(*)')->whereColumn('event_id', 'events.id')->where('status', 'paid'),
                    'tickets_sold' => DB::table('ticket_tiers')->selectRaw('COALESCE(SUM(sold), 0)')->whereColumn('event_id', 'events.id'),
                    'capacity' => DB::table('ticket_tiers')->selectRaw('COALESCE(SUM(capacity), 0)')->whereColumn('event_id', 'events.id'),
                ])
                ->orderByDesc('start_date')
                ->get(['events.id', 'events.uuid', 'events.title', 'events.status', 'events.is_public', 'events.start_date', 'events.city', 'events.location_name']);

            $wallet = WalletEntry::where('tenant_id', $t->id)->selectRaw('type, COALESCE(SUM(amount), 0) as total')->groupBy('type')->pluck('total', 'type');
            $attendees = (int) $events->sum('attendees_count');
            $checkedIn = (int) $events->sum('checked_in_count');

            return response()->json([
                'organiser' => $t->only([
                    'id', 'uuid', 'organization_name', 'business_type', 'contact_person', 'email', 'phone', 'website',
                    'kra_pin', 'payout_phone', 'payout_name', 'platform_fee_percent', 'suspended', 'onboarded_at', 'created_at',
                ]) + ['effective_fee_percent' => $t->feePercent()],
                'kpis' => [
                    'gmv' => (float) $paid()->sum('total'),
                    'orders' => $paid()->count(),
                    'gmv_30d' => (float) $paid()->where('paid_at', '>=', now()->subDays(30))->sum('total'),
                    'fees_earned' => -(float) ($wallet[WalletEntry::PLATFORM_FEE] ?? 0),
                    'tickets_sold' => (int) $events->sum('tickets_sold'),
                    'attendees' => $attendees,
                    'check_in_rate' => $attendees > 0 ? round($checkedIn / $attendees * 100, 1) : null,
                    'events' => $events->count(),
                    'live_events' => $events->whereIn('status', ['published', 'live'])->where('start_date', '>=', now())->count(),
                    'wallet_balance' => (float) $wallet->sum(),
                    'withdrawn' => (float) Payout::where('tenant_id', $t->id)->where('status', 'paid')->sum('net_amount'),
                    'pending_payouts' => (float) Payout::where('tenant_id', $t->id)->whereIn('status', ['requested', 'processing'])->sum('net_amount'),
                    'contacts' => DB::table('contacts')->where('tenant_id', $t->id)->count(),
                    'last_sale_at' => $paid()->max('paid_at'),
                ],
                'events' => $events,
                'orders' => Order::where('tenant_id', $t->id)->with('event:id,title')->latest('id')->limit(25)
                    ->get(['id', 'event_id', 'reference', 'buyer_name', 'buyer_email', 'buyer_phone', 'total', 'status', 'provider', 'paid_at', 'created_at']),
                'payouts' => Payout::where('tenant_id', $t->id)->latest('id')->limit(25)
                    ->get(['id', 'net_amount', 'destination_account', 'status', 'payment_method', 'mpesa_receipt', 'result_desc', 'due_at', 'paid_at', 'created_at']),
                'campaigns' => DB::table('campaigns')->where('tenant_id', $t->id)->latest('id')->limit(25)
                    ->get(['uuid', 'name', 'channel', 'status', 'recipient_count', 'sent_count', 'failed_count', 'completed_at', 'created_at']),
                'messages' => DB::table('message_logs')->where('tenant_id', $t->id)->latest('id')->limit(25)
                    ->get(['id', 'channel', 'type', 'to', 'subject', 'status', 'error', 'created_at']),
                'team' => User::where('tenant_id', $t->id)->orderBy('id')->get(['id', 'name', 'email', 'phone', 'role', 'created_at', 'last_login_at']),
                'activity' => ActivityLog::where('tenant_id', $t->id)->with('user:id,name')->latest('id')->limit(40)
                    ->get(['id', 'user_id', 'action', 'description', 'subject_type', 'subject_id', 'created_at']),
            ]);
        });
    }

    /** Suspend / unsuspend, fee deals, and correcting an organiser's details. */
    public function updateOrganiser(Request $request, int $tenant): JsonResponse
    {
        $data = $request->validate([
            'suspended' => ['sometimes', 'boolean'],
            'platform_fee_percent' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:50'],
            'organization_name' => ['sometimes', 'string', 'max:255'],
            'business_type' => ['sometimes', 'nullable', 'string', 'max:60'],
            'contact_person' => ['sometimes', 'nullable', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'website' => ['sometimes', 'nullable', 'url', 'max:255'],
            'kra_pin' => ['sometimes', 'nullable', 'string', 'max:20'],
            'payout_phone' => ['sometimes', 'nullable', 'string', 'max:20'],
            'payout_name' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        // Payouts go to this number, so store it the way B2C expects.
        if (! empty($data['payout_phone'])) {
            $data['payout_phone'] = AdvantaSmsClient::normalise($data['payout_phone']);
        }

        $model = Tenant::findOrFail($tenant);
        $model->update($data);

        $action = match (true) {
            array_key_exists('suspended', $data) => $data['suspended'] ? 'tenant_suspended' : 'tenant_unsuspended',
            array_keys($data) === ['platform_fee_percent'] => 'tenant_fee_changed',
            default => 'tenant_updated_by_admin',
        };

        ActivityLog::record($action, $model, json_encode($data));

        return response()->json($model->fresh());
    }

    /** One row per Nairobi calendar day, zero-filled so the chart has no gaps. */
    protected function daily(Carbon $from, int $days): array
    {
        $day = match (DB::connection()->getDriverName()) {
            'sqlite' => "date(paid_at, '+3 hours')",
            'pgsql' => "to_char(paid_at + interval '3 hours', 'YYYY-MM-DD')",
            default => 'DATE(DATE_ADD(paid_at, INTERVAL 3 HOUR))',
        };

        $rows = Order::query()
            ->where('status', 'paid')->where('paid_at', '>=', $from)
            ->selectRaw("{$day} as day, SUM(total) as gmv, COUNT(*) as orders")
            ->groupBy('day')
            ->get()
            ->keyBy('day');

        $out = [];
        $cursor = $from->copy()->timezone('Africa/Nairobi');
        for ($i = 0; $i < $days; $i++) {
            $key = $cursor->format('Y-m-d');
            $out[] = ['date' => $key, 'gmv' => (float) ($rows[$key]->gmv ?? 0), 'orders' => (int) ($rows[$key]->orders ?? 0)];
            $cursor->addDay();
        }

        return $out;
    }
}
