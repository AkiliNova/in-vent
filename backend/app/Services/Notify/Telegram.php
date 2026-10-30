<?php

namespace App\Services\Notify;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Ops alerts to a Telegram chat via the Bot API.
 *
 * Never throws and never blocks for long: an alert that cannot be delivered
 * must not break the payout or request that triggered it. Disabled until
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.
 */
class Telegram
{
    public static function enabled(): bool
    {
        return (bool) (config('services.telegram.bot_token') && config('services.telegram.chat_id'));
    }

    /**
     * @param  string|null  $dedupeKey  suppress repeats of the same alert for $dedupeMinutes
     */
    public static function send(string $text, ?string $dedupeKey = null, int $dedupeMinutes = 10): bool
    {
        if (! static::enabled()) {
            return false;
        }

        if ($dedupeKey !== null && ! Cache::add('telegram:'.md5($dedupeKey), 1, now()->addMinutes($dedupeMinutes))) {
            return false;
        }

        try {
            $prefix = app()->environment('production') ? '' : '['.app()->environment().'] ';

            return Http::timeout(5)
                ->asJson()
                ->post('https://api.telegram.org/bot'.config('services.telegram.bot_token').'/sendMessage', [
                    'chat_id' => config('services.telegram.chat_id'),
                    'text' => mb_substr($prefix.$text, 0, 4000),
                    'parse_mode' => 'HTML',
                    'disable_web_page_preview' => true,
                ])
                ->successful();
        } catch (\Throwable) {
            return false;
        }
    }

    /** Posts a text file (e.g. a day's log) to the ops chat. */
    public static function sendDocument(string $contents, string $filename, string $caption = ''): bool
    {
        if (! static::enabled()) {
            return false;
        }

        try {
            return Http::timeout(30)
                ->attach('document', $contents, $filename)
                ->post('https://api.telegram.org/bot'.config('services.telegram.bot_token').'/sendDocument', [
                    'chat_id' => config('services.telegram.chat_id'),
                    'caption' => mb_substr($caption, 0, 1000),
                    'parse_mode' => 'HTML',
                ])
                ->successful();
        } catch (\Throwable) {
            return false;
        }
    }

    public static function e(?string $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
