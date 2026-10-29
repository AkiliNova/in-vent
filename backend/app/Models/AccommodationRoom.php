<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccommodationRoom extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'amenities' => 'array',
            'rate_per_night' => 'decimal:2',
            'is_accessible' => 'boolean',
        ];
    }

    public function accommodation(): BelongsTo
    {
        return $this->belongsTo(Accommodation::class);
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(RoomAllocation::class);
    }

    /**
     * A room is free for a stay if no live allocation overlaps the requested
     * dates — the check that stops two dignitaries being put in one room.
     */
    public function scopeFreeBetween(Builder $query, string $from, string $to): Builder
    {
        return $query->whereDoesntHave('allocations', function (Builder $q) use ($from, $to) {
            $q->whereNotIn('status', ['cancelled', 'checked_out'])
                ->where('check_in_date', '<', $to)
                ->where('check_out_date', '>', $from);
        });
    }

    public function isFreeBetween(string $from, string $to): bool
    {
        return ! $this->allocations()
            ->whereNotIn('status', ['cancelled', 'checked_out'])
            ->where('check_in_date', '<', $to)
            ->where('check_out_date', '>', $from)
            ->exists();
    }
}
