<?php

namespace App\Services\Badges;

use App\Models\Attendee;
use App\Models\Badge;
use App\Models\BadgeTemplate;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\View;

/**
 * Tikooh feature 11: badge design and printing.
 *
 * Renders a BadgeTemplate's `elements` array to a print-ready PDF sized to the
 * physical badge stock, so it can go straight to a badge printer at the desk.
 */
class BadgeRenderer
{
    /** Points per millimetre — dompdf works in points. */
    protected const MM_TO_PT = 2.834645669;

    /** Generates (or regenerates) the PDF for one attendee's badge. */
    public function render(Attendee $attendee, ?BadgeTemplate $template = null): Badge
    {
        $template ??= BadgeTemplate::resolveFor($attendee);

        $badge = Badge::firstOrNew(['attendee_id' => $attendee->id]);
        $badge->fill([
            'event_id' => $attendee->event_id,
            'badge_template_id' => $template?->id,
            'qr_payload' => $this->qrPayload($attendee),
        ])->save();

        $html = View::make('badges.default', [
            'attendee' => $attendee,
            'event' => $attendee->event,
            'badge' => $badge,
            'elements' => $template?->elements ?? BadgeTemplate::defaultElements(),
            'background' => $template?->background_colour ?? '#FFFFFF',
            'backgroundImage' => $this->asset($template?->background_image_path),
            'qrDataUri' => $this->qrDataUri($badge->qr_payload),
            'widthMm' => (float) ($template?->width_mm ?? 100),
            'heightMm' => (float) ($template?->height_mm ?? 150),
        ])->render();

        $pdf = Pdf::loadHTML($html)->setPaper([
            0,
            0,
            (float) ($template?->width_mm ?? 100) * self::MM_TO_PT,
            (float) ($template?->height_mm ?? 150) * self::MM_TO_PT,
        ]);

        $path = "badges/{$attendee->event_id}/{$badge->serial}.pdf";
        Storage::disk('local')->put($path, $pdf->output());

        $badge->forceFill([
            'pdf_path' => $path,
            'status' => 'generated',
            'generated_at' => now(),
        ])->save();

        return $badge;
    }

    /**
     * Merges many badges into one PDF for batch printing — what an organizer
     * actually wants the night before the event.
     *
     * @param  Collection<int,Attendee>  $attendees
     */
    public function renderBatch($attendees, ?BadgeTemplate $template = null): string
    {
        $pages = $attendees->map(function (Attendee $attendee) use ($template) {
            $resolved = $template ?? BadgeTemplate::resolveFor($attendee);
            $badge = Badge::firstOrCreate(
                ['attendee_id' => $attendee->id],
                [
                    'event_id' => $attendee->event_id,
                    'badge_template_id' => $resolved?->id,
                    'qr_payload' => $this->qrPayload($attendee),
                ]
            );

            return [
                'attendee' => $attendee,
                'event' => $attendee->event,
                'badge' => $badge,
                'elements' => $resolved?->elements ?? BadgeTemplate::defaultElements(),
                'background' => $resolved?->background_colour ?? '#FFFFFF',
                'backgroundImage' => $this->asset($resolved?->background_image_path),
                'qrDataUri' => $this->qrDataUri($badge->qr_payload),
                'widthMm' => (float) ($resolved?->width_mm ?? 100),
                'heightMm' => (float) ($resolved?->height_mm ?? 150),
            ];
        });

        $first = $pages->first();

        $pdf = Pdf::loadHTML(View::make('badges.batch', ['pages' => $pages])->render())
            ->setPaper([
                0,
                0,
                ($first['widthMm'] ?? 100) * self::MM_TO_PT,
                ($first['heightMm'] ?? 150) * self::MM_TO_PT,
            ]);

        $path = 'badges/batches/'.now()->format('Ymd-His').'-'.uniqid().'.pdf';
        Storage::disk('local')->put($path, $pdf->output());

        return $path;
    }

    /**
     * What the QR encodes. The scanner resolves this against `tickets.code`, so
     * it stays a plain code rather than a URL — faster to scan and it works
     * with no network at the gate.
     */
    protected function qrPayload(Attendee $attendee): string
    {
        $ticket = $attendee->tickets()->where('status', 'valid')->first();

        return $ticket?->code ?? $attendee->uuid;
    }

    /**
     * Renders the QR as an embedded data URI. dompdf cannot fetch remote
     * images, so the code has to be inlined.
     */
    protected function qrDataUri(string $payload): string
    {
        $renderer = new ImageRenderer(
            // Quiet zone of 1 module — the badge layout supplies the rest of the margin.
            new RendererStyle(400, 1),
            new SvgImageBackEnd
        );

        return 'data:image/svg+xml;base64,'.base64_encode(
            (new Writer($renderer))->writeString($payload)
        );
    }

    protected function asset(?string $path): ?string
    {
        if (! $path || ! Storage::disk('local')->exists($path)) {
            return null;
        }

        $mime = str_ends_with($path, '.png') ? 'image/png' : 'image/jpeg';

        return "data:{$mime};base64,".base64_encode(Storage::disk('local')->get($path));
    }
}
