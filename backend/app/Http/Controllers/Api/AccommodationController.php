<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Accommodation;
use App\Models\AccommodationRoom;
use App\Models\Attendee;
use App\Models\Dignitary;
use App\Models\Event;
use App\Models\RoomAllocation;
use App\Models\Speaker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Tikooh feature 10: room allocation for dignitaries.
 *
 * Replaces the old global `rooms` collection, which was shared across every
 * tenant and only stored a headcount.
 */
class AccommodationController extends Controller
{
    // ── Dignitaries ─────────────────────────────────────────────────────────

    public function dignitaries(Event $event): JsonResponse
    {
        return response()->json(
            $event->dignitaries()
                ->with('roomAllocations.room.accommodation:id,name', 'liaison:id,name')
                ->byPrecedence()
                ->get()
        );
    }

    public function storeDignitary(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'honorific' => ['nullable', 'string', 'max:32'],
            'title' => ['nullable', 'string', 'max:255'],
            'organization' => ['nullable', 'string', 'max:255'],
            'category' => ['required', 'in:vip,government,diplomat,speaker,sponsor,media'],
            'protocol_rank' => ['nullable', 'integer', 'min:1', 'max:10'],
            'requires_security_detail' => ['boolean'],
            'entourage_size' => ['nullable', 'integer', 'min:0', 'max:200'],
            'arrival_at' => ['nullable', 'date'],
            'departure_at' => ['nullable', 'date', 'after_or_equal:arrival_at'],
            'arrival_mode' => ['nullable', 'in:flight,road,helicopter'],
            'protocol_notes' => ['nullable', 'string'],
            'dietary_requirements' => ['nullable', 'array'],
            'liaison_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'attendee_id' => ['nullable', 'integer', 'exists:attendees,id'],
        ]);

        return response()->json($event->dignitaries()->create($data), 201);
    }

    public function updateDignitary(Request $request, Event $event, Dignitary $dignitary): JsonResponse
    {
        abort_if($dignitary->event_id !== $event->id, 404);

        $dignitary->update($request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'protocol_rank' => ['sometimes', 'integer', 'min:1', 'max:10'],
            'arrival_at' => ['nullable', 'date'],
            'departure_at' => ['nullable', 'date', 'after_or_equal:arrival_at'],
            'protocol_notes' => ['nullable', 'string'],
            'liaison_user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]));

        return response()->json($dignitary->fresh());
    }

    // ── Accommodations and rooms ────────────────────────────────────────────

    public function accommodations(Event $event): JsonResponse
    {
        return response()->json(
            Accommodation::query()
                ->where(fn ($q) => $q->where('event_id', $event->id)->orWhereNull('event_id'))
                ->with('rooms')
                ->withCount(['rooms', 'rooms as available_rooms_count' => fn ($q) => $q->where('status', 'available')])
                ->get()
        );
    }

    public function storeAccommodation(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'kind' => ['required', 'in:hotel,guest_house,meeting_room,holding_room,lounge'],
            'address' => ['nullable', 'string', 'max:255'],
            'contact_phone' => ['nullable', 'string', 'max:32'],
            'venue_id' => ['nullable', 'integer', 'exists:venues,id'],
            'distance_km' => ['nullable', 'numeric', 'min:0'],
        ]);

        return response()->json(
            Accommodation::create($data + ['tenant_id' => $event->tenant_id, 'event_id' => $event->id]),
            201
        );
    }

    public function storeRooms(Request $request, Event $event, Accommodation $accommodation): JsonResponse
    {
        abort_if($accommodation->event_id !== null && $accommodation->event_id !== $event->id, 404);

        $data = $request->validate([
            'rooms' => ['required', 'array', 'min:1', 'max:500'],
            'rooms.*.room_number' => ['required', 'string', 'max:32'],
            'rooms.*.room_type' => ['nullable', 'in:standard,deluxe,suite,presidential,boardroom'],
            'rooms.*.floor_label' => ['nullable', 'string', 'max:32'],
            'rooms.*.capacity' => ['nullable', 'integer', 'min:1', 'max:20'],
            'rooms.*.rate_per_night' => ['nullable', 'numeric', 'min:0'],
            'rooms.*.is_accessible' => ['boolean'],
        ]);

        $created = collect($data['rooms'])->map(
            fn ($room) => $accommodation->rooms()->updateOrCreate(
                ['room_number' => $room['room_number']],
                $room
            )
        );

        return response()->json($created, 201);
    }

    /** Rooms free for a stay — this is the query that prevents double-booking. */
    public function availableRooms(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'check_in' => ['required', 'date'],
            'check_out' => ['required', 'date', 'after:check_in'],
            'room_type' => ['nullable', 'string', 'max:32'],
            'accessible' => ['nullable', 'boolean'],
        ]);

        $rooms = AccommodationRoom::query()
            ->whereHas('accommodation', fn ($q) => $q
                ->where('tenant_id', $event->tenant_id)
                ->where(fn ($w) => $w->where('event_id', $event->id)->orWhereNull('event_id')))
            ->with('accommodation:id,name,kind,distance_km')
            ->whereNot('status', 'maintenance')
            ->whereNot('status', 'blocked')
            ->when($data['room_type'] ?? null, fn ($q, $t) => $q->where('room_type', $t))
            ->when($data['accessible'] ?? null, fn ($q) => $q->where('is_accessible', true))
            ->freeBetween($data['check_in'], $data['check_out'])
            ->orderBy('room_type')
            ->get();

        return response()->json($rooms);
    }

    // ── Allocations ─────────────────────────────────────────────────────────

    public function allocations(Event $event): JsonResponse
    {
        return response()->json(
            $event->roomAllocations()
                ->with('room.accommodation:id,name', 'allocatable')
                ->orderBy('check_in_date')
                ->get()
        );
    }

    /** Assigns a room, re-checking availability inside a lock. */
    public function allocate(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'accommodation_room_id' => ['required', 'integer', 'exists:accommodation_rooms,id'],
            'allocatable_type' => ['required', 'in:dignitary,speaker,attendee'],
            'allocatable_id' => ['required', 'integer'],
            'check_in_date' => ['required', 'date'],
            'check_out_date' => ['required', 'date', 'after:check_in_date'],
            'guest_title' => ['nullable', 'string', 'max:255'],
            'guest_phone' => ['nullable', 'string', 'max:32'],
            'paid_by' => ['nullable', 'in:organizer,guest,sponsor'],
            'notes' => ['nullable', 'string'],
        ]);

        $model = match ($data['allocatable_type']) {
            'dignitary' => Dignitary::class,
            'speaker' => Speaker::class,
            default => Attendee::class,
        };

        $guest = $model::findOrFail($data['allocatable_id']);

        $allocation = DB::transaction(function () use ($data, $event, $model, $guest) {
            $room = AccommodationRoom::whereKey($data['accommodation_room_id'])
                ->lockForUpdate()
                ->firstOrFail();

            // Availability is re-checked under the lock — two coordinators
            // assigning the same suite at once must not both succeed.
            if (! $room->isFreeBetween($data['check_in_date'], $data['check_out_date'])) {
                abort(422, "Room {$room->room_number} is already taken for those dates.");
            }

            $nights = now()->parse($data['check_in_date'])->diffInDays($data['check_out_date']);

            $allocation = RoomAllocation::create([
                'accommodation_room_id' => $room->id,
                'event_id' => $event->id,
                'allocatable_type' => $model,
                'allocatable_id' => $guest->getKey(),
                'guest_name' => $guest->name ?? ($guest->full_name ?? 'Guest'),
                'guest_title' => $data['guest_title'] ?? ($guest->title ?? null),
                'guest_phone' => $data['guest_phone'] ?? ($guest->phone ?? null),
                'check_in_date' => $data['check_in_date'],
                'check_out_date' => $data['check_out_date'],
                'status' => 'reserved',
                'total_cost' => $room->rate_per_night ? $room->rate_per_night * $nights : null,
                'paid_by' => $data['paid_by'] ?? 'organizer',
                'notes' => $data['notes'] ?? null,
                'allocated_by' => request()->user()->id,
            ]);

            $room->update(['status' => 'assigned']);

            return $allocation;
        });

        return response()->json($allocation->load('room.accommodation'), 201);
    }

    public function releaseAllocation(Event $event, RoomAllocation $allocation): JsonResponse
    {
        abort_if($allocation->event_id !== $event->id, 404);

        DB::transaction(function () use ($allocation) {
            $allocation->update(['status' => 'cancelled']);

            // Only free the room if nothing else is holding it.
            $stillHeld = $allocation->room->allocations()
                ->whereNotIn('status', ['cancelled', 'checked_out'])
                ->exists();

            if (! $stillHeld) {
                $allocation->room->update(['status' => 'available']);
            }
        });

        return response()->json(null, 204);
    }

    /** The rooming list the protocol team actually prints. */
    public function roomingList(Event $event): StreamedResponse
    {
        return response()->streamDownload(function () use ($event) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Guest', 'Title', 'Phone', 'Hotel', 'Room', 'Type', 'Check in', 'Check out', 'Status', 'Paid by']);

            $event->roomAllocations()
                ->with('room.accommodation')
                ->orderBy('check_in_date')
                ->chunk(200, function ($rows) use ($out) {
                    foreach ($rows as $a) {
                        fputcsv($out, [
                            $a->guest_name, $a->guest_title, $a->guest_phone,
                            $a->room->accommodation->name, $a->room->room_number, $a->room->room_type,
                            $a->check_in_date?->format('Y-m-d'), $a->check_out_date?->format('Y-m-d'),
                            $a->status, $a->paid_by,
                        ]);
                    }
                });

            fclose($out);
        }, 'rooming-list.csv', ['Content-Type' => 'text/csv']);
    }
}
