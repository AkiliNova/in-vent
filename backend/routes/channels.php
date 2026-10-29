<?php

use App\Models\Attendee;
use App\Models\Conversation;
use App\Models\Event;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

/**
 * Channel authorisation. Every callback resolves the event or conversation
 * server-side and checks the caller actually belongs to it — a client cannot
 * subscribe its way into another tenant's live data.
 */

/** Public event floor: polls, approved Q&A, announcements. */
Broadcast::channel('event.{eventId}', function (User $user, int $eventId) {
    $event = Event::withoutGlobalScope('tenant')->find($eventId);

    if (! $event) {
        return false;
    }

    // Organisers and staff of the owning tenant.
    if ($user->tenant_id === $event->tenant_id) {
        return ['id' => $user->id, 'name' => $user->name, 'role' => $user->role];
    }

    // Attendees registered for this event.
    $attendee = Attendee::withoutGlobalScope('tenant')
        ->where('event_id', $eventId)
        ->where('user_id', $user->id)
        ->first();

    if (! $attendee) {
        return false;
    }

    return [
        'id' => $attendee->uuid,
        'name' => $attendee->consent_share_profile ? $attendee->full_name : 'Attendee',
        'role' => 'attendee',
    ];
});

/** Door feed and arrivals counter — organiser side only. */
Broadcast::channel('event.{eventId}.staff', function (User $user, int $eventId) {
    $event = Event::withoutGlobalScope('tenant')->find($eventId);

    return $event
        && $user->tenant_id === $event->tenant_id
        && in_array($user->role, [User::ROLE_ORGANIZER, User::ROLE_STAFF, User::ROLE_SUPER_ADMIN], true);
});

/** Pending questions awaiting moderation. */
Broadcast::channel('event.{eventId}.moderation', function (User $user, int $eventId) {
    $event = Event::withoutGlobalScope('tenant')->find($eventId);

    return $event
        && $user->tenant_id === $event->tenant_id
        && in_array($user->role, [User::ROLE_ORGANIZER, User::ROLE_STAFF, User::ROLE_SUPER_ADMIN], true);
});

/** A networking thread — only its participants. */
Broadcast::channel('conversation.{conversationId}', function (User $user, int $conversationId) {
    $conversation = Conversation::find($conversationId);

    if (! $conversation) {
        return false;
    }

    return $conversation->participants()
        ->where('attendees.user_id', $user->id)
        ->exists();
});
