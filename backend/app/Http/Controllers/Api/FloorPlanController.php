<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\FloorPlan;
use App\Models\FloorPlanItem;
use App\Models\SeatAssignment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Tikooh feature 4: venue diagramming, seating and booth layout. */
class FloorPlanController extends Controller
{
    public function index(Event $event): JsonResponse
    {
        return response()->json(
            $event->floorPlans()
                ->with('venueSpace:id,name,capacity')
                ->withCount('items')
                ->get()
        );
    }

    public function show(Event $event, FloorPlan $plan): JsonResponse
    {
        abort_if($plan->event_id !== $event->id, 404);

        return response()->json([
            'plan' => $plan->load('venueSpace:id,name,capacity'),
            'items' => $plan->items()->with('booth:id,floor_plan_item_id,code,exhibitor_id')->get(),
            'assignments' => $plan->items()
                ->with('seatAssignments.attendee:id,uuid,first_name,last_name,category')
                ->get()
                ->pluck('seatAssignments')
                ->flatten(),
            'seated_capacity' => $plan->seatedCapacity(),
        ]);
    }

    public function store(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'venue_space_id' => ['nullable', 'integer', 'exists:venue_spaces,id'],
            'canvas_width' => ['nullable', 'integer', 'min:100', 'max:10000'],
            'canvas_height' => ['nullable', 'integer', 'min:100', 'max:10000'],
            'scale_metres_per_unit' => ['nullable', 'numeric', 'min:0.0001'],
        ]);

        return response()->json($event->floorPlans()->create($data), 201);
    }

    /**
     * Replaces the plan's items wholesale — the editor sends the whole canvas
     * on save, which is simpler and avoids drift between client and server.
     */
    public function saveItems(Request $request, Event $event, FloorPlan $plan): JsonResponse
    {
        abort_if($plan->event_id !== $event->id, 404);

        $data = $request->validate([
            'items' => ['present', 'array', 'max:2000'],
            'items.*.uuid' => ['nullable', 'uuid'],
            'items.*.type' => ['required', 'in:seat,table,booth,stage,screen,door,wall,text,shape,entrance'],
            'items.*.label' => ['nullable', 'string', 'max:120'],
            'items.*.x' => ['required', 'numeric'],
            'items.*.y' => ['required', 'numeric'],
            'items.*.width' => ['nullable', 'numeric', 'min:1'],
            'items.*.height' => ['nullable', 'numeric', 'min:1'],
            'items.*.rotation' => ['nullable', 'numeric'],
            'items.*.z_index' => ['nullable', 'integer'],
            'items.*.capacity' => ['nullable', 'integer', 'min:0', 'max:100'],
            'items.*.style' => ['nullable', 'array'],
            'items.*.properties' => ['nullable', 'array'],
        ]);

        DB::transaction(function () use ($plan, $data) {
            $keptUuids = collect($data['items'])->pluck('uuid')->filter()->all();

            // Deleting an item drops its seat assignments with it, so only
            // remove items the editor actually removed.
            $plan->items()->whereNotIn('uuid', $keptUuids)->delete();

            foreach ($data['items'] as $item) {
                $plan->items()->updateOrCreate(
                    ['uuid' => $item['uuid'] ?? Str::uuid()->toString()],
                    array_diff_key($item, ['uuid' => null])
                );
            }

            $plan->increment('version');
        });

        return response()->json($plan->fresh()->load('items'));
    }

    public function publish(Event $event, FloorPlan $plan): JsonResponse
    {
        abort_if($plan->event_id !== $event->id, 404);

        $plan->update(['status' => 'published']);

        return response()->json($plan->fresh());
    }

    // ── Seating ─────────────────────────────────────────────────────────────

    public function assignSeat(Request $request, Event $event, FloorPlan $plan): JsonResponse
    {
        abort_if($plan->event_id !== $event->id, 404);

        $data = $request->validate([
            'floor_plan_item_id' => ['required', 'integer'],
            'attendee_id' => ['required', 'integer'],
            'event_session_id' => ['nullable', 'integer', 'exists:event_sessions,id'],
            'seat_label' => ['nullable', 'string', 'max:32'],
        ]);

        $assignment = DB::transaction(function () use ($data, $plan, $event, $request) {
            $item = FloorPlanItem::whereKey($data['floor_plan_item_id'])
                ->where('floor_plan_id', $plan->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless($item->is_assignable, 422, 'That element cannot be assigned.');

            if ($item->remainingSeats() <= 0) {
                abort(422, ($item->label ?: 'That seat').' is full.');
            }

            $attendee = $event->attendees()->findOrFail($data['attendee_id']);

            return SeatAssignment::updateOrCreate(
                [
                    'floor_plan_item_id' => $item->id,
                    'event_session_id' => $data['event_session_id'] ?? null,
                    'attendee_id' => $attendee->id,
                ],
                [
                    'event_id' => $event->id,
                    'seat_label' => $data['seat_label'] ?? $item->label,
                    'status' => 'assigned',
                    'assigned_by' => $request->user()->id,
                ]
            );
        });

        return response()->json($assignment->load('attendee:id,first_name,last_name'), 201);
    }

    public function releaseSeat(Event $event, SeatAssignment $assignment): JsonResponse
    {
        abort_if($assignment->event_id !== $event->id, 404);

        $assignment->delete();

        return response()->json(null, 204);
    }

    /** Auto-seats VIPs and dignitaries first, then everyone else. */
    public function autoSeat(Request $request, Event $event, FloorPlan $plan): JsonResponse
    {
        abort_if($plan->event_id !== $event->id, 404);

        $data = $request->validate([
            'event_session_id' => ['nullable', 'integer', 'exists:event_sessions,id'],
            'categories' => ['nullable', 'array'],
        ]);

        $seated = 0;

        DB::transaction(function () use ($plan, $event, $data, &$seated) {
            $seats = $plan->items()
                ->whereIn('type', ['seat', 'table'])
                ->where('is_assignable', true)
                ->orderBy('z_index')
                ->orderBy('y')
                ->orderBy('x')
                ->lockForUpdate()
                ->get();

            // Front-of-room seats come first in the ordering above, so VIPs
            // land there naturally.
            $attendees = $event->attendees()
                ->when($data['categories'] ?? null, fn ($q, $c) => $q->whereIn('category', $c))
                ->whereNot('status', 'cancelled')
                ->orderByRaw("FIELD(category, 'VIP', 'Speaker', 'Press', 'General')")
                ->orderBy('last_name')
                ->get();

            $queue = $attendees->values();
            $index = 0;

            foreach ($seats as $seat) {
                for ($i = $seat->remainingSeats(); $i > 0; $i--) {
                    if (! isset($queue[$index])) {
                        return;
                    }

                    SeatAssignment::firstOrCreate([
                        'floor_plan_item_id' => $seat->id,
                        'event_session_id' => $data['event_session_id'] ?? null,
                        'attendee_id' => $queue[$index]->id,
                    ], [
                        'event_id' => $event->id,
                        'seat_label' => $seat->label,
                        'status' => 'assigned',
                    ]);

                    $index++;
                    $seated++;
                }
            }
        });

        return response()->json(['seated' => $seated]);
    }
}
