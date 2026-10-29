<?php

namespace App\Support;

use App\Models\Event;
use Illuminate\Support\Str;

/**
 * A generated poster for events that have no image: Tikooh's navy and teal,
 * an accent picked from what the event is, and the event's own title, date
 * and venue — so it reads as that event, not a stock photo of somewhere else.
 *
 * SVG on purpose: crisp at any size, a few KB, and every piece of text is
 * escaped here, so nothing user-supplied becomes markup.
 */
class EventCover
{
    protected const THEMES = [
        // keywords => [accent from, accent to, motif]
        'worship' => [['praise', 'worship', 'gospel', 'tehilla', 'singover', 'encounter', 'church', 'choir', 'concert', 'music', 'night'], '#a855f7', '#2dd4bf', 'waves'],
        'ceremony' => [['ceremony', 'installation', 'gala', 'award', 'wedding', 'dinner', 'affair', 'love'], '#f59e0b', '#f43f5e', 'rings'],
        'talk' => [['summit', 'workshop', 'conference', 'forum', 'seminar', 'leadership', 'business', 'tech', 'sustainab', 'training'], '#2dd4bf', '#3b82f6', 'grid'],
    ];

    public static function svg(Event $event): string
    {
        [$from, $to, $motif] = static::theme($event->title.' '.$event->event_type);
        $shapes = static::motif($motif, crc32((string) ($event->uuid ?? $event->title)));
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES | ENT_XML1, 'UTF-8');

        $lines = static::wrap($event->title, 22, 4);
        $size = count($lines) > 3 ? 60 : 72;
        $titleY = 330 - (count($lines) - 1) * ($size * 0.6);

        $title = '';
        foreach ($lines as $i => $line) {
            $title .= '<tspan x="80" dy="'.($i === 0 ? 0 : round($size * 1.12)).'">'.$e($line).'</tspan>';
        }

        $date = $event->start_date?->timezone('Africa/Nairobi')->format('D j M Y · g:i a') ?? '';
        $venue = Str::limit(trim(implode(', ', array_filter([$event->location_name, $event->city]))), 60);
        $host = $event->host ? 'Hosted by '.Str::limit($event->host, 40) : '';

        return <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="{$e($event->title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#111a33"/>
    </linearGradient>
    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{$from}"/><stop offset="1" stop-color="{$to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.15" r="0.6">
      <stop offset="0" stop-color="{$to}" stop-opacity="0.35"/><stop offset="1" stop-color="{$to}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect width="1200" height="675" fill="url(#glow)"/>
  {$shapes}
  <rect x="80" y="96" width="120" height="8" rx="4" fill="url(#ac)"/>
  <text x="80" y="{$titleY}" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="{$size}" font-weight="800" fill="#f8fafc">{$title}</text>
  <text x="80" y="540" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="30" font-weight="600" fill="{$to}">{$e($date)}</text>
  <text x="80" y="584" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="26" fill="#94a3b8">{$e($venue)}</text>
  <text x="1120" y="140" text-anchor="end" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="22" fill="#64748b">{$e($host)}</text>
  <text x="1120" y="620" text-anchor="end" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="24" font-weight="700" fill="#e2e8f0">tikooh<tspan fill="{$to}">.</tspan></text>
</svg>
SVG;
    }

    /** @return array{0:string,1:string,2:string} */
    protected static function theme(string $text): array
    {
        $text = strtolower($text);

        foreach (static::THEMES as [$words, $from, $to, $motif]) {
            foreach ($words as $w) {
                if (str_contains($text, $w)) {
                    return [$from, $to, $motif];
                }
            }
        }

        return ['#2dd4bf', '#3b82f6', 'grid'];
    }

    /** Decorative shapes on the right; seeded so each event looks a little different. */
    protected static function motif(string $kind, int $seed): string
    {
        mt_srand($seed);
        $out = '';

        if ($kind === 'waves') {
            for ($i = 0; $i < 7; $i++) {
                $y = 140 + $i * 62;
                $a = mt_rand(30, 70);
                $out .= "<path d=\"M640 {$y} C 780 ".($y - $a).", 900 ".($y + $a).", 1200 {$y}\" stroke=\"url(#ac)\" stroke-width=\"3\" fill=\"none\" opacity=\"".round(0.12 + $i * 0.05, 2)."\"/>";
            }
        } elseif ($kind === 'rings') {
            $cx = 960 + mt_rand(-40, 40);
            $cy = 330 + mt_rand(-40, 40);
            for ($r = 60; $r <= 300; $r += 48) {
                $out .= "<circle cx=\"{$cx}\" cy=\"{$cy}\" r=\"{$r}\" stroke=\"url(#ac)\" stroke-width=\"3\" fill=\"none\" opacity=\"".round(0.5 - $r / 800, 2).'"/>';
            }
        } else {
            for ($x = 0; $x < 6; $x++) {
                for ($y = 0; $y < 6; $y++) {
                    $on = mt_rand(0, 100) < 40;
                    $out .= '<rect x="'.(800 + $x * 62).'" y="'.(150 + $y * 62).'" width="40" height="40" rx="8" fill="url(#ac)" opacity="'.($on ? '0.45' : '0.08').'"/>';
                }
            }
        }

        return $out;
    }

    /** Word-wraps the title; the last line gets an ellipsis if it overflows. */
    protected static function wrap(string $text, int $width, int $maxLines): array
    {
        $lines = explode("\n", wordwrap(trim($text), $width, "\n", true));

        if (count($lines) > $maxLines) {
            $lines = array_slice($lines, 0, $maxLines);
            $lines[$maxLines - 1] = rtrim(Str::limit($lines[$maxLines - 1], $width - 1, '')).'…';
        }

        return $lines;
    }
}
