<?php

namespace App\Services\Sms;

use App\Models\IntegrationCredential;
use App\Models\Suppression;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Advanta SMS, called server-side.
 *
 * The previous PHP proxy accepted the API key from the request body, which meant
 * the browser held it and anyone could drive the account. Credentials now come
 * from the encrypted integration_credentials row and never leave the server.
 */
class AdvantaSmsClient
{
    /** GSM-7 single segment; longer bodies are billed per 153-char part. */
    protected const SEGMENT_LENGTH = 160;

    protected const CONCAT_SEGMENT_LENGTH = 153;

    public function __construct(protected ?int $tenantId = null) {}

    /**
     * @param  array<int,string>  $recipients
     * @return array{sent: int, failed: array<int,array{destination: string, error: string}>, results: array}
     */
    public function send(array $recipients, string $message): array
    {
        $credential = IntegrationCredential::resolve('advanta_sms', $this->tenantId);

        $apiKey = $credential?->get('api_key') ?? config('services.advanta.api_key');
        $partnerId = $credential?->get('partner_id') ?? config('services.advanta.partner_id');
        $shortcode = $credential?->get('shortcode') ?? config('services.advanta.shortcode');

        if (! $apiKey || ! $partnerId) {
            throw new RuntimeException('SMS is not configured for this organisation.');
        }

        $numbers = $this->normaliseAll($recipients);
        $sent = 0;
        $failed = [];
        $results = [];

        foreach ($numbers as $number) {
            if ($this->tenantId && Suppression::blocks($this->tenantId, 'sms', $number)) {
                $failed[] = ['destination' => $number, 'error' => 'Recipient opted out'];

                continue;
            }

            try {
                $response = Http::timeout(20)
                    ->retry(2, 500, throw: false)
                    ->asJson()
                    ->post(config('services.advanta.endpoint'), [
                        'apikey' => $apiKey,
                        'partnerID' => $partnerId,
                        'shortcode' => $shortcode,
                        'mobile' => $number,
                        'message' => $message,
                    ]);

                $body = $response->json() ?? [];
                $entry = data_get($body, 'responses.0', $body);
                $code = (string) data_get($entry, 'response-code', $response->status());

                // Advanta returns 200/222 for accepted messages.
                if ($response->successful() && in_array($code, ['200', '222'], true)) {
                    $sent++;
                    $results[] = [
                        'destination' => $number,
                        'reference' => data_get($entry, 'messageid'),
                        'status' => 'sent',
                    ];
                } else {
                    $failed[] = [
                        'destination' => $number,
                        'error' => (string) data_get($entry, 'response-description', 'Provider rejected the message'),
                    ];
                }
            } catch (\Throwable $e) {
                Log::error('SMS send failed', ['destination' => $number, 'error' => $e->getMessage()]);
                $failed[] = ['destination' => $number, 'error' => 'Delivery failed'];
            }
        }

        return ['sent' => $sent, 'failed' => $failed, 'results' => $results];
    }

    /** Billable parts for one message body — drives campaign cost estimates. */
    public static function segmentCount(string $message): int
    {
        $length = mb_strlen($message);

        if ($length <= self::SEGMENT_LENGTH) {
            return 1;
        }

        return (int) ceil($length / self::CONCAT_SEGMENT_LENGTH);
    }

    /** @param array<int,string> $recipients */
    protected function normaliseAll(array $recipients): array
    {
        return collect($recipients)
            ->map(fn ($n) => static::normalise($n))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    /** Kenyan numbers to 254XXXXXXXXX; anything else is passed through digits-only. */
    public static function normalise(string $number): ?string
    {
        $digits = preg_replace('/\D+/', '', $number) ?? '';

        if ($digits === '') {
            return null;
        }

        if (str_starts_with($digits, '0')) {
            return '254'.substr($digits, 1);
        }

        if (str_starts_with($digits, '7') || str_starts_with($digits, '1')) {
            return strlen($digits) === 9 ? '254'.$digits : $digits;
        }

        return $digits;
    }
}
