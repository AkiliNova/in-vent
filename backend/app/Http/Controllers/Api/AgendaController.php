<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\EventSession;
use App\Models\Speaker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Tikooh feature 5 (speakers) and the agenda behind features 8 and 14. */
class AgendaController extends Controller
{
    public function sessions(Request $request, Event $event): JsonResponse
    {
        return response()->json(
            $event->sessions()
                ->with('speakers:id,name,title,company,photo_path', 'venueSpace:id,name')
                ->withCount(['attendees as registered_count'])
                ->when($request->string('track')->toString(), fn ($q, $t) => $q->where('track', $t))
                ->when($request->date('date'), fn ($q, $d) => $q->whereDate('starts_at', $d))
                ->get()
        );
    }

    public function storeSession(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'track' => ['nullable', 'string', 'max:120'],
            'type' => ['nullable', 'in:talk,panel,workshop,break,networking,keynote'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
            'venue_space_id' => ['nullable', 'integer', 'exists:venue_spaces,id'],
            'room_label' => ['nullable', 'string', 'max:120'],
            'capacity' => ['nullable', 'integer', 'min:1'],
            'requires_registration' => ['boolean'],
            'allows_questions' => ['boolean'],
            'allows_polls' => ['boolean'],
            'collect_feedback' => ['boolean'],
            'livestream_url' => ['nullable', 'url', 'max:2048'],
            'speaker_ids' => ['nullable', 'array'],
            'speaker_ids.*' => ['integer', 'exists:speakers,id'],
        ]);

        $session = $event->sessions()->create(array_diff_key($data, ['speaker_ids' => null]));

        if (! empty($data['speaker_ids'])) {
            $session->speakers()->sync($data['speaker_ids']);
        }

        return response()->json($session->load('speakers'), 201);
    }

    public function updateSession(Request $request, Event $event, EventSession $session): JsonResponse
    {
        abort_if($session->event_id !== $event->id, 404);

        $session->update($request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'track' => ['nullable', 'string', 'max:120'],
            'starts_at' => ['sometimes', 'date'],
            'ends_at' => ['sometimes', 'date', 'after:starts_at'],
            'venue_space_id' => ['nullable', 'integer', 'exists:venue_spaces,id'],
            'room_label' => ['nullable', 'string', 'max:120'],
            'capacity' => ['nullable', 'integer', 'min:1'],
            'materials' => ['nullable', 'array'],
        ]));

        if ($request->has('speaker_ids')) {
            $session->speakers()->sync($request->input('speaker_ids', []));
        }

        return response()->json($session->fresh('speakers'));
    }

    public function destroySession(Event $event, EventSession $session): JsonResponse
    {
        abort_if($session->event_id !== $event->id, 404);

        $session->delete();

        return response()->json(null, 204);
    }

    // ── Speakers ────────────────────────────────────────────────────────────

    public function speakers(Event $event): JsonResponse
    {
        return response()->json(
            $event->speakers()->with('sessions:id,title,starts_at')->get()
        );
    }

    public function storeSpeaker(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'title' => ['nullable', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'twitter' => ['nullable', 'string', 'max:255'],
            'linkedin' => ['nullable', 'string', 'max:255'],
            'website' => ['nullable', 'url', 'max:255'],
            'status' => ['nullable', 'in:invited,confirmed,declined,cancelled'],
            'is_keynote' => ['boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        return response()->json(
            $event->speakers()->create($data + ['tenant_id' => $event->tenant_id]),
            201
        );
    }

    public function updateSpeaker(Request $request, Event $event, Speaker $speaker): JsonResponse
    {
        abort_if($speaker->event_id !== $event->id, 404);

        $speaker->update($request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'title' => ['nullable', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string'],
            'status' => ['sometimes', 'in:invited,confirmed,declined,cancelled'],
            'is_keynote' => ['boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]));

        return response()->json($speaker->fresh());
    }

    public function destroySpeaker(Event $event, Speaker $speaker): JsonResponse
    {
        abort_if($speaker->event_id !== $event->id, 404);

        $speaker->delete();

        return response()->json(null, 204);
    }

    // ── Attendee personal schedule (feature 14) ─────────────────────────────

    public function myAgenda(Request $request, Event $event): JsonResponse
    {
        $attendee = $event->attendees()->where('user_id', $request->user()->id)->firstOrFail();

        return response()->json(
            $attendee->sessions()->with('speakers:id,name')->get()
        );
    }

    public function toggleFavourite(Request $request, Event $event, EventSession $session): JsonResponse
    {
        abort_if($session->event_id !== $event->id, 404);

        $attendee = $event->attendees()->where('user_id', $request->user()->id)->firstOrFail();

        $existing = $attendee->sessions()->where('event_sessions.id', $session->id)->first();
        $favourite = ! ($existing?->pivot?->is_favourite ?? false);

        if ($session->requires_registration && $session->capacity) {
            $registered = $session->attendees()->wherePivotNotNull('registered_at')->count();

            if ($favourite && $registered >= $session->capacity) {
                return response()->json(['message' => 'This session is full.'], 422);
            }
        }

        $attendee->sessions()->syncWithoutDetaching([
            $session->id => [
                'is_favourite' => $favourite,
                'registered_at' => $favourite && $session->requires_registration ? now() : null,
            ],
        ]);

        return response()->json(['is_favourite' => $favourite]);
    }
}
