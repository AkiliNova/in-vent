<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendCampaign;
use App\Mail\CampaignMail;
use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Models\Event;
use App\Models\Suppression;
use App\Models\Tenant;
use App\Services\CampaignAudience;
use App\Services\Sms\AdvantaSmsClient;
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
                ->with('event:id,title', 'featuredEvent:id,uuid,title')
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

        return response()->json($this->refreshCounts($campaign), 201);
    }

    public function update(Request $request, Campaign $campaign): JsonResponse
    {
        abort_unless(in_array($campaign->status, ['draft', 'scheduled'], true), 422, 'This campaign has already been sent.');

        $campaign->update($this->validated($request, $campaign));

        return response()->json($this->refreshCounts($campaign));
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
        $data = $this->validated($request, partial: true);

        $draft = new Campaign($data + ['channel' => $data['channel'] ?? 'email', 'body' => $data['body'] ?? '']);
        $draft->tenant_id = TenantContext::id() ?? $request->user()->tenant_id;

        return response()->json($this->audienceSummary($draft));
    }

    /** Sends one copy to the signed-in user so they can see it in a real inbox. */
    public function test(Request $request, Campaign $campaign): JsonResponse
    {
        abort_unless($campaign->channel === 'email', 422, 'Test sends are for email campaigns.');

        $user = $request->user();
        $first = explode(' ', (string) $user->name)[0] ?: 'there';
        $fill = fn (string $s) => strtr($s, ['{{first_name}}' => $first, '{{last_name}}' => '', '{{name}}' => $user->name, '{{company}}' => '', '{{category}}' => '']);

        Mail::to($user->email)->send(CampaignMail::forCampaign(
            $campaign->loadMissing('featuredEvent', 'tenant'),
            subjectLine: '[Test] '.$fill($campaign->subject ?? $campaign->name),
            body: $fill($campaign->body),
            unsubscribeUrl: null,
        ));

        return response()->json(['message' => "Test sent to {$user->email}."]);
    }

    public function uploadImage(Request $request): JsonResponse
    {
        $request->validate(['image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120']]);

        $tenant = TenantContext::id() ?? $request->user()->tenant_id;
        $path = $request->file('image')->store("campaigns/{$tenant}", 'public');

        return response()->json(['path' => $path, 'url' => Storage::disk('public')->url($path)], 201);
    }

    public function send(Campaign $campaign): JsonResponse
    {
        abort_unless(in_array($campaign->status, ['draft', 'scheduled'], true), 422, 'This campaign has already been sent.');

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
        $count = CampaignAudience::count($campaign);

        return [
            'recipient_count' => $count,
            'segments_per_message' => $campaign->channel === 'sms'
                ? AdvantaSmsClient::segmentCount((string) $campaign->body)
                : 1,
            'estimated_cost' => $this->estimateCost($campaign, $count),
            'sample' => CampaignAudience::sample($campaign),
        ];
    }

    protected function refreshCounts(Campaign $campaign): Campaign
    {
        $count = CampaignAudience::count($campaign);

        $campaign->update([
            'recipient_count' => $count,
            'estimated_cost' => $this->estimateCost($campaign, $count),
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
            'body' => [$required, 'string', 'max:10000'],
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
            'audience_label' => ['nullable', 'string', 'max:255'],
        ]);

        if (($data['audience_filter']['source'] ?? null) === 'platform') {
            abort_unless($user->isSuperAdmin(), 403, 'Only Tikooh admins can message everyone on the platform.');
        }

        if (($data['audience_filter']['source'] ?? null) === 'event' && empty($data['event_id']) && ! $campaign?->event_id) {
            abort(422, 'Choose which event\'s guests to message.');
        }

        // An organiser may only target, or showcase, their own events.
        if (! $user->isSuperAdmin()) {
            foreach (['event_id', 'featured_event_id'] as $key) {
                if (! empty($data[$key])) {
                    abort_unless(
                        Event::withoutGlobalScope('tenant')->whereKey($data[$key])->where('tenant_id', $user->tenant_id)->exists(),
                        422,
                        'That event belongs to another organiser.'
                    );
                }
            }
        }

        return $data;
    }

    /** Rough SMS cost so an organizer isn't surprised by the bill. */
    protected function estimateCost(Campaign $campaign, int $recipients): float
    {
        if ($campaign->channel !== 'sms') {
            return 0.0;
        }

        $perSegment = (float) (config('services.sms.cost_per_segment') ?? config('services.advanta.cost_per_segment', 0.80));

        return round($recipients * AdvantaSmsClient::segmentCount((string) $campaign->body) * $perSegment, 2);
    }
}
