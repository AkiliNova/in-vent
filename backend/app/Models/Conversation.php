<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Conversation extends Model
{
    use HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['last_message_at' => 'datetime'];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(EventSession::class, 'event_session_id');
    }

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(Attendee::class, 'conversation_participants')
            ->withPivot(['last_read_at', 'is_muted'])
            ->withTimestamps();
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class)->orderBy('created_at');
    }

    public function latestMessage(): HasMany
    {
        return $this->hasMany(Message::class)->latest()->limit(1);
    }

    /** Finds or opens the one-to-one thread between two attendees. */
    public static function between(Event $event, int $attendeeA, int $attendeeB): self
    {
        $existing = static::query()
            ->where('event_id', $event->id)
            ->where('type', 'direct')
            ->whereHas('participants', fn ($q) => $q->where('attendees.id', $attendeeA))
            ->whereHas('participants', fn ($q) => $q->where('attendees.id', $attendeeB))
            ->first();

        if ($existing) {
            return $existing;
        }

        $conversation = static::create(['event_id' => $event->id, 'type' => 'direct']);
        $conversation->participants()->attach([$attendeeA, $attendeeB]);

        return $conversation;
    }

    public function unreadCountFor(int $attendeeId): int
    {
        $lastRead = $this->participants()
            ->where('attendees.id', $attendeeId)
            ->first()?->pivot?->last_read_at;

        return $this->messages()
            ->when($lastRead, fn ($q) => $q->where('created_at', '>', $lastRead))
            ->where('sender_id', '!=', $attendeeId)
            ->count();
    }
}
