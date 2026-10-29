<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class FloorPlanItem extends Model
{
    use HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'x' => 'float',
            'y' => 'float',
            'width' => 'float',
            'height' => 'float',
            'rotation' => 'float',
            'style' => 'array',
            'properties' => 'array',
            'is_assignable' => 'boolean',
        ];
    }

    public function floorPlan(): BelongsTo
    {
        return $this->belongsTo(FloorPlan::class);
    }

    public function seatAssignments(): HasMany
    {
        return $this->hasMany(SeatAssignment::class);
    }

    public function booth(): HasOne
    {
        return $this->hasOne(Booth::class);
    }

    public function remainingSeats(): int
    {
        return max(0, $this->capacity - $this->seatAssignments()->where('status', 'assigned')->count());
    }
}
