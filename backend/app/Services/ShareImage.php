<?php

namespace App\Services;

use App\Models\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * The 1200×630 JPEG link previews use (WhatsApp chats and Status, Facebook,
 * X, Telegram…). Landscape covers are cropped to fill; posters and flyers are
 * shown whole over a blurred copy of themselves so nothing gets cut off.
 * Uses the organiser's uploads (cover first, then gallery photos); events
 * with nothing usable get a branded card in the cover's colours.
 */
class ShareImage
{
    public const W = 1200;

    public const H = 630;

    /** Changes whenever anything drawn on the image changes, so crawlers re-fetch. */
    public static function version(Event $event): string
    {
        return substr(md5(implode('|', [...self::candidates($event), $event->title, $event->start_date, $event->updated_at])), 0, 10);
    }

    /** Images the organiser uploaded, best first: the cover, then the gallery. */
    public static function candidates(Event $event): array
    {
        return array_values(array_filter([
            $event->cover_image_path,
            ...$event->images()->pluck('path')->all(),
        ], fn ($p) => $p && ! str_ends_with(strtolower(strtok($p, '?')), '.svg')));
    }

    /** Absolute path to the cached JPEG, rendering it first if needed. */
    public function path(Event $event): string
    {
        $dir = storage_path('app/share');
        $file = "{$dir}/{$event->uuid}-".self::version($event).'.jpg';

        if (! is_file($file)) {
            @mkdir($dir, 0775, true);
            foreach (glob("{$dir}/{$event->uuid}-*.jpg") ?: [] as $old) {
                @unlink($old);
            }
            $this->render($event, $file);
        }

        return $file;
    }

    protected function render(Event $event, string $file): void
    {
        $canvas = imagecreatetruecolor(self::W, self::H);
        $cover = $this->loadCover($event);

        if ($cover) {
            $this->drawCover($canvas, $cover);
            imagedestroy($cover);
        } else {
            $this->drawCard($canvas, $event);
        }

        // WhatsApp drops previews over ~300 KB; step quality down until it fits.
        foreach ([85, 75, 65] as $quality) {
            imagejpeg($canvas, $file, $quality);
            clearstatcache(true, $file);
            if (filesize($file) < 280_000) {
                break;
            }
        }

        imagedestroy($canvas);
    }

    /** @return \GdImage|null */
    protected function loadCover(Event $event)
    {
        foreach (self::candidates($event) as $path) {
            try {
                $bytes = str_starts_with($path, 'http')
                    ? Http::timeout(8)->get($path)->throw()->body()
                    : Storage::disk('public')->get($path);

                if ($bytes && ($img = @imagecreatefromstring($bytes))) {
                    return $img;
                }
            } catch (\Throwable) {
                // Missing or unreachable: try the next upload.
            }
        }

        return null;
    }

    protected function drawCover($canvas, $cover): void
    {
        $sw = imagesx($cover);
        $sh = imagesy($cover);
        $target = self::W / self::H;

        if ($sw / $sh >= 1.6) {
            // Close enough to the preview shape: crop to fill.
            $cw = (int) min($sw, round($sh * $target));
            $ch = (int) min($sh, round($sw / $target));
            imagecopyresampled($canvas, $cover, 0, 0, (int) (($sw - $cw) / 2), (int) (($sh - $ch) / 2), self::W, self::H, $cw, $ch);

            return;
        }

        // Blurred, darkened backdrop: shrink to a few pixels and scale back up.
        $tiny = imagecreatetruecolor(48, 25);
        imagecopyresampled($tiny, $cover, 0, 0, 0, (int) ($sh * 0.2), 48, 25, $sw, (int) ($sh * 0.6));
        imagecopyresampled($canvas, $tiny, 0, 0, 0, 0, self::W, self::H, 48, 25);
        imagedestroy($tiny);
        imagefilledrectangle($canvas, 0, 0, self::W, self::H, imagecolorallocatealpha($canvas, 0, 0, 0, 70));

        // The whole poster, as large as fits.
        $scale = min((self::H - 30) / $sh, (self::W - 60) / $sw);
        $dw = (int) round($sw * $scale);
        $dh = (int) round($sh * $scale);
        $dx = (int) ((self::W - $dw) / 2);
        $dy = (int) ((self::H - $dh) / 2);
        imagefilledrectangle($canvas, $dx - 2, $dy - 2, $dx + $dw + 1, $dy + $dh + 1, imagecolorallocatealpha($canvas, 255, 255, 255, 100));
        imagecopyresampled($canvas, $cover, $dx, $dy, 0, 0, $dw, $dh, $sw, $sh);
    }

