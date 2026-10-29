<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tikooh feature 13: a connection request between two attendees. */
class Connection extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'card_shared' => 'boolean',
            'responded_at' => 'datetime',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(Attendee::class, 'requester_id');
    }

    public function addressee(): BelongsTo
    {
        return $this->belongsTo(Attendee::class, 'addressee_id');
    }

    public function scopeAccepted(Builder $query): Builder
    {
        return $query->where('status', 'accepted');
    }

    /** Either side of an accepted connection, from one attendee's point of view. */
    public function scopeInvolving(Builder $query, int $attendeeId): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->where('requester_id', $attendeeId)
            ->orWhere('addressee_id', $attendeeId));
    }

    public function accept(): void
    {
        $this->forceFill([
            'status' => 'accepted',
            'card_shared' => true,
            'responded_at' => now(),
        ])->save();
    }

    public function otherParty(int $attendeeId): ?Attendee
    {
        return $this->requester_id === $attendeeId ? $this->addressee : $this->requester;
    }
}
