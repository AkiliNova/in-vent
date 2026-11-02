<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Tenant;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SharePreviewTest extends TestCase
{
    use RefreshDatabase;

    protected function event(array $attrs = []): Event
    {
        return TenantContext::withoutScoping(function () use ($attrs) {
            $tenant = Tenant::create(['organization_name' => 'Acme', 'slug' => 'acme', 'email' => 'a@x.com']);

            return Event::create($attrs + [
                'tenant_id' => $tenant->id, 'title' => 'Praise Night', 'slug' => 'praise', 'city' => 'Mombasa',
                'start_date' => now()->addWeek(), 'status' => 'published', 'is_public' => true,
            ]);
        });
    }

    public function test_preview_page_carries_the_event_title_and_a_large_image(): void
    {
        $event = $this->event();

        $html = $this->get("/api/public/events/{$event->uuid}/share")->assertOk()->getContent();

        $this->assertStringContainsString('<meta property="og:title" content="Praise Night">', $html);
        $this->assertStringContainsString("/og/{$event->uuid}.jpg?v=", $html);
        $this->assertStringContainsString('og:image:width" content="1200"', $html);
        $this->assertStringContainsString('Mombasa', $html);
    }

    public function test_image_uses_an_uploaded_portrait_poster_whole_and_stays_small(): void
    {
        Storage::fake('public');
        $poster = imagecreatetruecolor(800, 1200);
        imagefill($poster, 0, 0, imagecolorallocate($poster, 200, 30, 30));
        ob_start();
        imagejpeg($poster);
        Storage::disk('public')->put('events/1/poster.jpg', ob_get_clean());

        // No cover; the poster is a gallery upload.
        $event = $this->event();
        $event->images()->create(['path' => 'events/1/poster.jpg']);

        $res = $this->get("/api/public/events/{$event->uuid}/share.jpg")->assertOk();
        $file = $res->baseResponse->getFile()->getPathname();
        [$w, $h] = getimagesize($file);

        $this->assertSame([1200, 630], [$w, $h]);
        $this->assertLessThan(300_000, filesize($file));
        // The middle of the image is the poster itself (red), not the branded card.
        $px = imagecolorat($img = imagecreatefromjpeg($file), 600, 315);
        $this->assertGreaterThan(150, ($px >> 16) & 0xFF);
    }

    public function test_events_without_uploads_get_a_card_and_private_events_404(): void
    {
        $event = $this->event();
        $this->get("/api/public/events/{$event->uuid}/share.jpg")->assertOk()->assertHeader('Content-Type', 'image/jpeg');

        $event->update(['is_public' => false]);
        $this->get("/api/public/events/{$event->uuid}/share")->assertNotFound();
    }
}
