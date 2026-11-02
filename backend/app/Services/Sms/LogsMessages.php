<?php

namespace App\Services\Sms;

use App\Models\MessageLog;

/** Shared by the SMS clients: what the message was for, and writing it to the message log. */
trait LogsMessages
{
    public string $type = 'other';

    public ?string $relatedType = null;

    public ?int $relatedId = null;

    public function about(string $type, ?string $relatedType = null, ?int $relatedId = null): static
    {
        $this->type = $type;
        $this->relatedType = $relatedType;
        $this->relatedId = $relatedId;

        return $this;
    }

    protected function logOutcome(string $provider, string $message, array $results, array $failed): void
    {
        foreach ($results as $r) {
            MessageLog::record($this->logRow($provider, $message, $r['destination'], 'sent', null, $r['reference'] ?? null));
        }

        foreach ($failed as $f) {
            MessageLog::record($this->logRow($provider, $message, $f['destination'], 'failed', $f['error'] ?? null, null));
        }
    }

    protected function logRow(string $provider, string $message, string $to, string $status, ?string $error, ?string $ref): array
    {
        return [
            'tenant_id' => $this->tenantId,
            'channel' => 'sms',
            'type' => $this->type,
            'to' => $to,
            'body' => $message,
            'status' => $status,
            'error' => $error,
            'provider' => $provider,
            'provider_message_id' => $ref,
            'related_type' => $this->relatedType,
            'related_id' => $this->relatedId,
        ];
    }
}
