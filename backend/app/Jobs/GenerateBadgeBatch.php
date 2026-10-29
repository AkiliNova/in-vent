<?php

namespace App\Jobs;

use App\Models\Attendee;
use App\Models\BadgeTemplate;
use App\Models\Event;
use App\Services\Badges\BadgeRenderer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

/**
 * Pre-prints every badge for an event into one PDF. Runs long, so it reports
 * its output path through the cache for the UI to pick up.
 */
class GenerateBadgeBatch implements ShouldQueue
{
    use Queueable;

    public int $timeout = 900;

    public function __construct(
        public Event $event,
        public ?string $category = null,
        public ?int $templateId = null,
        public ?string $trackingKey = null,
    ) {}

    public function handle(BadgeRenderer $renderer): void
    {
        $attendees = Attendee::withoutGlobalScope('tenant')
            ->with('event', 'tickets')
            ->where('event_id', $this->event->id)
            ->when($this->category, fn ($q) => $q->where('category', $this->category))
            ->whereNot('status', 'cancelled')
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get();

        if ($attendees->isEmpty()) {
            return;
        }

        $template = $this->templateId
            ? BadgeTemplate::withoutGlobalScope('tenant')->find($this->templateId)
            : null;

        $path = $renderer->renderBatch($attendees, $template);

        if ($this->trackingKey) {
            Cache::put($this->trackingKey, [
                'status' => 'ready',
                'path' => $path,
                'count' => $attendees->count(),
            ], now()->addHours(6));
        }
    }
}
