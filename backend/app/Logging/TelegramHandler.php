<?php

namespace App\Logging;

use App\Services\Notify\Telegram;
use Monolog\Handler\AbstractProcessingHandler;
use Monolog\Level;
use Monolog\LogRecord;

/**
 * Forwards ERROR and above to Telegram. The same message is sent at most once
 * per 10 minutes, so a failing endpoint cannot flood the chat.
 */
class TelegramHandler extends AbstractProcessingHandler
{
    public function __construct(Level $level = Level::Error)
    {
        parent::__construct($level, true);
    }

    protected function write(LogRecord $record): void
    {
        $exception = $record->context['exception'] ?? null;
        $where = $exception instanceof \Throwable
            ? basename($exception->getFile()).':'.$exception->getLine()
            : '';

        $url = app()->runningInConsole() ? 'console' : request()?->method().' '.request()?->path();

        Telegram::send(
            "🔴 <b>{$record->level->getName()}</b> on Tikooh\n"
            .Telegram::e(mb_substr($record->message, 0, 600))."\n"
            .($where ? '<code>'.Telegram::e($where).'</code>'."\n" : '')
            .'<i>'.Telegram::e($url).'</i>',
            dedupeKey: 'log:'.$record->message.$where,
        );
    }
}
