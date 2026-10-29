<?php

namespace App\Services;

use App\Events\AttendeeCheckedIn;
use App\Models\Attendee;
use App\Models\CheckIn;
use App\Models\Event;
use App\Models\NfcTag;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Tikooh features 6 and 15: NFC and QR check-in.
 *
 * Every scan is recorded, accepted or not, so the organizer can see rejected
 * scans and duplicate attempts rather than only successful entries.
 */
class CheckInService
{
    /**
     * Resolves a scanned code to an attendee and records the scan.
     *
     * @param  string  $code  Ticket code (QR) or NFC tag UID.
     * @return array{result: string, message: string, attendee: ?Attendee, check_in: CheckIn}
     */
    public function scan(
        Event $event,
        string $code,
        string $method = 'qr',
        ?User $scanner = null,
        ?int $sessionId = null,
        ?int $pointId = null,
        string $direction = 'in',
        ?Carbon $scannedAt = null,
        ?string $deviceId = null,
    ): array {
        $scannedAt ??= now();
        $code = trim($code);

        return DB::transaction(function () use (
            $event, $code, $method, $scanner, $sessionId, $pointId, $direction, $scannedAt, $deviceId
        ) {
            [$ticket, $attendee] = $this->resolve($event, $code, $method);

            $result = $this->evaluate($event, $ticket, $attendee, $direction, $sessionId);

            $checkIn = CheckIn::create([
                'event_id' => $event->id,
                'attendee_id' => $attendee?->id,
                'ticket_id' => $ticket?->id,
                'event_session_id' => $sessionId,
                'check_in_point_id' => $pointId,
                'scanned_by' => $scanner?->id,
                'method' => $method,
                'direction' => $direction,
                'result' => $result['result'],
                'failure_reason' => $result['result'] === 'accepted' ? null : $result['message'],
                'device_id' => $deviceId,
                'scanned_at' => $scannedAt,
            ]);

            if ($result['result'] === 'accepted' && $attendee) {
                $this->applyAcceptance($attendee, $ticket, $sessionId, $direction, $scannedAt);

                AttendeeCheckedIn::dispatch($checkIn->fresh(['attendee']));
            }

            return $result + ['check_in' => $checkIn];
        });
    }

    /**
     * Replays a batch queued by an offline scanner. Ordered by scan time so
     * the first scan of a duplicate pair still wins.
     *
     * @param  array<int,array{code:string,scanned_at:string,method?:string,direction?:string,device_id?:string,event_session_id?:int}>  $scans
     */
    public function syncOffline(Event $event, array $scans, ?User $scanner = null): array
    {
        $results = [];

        $ordered = collect($scans)->sortBy('scanned_at')->values();

        foreach ($ordered as $scan) {
            $outcome = $this->scan(
                event: $event,
                code: $scan['code'],
                method: $scan['method'] ?? 'qr',
                scanner: $scanner,
                sessionId: $scan['event_session_id'] ?? null,
                direction: $scan['direction'] ?? 'in',
                scannedAt: Carbon::parse($scan['scanned_at']),
                deviceId: $scan['device_id'] ?? null,
            );

            $outcome['check_in']->update(['synced_offline' => true]);

            $results[] = [
                'code' => $scan['code'],
                'result' => $outcome['result'],
                'message' => $outcome['message'],
            ];
        }

        return $results;
    }

    /** @return array{0: ?Ticket, 1: ?Attendee} */
    protected function resolve(Event $event, string $code, string $method): array
    {
        if ($method === 'nfc') {
            $tag = NfcTag::with('attendee')->where('uid', $code)->first();

            if (! $tag?->attendee) {
                return [null, null];
            }

            $ticket = Ticket::withoutGlobalScope('tenant')
                ->where('attendee_id', $tag->attendee_id)
                ->first();

            return [$ticket, $tag->attendee];
        }

        $ticket = Ticket::withoutGlobalScope('tenant')
            ->with('attendee')
            ->where('code', $code)
            ->first();

        if ($ticket) {
            return [$ticket, $ticket->attendee];
        }

        // Manual desk lookup: staff typed an email instead of scanning.
        $attendee = Attendee::withoutGlobalScope('tenant')
            ->where('event_id', $event->id)
            ->where('email', strtolower($code))
            ->first();

        return [null, $attendee];
    }

    /** @return array{result: string, message: string, attendee: ?Attendee} */
    protected function evaluate(
        Event $event,
        ?Ticket $ticket,
        ?Attendee $attendee,
        string $direction,
        ?int $sessionId
    ): array {
        if (! $attendee) {
            return ['result' => 'invalid', 'message' => 'Not recognised.', 'attendee' => null];
        }

        if ($attendee->event_id !== $event->id) {
            return ['result' => 'wrong_event', 'message' => 'This ticket is for a different event.', 'attendee' => $attendee];
        }

        // "used" is not a revocation — it is the normal state after a first
        // scan, and must fall through to the duplicate/re-entry logic below.
        if ($ticket && in_array($ticket->status, ['void', 'refunded', 'transferred'], true)) {
            return [
                'result' => 'revoked',
                'message' => 'This ticket has been '.$ticket->status.'.',
                'attendee' => $attendee,
            ];
        }

        if ($attendee->status === 'cancelled') {
            return ['result' => 'revoked', 'message' => 'This registration was cancelled.', 'attendee' => $attendee];
        }

        // Re-entry is fine; a second *entry* scan without an exit is a duplicate.
        if ($direction === 'in' && $sessionId === null && $attendee->checked_in_at !== null) {
            $lastExit = $attendee->checkIns()
                ->where('direction', 'out')
                ->where('result', 'accepted')
                ->latest('scanned_at')
                ->first();

            if (! $lastExit || $lastExit->scanned_at < $attendee->checked_in_at) {
                return [
                    'result' => 'duplicate',
                    'message' => 'Already checked in at '.$attendee->checked_in_at->format('H:i').'.',
                    'attendee' => $attendee,
                ];
            }
        }

        return [
            'result' => 'accepted',
            'message' => $attendee->full_name.' — '.$attendee->category,
            'attendee' => $attendee,
        ];
    }

    protected function applyAcceptance(
        Attendee $attendee,
        ?Ticket $ticket,
        ?int $sessionId,
        string $direction,
        Carbon $scannedAt
    ): void {
        if ($sessionId !== null) {
            $attendee->sessions()->syncWithoutDetaching([
                $sessionId => $direction === 'in'
                    ? ['attended_at' => $scannedAt]
                    : ['left_at' => $scannedAt],
            ]);

            return;
        }

        if ($direction !== 'in') {
            return;
        }

        // First entry sets the event check-in time; re-entries leave it alone.
        if ($attendee->checked_in_at === null) {
            $attendee->forceFill([
                'status' => 'checked_in',
                'checked_in_at' => $scannedAt,
            ])->save();
        }

        $ticket?->forceFill([
            'status' => 'used',
            'checked_in_at' => $ticket->checked_in_at ?? $scannedAt,
        ])->save();
    }
}
