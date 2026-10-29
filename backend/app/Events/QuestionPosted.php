<?php

namespace App\Events;

use App\Models\Question;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/** Tikooh feature 7: live Q&A. */
class QuestionPosted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Question $question) {}

    public function broadcastOn(): array
    {
        // Pending questions go only to the moderator channel; approved ones
        // also reach the audience.
        $channels = [new PrivateChannel('event.'.$this->question->event_id.'.moderation')];

        if (in_array($this->question->status, ['approved', 'answered'], true)) {
            $channels[] = new PresenceChannel('event.'.$this->question->event_id);
        }

        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'question.posted';
    }

    public function broadcastWith(): array
    {
        return [
            'uuid' => $this->question->uuid,
            'session_id' => $this->question->event_session_id,
            'body' => $this->question->body,
            'author' => $this->question->displayName(),
            'status' => $this->question->status,
            'upvotes' => $this->question->upvote_count,
            'answer' => $this->question->answer,
            'created_at' => $this->question->created_at?->toIso8601String(),
        ];
    }
}
