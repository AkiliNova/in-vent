<?php

namespace App\Logging;

use App\Services\Notify\Telegram;
use App\Support\LogRedactor;
use Monolog\Handler\AbstractProcessingHandler;
use Monolog\Level;
use Monolog\LogRecord;

/**
 * Forwards log records (WARNING and above by default — LOG_TELEGRAM_LEVEL) to
 * Telegram, redacted. The same message is sent at most once per 10 minutes,
 * so a failing endpoint cannot flood the chat.
 */
class TelegramHandler extends AbstractProcessingHandler
{
    public function __construct(Level $level = Level::Warning)
    {
        parent::__construct($level, true);
    }

    protected function write(LogRecord $record): void
    {
        $exception = $record->context['exception'] ?? null;
        $where = $exception instanceof \Throwable
            ? basename($exception->getFile()).':'.$exception->getLine()
            : '';

        // Non-exception context (payout ids, result codes) is often the useful
        // part of a warning. Payloads are cut short and redacted.
        $context = array_diff_key($record->context, ['exception' => true]);
        $detail = $context ? LogRedactor::clean(mb_substr((string) json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), 0, 500)) : '';

        $url = app()->runningInConsole() ? 'console' : request()?->method().' '.request()?->path();
        $icon = $record->level->isHigherThan(Level::Warning) ? '🔴' : '🟡';

        Telegram::send(
            "{$icon} <b>{$record->level->getName()}</b> on Tikooh\n"
            .Telegram::e(LogRedactor::clean(mb_substr($record->message, 0, 600)))."\n"
            .($detail ? '<code>'.Telegram::e($detail).'</code>'."\n" : '')
            .($where ? '<code>'.Telegram::e($where).'</code>'."\n" : '')
            .'<i>'.Telegram::e(LogRedactor::clean((string) $url)).'</i>',
            dedupeKey: 'log:'.$record->message.$where,
        );
    }
}
