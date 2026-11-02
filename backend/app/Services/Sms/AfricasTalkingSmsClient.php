<?php

namespace App\Services\Sms;

use App\Models\Suppression;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Africa's Talking bulk SMS (https://developers.africastalking.com/docs/sms/sending/bulk).
 * Same send() contract as AdvantaSmsClient so callers don't care which is active.
 */
class AfricasTalkingSmsClient
{
    use LogsMessages;

    /** 100 Processed, 101 Sent, 102 Queued — anything else is a failure. */
    protected const OK = [100, 101, 102];

    public function __construct(protected ?int $tenantId = null) {}

    public static function configured(): bool
    {
        return (bool) (config('services.africastalking.username') && config('services.africastalking.api_key'));
    }

    /**
     * @param  array<int,string>  $recipients
     * @return array{sent: int, failed: array<int,array{destination: string, error: string}>, results: array}
     */
    public function send(array $recipients, string $message): array
    {
        if (! self::configured()) {
            throw new RuntimeException('Africa\'s Talking is not configured. Add the username and API key in Settings → SMS.');
        }

        $failed = [];
        $numbers = [];

        foreach ($recipients as $raw) {
            $number = AdvantaSmsClient::normalise($raw);

            if (! $number) {
                continue;
            }

            if ($this->tenantId && Suppression::blocks($this->tenantId, 'sms', $number)) {
                $failed[] = ['destination' => $number, 'error' => 'Recipient opted out'];

                continue;
            }

            $numbers[$number] = true;
        }

        $sent = 0;
        $results = [];

        // AT accepts a comma-separated list; keep batches modest.
        foreach (array_chunk(array_keys($numbers), 500) as $batch) {
            try {
                $response = Http::timeout(30)
                    ->retry(2, 500, throw: false)
                    ->withHeaders(['apiKey' => (string) config('services.africastalking.api_key'), 'Accept' => 'application/json'])
                    ->asForm()
                    ->post($this->endpoint(), array_filter([
                        'username' => config('services.africastalking.username'),
                        'to' => implode(',', array_map(fn ($n) => '+'.$n, $batch)),
                        'message' => $message,
                        'from' => config('services.africastalking.sender_id') ?: null,
                    ]));

                $recipientsOut = data_get($response->json(), 'SMSMessageData.Recipients', []);
                $byNumber = collect($recipientsOut)->keyBy(fn ($r) => ltrim((string) ($r['number'] ?? ''), '+'));

                foreach ($batch as $number) {
                    $r = $byNumber->get($number);

                    if ($r && in_array((int) ($r['statusCode'] ?? 0), self::OK, true)) {
                        $sent++;
                        $results[] = ['destination' => $number, 'reference' => $r['messageId'] ?? null, 'status' => 'sent', 'cost' => $r['cost'] ?? null];
                    } else {
                        $failed[] = [
                            'destination' => $number,
                            'error' => (string) ($r['status'] ?? data_get($response->json(), 'SMSMessageData.Message') ?? $response->body() ?: 'Provider rejected the message'),
                        ];
                    }
                }
            } catch (\Throwable $e) {
                Log::error('Africa\'s Talking send failed', ['count' => count($batch), 'error' => $e->getMessage()]);

                foreach ($batch as $number) {
                    $failed[] = ['destination' => $number, 'error' => 'Delivery failed'];
                }
            }
        }

        $this->logOutcome('africastalking', $message, $results, $failed);

        return ['sent' => $sent, 'failed' => $failed, 'results' => $results];
    }

    protected function endpoint(): string
    {
        $sandbox = filter_var(config('services.africastalking.sandbox'), FILTER_VALIDATE_BOOLEAN)
            || config('services.africastalking.username') === 'sandbox';

        return $sandbox
            ? 'https://api.sandbox.africastalking.com/version1/messaging'
            : 'https://api.africastalking.com/version1/messaging';
    }
}
