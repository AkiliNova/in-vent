<?php

namespace App\Jobs;

use App\Models\Attendee;
use App\Services\Badges\BadgeRenderer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Renders one attendee's badge PDF off the request path. */
class GenerateBadge implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public Attendee $attendee) {}

    public function handle(BadgeRenderer $renderer): void
    {
        $renderer->render($this->attendee);
    }
}
