<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\GenerateBadgeBatch;
use App\Models\Attendee;
use App\Models\Badge;
use App\Models\BadgeTemplate;
use App\Models\Event;
use App\Services\Badges\BadgeRenderer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Tikooh feature 11: badge design and printing. */
class BadgeController extends Controller
{
    public function __construct(protected BadgeRenderer $renderer) {}

    public function templates(Event $event): JsonResponse
    {
        return response()->json(
            BadgeTemplate::where(fn ($q) => $q->where('event_id', $event->id)->orWhereNull('event_id'))
                ->orderByDesc('is_default')
                ->get()
        );
    }

    public function storeTemplate(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'attendee_category' => ['nullable', 'string', 'max:64'],
            'width_mm' => ['nullable', 'numeric', 'min:20', 'max:400'],
            'height_mm' => ['nullable', 'numeric', 'min:20', 'max:400'],
            'orientation' => ['nullable', 'in:portrait,landscape'],
            'background_colour' => ['nullable', 'string', 'max:9'],
            'elements' => ['required', 'array', 'min:1'],
            'elements.*.type' => ['required', 'in:field,text,qr,image,rect'],
            'elements.*.x' => ['required', 'numeric'],
            'elements.*.y' => ['required', 'numeric'],
            'include_qr' => ['boolean'],
            'include_nfc' => ['boolean'],
            'is_default' => ['boolean'],
        ]);

        $template = $event->badgeTemplates()->create($data + ['tenant_id' => $event->tenant_id]);

        // Only one default per event/category pair.
        if ($template->is_default) {
            BadgeTemplate::where('event_id', $event->id)
                ->where('attendee_category', $template->attendee_category)
                ->whereKeyNot($template->id)
                ->update(['is_default' => false]);
        }

        return response()->json($template, 201);
    }

    public function updateTemplate(Request $request, Event $event, BadgeTemplate $template): JsonResponse
    {
        abort_if($template->event_id !== null && $template->event_id !== $event->id, 404);

        $template->update($request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'attendee_category' => ['nullable', 'string', 'max:64'],
            'width_mm' => ['sometimes', 'numeric', 'min:20', 'max:400'],
            'height_mm' => ['sometimes', 'numeric', 'min:20', 'max:400'],
            'background_colour' => ['nullable', 'string', 'max:9'],
            'elements' => ['sometimes', 'array', 'min:1'],
            'is_default' => ['boolean'],
        ]));

        return response()->json($template->fresh());
    }

    /** Renders one badge on demand — used by the check-in desk's print button. */
    public function generate(Event $event, Attendee $attendee): JsonResponse
    {
        abort_if($attendee->event_id !== $event->id, 404);

        $badge = $this->renderer->render($attendee->load('event', 'tickets'));

        return response()->json([
            'serial' => $badge->serial,
            'status' => $badge->status,
            'download_url' => route('badges.download', ['badge' => $badge->uuid]),
        ]);
    }

    public function download(Request $request, string $badgeUuid): StreamedResponse
    {
        $badge = Badge::where('uuid', $badgeUuid)->firstOrFail();

        abort_unless($badge->event->tenant_id === $request->user()->tenant_id, 403);
        abort_unless($badge->pdf_path && Storage::disk('local')->exists($badge->pdf_path), 404);

        // Downloading is what the printer does, so this is the print event.
        $badge->markPrinted($request->user());

        return Storage::disk('local')->download($badge->pdf_path, "badge-{$badge->serial}.pdf");
    }

    /** Queues the whole event's badges into one printable PDF. */
    public function generateBatch(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'category' => ['nullable', 'string', 'max:64'],
            'badge_template_id' => ['nullable', 'integer', 'exists:badge_templates,id'],
        ]);

        $key = 'badge-batch:'.$event->id.':'.Str::random(12);

        Cache::put($key, ['status' => 'queued'], now()->addHours(6));

        GenerateBadgeBatch::dispatch(
            $event,
            $data['category'] ?? null,
            $data['badge_template_id'] ?? null,
            $key
        );

        return response()->json(['tracking_key' => $key, 'status' => 'queued'], 202);
    }

    public function batchStatus(string $key): JsonResponse
    {
        $state = Cache::get($key);

        abort_unless($state, 404);

        return response()->json($state);
    }

    public function downloadBatch(Request $request, string $key): StreamedResponse
    {
        $state = Cache::get($key);

        abort_unless($state && ($state['status'] ?? null) === 'ready', 404);
        abort_unless(str_starts_with($key, 'badge-batch:'), 403);

        return Storage::disk('local')->download($state['path'], 'badges.pdf');
    }
}
