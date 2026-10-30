<?php

namespace Tests\Unit;

use App\Support\LogRedactor;
use PHPUnit\Framework\TestCase;

class LogRedactorTest extends TestCase
{
    public function test_secrets_and_personal_data_are_masked(): void
    {
        // All sample values are fake.
        $line = '[2026-10-30] production.INFO: C2B confirmation {"MSISDN":"254712345678","phone":"0712345678",'
            .'"SecurityCredential":"abc123==","Password":"p@ss","email":"ada.lovelace@example.com"} '
            .'Authorization: Bearer 1|abcDEF123 url=https://x/api/webhooks/daraja/c2b/9f8e7d6c/confirm '
            .'https://api.telegram.org/bot1234567890:FAKEfakeFAKEfakeFAKEfakeFAKEfake123/sendMessage';

        $clean = LogRedactor::clean($line);

        foreach (['254712345678', '0712345678', 'abc123==', 'p@ss', 'ada.lovelace', '1|abcDEF123', '9f8e7d6c', 'FAKEfake'] as $secret) {
            $this->assertStringNotContainsString($secret, $clean, "leaked: {$secret}");
        }

        $this->assertStringContainsString('25471****678', $clean);
        $this->assertStringContainsString('a***@example.com', $clean);
        $this->assertStringContainsString('C2B confirmation', $clean);
    }
}
