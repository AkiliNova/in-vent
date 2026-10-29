<?php

namespace App\Events;

use App\Models\CheckIn;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Drives the organizer's live door feed and the arrivals counter. Organizer
 * channel only — attendee names must not go out on the public event channel.
 */
class AttendeeCheckedIn implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public CheckIn $checkIn) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('event.'.$this->checkIn->event_id.'.staff')];
    }

    public function broadcastAs(): string
    {
        return 'attendee.checked-in';
    }

    public function broadcastWith(): array
    {
        $attendee = $this->checkIn->attendee;

        return [
            'attendee_uuid' => $attendee?->uuid,
            'name' => $attendee?->full_name,
            'category' => $attendee?->category,
            'company' => $attendee?->company,
            'method' => $this->checkIn->method,
            'session_id' => $this->checkIn->event_session_id,
            'scanned_at' => $this->checkIn->scanned_at?->toIso8601String(),
        ];
    }
}
