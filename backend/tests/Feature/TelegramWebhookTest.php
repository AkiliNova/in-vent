<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class TelegramWebhookTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.telegram' => ['bot_token' => 'T', 'chat_id' => '-100', 'webhook_secret' => 's3cret']]);
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
    }

    protected function command(string $text, string $chat = '-100', string $secret = 's3cret')
    {
        return $this->postJson('/api/webhooks/telegram', ['message' => ['chat' => ['id' => (int) $chat], 'text' => $text]], [
            'X-Telegram-Bot-Api-Secret-Token' => $secret,
        ]);
    }

    public function test_status_in_the_ops_chat_gets_the_report(): void
    {
        $this->command('/status@TikoohBot')->assertOk();

        Http::assertSent(fn ($r) => str_contains($r->url(), 'sendMessage') && str_contains($r['text'], 'Tikooh server report'));
    }

    public function test_other_chats_and_forged_calls_are_ignored(): void
    {
        $this->command('/status', chat: '12345')->assertOk();
        $this->command('/status', secret: 'guess')->assertNotFound();

        Http::assertNothingSent();
    }
}
