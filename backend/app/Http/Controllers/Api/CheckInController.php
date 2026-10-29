<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CheckIn;
use App\Models\Event;
use App\Models\NfcTag;
use App\Services\CheckInService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Tikooh features 6 and 15: the scanner endpoints. */
class CheckInController extends Controller
{
    public function __construct(protected CheckInService $checkIns) {}

    public function scan(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:255'],
            'method' => ['nullable', 'in:qr,nfc,manual,self_service'],
            'direction' => ['nullable', 'in:in,out'],
            'event_session_id' => ['nullable', 'integer', 'exists:event_sessions,id'],
            'check_in_point_id' => ['nullable', 'integer', 'exists:check_in_points,id'],
            'device_id' => ['nullable', 'string', 'max:120'],
        ]);

        $outcome = $this->checkIns->scan(
            event: $event,
            code: $data['code'],
            method: $data['method'] ?? 'qr',
            scanner: $request->user(),
            sessionId: $data['event_session_id'] ?? null,
            pointId: $data['check_in_point_id'] ?? null,
            direction: $data['direction'] ?? 'in',
            deviceId: $data['device_id'] ?? null,
        );

        $attendee = $outcome['attendee'];

        return response()->json([
            'result' => $outcome['result'],
            'message' => $outcome['message'],
            'attendee' => $attendee ? [
                'uuid' => $attendee->uuid,
                'name' => $attendee->full_name,
                'email' => $attendee->email,
                'company' => $attendee->company,
                'category' => $attendee->category,
                'is_vip' => in_array($attendee->category, ['VIP', 'Speaker'], true),
                'checked_in_at' => $attendee->checked_in_at,
                'badge_status' => $attendee->badge?->status,
            ] : null,
        ], $outcome['result'] === 'accepted' ? 200 : 422);
    }

    /** Replays scans a device queued while offline. */
    public function syncOffline(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'scans' => ['required', 'array', 'min:1', 'max:500'],
            'scans.*.code' => ['required', 'string', 'max:255'],
            'scans.*.scanned_at' => ['required', 'date'],
            'scans.*.method' => ['nullable', 'in:qr,nfc,manual,self_service'],
            'scans.*.direction' => ['nullable', 'in:in,out'],
            'scans.*.device_id' => ['nullable', 'string', 'max:120'],
            'scans.*.event_session_id' => ['nullable', 'integer'],
        ]);

        return response()->json([
            'results' => $this->checkIns->syncOffline($event, $data['scans'], $request->user()),
        ]);
    }

    /** Live door stats for the organizer dashboard. */
    public function stats(Event $event): JsonResponse
    {
        $registered = $event->attendees()->whereNot('status', 'cancelled')->count();
        $checkedIn = $event->attendees()->whereNotNull('checked_in_at')->count();

        return response()->json([
            'registered' => $registered,
            'checked_in' => $checkedIn,
            'not_arrived' => max(0, $registered - $checkedIn),
            'attendance_rate' => $registered > 0 ? round($checkedIn / $registered * 100, 1) : 0.0,
            'by_category' => $event->attendees()
                ->selectRaw('category, COUNT(*) as total, SUM(checked_in_at IS NOT NULL) as arrived')
                ->groupBy('category')
                ->get(),
            'recent' => CheckIn::with('attendee:id,first_name,last_name,company,category')
                ->where('event_id', $event->id)
                ->accepted()
                ->latest('scanned_at')
                ->limit(20)
                ->get(),
            'rejected_today' => CheckIn::where('event_id', $event->id)
                ->whereNot('result', 'accepted')
                ->whereDate('scanned_at', today())
                ->count(),
        ]);
    }

    /** Binds a blank NFC wristband/badge to an attendee at the desk. */
    public function assignNfc(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'uid' => ['required', 'string', 'max:255'],
            'attendee_uuid' => ['required', 'uuid'],
        ]);

        $attendee = $event->attendees()->where('uuid', $data['attendee_uuid'])->firstOrFail();

        $tag = NfcTag::firstOrNew(['uid' => $data['uid']]);

        if ($tag->exists && $tag->attendee_id && $tag->attendee_id !== $attendee->id) {
            return response()->json([
                'message' => 'That tag is already assigned to another attendee. Recycle it first.',
            ], 422);
        }

        $tag->tenant_id = $event->tenant_id;
        $tag->save();
        $tag->assignTo($attendee);

        return response()->json(['tag' => $tag->fresh(), 'attendee' => $attendee->only(['uuid', 'first_name', 'last_name'])]);
    }
}
