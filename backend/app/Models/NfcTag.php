<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tikooh feature 6: a physical NFC chip bound to an attendee for the event. */
class NfcTag extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'assigned_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function attendee(): BelongsTo
    {
        return $this->belongsTo(Attendee::class);
    }

    public function assignTo(Attendee $attendee): void
    {
        $this->forceFill([
            'attendee_id' => $attendee->id,
            'event_id' => $attendee->event_id,
            'status' => 'assigned',
            'assigned_at' => now(),
        ])->save();
    }

    /** Frees the chip for a later event without losing its history. */
    public function recycle(): void
    {
        $this->forceFill([
            'attendee_id' => null,
            'status' => 'unassigned',
            'reuse_count' => $this->reuse_count + 1,
            'revoked_at' => now(),
        ])->save();
    }

    public function isUsable(): bool
    {
        return $this->status === 'assigned' && $this->attendee_id !== null;
    }
}
