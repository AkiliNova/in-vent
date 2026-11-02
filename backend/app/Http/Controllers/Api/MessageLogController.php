<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MessageLog;
use App\Models\Payout;
use App\Models\Tenant;
use App\Models\WalletEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Super admin: every email/SMS sent, and the full story of each payout. */
class MessageLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = trim($request->string('q')->toString());

        $page = MessageLog::query()
            ->select(['id', 'tenant_id', 'channel', 'type', 'to', 'subject', 'status', 'error', 'provider', 'related_type', 'related_id', 'created_at'])
            ->when($request->string('channel')->toString(), fn ($w, $v) => $w->where('channel', $v))
            ->when($request->string('status')->toString(), fn ($w, $v) => $w->where('status', $v))
            ->when($request->string('type')->toString(), fn ($w, $v) => $w->where('type', $v))
            ->when($request->string('related_type')->toString(), fn ($w, $v) => $w->where('related_type', $v)
                ->when($request->integer('related_id'), fn ($x, $id) => $x->where('related_id', $id)))
            ->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('to', 'like', "%{$q}%")->orWhere('subject', 'like', "%{$q}%")))
            ->latest('id')
            ->paginate(min(100, $request->integer('per_page', 50)));

        $tenants = Tenant::whereIn('id', $page->getCollection()->pluck('tenant_id')->filter()->unique())->pluck('organization_name', 'id');
        $page->getCollection()->each(fn ($m) => $m->setAttribute('organiser', $tenants[$m->tenant_id] ?? null));

        return response()->json($page->toArray() + [
            'stats' => [
                'today' => MessageLog::where('created_at', '>=', today())->count(),
                'failed_7d' => MessageLog::where('status', 'failed')->where('created_at', '>=', now()->subWeek())->count(),
                'email_7d' => MessageLog::where('channel', 'email')->where('created_at', '>=', now()->subWeek())->count(),
                'sms_7d' => MessageLog::where('channel', 'sms')->where('created_at', '>=', now()->subWeek())->count(),
            ],
        ]);
    }

    public function show(MessageLog $message): JsonResponse
    {
        return response()->json($message->makeVisible('body'));
    }

    /** Request → approval → money → emails, in order. */
    public function payoutHistory(int $payout): JsonResponse
    {
        $p = Payout::withoutGlobalScope('tenant')->with('requester:id,name,email', 'approver:id,name', 'tenant:id,organization_name')->findOrFail($payout);
        $tz = 'Africa/Nairobi';
        $events = [];

        $events[] = ['at' => $p->created_at, 'kind' => 'requested', 'title' => 'Requested by '.($p->requester?->name ?? 'organiser'), 'detail' => 'KES '.number_format((float) $p->net_amount).' to '.$p->destination_account];

        if ($p->approved_at) {
            $events[] = ['at' => $p->approved_at, 'kind' => 'approved', 'title' => 'Approved by '.($p->approver?->name ?? 'admin'), 'detail' => $p->payment_method === 'b2c' ? 'Sent via M-Pesa B2C' : ($p->payment_method === 'manual' ? 'Paid manually' : null)];
        }

        foreach (WalletEntry::withoutGlobalScope('tenant')->where('payout_id', $p->id)->orderBy('id')->get() as $w) {
            $events[] = ['at' => $w->created_at, 'kind' => 'wallet', 'title' => $w->description, 'detail' => 'KES '.number_format((float) $w->amount)];
        }

        if ($p->status === 'paid') {
            $events[] = ['at' => $p->paid_at, 'kind' => 'paid', 'title' => 'Paid', 'detail' => $p->mpesa_receipt ? 'M-Pesa receipt '.$p->mpesa_receipt : null];
        } elseif (in_array($p->status, ['rejected', 'cancelled'], true)) {
            $events[] = ['at' => $p->updated_at, 'kind' => $p->status, 'title' => ucfirst($p->status), 'detail' => $p->result_desc];
        } elseif ($p->result_desc) {
            $events[] = ['at' => $p->updated_at, 'kind' => 'note', 'title' => 'Latest status', 'detail' => ($p->result_code ? "[{$p->result_code}] " : '').$p->result_desc];
        }

        foreach (MessageLog::where('related_type', 'payout')->where('related_id', $p->id)->orderBy('id')->get(['id', 'channel', 'to', 'subject', 'status', 'error', 'created_at']) as $m) {
            $events[] = ['at' => $m->created_at, 'kind' => 'message', 'title' => ($m->status === 'failed' ? 'Email failed: ' : 'Email sent: ').$m->subject, 'detail' => $m->to.($m->error ? ' · '.$m->error : ''), 'message_id' => $m->id, 'status' => $m->status];
        }

        usort($events, fn ($a, $b) => ($a['at']?->getTimestamp() ?? 0) <=> ($b['at']?->getTimestamp() ?? 0));

        return response()->json([
            'payout' => $p->only(['id', 'status', 'net_amount', 'destination_account', 'mpesa_receipt', 'due_at', 'paid_at']) + ['organiser' => $p->tenant?->organization_name],
            'events' => array_map(fn ($e) => ['at' => $e['at']?->copy()->timezone($tz)->toIso8601String()] + $e, $events),
        ]);
    }
}
