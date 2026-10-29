<?php

namespace App\Http\Controllers\Api;

use App\Events\MessageSent;
use App\Http\Controllers\Concerns\ResolvesAttendee;
use App\Http\Controllers\Controller;
use App\Models\Attendee;
use App\Models\Connection;
use App\Models\Conversation;
use App\Models\Event;
use App\Models\Meeting;
use App\Models\Message;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Tikooh feature 13: the networking platform. */
class NetworkingController extends Controller
{
    use ResolvesAttendee;

    /** Attendee directory — only people who opted in are listed. */
    public function directory(Request $request, string $eventUuid): JsonResponse
    {
        $event = $this->publicEvent($eventUuid);
        $me = $this->requireAttendee($request, $event);

        $attendees = TenantContext::withoutScoping(fn () => Attendee::query()
            ->where('event_id', $event->id)
            ->whereKeyNot($me->id)
            ->discoverable()
            ->with('profile')
            ->when($request->string('search')->toString(), fn ($q, $s) => $q->where(
                fn ($w) => $w->where('first_name', 'like', "%{$s}%")
                    ->orWhere('last_name', 'like', "%{$s}%")
                    ->orWhere('company', 'like', "%{$s}%")
                    ->orWhere('job_title', 'like', "%{$s}%")
            ))
            ->when($request->string('interest')->toString(), fn ($q, $i) => $q
                ->whereHas('profile', fn ($p) => $p->whereJsonContains('interests', $i)))
            ->paginate($request->integer('per_page', 24)));

        $connections = TenantContext::withoutScoping(fn () => Connection::query()
            ->where('event_id', $event->id)
            ->involving($me->id)
            ->get());

        $attendees->through(fn (Attendee $a) => [
            'uuid' => $a->uuid,
            'name' => $a->full_name,
            'job_title' => $a->job_title,
            'company' => $a->company,
            'headline' => $a->profile?->headline,
            'avatar' => $a->profile?->avatar_path,
            'interests' => $a->profile?->interests,
            'looking_for' => $a->profile?->looking_for,
            'open_to_meetings' => $a->profile?->open_to_meetings ?? false,
            'connection_status' => $connections
                ->first(fn ($c) => $c->requester_id === $a->id || $c->addressee_id === $a->id)?->status,
        ]);

        return response()->json($attendees);
    }

    public function updateProfile(Request $request, string $eventUuid): JsonResponse
    {
        $event = $this->publicEvent($eventUuid);
        $me = $this->requireAttendee($request, $event);

        $data = $request->validate([
            'headline' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string', 'max:2000'],
            'interests' => ['nullable', 'array', 'max:12'],
            'looking_for' => ['nullable', 'array', 'max:6'],
            'social_links' => ['nullable', 'array'],
            'visibility' => ['nullable', 'in:public,event,connections,hidden'],
            'open_to_meetings' => ['boolean'],
            'consent_share_profile' => ['boolean'],
        ]);

        if (array_key_exists('consent_share_profile', $data)) {
            $me->update(['consent_share_profile' => $data['consent_share_profile']]);
            unset($data['consent_share_profile']);
        }

        $profile = $me->profile()->updateOrCreate([], $data);

        return response()->json($profile);
    }

    // ── Connections ─────────────────────────────────────────────────────────

    public function connect(Request $request, string $eventUuid): JsonResponse
    {
        $data = $request->validate([
            'attendee_uuid' => ['required', 'uuid'],
            'message' => ['nullable', 'string', 'max:500'],
            'source' => ['nullable', 'in:directory,badge_scan,session,recommendation,qr'],
        ]);

        $event = $this->publicEvent($eventUuid);
        $me = $this->requireAttendee($request, $event);

        $target = TenantContext::withoutScoping(fn () => Attendee::query()
            ->where('event_id', $event->id)
            ->where('uuid', $data['attendee_uuid'])
            ->firstOrFail());

        abort_if($target->id === $me->id, 422, 'You cannot connect with yourself.');

        // If they already asked you, accept theirs rather than creating a mirror.
        $inbound = TenantContext::withoutScoping(fn () => Connection::query()
            ->where('event_id', $event->id)
            ->where('requester_id', $target->id)
            ->where('addressee_id', $me->id)
            ->where('status', 'pending')
            ->first());

        if ($inbound) {
            $inbound->accept();

            return response()->json($inbound->fresh());
        }

        $connection = TenantContext::withoutScoping(fn () => Connection::updateOrCreate(
            ['event_id' => $event->id, 'requester_id' => $me->id, 'addressee_id' => $target->id],
            ['message' => $data['message'] ?? null, 'source' => $data['source'] ?? 'directory']
        ));

        return response()->json($connection, 201);
    }

