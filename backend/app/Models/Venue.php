<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Tikooh feature 3. Not tenant-scoped by trait: a venue with tenant_id = null is
 * part of the shared directory every organizer can search.
 */
class Venue extends Model
{
    use HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'suitable_for' => 'array',
            'images' => 'array',
            'latitude' => 'float',
            'longitude' => 'float',
            'price_per_day' => 'decimal:2',
            'price_per_hour' => 'decimal:2',
            'rating' => 'decimal:2',
            'is_public' => 'boolean',
            'is_verified' => 'boolean',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function spaces(): HasMany
    {
        return $this->hasMany(VenueSpace::class);
    }

    public function amenities(): BelongsToMany
    {
        return $this->belongsToMany(Amenity::class)->withPivot('notes');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(VenueReview::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(Event::class);
    }

    /** Directory listing: public venues plus the caller's own private ones. */
    public function scopeVisibleTo(Builder $query, ?int $tenantId): Builder
    {
        return $query->where(function (Builder $q) use ($tenantId) {
            $q->where('is_public', true);

            if ($tenantId !== null) {
                $q->orWhere('tenant_id', $tenantId);
            }
        });
    }

    public function scopeFitting(Builder $query, ?int $minCapacity, ?int $maxCapacity): Builder
    {
        return $query
            ->when($minCapacity, fn ($q) => $q->where('capacity', '>=', $minCapacity))
            ->when($maxCapacity, fn ($q) => $q->where('capacity', '<=', $maxCapacity));
    }

    public function scopeWithAllAmenities(Builder $query, array $amenitySlugs): Builder
    {
        foreach ($amenitySlugs as $slug) {
            $query->whereHas('amenities', fn ($q) => $q->where('slug', $slug));
        }

        return $query;
    }

    /** Straight-line distance filter; good enough for a city-scale search. */
    public function scopeNear(Builder $query, float $lat, float $lng, float $radiusKm): Builder
    {
        $haversine = '(6371 * acos(cos(radians(?)) * cos(radians(latitude))
            * cos(radians(longitude) - radians(?)) + sin(radians(?)) * sin(radians(latitude))))';

        return $query->whereNotNull('latitude')
            ->whereRaw("{$haversine} <= ?", [$lat, $lng, $lat, $radiusKm])
            ->selectRaw("venues.*, {$haversine} AS distance_km", [$lat, $lng, $lat])
            ->orderBy('distance_km');
    }

    public function recalculateRating(): void
    {
        $this->forceFill([
            'rating' => (float) $this->reviews()->avg('rating'),
            'review_count' => $this->reviews()->count(),
        ])->save();
    }
}