    protected function drawCard($canvas, Event $event): void
    {
        [$a, $b] = $this->palette($event);

        for ($y = 0; $y < self::H; $y++) {
            $t = $y / self::H;
            $c = imagecolorallocate($canvas, ...array_map(fn ($i) => (int) round($a[$i] + ($b[$i] - $a[$i]) * $t), [0, 1, 2]));
            imageline($canvas, 0, $y, self::W, $y, $c);
        }
        imagefilledrectangle($canvas, 0, 0, self::W, self::H, imagecolorallocatealpha($canvas, 0, 0, 0, 80));

        $bold = base_path('vendor/dompdf/dompdf/lib/fonts/DejaVuSans-Bold.ttf');
        $regular = base_path('vendor/dompdf/dompdf/lib/fonts/DejaVuSans.ttf');
        $white = imagecolorallocate($canvas, 255, 255, 255);
        $soft = imagecolorallocatealpha($canvas, 255, 255, 255, 30);

        $lines = $this->wrap($event->title ?: 'Event', $bold, 60, self::W - 160, 3);
        $y = 300 - (count($lines) - 1) * 40;
        foreach ($lines as $line) {
            imagettftext($canvas, 60, 0, 80, $y, $white, $bold, $line);
            $y += 82;
        }

        $tz = $event->timezone ?: 'Africa/Nairobi';
        $meta = array_filter([
            $event->start_date?->copy()->setTimezone($tz)->format('D j M Y · g:i A'),
            $event->location_name ?: $event->city,
        ]);
        if ($meta) {
            imagettftext($canvas, 26, 0, 80, $y + 10, $soft, $regular, implode('   ·   ', $meta));
        }

        imagettftext($canvas, 24, 0, 80, self::H - 50, $white, $bold, 'tikooh');
        imagettftext($canvas, 22, 0, self::W - 330, self::H - 50, $soft, $regular, 'Get tickets on Tikooh');
    }

    /** Reuse the generated SVG cover's colours so the card matches the event page. */
    protected function palette(Event $event): array
    {
        $fallback = [[124, 58, 237], [17, 24, 39]];
        $path = $event->cover_image_path;

        if (! $path || str_starts_with($path, 'http') || ! str_ends_with(strtolower($path), '.svg')) {
            return $fallback;
        }

        try {
            preg_match_all('/#([0-9a-f]{6})\b/i', (string) Storage::disk('public')->get($path), $m);
        } catch (\Throwable) {
            return $fallback;
        }

        $colours = array_values(array_unique(array_map('strtolower', $m[1] ?? [])));
        if (count($colours) < 2) {
            return $fallback;
        }

        return array_map(fn ($hex) => array_map('hexdec', str_split($hex, 2)), array_slice($colours, 0, 2));
    }

    protected function wrap(string $text, string $font, int $size, int $width, int $maxLines): array
    {
        $lines = [];
        $line = '';

        foreach (preg_split('/\s+/', trim($text)) as $word) {
            $try = $line === '' ? $word : "{$line} {$word}";
            $box = imagettfbbox($size, 0, $font, $try);
            if ($box[2] - $box[0] > $width && $line !== '') {
                $lines[] = $line;
                $line = $word;
            } else {
                $line = $try;
            }
        }
        $lines[] = $line;

        if (count($lines) > $maxLines) {
            $lines = array_slice($lines, 0, $maxLines);
            $lines[$maxLines - 1] = rtrim(mb_substr($lines[$maxLines - 1], 0, 28)).'…';
        }

        return $lines;
    }
}
