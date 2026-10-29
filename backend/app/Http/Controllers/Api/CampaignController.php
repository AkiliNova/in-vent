<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendCampaign;
use App\Models\Campaign;
use App\Models\Suppression;
use App\Models\Tenant;
use App\Services\Sms\AdvantaSmsClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Tikooh feature 2: email and bulk SMS to attendees. */
class CampaignController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(
            Campaign::query()
                ->with('event:id,title')
                ->when($request->integer('event_id'), fn ($q, $id) => $q->where('event_id', $id))
                ->when($request->string('channel')->toString(), fn ($q, $c) => $q->where('channel', $c))
                ->latest()
                ->paginate($request->integer('per_page', 25))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $campaign = Campaign::create($data + ['created_by' => $request->user()->id]);

        $campaign->update([
            'recipient_count' => $campaign->audienceQuery()->count(),
            'estimated_cost' => $this->estimateCost($campaign),
        ]);

        return response()->json($campaign->fresh(), 201);
    }

    public function update(Request $request, Campaign $campaign): JsonResponse
    {
        abort_unless(in_array($campaign->status, ['draft', 'scheduled'], true), 422, 'This campaign has already been sent.');

        $campaign->update($this->validated($request, $campaign));

        $campaign->update([
            'recipient_count' => $campaign->audienceQuery()->count(),
            'estimated_cost' => $this->estimateCost($campaign),
        ]);

        return response()->json($campaign->fresh());
    }

    /** Dry run: how many people, and what it will cost. */
    public function preview(Request $request, Campaign $campaign): JsonResponse
    {
        $query = $campaign->audienceQuery();

        return response()->json([
            'recipient_count' => $query->count(),
            'segments_per_message' => $campaign->channel === 'sms'
                ? AdvantaSmsClient::segmentCount($campaign->body)
                : 1,
            'estimated_cost' => $this->estimateCost($campaign),
            'sample' => $query->limit(5)->get(['first_name', 'last_name', 'email', 'phone']),
        ]);
    }

    public function send(Campaign $campaign): JsonResponse
    {
        abort_unless(in_array($campaign->status, ['draft', 'scheduled'], true), 422, 'This campaign has already been sent.');

        SendCampaign::dispatch($campaign);

        return response()->json(['status' => 'queued'], 202);
    }

    public function schedule(Request $request, Campaign $campaign): JsonResponse
    {
        $data = $request->validate([
            'scheduled_for' => ['required', 'date', 'after:now'],
        ]);

        $campaign->update(['status' => 'scheduled', 'scheduled_for' => $data['scheduled_for']]);

        return response()->json($campaign->fresh());
    }

    public function cancel(Campaign $campaign): JsonResponse
    {
        abort_unless($campaign->status === 'scheduled', 422, 'Only a scheduled campaign can be cancelled.');

        $campaign->update(['status' => 'cancelled', 'scheduled_for' => null]);

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

        Suppression::withoutGlobalScope('tenant')->updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'channel' => $data['channel'],
                'destination' => $data['channel'] === 'sms'
                    ? AdvantaSmsClient::normalise($data['destination'])
                    : strtolower($data['destination']),
            ],
            ['reason' => 'unsubscribed']
        );

        return response()->json(['message' => 'You will not receive further messages.']);
    }

    protected function validated(Request $request, ?Campaign $campaign = null): array
    {
        return $request->validate([
            'name' => [$campaign ? 'sometimes' : 'required', 'string', 'max:255'],
            'channel' => [$campaign ? 'sometimes' : 'required', 'in:sms,email,push'],
            'event_id' => ['nullable', 'integer', 'exists:events,id'],
            'subject' => ['nullable', 'string', 'max:255'],
            'body' => [$campaign ? 'sometimes' : 'required', 'string', 'max:10000'],
            'image_path' => ['nullable', 'string', 'max:2048'],
            'audience_filter' => ['nullable', 'array'],
            'audience_filter.category' => ['nullable', 'array'],
            'audience_filter.status' => ['nullable', 'array'],
            'audience_filter.ticket_tier_id' => ['nullable', 'array'],
            'audience_filter.checked_in' => ['nullable', 'boolean'],
            'audience_label' => ['nullable', 'string', 'max:255'],
        ]);
    }

    /** Rough SMS cost so an organizer isn't surprised by the bill. */
    protected function estimateCost(Campaign $campaign): float
    {
        if ($campaign->channel !== 'sms') {
            return 0.0;
        }

        $perSegment = (float) config('services.advanta.cost_per_segment', 0.80);

        return round(
            $campaign->recipient_count * AdvantaSmsClient::segmentCount($campaign->body) * $perSegment,
            2
        );
    }
}
