<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Venue;
use App\Models\VenueSpace;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/** Tikooh feature 3: venue sourcing. */
class VenueController extends Controller
{
    /** Search and compare venues: capacity, location, price, amenities. */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'city' => ['nullable', 'string', 'max:120'],
            'min_capacity' => ['nullable', 'integer', 'min:0'],
            'max_capacity' => ['nullable', 'integer', 'min:0'],
            'max_price' => ['nullable', 'numeric', 'min:0'],
            'amenities' => ['nullable', 'array'],
            'amenities.*' => ['string', 'max:64'],
            'suitable_for' => ['nullable', 'string', 'max:64'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'radius_km' => ['nullable', 'numeric', 'min:0.1', 'max:500'],
            'sort' => ['nullable', 'in:capacity,price,rating,distance'],
        ]);

        $venues = Venue::query()
            ->visibleTo(TenantContext::id())
            ->with('amenities:id,name,slug,icon')
            ->withCount('spaces')
            ->when($data['city'] ?? null, fn ($q, $c) => $q->where('city', 'like', "%{$c}%"))
            ->fitting($data['min_capacity'] ?? null, $data['max_capacity'] ?? null)
            ->when($data['max_price'] ?? null, fn ($q, $p) => $q->where('price_per_day', '<=', $p))
            ->when($data['amenities'] ?? null, fn ($q, $a) => $q->withAllAmenities($a))
            ->when($data['suitable_for'] ?? null, fn ($q, $s) => $q->whereJsonContains('suitable_for', $s))
            ->when(
                isset($data['lat'], $data['lng']),
                fn ($q) => $q->near($data['lat'], $data['lng'], $data['radius_km'] ?? 25)
            )
            ->when(($data['sort'] ?? null) === 'capacity', fn ($q) => $q->orderByDesc('capacity'))
            ->when(($data['sort'] ?? null) === 'price', fn ($q) => $q->orderBy('price_per_day'))
            ->when(($data['sort'] ?? null) === 'rating', fn ($q) => $q->orderByDesc('rating'))
            ->paginate($request->integer('per_page', 20));

        return response()->json($venues);
    }

    public function show(Venue $venue): JsonResponse
    {
        abort_unless(
            $venue->is_public || $venue->tenant_id === TenantContext::id(),
            404
        );

        return response()->json($venue->load('amenities', 'spaces', 'reviews.tenant:id,organization_name'));
    }

    /** Creates a private venue for the tenant, or a public listing for staff. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'county' => ['nullable', 'string', 'max:120'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'map_link' => ['nullable', 'url', 'max:2048'],
            'capacity' => ['required', 'integer', 'min:1'],
            'min_capacity' => ['nullable', 'integer', 'min:0'],
            'price_per_day' => ['nullable', 'numeric', 'min:0'],
            'price_per_hour' => ['nullable', 'numeric', 'min:0'],
            'suitable_for' => ['nullable', 'array'],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'contact_email' => ['nullable', 'email', 'max:255'],
            'contact_phone' => ['nullable', 'string', 'max:32'],
            'amenity_ids' => ['nullable', 'array'],
            'amenity_ids.*' => ['integer', 'exists:amenities,id'],
        ]);

        $venue = Venue::create(array_merge($data, [
            // Only platform staff can publish into the shared directory.
            'tenant_id' => TenantContext::id(),
            'is_public' => $request->user()->isSuperAdmin() && $request->boolean('is_public'),
            'slug' => $this->uniqueSlug($data['name']),
        ]));

        if (! empty($data['amenity_ids'])) {
            $venue->amenities()->sync($data['amenity_ids']);
        }

        return response()->json($venue->load('amenities'), 201);
    }

    public function update(Request $request, Venue $venue): JsonResponse
    {
        abort_unless($venue->tenant_id === TenantContext::id() || $request->user()->isSuperAdmin(), 403);

        $venue->update($request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'capacity' => ['sometimes', 'integer', 'min:1'],
            'price_per_day' => ['nullable', 'numeric', 'min:0'],
            'contact_email' => ['nullable', 'email', 'max:255'],
            'contact_phone' => ['nullable', 'string', 'max:32'],
        ]));

        if ($request->has('amenity_ids')) {
            $venue->amenities()->sync($request->input('amenity_ids', []));
        }

        return response()->json($venue->fresh('amenities'));
    }

    /** Halls and breakout rooms inside a venue. */
    public function storeSpace(Request $request, Venue $venue): JsonResponse
    {
        abort_unless($venue->tenant_id === TenantContext::id() || $request->user()->isSuperAdmin(), 403);

        $space = $venue->spaces()->create($request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'capacity' => ['required', 'integer', 'min:1'],
            'floor_area_sqm' => ['nullable', 'numeric', 'min:0'],
            'floor_label' => ['nullable', 'string', 'max:64'],
            'layout_types' => ['nullable', 'array'],
            'price_per_day' => ['nullable', 'numeric', 'min:0'],
        ]));

        return response()->json($space, 201);
    }

    public function destroySpace(Venue $venue, VenueSpace $space): JsonResponse
    {
        abort_if($space->venue_id !== $venue->id, 404);
        abort_unless($venue->tenant_id === TenantContext::id(), 403);

        $space->delete();

        return response()->json(null, 204);
    }

    /** A tenant may review a venue once. */
    public function review(Request $request, Venue $venue): JsonResponse
    {
        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);

        $venue->reviews()->updateOrCreate(
            ['tenant_id' => TenantContext::id()],
            $data + ['user_id' => $request->user()->id]
        );

        $venue->recalculateRating();

        return response()->json($venue->fresh('reviews'));
    }

    protected function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'venue';
        $slug = $base;
        $n = 1;

        while (Venue::withTrashed()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.(++$n);
        }

        return $slug;
    }
}
