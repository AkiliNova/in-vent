<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Notify\Telegram;
use App\Support\ServerReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Commands typed in the ops group. Telegram proves the call is genuine with
 * the secret header set at setWebhook time, and only the configured chat is
 * answered — the bot ignores anyone who finds it and DMs it.
 */
class TelegramWebhookController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $secret = (string) config('services.telegram.webhook_secret');

        abort_if($secret === '' || ! hash_equals($secret, (string) $request->header('X-Telegram-Bot-Api-Secret-Token')), 404);

        $message = $request->input('message', []);
        $chat = (string) data_get($message, 'chat.id');

        if ($chat !== (string) config('services.telegram.chat_id')) {
            return response()->json(['ok' => true]);
        }

        // "/status@TikoohBot" in groups → "/status"
        $command = strtolower(strtok(trim((string) data_get($message, 'text', '')), " @") ?: '');

        $reply = match ($command) {
            '/status', '/server' => ServerReport::build(),
            '/payouts' => ServerReport::payouts(),
            '/help', '/start' => "Commands:\n/status — server and app report\n/payouts — withdrawal queue",
            default => null,
        };

        if ($reply !== null) {
            Telegram::send($reply);
        }

        return response()->json(['ok' => true]);
    }
}
