<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Services\ShareImage;
use App\Support\TenantContext;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Link previews for public event pages. The SPA can't set meta tags for
 * crawlers (they don't run JavaScript), so tikooh.com's edge middleware hands
 * preview bots this page instead, and /og/{uuid}.jpg proxies to image().
 */
class ShareController extends Controller
{
    public function page(string $uuid): Response
    {
        $event = $this->find($uuid);
        $frontend = rtrim(config('app.frontend_url'), '/');
        $tz = $event->timezone ?: 'Africa/Nairobi';

        $when = $event->start_date?->copy()->setTimezone($tz)->format('D j M Y, g:i A');
        $where = $event->venue?->name ?: ($event->location_name ?: $event->city);
        $about = Str::limit(trim(preg_replace('/\s+/', ' ', strip_tags((string) $event->description))), 150);

        return response()->view('share.event', [
            'event' => $event,
            'url' => "{$frontend}/e/{$event->uuid}",
            'image' => "{$frontend}/og/{$event->uuid}.jpg?v=".ShareImage::version($event),
            'description' => implode(' · ', array_filter([$when, $where])).($about ? " — {$about}" : ''),
        ])->header('Cache-Control', 'public, max-age=600');
    }

    public function image(string $uuid, ShareImage $images): BinaryFileResponse
    {
        return response()->file($images->path($this->find($uuid)), [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }

    protected function find(string $uuid): Event
    {
        return TenantContext::withoutScoping(fn () => Event::query()
            ->with('venue:id,name')
            ->where('is_public', true)
            ->whereIn('status', ['published', 'live', 'ended'])
            ->where('uuid', $uuid)
            ->firstOrFail());
    }
}
