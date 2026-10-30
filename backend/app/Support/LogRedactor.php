<?php

namespace App\Support;

/**
 * Cleans log text before it leaves the server (Telegram). Logs carry M-Pesa
 * payloads, buyer phone numbers and, in error context, request headers —
 * none of which belong in a chat app.
 */
class LogRedactor
{
    public static function clean(string $text): string
    {
        $rules = [
            // Secrets in JSON, query strings and headers.
            '/("?(?:SecurityCredential|Password|passkey|password|initiator_password|consumer_secret|api_key|apikey|secret|token|access_token)"?\s*[:=]\s*)"[^"]*"/i' => '$1"<redacted>"',
            '/((?:password|passkey|secret|token|api_key)=)[^&\s"]+/i' => '$1<redacted>',
            '/(Bearer\s+)[A-Za-z0-9._|\-]+/' => '$1<redacted>',
            '/(Basic\s+)[A-Za-z0-9+\/=]+/' => '$1<redacted>',
            '/\bbot\d+:[A-Za-z0-9_-]{30,}/' => 'bot<redacted>',
            // The C2B/B2C callback path token.
            '#(/webhooks/daraja/(?:c2b|b2c)/)[^/\s"]+#' => '$1<token>',
            // Kenyan phone numbers: keep enough to recognise, not to call.
            '/\b(254|0)([17]\d)\d{4}(\d{3})\b/' => '$1$2****$3',
            // Emails: first letter and domain.
            '/\b([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/' => '$1***@$2',
        ];

        return (string) preg_replace(array_keys($rules), array_values($rules), $text);
    }

    /** The last $lines lines of today's log (or the newest log file). */
    public static function tail(int $lines = 30): string
    {
        $files = glob(storage_path('logs/laravel*.log')) ?: [];
        rsort($files);
        $file = $files[0] ?? null;

        if (! $file) {
            return '';
        }

        // Read only the end of the file: logs can be large.
        $fh = fopen($file, 'r');
        $size = filesize($file);
        fseek($fh, max(0, $size - 64 * 1024));
        $chunk = (string) stream_get_contents($fh);
        fclose($fh);

        $all = preg_split('/\R/', rtrim($chunk));

        return static::clean(implode("\n", array_slice($all, -$lines)));
    }
}
