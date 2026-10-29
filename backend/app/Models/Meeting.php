<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Meeting extends Model
{
    use HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function organizer(): BelongsTo
    {
        return $this->belongsTo(Attendee::class, 'organizer_id');
    }

    public function venueSpace(): BelongsTo
    {
        return $this->belongsTo(VenueSpace::class);
    }

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(Attendee::class, 'meeting_participants')
            ->withPivot(['status', 'responded_at']);
    }

    /** True when the attendee already has a meeting overlapping this slot. */
    public static function clashesFor(int $attendeeId, string $startsAt, string $endsAt): bool
    {
        return static::query()
            ->whereIn('status', ['proposed', 'confirmed'])
            ->where('starts_at', '<', $endsAt)
            ->where('ends_at', '>', $startsAt)
            ->where(fn ($q) => $q
                ->where('organizer_id', $attendeeId)
                ->orWhereHas('participants', fn ($p) => $p
                    ->where('attendees.id', $attendeeId)
                    ->where('meeting_participants.status', 'accepted')))
            ->exists();
    }
}
