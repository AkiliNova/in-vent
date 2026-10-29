<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Event;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class EventController extends Controller
{
    /** Organizer-facing list — the tenant scope handles isolation. */
    public function index(Request $request): JsonResponse
    {
        $events = Event::query()
            ->withCount(['attendees', 'sessions', 'exhibitors'])
            ->with('venue:id,name,city')
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->string('search')->toString(), fn ($q, $s) => $q->where('title', 'like', "%{$s}%"))
            ->orderByDesc('start_date')
            ->paginate($request->integer('per_page', 20));

        return response()->json($events);
    }

    /** Public discovery feed — published, public events across all tenants. */
    public function publicIndex(Request $request): JsonResponse
    {
        $events = TenantContext::withoutScoping(fn () => Event::query()
            ->publiclyVisible()
            ->upcoming()
            ->with('venue:id,name,city', 'ticketTiers:id,event_id,name,price,capacity,sold,is_active')
            ->when($request->string('city')->toString(), fn ($q, $c) => $q->where('city', 'like', "%{$c}%"))
            ->when($request->string('type')->toString(), fn ($q, $t) => $q->where('event_type', $t))
            ->when($request->string('search')->toString(), fn ($q, $s) => $q->where(
                fn ($w) => $w->where('title', 'like', "%{$s}%")->orWhere('description', 'like', "%{$s}%")
            ))
            ->orderBy('start_date')
            ->paginate($request->integer('per_page', 12)));

        return response()->json($events);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $data['slug'] = $this->uniqueSlug($data['title']);
        $event = Event::create($data);

        ActivityLog::record('created', $event, "Created event {$event->title}");

        return response()->json($event->load('ticketTiers'), 201);
    }

    public function show(Event $event): JsonResponse
    {
        return response()->json($event->load([
            'venue', 'images', 'ticketTiers', 'registrationFields',
            'sponsors', 'speakers:id,event_id,name,title,company,photo_path',
        ]));
    }

    /** Public event page — no auth, so only safe fields are exposed. */
    public function publicShow(string $uuid): JsonResponse
    {
        $event = TenantContext::withoutScoping(fn () => Event::query()
            ->publiclyVisible()
            ->with([
                'venue:id,name,address,city,map_link,latitude,longitude',
                'images',
                'ticketTiers' => fn ($q) => $q->where('is_active', true)->where('is_hidden', false),
                'registrationFields' => fn ($q) => $q->where('enabled', true),
                'speakers:id,event_id,name,title,company,bio,photo_path',
                'sessions.speakers:id,name',
                'sponsors',
            ])
            ->where('uuid', $uuid)
            ->firstOrFail());

        return response()->json($event);
    }

    public function update(Request $request, Event $event): JsonResponse
    {
        $event->update($this->validated($request, $event));

        ActivityLog::record('updated', $event, "Updated event {$event->title}");

        return response()->json($event->fresh());
    }

    public function uploadCover(Request $request, Event $event): JsonResponse
    {
        $request->validate(['image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120']]);

        $old = $event->cover_image_path;
        $path = $request->file('image')->store("events/{$event->tenant_id}", 'public');
        $event->update(['cover_image_path' => $path]);

        if ($old && ! str_starts_with($old, 'http')) {
            Storage::disk('public')->delete($old);
        }

        return response()->json($event->fresh());
    }

    public function publish(Event $event): JsonResponse
    {
        if ($event->ticketTiers()->where('is_active', true)->doesntExist()) {
            return response()->json([
                'message' => 'Add at least one active ticket type before publishing.',
            ], 422);
        }

        $event->update(['status' => 'published', 'published_at' => now()]);

        ActivityLog::record('published', $event);

        return response()->json($event->fresh());
    }

    public function destroy(Event $event): JsonResponse
    {
        if ($event->attendees()->exists()) {
            return response()->json([
                'message' => 'This event has registrations and cannot be deleted. Archive it instead.',
            ], 422);
        }

        $event->delete();

        ActivityLog::record('deleted', $event);

        return response()->json(null, 204);
    }

    protected function validated(Request $request, ?Event $event = null): array
    {
        return $request->validate([
            'title' => [$event ? 'sometimes' : 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'host' => ['nullable', 'string', 'max:255'],
            'event_type' => ['nullable', 'string', 'max:64'],
            'format' => ['nullable', 'in:in_person,virtual,hybrid'],
            'start_date' => [$event ? 'sometimes' : 'required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'timezone' => ['nullable', 'timezone'],
            'venue_id' => ['nullable', 'exists:venues,id'],
            'location_name' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'location_map_link' => ['nullable', 'url', 'max:2048'],
            'capacity' => ['nullable', 'integer', 'min:1'],
            'currency' => ['nullable', 'string', 'size:3'],
            'is_public' => ['boolean'],
            'waitlist_enabled' => ['boolean'],
            'networking_enabled' => ['boolean'],
            'chatbot_enabled' => ['boolean'],
            'livestream_url' => ['nullable', 'url', 'max:2048'],
            'settings' => ['nullable', 'array'],
        ]);
    }

    protected function uniqueSlug(string $title): string
    {
        $base = Str::slug($title) ?: 'event';
        $slug = $base;
        $n = 1;

        while (Event::where('slug', $slug)->exists()) {
            $slug = $base.'-'.(++$n);
        }

        return $slug;
    }
}
