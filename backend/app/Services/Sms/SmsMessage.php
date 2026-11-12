<?php

namespace App\Services\Sms;

/**
 * How many billable parts an SMS takes.
 *
 * Plain GSM-7 text fits 160 characters in one part (153 per part once split).
 * A single character outside GSM-7 — an emoji, curly quotes pasted from Word,
 * most accented letters — switches the whole message to UCS-2: 70 per part
 * (67 when split), and every emoji counts as two. That is the usual reason a
 * "one SMS" campaign is billed three times over.
 */
class SmsMessage
{
    /** GSM 03.38 basic set. */
    protected const GSM7 = "@£\$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

    /** Extension table: each costs two characters (escape + char). */
    protected const GSM7_EXT = '^{}\\[~]|€';

    /** Common lookalikes that silently force Unicode, and what to type instead. */
    public const REPLACEMENTS = [
        '‘' => "'", '’' => "'", '‚' => "'", '“' => '"', '”' => '"', '„' => '"',
        '–' => '-', '—' => '-', '…' => '...', "\u{00A0}" => ' ', '•' => '-', '·' => '-',
    ];

    /** @return array{encoding: 'GSM-7'|'UCS-2', characters: int, segments: int, per_segment: int, unicode_chars: array<int,string>} */
    public static function analyse(string $text): array
    {
        $chars = mb_str_split($text);
        $unicode = [];
        $units = 0;

        foreach ($chars as $c) {
            if (str_contains(self::GSM7, $c)) {
                $units++;
            } elseif (str_contains(self::GSM7_EXT, $c)) {
                $units += 2;
            } else {
                $unicode[$c] = true;
            }
        }

        if ($unicode !== []) {
            // UCS-2 counts UTF-16 code units: emoji and other astral characters are 2.
            $units = intdiv(strlen(mb_convert_encoding($text, 'UTF-16BE', 'UTF-8')), 2);
            $single = 70;
            $multi = 67;
        } else {
            $single = 160;
            $multi = 153;
        }

        $segments = $units === 0 ? 1 : ($units <= $single ? 1 : (int) ceil($units / $multi));

        return [
            'encoding' => $unicode === [] ? 'GSM-7' : 'UCS-2',
            'characters' => $units,
            'segments' => $segments,
            'per_segment' => $segments > 1 ? $multi : $single,
            'unicode_chars' => array_slice(array_keys($unicode), 0, 20),
        ];
    }

    public static function segments(string $text): int
    {
        return self::analyse($text)['segments'];
    }

    /** Merge tags as DeliverCampaignChunk fills them, so credits match what is actually sent. */
    public static function personalise(string $text, ?string $first, ?string $last, ?string $company = null, ?string $category = null): string
    {
        return strtr($text, [
            '{{first_name}}' => $first ?: 'there',
            '{{last_name}}' => $last ?? '',
            '{{name}}' => trim(($first ?? '').' '.($last ?? '')) ?: 'there',
            '{{company}}' => $company ?? '',
            '{{category}}' => $category ?? '',
        ]);
    }
}
