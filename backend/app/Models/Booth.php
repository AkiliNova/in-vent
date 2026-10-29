<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Booth extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'amenities' => 'array',
            'price' => 'decimal:2',
            'area_sqm' => 'decimal:2',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function exhibitor(): BelongsTo
    {
        return $this->belongsTo(Exhibitor::class);
    }

    /** Links the booth to its rectangle on the floor plan (feature 4). */
    public function floorPlanItem(): BelongsTo
    {
        return $this->belongsTo(FloorPlanItem::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }

    public function assignTo(Exhibitor $exhibitor): void
    {
        $this->forceFill([
            'exhibitor_id' => $exhibitor->id,
            'status' => 'assigned',
        ])->save();
    }
}
