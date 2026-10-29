<?php

namespace App\Events;

use App\Models\Poll;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Tikooh feature 7. Broadcast immediately rather than through the queue — a
 * live poll on stage is worthless if the bars move a few seconds late.
 */
class PollResultsUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Poll $poll) {}

    public function broadcastOn(): array
    {
        return [new PresenceChannel('event.'.$this->poll->event_id)];
    }

    public function broadcastAs(): string
    {
        return 'poll.results';
    }

    public function broadcastWith(): array
    {
        // Results stay hidden until the presenter opens them, so a closed poll
        // only broadcasts its state change.
        if (! $this->poll->show_results_live && ! $this->poll->results_published) {
            return [
                'poll_uuid' => $this->poll->uuid,
                'status' => $this->poll->status,
                'total_votes' => $this->poll->total_votes,
            ];
        }

        return $this->poll->loadMissing('options')->resultsPayload();
    }
}
