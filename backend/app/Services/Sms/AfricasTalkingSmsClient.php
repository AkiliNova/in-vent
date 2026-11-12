<?php

namespace App\Services\Sms;

use App\Models\Suppression;
use Illuminate\Support\Facades\Cache;
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

            // AT already rejected this number for good — don't pay to hear it again.
            $check = PhoneCheck::classify($number);
            if ($check['status'] === 'blocked') {
                $failed[] = ['destination' => $number, 'error' => $check['reason'], 'code' => 'flagged'];

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
                        $status = (string) ($r['status'] ?? '');

                        if ($status !== '') {
                            PhoneCheck::flag($number, $status);
                        }

                        $failed[] = [
                            'destination' => $number,
                            'error' => $status ?: (string) (data_get($response->json(), 'SMSMessageData.Message') ?? $response->body() ?: 'Provider rejected the message'),
                            'code' => $status ?: null,
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

    /**
     * Account balance from AT's user endpoint, e.g. "KES 1234.5000".
     * Cached briefly: the composer asks on every keystroke-debounce.
     *
     * @return array{ok: bool, currency: ?string, amount: ?float, error: ?string}
     */
    public static function balance(bool $fresh = false): array
    {
        if (! self::configured()) {
            return ['ok' => false, 'currency' => null, 'amount' => null, 'error' => 'Africa\'s Talking is not configured.'];
        }

        $key = 'sms:at-balance:'.md5((string) config('services.africastalking.username').'|'.self::isSandbox());

        if ($fresh) {
            Cache::forget($key);
        }

        return Cache::remember($key, 60, function () {
            try {
                $response = Http::timeout(10)
                    ->withHeaders(['apiKey' => (string) config('services.africastalking.api_key'), 'Accept' => 'application/json'])
                    ->get(self::base().'/version1/user', ['username' => config('services.africastalking.username')]);

                if (! $response->successful()) {
                    return ['ok' => false, 'currency' => null, 'amount' => null, 'error' => $response->status() === 401
                        ? 'Africa\'s Talking rejected the API key or username.'
                        : 'Africa\'s Talking returned HTTP '.$response->status().'.'];
                }

                $raw = (string) data_get($response->json(), 'UserData.balance', '');

                if (! preg_match('/^([A-Z]{3})\s*(-?[\d.,]+)/', trim($raw), $m)) {
                    return ['ok' => false, 'currency' => null, 'amount' => null, 'error' => 'Unexpected balance format: '.$raw];
                }

                return ['ok' => true, 'currency' => $m[1], 'amount' => (float) str_replace(',', '', $m[2]), 'error' => null];
            } catch (\Throwable $e) {
                return ['ok' => false, 'currency' => null, 'amount' => null, 'error' => 'Could not reach Africa\'s Talking: '.$e->getMessage()];
            }
        });
    }

    /** Forget the cached balance after spending, so the next check is real. */
    public static function forgetBalance(): void
    {
        Cache::forget('sms:at-balance:'.md5((string) config('services.africastalking.username').'|'.self::isSandbox()));
    }

    public static function isSandbox(): bool
    {
        return filter_var(config('services.africastalking.sandbox'), FILTER_VALIDATE_BOOLEAN)
            || config('services.africastalking.username') === 'sandbox';
    }

    protected static function base(): string
    {
        return self::isSandbox() ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
    }

    protected function endpoint(): string
    {
        return self::base().'/version1/messaging';
    }
}
