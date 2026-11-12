<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendCampaign;
use App\Mail\CampaignMail;
use App\Models\Attendee;
use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Models\Event;
use App\Models\SmsNumberFlag;
use App\Models\Suppression;
use App\Models\Tenant;
use App\Models\TicketTier;
use App\Services\CampaignAudience;
use App\Services\Sms\AdvantaSmsClient;
use App\Services\Sms\AfricasTalkingSmsClient;
use App\Services\Sms\PhoneCheck;
use App\Services\Sms\Sms;
use App\Services\Sms\SmsMessage;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/** Tikooh feature 2: email and bulk SMS to attendees and imported contacts. */
class CampaignController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(
            Campaign::query()
                ->with('event:id,title', 'featuredEvent:id,uuid,title', 'monitors:id,campaign_id,destination,status,error,sent_at,delivered_at')
                ->withCount(['recipients as phones_added' => fn ($q) => $q->whereNotNull('phone_added_at')])
                ->when($request->integer('event_id'), fn ($q, $id) => $q->where('event_id', $id))
                ->when($request->string('channel')->toString(), fn ($q, $c) => $q->where('channel', $c))
                ->latest()
                ->paginate($request->integer('per_page', 25))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $campaign = Campaign::create($data + [
            // Platform staff have no tenant in context; their campaigns belong
            // to their own account's tenant (which also owns the unsubscribes).
            'tenant_id' => TenantContext::id() ?? $request->user()->tenant_id,
            'created_by' => $request->user()->id,
        ]);

        $this->rememberMonitors($request, $data);

        return response()->json($this->refreshCounts($campaign), 201);
    }

    public function update(Request $request, Campaign $campaign): JsonResponse
    {
        abort_unless(in_array($campaign->status, ['draft', 'scheduled'], true), 422, 'This campaign has already been sent.');

        $campaign->update($data = $this->validated($request, $campaign));
        $this->rememberMonitors($request, $data);

        return response()->json($this->refreshCounts($campaign));
    }

    /** The composer pre-fills the sender's confirmation numbers next time. */
    protected function rememberMonitors(Request $request, array $data): void
    {
        if (array_key_exists('monitor_numbers', $data) && ($data['channel'] ?? 'sms') === 'sms') {
            $request->user()->forceFill(['sms_monitor_numbers' => $data['monitor_numbers']])->save();
        }
    }

    public function destroy(Campaign $campaign): JsonResponse
    {
        abort_unless(in_array($campaign->status, ['draft', 'scheduled', 'cancelled'], true), 422, 'A sent campaign is kept for its delivery report.');

        $campaign->delete();

        return response()->json(null, 204);
    }

    /** Dry run: how many people, and what it will cost. */
    public function preview(Request $request, Campaign $campaign): JsonResponse
    {
        return response()->json($this->audienceSummary($campaign));
    }

    /** Live count while the organiser is still composing — nothing is saved. */
    public function audience(Request $request): JsonResponse
    {
        return response()->json($this->audienceSummary($this->draft($request)));
    }

    /** The review screen: everyone the filters match, with why anyone is skipped. */
    public function people(Request $request): JsonResponse
    {
        $request->validate([
            'state' => ['nullable', Rule::in([...CampaignAudience::STATES, 'skipped'])],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        return response()->json(CampaignAudience::people(
            $this->draft($request),
            $request->input('state'),
            $request->input('search'),
            $request->integer('page', 1),
            $request->integer('per_page', 50),
        ));
    }

    /** Values the refine filters can take for the events in scope. */
    public function facets(Request $request): JsonResponse
    {
        $draft = $this->draft($request);
        $user = $request->user();
        $events = CampaignAudience::eventIds($draft);
        $tenants = $user->isSuperAdmin() ? array_map('intval', (array) ($draft->audience_filter['tenant_ids'] ?? [])) : [];

        $attendees = fn () => Attendee::withoutGlobalScope('tenant')
            ->when(! $user->isSuperAdmin(), fn ($q) => $q->where('tenant_id', $draft->tenant_id))
            ->when($tenants, fn ($q) => $q->whereIn('tenant_id', $tenants))
            ->when($events, fn ($q) => $q->whereIn('event_id', $events));

        $tiers = $events
            ? TicketTier::withoutGlobalScope('tenant')
                ->with('event:id,title')
                ->whereIn('event_id', $events)
                ->orderBy('event_id')->orderBy('price')
                ->get(['id', 'event_id', 'name', 'price'])
                ->map(fn ($t) => ['id' => $t->id, 'name' => $t->name, 'price' => (float) $t->price, 'event' => $t->event?->title])
            : [];

        $distinct = fn (string $column) => $attendees()->whereNotNull($column)->where($column, '!=', '')
            ->distinct()->orderBy($column)->limit(100)->pluck($column);

        return response()->json([
            'tiers' => $tiers,
            'categories' => $distinct('category'),
            'statuses' => $distinct('status'),
            'countries' => $distinct('country'),
        ]);
    }

    /**
     * Which SMS provider is live, what a part costs, and — for platform
     * staff — the Africa's Talking balance the campaign will draw on.
     */
    public function smsStatus(Request $request): JsonResponse
    {
        $provider = config('services.sms.provider') === 'africastalking' ? 'africastalking' : 'advanta';
        $admin = $request->user()->isSuperAdmin();

        $out = [
            'provider' => $provider,
            'provider_label' => $provider === 'africastalking' ? 'Africa\'s Talking' : 'Advanta',
            'configured' => $provider === 'africastalking' ? AfricasTalkingSmsClient::configured() : (bool) config('services.advanta.api_key'),
            'cost_per_segment' => $this->costPerSegment(),
            'currency' => 'KES',
            // Pre-fill for "Send a copy to": what they used last, else their own phone.
            'monitor_numbers' => $request->user()->sms_monitor_numbers
                ?: array_values(array_filter([$request->user()->phone])),
        ];

        if ($admin) {
            $out += [
                'sandbox' => $provider === 'africastalking' && AfricasTalkingSmsClient::isSandbox(),
                'sender_id' => $provider === 'africastalking' ? (config('services.africastalking.sender_id') ?: null) : (config('services.advanta.shortcode') ?: null),
                'countries' => (string) (config('services.sms.countries') ?: '254'),
                'flagged_numbers' => SmsNumberFlag::count(),
                'balance' => $provider === 'africastalking' ? AfricasTalkingSmsClient::balance($request->boolean('fresh')) : null,
            ];
        }

        return response()->json($out);
    }

    /** Admin: the numbers the provider permanently rejected, and a way to clear one. */
    public function flaggedNumbers(Request $request): JsonResponse
    {
        return response()->json(SmsNumberFlag::query()
            ->when($request->string('q')->toString(), fn ($q, $s) => $q->where('number', 'like', '%'.preg_replace('/\D+/', '', $s).'%'))
            ->latest('last_failed_at')
            ->paginate($request->integer('per_page', 50)));
    }

    public function unflagNumber(SmsNumberFlag $flag): JsonResponse
    {
        $flag->delete();
        PhoneCheck::reset();

        return response()->json(null, 204);
    }

    /** Admin: paste numbers, see which would go through, before any campaign. */
    public function checkNumbers(Request $request): JsonResponse
    {
        $data = $request->validate(['numbers' => ['required', 'string', 'max:200000']]);

        // One number per line (or comma/semicolon/tab): spaces stay, since
        // people paste "0712 345 678".
        $rows = collect(preg_split('/[\r\n,;\t]+/', $data['numbers']))
            ->map(fn ($n) => trim((string) $n))
            // Count digits, not runs of them: "+256 772 123 456" has no 4 in a row.
            ->filter(fn ($n) => strlen(preg_replace('/\D+/', '', (string) $n)) >= 4)
            ->take(5000)
            ->map(fn ($n) => ['input' => $n] + PhoneCheck::classify($n))
            ->values();

        return response()->json([
            'counts' => $rows->countBy('status')->all() + ['total' => $rows->count()],
            'networks' => $rows->where('status', 'ok')->countBy('network')->sortDesc()->all(),
            'rows' => $rows,
        ]);
    }

    /** An unsaved campaign built from the composer's current state. */
    protected function draft(Request $request): Campaign
    {
        $data = $this->validated($request, partial: true);

        $draft = new Campaign($data + ['channel' => $data['channel'] ?? 'email', 'body' => $data['body'] ?? '']);
        $draft->tenant_id = TenantContext::id() ?? $request->user()->tenant_id;
        $draft->created_by = $request->user()->id;
        $draft->setRelation('creator', $request->user());

        return $draft;
    }

    /** Sends one copy to the signed-in user so they can see it in a real inbox. */
    public function test(Request $request, Campaign $campaign): JsonResponse
    {
        $user = $request->user();

        if ($campaign->channel === 'sms') {
            return $this->testSms($request, $campaign);
        }

        $first = explode(' ', (string) $user->name)[0] ?: 'there';
        $fill = fn (string $s) => strtr($s, ['{{first_name}}' => $first, '{{last_name}}' => '', '{{name}}' => $user->name, '{{company}}' => '', '{{category}}' => '']);

        Mail::to($user->email)->send(CampaignMail::forCampaign(
            $campaign->loadMissing('featuredEvent', 'tenant'),
            subjectLine: '[Test] '.$fill($campaign->subject ?? $campaign->name),
            body: $fill($campaign->body),
            unsubscribeUrl: null,
            // Test copy: the button shows, but there is no recipient row to save against.
            phoneUrl: $campaign->ask_phone ? rtrim((string) config('app.frontend_url'), '/') : null,
        ));

        return response()->json(['message' => "Test sent to {$user->email}."]);
    }

    /**
     * Text the campaign to the sender's confirmation numbers only, exactly as
     * recipients will get it (personalised with the sender's name), and say
     * per number whether the provider accepted it.
     */
    protected function testSms(Request $request, Campaign $campaign): JsonResponse
    {
        $campaign->setRelation('creator', $request->user());
        $monitors = CampaignAudience::monitors($campaign);

        if ($monitors === [] && $request->user()->phone) {
            $campaign->monitor_numbers = [$request->user()->phone];
            $monitors = CampaignAudience::monitors($campaign);
        }

        abort_if($monitors === [], 422, 'Add a confirmation number (yours) to send a test SMS to.');

        $client = Sms::client($campaign->tenant_id)->about('campaign_test', 'campaign', $campaign->id);
        $results = [];

        foreach ($monitors as $m) {
            $out = $client->send([$m['destination']], SmsMessage::personalise((string) $campaign->body, $m['first_name'], $m['last_name']));
            $results[] = [
                'number' => $m['destination'],
                'ok' => $out['sent'] > 0,
                'error' => data_get($out, 'failed.0.error'),
                'segments' => $m['segments'],
            ];
        }

        AfricasTalkingSmsClient::forgetBalance();
        $sent = collect($results)->where('ok', true)->count();

        return response()->json([
            'message' => $sent === count($results)
                ? 'Test SMS sent to '.collect($results)->map(fn ($r) => '+'.$r['number'])->join(', ').'.'
                : "{$sent} of ".count($results).' test SMS accepted.',
            'results' => $results,
        ], $sent ? 200 : 422);
    }

    public function uploadImage(Request $request): JsonResponse
    {
        $request->validate(['image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120']]);

        $tenant = TenantContext::id() ?? $request->user()->tenant_id;
        $path = $request->file('image')->store("campaigns/{$tenant}", 'public');

        return response()->json(['path' => $path, 'url' => Storage::disk('public')->url($path)], 201);
    }

    public function send(Request $request, Campaign $campaign): JsonResponse
    {
        abort_unless(in_array($campaign->status, ['draft', 'scheduled'], true), 422, 'This campaign has already been sent.');

        if ($campaign->channel === 'sms') {
            $summary = CampaignAudience::summary($campaign);
            abort_if($summary['recipient_count'] === 0, 422, 'Nobody in this audience has a number we can text.');
            $this->ensureBalance($request, $this->costFor($summary['credits']));
        }

        $campaign->update(['status' => 'queued', 'scheduled_for' => null]);
        SendCampaign::dispatch($campaign);

        return response()->json(['status' => 'queued'], 202);
    }

    public function schedule(Request $request, Campaign $campaign): JsonResponse
    {
        abort_unless(in_array($campaign->status, ['draft', 'scheduled'], true), 422, 'This campaign has already been sent.');

        $data = $request->validate([
            'scheduled_for' => ['required', 'date', 'after:now'],
        ]);

        $campaign->update(['status' => 'scheduled', 'scheduled_for' => $data['scheduled_for']]);

        return response()->json($campaign->fresh());
    }

    public function cancel(Campaign $campaign): JsonResponse
    {
        abort_unless($campaign->status === 'scheduled', 422, 'Only a scheduled campaign can be cancelled.');

        $campaign->update(['status' => 'draft', 'scheduled_for' => null]);

        return response()->json($campaign->fresh());
    }

    /** Per-recipient delivery report — the thing the old proxy could not give. */
    public function report(Request $request, Campaign $campaign): JsonResponse
    {
        return response()->json([
            'campaign' => $campaign->only([
                'name', 'channel', 'status', 'recipient_count',
                'sent_count', 'delivered_count', 'failed_count', 'estimated_cost',
            ]),
            'breakdown' => $campaign->recipients()
                ->selectRaw('status, COUNT(*) as total')
                ->groupBy('status')
                ->pluck('total', 'status'),
            'failures' => $campaign->recipients()
                ->whereIn('status', ['failed', 'bounced'])
                ->limit(100)
                ->get(['destination', 'error', 'updated_at']),
            // The sender's own copies: did it land, and when.
            'monitors' => $campaign->recipients()
                ->where('is_monitor', true)
                ->get(['destination', 'status', 'error', 'sent_at', 'delivered_at']),
            'skipped' => $campaign->recipients()
                ->where('status', 'skipped')
                ->limit(200)
                ->get(['destination', 'first_name', 'last_name', 'error']),
            'recipients' => $campaign->recipients()
                ->with('attendee:id,first_name,last_name')
                ->paginate($request->integer('per_page', 50)),
        ]);
    }

    /** Unsubscribe endpoint hit from a message footer. Public. */
    public function unsubscribe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tenant' => ['required', 'uuid'],
            'channel' => ['required', 'in:sms,email'],
            'destination' => ['required', 'string', 'max:255'],
        ]);

        $tenant = Tenant::where('uuid', $data['tenant'])->firstOrFail();

        $this->suppress($tenant->id, $data['channel'], $data['destination']);

        return response()->json(['message' => 'You will not receive further messages.']);
    }

    /**
     * The link in the email footer. GET only shows a button: mail scanners
     * (Outlook Safe Links, antivirus) prefetch links, and must not
     * unsubscribe people by doing so.
     */
    public function unsubscribePage(CampaignRecipient $recipient)
    {
        return response()->view('mail.unsubscribe', ['done' => false, 'sender' => $this->senderFor($recipient)]);
    }

    /** The button on that page, and the one-click POST Gmail/Yahoo send. */
    public function unsubscribeConfirm(CampaignRecipient $recipient)
    {
        $campaign = Campaign::withoutGlobalScope('tenant')->find($recipient->campaign_id);

        if ($campaign) {
            $this->suppress($campaign->tenant_id, $campaign->channel === 'sms' ? 'sms' : 'email', $recipient->destination);
        }

        return response()->view('mail.unsubscribe', ['done' => true, 'sender' => $this->senderFor($recipient)]);
    }

    protected function senderFor(CampaignRecipient $recipient): string
    {
        $campaign = Campaign::withoutGlobalScope('tenant')->with('tenant')->find($recipient->campaign_id);

        return $campaign ? CampaignMail::senderName($campaign) : (string) config('mail.from.name');
    }

    protected function suppress(int $tenantId, string $channel, string $destination): void
    {
        Suppression::withoutGlobalScope('tenant')->updateOrCreate(
            [
                'tenant_id' => $tenantId,
                'channel' => $channel,
                'destination' => $channel === 'sms'
                    ? AdvantaSmsClient::normalise($destination)
                    : strtolower(trim($destination)),
            ],
            ['reason' => 'unsubscribed']
        );
    }

    protected function audienceSummary(Campaign $campaign): array
    {
        $summary = CampaignAudience::summary($campaign);
        $sms = $campaign->channel === 'sms';
        $message = $sms ? SmsMessage::analyse((string) $campaign->body) : null;

        return $summary + [
            'segments_per_message' => $sms ? $message['segments'] : 1,
            'encoding' => $message['encoding'] ?? null,
            'characters' => $message['characters'] ?? null,
            'unicode_chars' => $message['unicode_chars'] ?? [],
            'cost_per_segment' => $this->costPerSegment(),
            'estimated_cost' => $sms ? $this->costFor($summary['credits']) : 0.0,
        ];
    }

    protected function refreshCounts(Campaign $campaign): Campaign
    {
        $summary = CampaignAudience::summary($campaign, 0);

        $campaign->update([
            'recipient_count' => $summary['recipient_count'],
            'estimated_cost' => $campaign->channel === 'sms' ? $this->costFor($summary['credits']) : 0,
        ]);

        return $campaign->fresh(['event:id,title', 'featuredEvent:id,uuid,title']);
    }

    protected function validated(Request $request, ?Campaign $campaign = null, bool $partial = false): array
    {
        $required = ($campaign || $partial) ? 'sometimes' : 'required';
        $user = $request->user();

        $data = $request->validate([
            'name' => [$required, 'string', 'max:255'],
            'channel' => [$required, 'in:sms,email'],
            'event_id' => ['nullable', 'integer', 'exists:events,id'],
            'featured_event_id' => ['nullable', 'integer', 'exists:events,id'],
            'subject' => ['nullable', 'string', 'max:255'],
            // Live counts don't need the text (email) or may run before it's written.
            'body' => $partial ? ['nullable', 'string', 'max:10000'] : [$required, 'string', 'max:10000'],
            'image_path' => ['nullable', 'string', 'max:2048'],
            'cta_label' => ['nullable', 'string', 'max:60', 'required_with:cta_url'],
            'cta_url' => ['nullable', 'url:http,https', 'max:2048', 'required_with:cta_label'],
            'audience_filter' => ['nullable', 'array'],
            'audience_filter.source' => ['nullable', Rule::in(CampaignAudience::SOURCES)],
            'audience_filter.include_contacts' => ['nullable', 'boolean'],
            'audience_filter.category' => ['nullable', 'array'],
            'audience_filter.status' => ['nullable', 'array'],
            'audience_filter.ticket_tier_id' => ['nullable', 'array'],
            'audience_filter.checked_in' => ['nullable', 'boolean'],
            'audience_filter.event_ids' => ['nullable', 'array', 'max:200'],
            'audience_filter.event_ids.*' => ['integer'],
            'audience_filter.tenant_ids' => ['nullable', 'array', 'max:200'],
            'audience_filter.tenant_ids.*' => ['integer'],
            'audience_filter.ticket_tier_id.*' => ['integer'],
            'audience_filter.attendance' => ['nullable', 'in:checked_in,no_show'],
            'audience_filter.paid' => ['nullable', 'in:paid,free'],
            'audience_filter.consent' => ['nullable', 'boolean'],
            'audience_filter.country' => ['nullable', 'array'],
            'audience_filter.registered_from' => ['nullable', 'date'],
            'audience_filter.registered_to' => ['nullable', 'date'],
            'audience_filter.event_from' => ['nullable', 'date'],
            'audience_filter.event_to' => ['nullable', 'date'],
            'audience_filter.q' => ['nullable', 'string', 'max:100'],
            'audience_filter.phone' => ['nullable', 'in:missing,present'],
            'ask_phone' => ['nullable', 'boolean'],
            'audience_filter.include' => ['nullable', 'array', 'max:20000'],
            'audience_filter.include.*' => ['string', 'regex:/^[ac]:\d+$/'],
            'audience_filter.exclude' => ['nullable', 'array', 'max:20000'],
            'audience_filter.exclude.*' => ['string', 'regex:/^[ac]:\d+$/'],
            'audience_label' => ['nullable', 'string', 'max:255'],
            'monitor_numbers' => ['nullable', 'array', 'max:3'],
            'monitor_numbers.*' => ['nullable', 'string', 'max:30'],
        ]);

        // Confirmation numbers: each must be textable, stored as 2547…
        if (array_key_exists('monitor_numbers', $data)) {
            $clean = [];
            foreach (array_filter((array) $data['monitor_numbers'], fn ($n) => trim((string) $n) !== '') as $raw) {
                $check = PhoneCheck::classify((string) $raw);
                abort_unless($check['status'] === 'ok', 422, "Confirmation number {$raw} can't receive SMS: {$check['reason']}.");
                $clean[] = (string) $check['number'];
            }
            // Values, not keys: numeric-string keys would turn into integers.
            $data['monitor_numbers'] = array_values(array_unique($clean)) ?: null;
        }

        $filter = $data['audience_filter'] ?? [];

        // The phone link only makes sense in an email; an SMS reaches people who already have one.
        if (($data['channel'] ?? $campaign?->channel) === 'sms') {
            $data['ask_phone'] = false;
        }

        if (($filter['source'] ?? null) === 'platform') {
            abort_unless($user->isSuperAdmin(), 403, 'Only Tikooh admins can message everyone on the platform.');
        }

        if (! empty($filter['tenant_ids'])) {
            abort_unless($user->isSuperAdmin(), 403, 'Only Tikooh admins can choose organisers.');
        }

        $handPicked = ! empty($filter['include']);

        if (! $partial && ($filter['source'] ?? null) === 'event' && ! $handPicked
            && empty($data['event_id']) && empty($filter['event_ids']) && ! $campaign?->event_id) {
            abort(422, 'Choose which event\'s guests to message.');
        }

        // An organiser may only target, or showcase, their own events.
        if (! $user->isSuperAdmin()) {
            $ids = array_filter([...(array) ($filter['event_ids'] ?? []), $data['event_id'] ?? null, $data['featured_event_id'] ?? null]);

            if ($ids) {
                abort_unless(
                    Event::withoutGlobalScope('tenant')->whereIn('id', $ids)->where('tenant_id', '!=', $user->tenant_id)->doesntExist()
                        && Event::withoutGlobalScope('tenant')->whereIn('id', $ids)->count() === count(array_unique($ids)),
                    422,
                    'That event belongs to another organiser.'
                );
            }
        }

        return $data;
    }

    protected function costPerSegment(): float
    {
        return (float) (config('services.sms.cost_per_segment') ?? config('services.advanta.cost_per_segment', 0.80));
    }

    /** Credits are counted per person after merge tags are filled in. */
    protected function costFor(int $credits): float
    {
        return round($credits * $this->costPerSegment(), 2);
    }

    /**
     * Refuse a send the Africa's Talking account can't pay for: half a
     * campaign going out and the rest failing on InsufficientBalance is worse
     * than not starting. An unreachable balance check doesn't block.
     */
    protected function ensureBalance(Request $request, float $cost): void
    {
        if (config('services.sms.provider') !== 'africastalking' || $cost <= 0) {
            return;
        }

        $balance = AfricasTalkingSmsClient::balance(fresh: true);

        if (! $balance['ok'] || $balance['amount'] >= $cost) {
            return;
        }

        abort(422, $request->user()->isSuperAdmin()
            ? sprintf('Africa\'s Talking balance is %s %s but this campaign needs about KES %s. Top up first.', $balance['currency'], number_format($balance['amount'], 2), number_format($cost, 2))
            : 'SMS sending is temporarily unavailable. Please try again later or contact Tikooh support.');
    }
}
