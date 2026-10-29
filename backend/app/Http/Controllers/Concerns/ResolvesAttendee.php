<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Attendee;
use App\Models\Event;
use App\Support\TenantContext;
use Illuminate\Http\Request;

trait ResolvesAttendee
{
    /**
     * Resolves the signed-in user to their attendee record for an event, or
     * 403s. Attendee-facing endpoints act on this rather than on any id the
     * client supplies.
     */
    protected function requireAttendee(Request $request, Event $event): Attendee
    {
        $user = $request->user();

        abort_unless($user, 401, 'Sign in to use this.');

        $attendee = TenantContext::withoutScoping(fn () => Attendee::query()
            ->where('event_id', $event->id)
            ->where('user_id', $user->id)
            ->first());

        abort_unless($attendee, 403, 'You are not registered for this event.');

        return $attendee;
    }
}