    public function respondToConnection(Request $request, string $eventUuid, int $connectionId): JsonResponse
    {
        $data = $request->validate(['action' => ['required', 'in:accept,decline,block']]);

        $event = $this->publicEvent($eventUuid);
        $me = $this->requireAttendee($request, $event);

        $connection = TenantContext::withoutScoping(fn () => Connection::query()
            ->where('event_id', $event->id)
            ->where('addressee_id', $me->id)
            ->findOrFail($connectionId));

        $data['action'] === 'accept'
            ? $connection->accept()
            : $connection->update([
                'status' => $data['action'] === 'block' ? 'blocked' : 'declined',
                'responded_at' => now(),
            ]);

        return response()->json($connection->fresh());
    }

    /** Digital business cards — accepted connections only. */
    public function myConnections(Request $request, string $eventUuid): JsonResponse
    {
        $event = $this->publicEvent($eventUuid);
        $me = $this->requireAttendee($request, $event);

        $connections = TenantContext::withoutScoping(fn () => Connection::query()
            ->where('event_id', $event->id)
            ->involving($me->id)
            ->with('requester.profile', 'addressee.profile')
            ->get());

        return response()->json($connections->map(function (Connection $c) use ($me) {
            $other = $c->otherParty($me->id);

            return [
                'id' => $c->id,
                'status' => $c->status,
                'direction' => $c->requester_id === $me->id ? 'sent' : 'received',
                'message' => $c->message,
                'attendee' => [
                    'uuid' => $other?->uuid,
                    'name' => $other?->full_name,
                    'job_title' => $other?->job_title,
                    'company' => $other?->company,
                    'headline' => $other?->profile?->headline,
                    // Contact details only cross once both sides agreed.
                    'email' => $c->card_shared ? $other?->email : null,
                    'phone' => $c->card_shared ? $other?->phone : null,
                ],
            ];
        }));
    }

    // ── Meetings ────────────────────────────────────────────────────────────

