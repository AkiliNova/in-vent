<?php

namespace App\Services\Chatbot;

use Anthropic\Client;
use App\Models\IntegrationCredential;
use RuntimeException;

/**
 * Builds the Anthropic client from server-side credentials only.
 *
 * The key is read from the tenant's encrypted integration_credentials row (or
 * the platform-wide fallback, or config) and never leaves the server — unlike
 * the SMS credentials the old frontend fetched into the browser.
 */
class ClaudeClientFactory
{
    public function for(?int $tenantId): Client
    {
        $apiKey = $this->resolveApiKey($tenantId);

        if ($apiKey === null || $apiKey === '') {
            throw new RuntimeException(
                'No Anthropic API key configured. Add an "anthropic" integration credential.'
            );
        }

        return new Client(apiKey: $apiKey);
    }

    protected function resolveApiKey(?int $tenantId): ?string
    {
        $credential = IntegrationCredential::resolve('anthropic', $tenantId);

        return $credential?->get('api_key') ?? config('services.anthropic.key');
    }
}
