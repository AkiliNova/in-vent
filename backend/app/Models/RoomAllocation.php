<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class RoomAllocation extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'check_in_date' => 'date',
            'check_out_date' => 'date',
            'actual_check_in_at' => 'datetime',
            'actual_check_out_at' => 'datetime',
            'total_cost' => 'decimal:2',
        ];
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(AccommodationRoom::class, 'accommodation_room_id');
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    /** A Dignitary, Speaker or Attendee. */
    public function allocatable(): MorphTo
    {
        return $this->morphTo();
    }

    public function allocatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'allocated_by');
    }

    public function nights(): int
    {
        if (! $this->check_in_date || ! $this->check_out_date) {
            return 0;
        }

        return (int) $this->check_in_date->diffInDays($this->check_out_date);
    }
}