    public function proposeMeeting(Request $request, string $eventUuid): JsonResponse
    {
        $data = $request->validate([
            'attendee_uuid' => ['required', 'uuid'],
            'title' => ['required', 'string', 'max:255'],
            'agenda' => ['nullable', 'string', 'max:2000'],
            'location_label' => ['nullable', 'string', 'max:255'],
            'starts_at' => ['required', 'date', 'after:now'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
        ]);

        $event = $this->publicEvent($eventUuid);
        $me = $this->requireAttendee($request, $event);

        $invitee = TenantContext::withoutScoping(fn () => Attendee::query()
            ->where('event_id', $event->id)
            ->where('uuid', $data['attendee_uuid'])
            ->firstOrFail());

        foreach ([$me->id, $invitee->id] as $attendeeId) {
            if (Meeting::clashesFor($attendeeId, $data['starts_at'], $data['ends_at'])) {
                return response()->json([
                    'message' => $attendeeId === $me->id
                        ? 'You already have a meeting at that time.'
                        : 'They already have a meeting at that time.',
                ], 422);
            }
        }

        $meeting = TenantContext::withoutScoping(fn () => Meeting::create([
            'event_id' => $event->id,
            'organizer_id' => $me->id,
            'title' => $data['title'],
            'agenda' => $data['agenda'] ?? null,
            'location_label' => $data['location_label'] ?? null,
            'starts_at' => $data['starts_at'],
            'ends_at' => $data['ends_at'],
        ]));

        $meeting->participants()->attach($invitee->id, ['status' => 'invited']);

        return response()->json($meeting->load('participants:id,first_name,last_name'), 201);
    }

    public function respondToMeeting(Request $request, string $eventUuid, string $meetingUuid): JsonResponse
    {
        $data = $request->validate(['action' => ['required', 'in:accept,decline,tentative']]);

        $event = $this->publicEvent($eventUuid);
        $me = $this->requireAttendee($request, $event);

        $meeting = TenantContext::withoutScoping(fn () => Meeting::query()
            ->where('event_id', $event->id)
            ->where('uuid', $meetingUuid)
            ->firstOrFail());

        abort_unless($meeting->participants()->where('attendees.id', $me->id)->exists(), 403);

        $status = match ($data['action']) {
            'accept' => 'accepted',
            'decline' => 'declined',
            default => 'tentative',
        };

        $meeting->participants()->updateExistingPivot($me->id, [
            'status' => $status,
            'responded_at' => now(),
        ]);

        if ($status === 'accepted') {
            $meeting->update(['status' => 'confirmed']);
        } elseif ($status === 'declined') {
            $meeting->update(['status' => 'declined']);
        }

        return response()->json($meeting->fresh('participants'));
    }

    public function myMeetings(Request $request, string $eventUuid): JsonResponse
    {
        $event = $this->publicEvent($eventUuid);
        $me = $this->requireAttendee($request, $event);

        return response()->json(TenantContext::withoutScoping(fn () => Meeting::query()
            ->where('event_id', $event->id)
            ->where(fn ($q) => $q->where('organizer_id', $me->id)
                ->orWhereHas('participants', fn ($p) => $p->where('attendees.id', $me->id)))
            ->with('organizer:id,first_name,last_name,company', 'participants:id,first_name,last_name,company')
            ->orderBy('starts_at')
            ->get()));
    }

    // ── Chat ────────────────────────────────────────────────────────────────

    public function conversations(Request $request, string $eventUuid): JsonResponse
    {
        $event = $this->publicEvent($eventUuid);
        $me = $this->requireAttendee($request, $event);

        $conversations = TenantContext::withoutScoping(fn () => Conversation::query()
            ->where('event_id', $event->id)
            ->whereHas('participants', fn ($q) => $q->where('attendees.id', $me->id))
            ->with('participants:id,uuid,first_name,last_name,company', 'latestMessage')
            ->orderByDesc('last_message_at')
            ->get());

        return response()->json($conversations->map(fn (Conversation $c) => [
            'uuid' => $c->uuid,
            'type' => $c->type,
            'participants' => $c->participants
                ->where('id', '!=', $me->id)
                ->map(fn ($p) => ['uuid' => $p->uuid, 'name' => $p->full_name, 'company' => $p->company])
                ->values(),
            'last_message' => $c->latestMessage->first()?->body,
            'last_message_at' => $c->last_message_at,
            'unread' => $c->unreadCountFor($me->id),
        ]));
    }

    public function sendMessage(Request $request, string $eventUuid): JsonResponse
    {
        $data = $request->validate([
            'attendee_uuid' => ['required', 'uuid'],
            'body' => ['required', 'string', 'max:4000'],
        ]);

        $event = $this->publicEvent($eventUuid);
        $me = $this->requireAttendee($request, $event);

        $other = TenantContext::withoutScoping(fn () => Attendee::query()
            ->where('event_id', $event->id)
            ->where('uuid', $data['attendee_uuid'])
            ->firstOrFail());

        // You can only message someone you're connected to — this is what stops
        // the directory becoming a spam surface.
        $connected = TenantContext::withoutScoping(fn () => Connection::query()
            ->where('event_id', $event->id)
            ->accepted()
            ->involving($me->id)
            ->where(fn ($q) => $q->where('requester_id', $other->id)->orWhere('addressee_id', $other->id))
            ->exists());

        abort_unless($connected, 403, 'Connect with them first.');

        $conversation = TenantContext::withoutScoping(
            fn () => Conversation::between($event, $me->id, $other->id)
        );

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => $me->id,
            'body' => $data['body'],
        ]);

        MessageSent::dispatch($message->load('sender.profile'));

        return response()->json($message, 201);
    }

    public function messages(Request $request, string $eventUuid, string $conversationUuid): JsonResponse
    {
        $event = $this->publicEvent($eventUuid);
        $me = $this->requireAttendee($request, $event);

        $conversation = TenantContext::withoutScoping(fn () => Conversation::query()
            ->where('event_id', $event->id)
            ->where('uuid', $conversationUuid)
            ->firstOrFail());

        abort_unless($conversation->participants()->where('attendees.id', $me->id)->exists(), 403);

        $conversation->participants()->updateExistingPivot($me->id, ['last_read_at' => now()]);

        return response()->json(
            $conversation->messages()->with('sender:id,uuid,first_name,last_name')->paginate(50)
        );
    }

    protected function publicEvent(string $uuid): Event
    {
        return TenantContext::withoutScoping(
            fn () => Event::publiclyVisible()->where('uuid', $uuid)->firstOrFail()
        );
    }
}
