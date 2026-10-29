<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Tikooh feature 4: the canvas an organizer lays a room out on. */
class FloorPlan extends Model
{
    use HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['scale_metres_per_unit' => 'float'];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function venueSpace(): BelongsTo
    {
        return $this->belongsTo(VenueSpace::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(FloorPlanItem::class)->orderBy('z_index');
    }

    public function seats(): HasMany
    {
        return $this->hasMany(FloorPlanItem::class)->where('type', 'seat');
    }

    public function boothItems(): HasMany
    {
        return $this->hasMany(FloorPlanItem::class)->where('type', 'booth');
    }

    /** Total people the laid-out furniture can hold. */
    public function seatedCapacity(): int
    {
        return (int) $this->items()->whereIn('type', ['seat', 'table'])->sum('capacity');
    }
}
