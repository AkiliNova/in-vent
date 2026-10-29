<?php

namespace App\Services\Payments;

use App\Models\IntegrationCredential;
use App\Models\Order;
use App\Services\Sms\AdvantaSmsClient;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/** Safaricom Daraja STK push, ported from php/mpesa/. */
class MpesaGateway
{
    protected const LIVE_URL = 'https://api.safaricom.co.ke';

    protected const SANDBOX_URL = 'https://sandbox.safaricom.co.ke';

    public function __construct(protected ?int $tenantId = null) {}

    /** Triggers the PIN prompt on the buyer's handset. */
    public function stkPush(Order $order, string $phone, string $callbackUrl): array
    {
        $credential = $this->credential();
        $shortcode = $credential?->get('shortcode') ?? config('services.mpesa.shortcode');
        $passkey = $credential?->get('passkey') ?? config('services.mpesa.passkey');

        if (! $shortcode || ! $passkey) {
            throw new RuntimeException('M-Pesa is not configured for this organisation.');
        }

        $timestamp = now()->format('YmdHis');
        $msisdn = AdvantaSmsClient::normalise($phone);

        if (! $msisdn) {
            throw new RuntimeException('That phone number is not valid.');
        }

        $response = Http::withToken($this->token())
            ->acceptJson()
            ->timeout(45)
            ->post($this->baseUrl().'/mpesa/stkpush/v1/processrequest', [
                'BusinessShortCode' => $shortcode,
                'Password' => base64_encode($shortcode.$passkey.$timestamp),
                'Timestamp' => $timestamp,
                'TransactionType' => 'CustomerPayBillOnline',
                // Daraja rejects decimals on the amount field.
                'Amount' => (int) ceil((float) $order->total),
                'PartyA' => $msisdn,
                'PartyB' => $shortcode,
                'PhoneNumber' => $msisdn,
                'CallBackURL' => $callbackUrl,
                'AccountReference' => $order->pay_code ?? substr($order->reference, 0, 12),
                'TransactionDesc' => 'Event tickets',
            ]);

        $body = $response->json() ?? [];

        if (! $response->successful() || ($body['ResponseCode'] ?? '1') !== '0') {
            Log::error('M-Pesa STK push failed', [
                'order' => $order->reference,
                'error' => data_get($body, 'errorMessage', data_get($body, 'ResponseDescription')),
            ]);

            throw new RuntimeException('Could not reach M-Pesa. Please try again.');
        }

        $order->update([
            'provider' => 'mpesa',
            'provider_reference' => $body['CheckoutRequestID'] ?? null,
        ]);

        return [
            'checkout_request_id' => $body['CheckoutRequestID'],
            'merchant_request_id' => $body['MerchantRequestID'] ?? null,
            'message' => $body['CustomerMessage'] ?? 'Check your phone to complete the payment.',
        ];
    }

    /**
     * Polls transaction status. The callback is authoritative; this is the
     * fallback for when Safaricom's callback never arrives.
     *
     * @return array{status: string, receipt: ?string, raw: array}
     */
    public function query(string $checkoutRequestId): array
    {
        $credential = $this->credential();
        $shortcode = $credential?->get('shortcode') ?? config('services.mpesa.shortcode');
        $passkey = $credential?->get('passkey') ?? config('services.mpesa.passkey');
        $timestamp = now()->format('YmdHis');

        $response = Http::withToken($this->token())
            ->acceptJson()
            ->timeout(30)
            ->post($this->baseUrl().'/mpesa/stkpushquery/v1/query', [
                'BusinessShortCode' => $shortcode,
                'Password' => base64_encode($shortcode.$passkey.$timestamp),
                'Timestamp' => $timestamp,
                'CheckoutRequestID' => $checkoutRequestId,
            ]);

        $body = $response->json() ?? [];
        $code = (string) data_get($body, 'ResultCode', '');

        return [
            // 1032 = cancelled by user, 1037 = timeout, 0 = success.
            'status' => match ($code) {
                '0' => 'completed',
                '1032', '1037', '1' => 'failed',
                default => 'pending',
            },
            'receipt' => data_get($body, 'MpesaReceiptNumber'),
            'raw' => $body,
        ];
    }

    /** Parses the async callback Safaricom posts to us. */
    public function parseCallback(array $payload): array
    {
        $stk = data_get($payload, 'Body.stkCallback', []);
        $items = collect(data_get($stk, 'CallbackMetadata.Item', []))
            ->pluck('Value', 'Name');

        return [
            'checkout_request_id' => data_get($stk, 'CheckoutRequestID'),
            'status' => (string) data_get($stk, 'ResultCode') === '0' ? 'completed' : 'failed',
            'reason' => data_get($stk, 'ResultDesc'),
            'receipt' => $items['MpesaReceiptNumber'] ?? null,
            'amount' => (float) ($items['Amount'] ?? 0),
            'phone' => (string) ($items['PhoneNumber'] ?? ''),
        ];
    }

    /**
     * Points the paybill's C2B notifications at this app. Destructive: it
     * replaces whatever is registered for the shortcode now, so it is only
     * run deliberately via `php artisan tikooh:register-c2b --confirm`.
     *
     * Safaricom rejects URLs containing "mpesa", "safaricom", "sql", "query"
     * and similar words, which is why these routes are named "daraja".
     */
    public function registerC2bUrls(string $confirmationUrl, string $validationUrl): array
    {
        $response = Http::withToken($this->token())
            ->acceptJson()
            ->timeout(30)
            ->post($this->baseUrl().'/mpesa/c2b/v2/registerurl', [
                'ShortCode' => config('services.mpesa.shortcode'),
                'ResponseType' => 'Completed',
                'ConfirmationURL' => $confirmationUrl,
                'ValidationURL' => $validationUrl,
            ]);

        return ['http_status' => $response->status()] + ($response->json() ?? []);
    }

    /** Parses a C2B confirmation into the fields we store. */
    public function parseC2b(array $payload): array
    {
        return [
            'trans_id' => (string) data_get($payload, 'TransID', ''),
            'trans_type' => data_get($payload, 'TransactionType'),
            'amount' => (float) data_get($payload, 'TransAmount', 0),
            'bill_ref_number' => strtoupper(trim((string) data_get($payload, 'BillRefNumber', ''))),
            'msisdn' => (string) data_get($payload, 'MSISDN', ''),
            'first_name' => data_get($payload, 'FirstName'),
            'business_short_code' => (string) data_get($payload, 'BusinessShortCode', ''),
            'trans_time' => (string) data_get($payload, 'TransTime', ''),
        ];
    }

    /**
     * Sends money to a phone. Asynchronous: "accepted" here only means
     * Safaricom queued it — the outcome arrives at the ResultURL.
     *
     * @return array{accepted: bool, conversation_id: ?string, description: ?string, raw: array}
     */
    public function b2c(string $phone, int $amount, string $originatorConversationId, string $resultUrl, string $timeoutUrl, string $remarks = 'Tikooh payout'): array
    {
        $this->assertInitiatorUsable();

        $msisdn = AdvantaSmsClient::normalise($phone);

        if (! $msisdn || ! preg_match('/^254[17]\d{8}$/', $msisdn)) {
            throw new RuntimeException('That is not a valid Safaricom number.');
        }

        $response = Http::withToken($this->token('b2c'))
            ->acceptJson()
            ->timeout(45)
            ->post($this->baseUrl().'/mpesa/b2c/v3/paymentrequest', [
                'OriginatorConversationID' => $originatorConversationId,
                'InitiatorName' => config('services.mpesa.b2c.initiator'),
                'SecurityCredential' => $this->securityCredential(),
                'CommandID' => config('services.mpesa.b2c.command_id'),
                'Amount' => $amount,
                'PartyA' => config('services.mpesa.b2c.shortcode'),
                'PartyB' => $msisdn,
                'Remarks' => substr($remarks, 0, 100),
                'QueueTimeOutURL' => $timeoutUrl,
                'ResultURL' => $resultUrl,
                'Occasion' => '',
            ]);

        $body = $response->json() ?? [];

        return [
            'accepted' => $response->successful() && (string) data_get($body, 'ResponseCode') === '0',
            'conversation_id' => data_get($body, 'ConversationID'),
            'description' => data_get($body, 'ResponseDescription', data_get($body, 'errorMessage')),
            'raw' => $body,
        ];
    }

    /** Parses the B2C result Safaricom posts to the ResultURL. */
    public function parseB2cResult(array $payload): array
    {
        $result = data_get($payload, 'Result', []);
        $params = collect(data_get($result, 'ResultParameters.ResultParameter', []))
            ->pluck('Value', 'Key');

        return [
            'originator_conversation_id' => data_get($result, 'OriginatorConversationID'),
            'conversation_id' => data_get($result, 'ConversationID'),
            'result_code' => (string) data_get($result, 'ResultCode', ''),
            'result_desc' => data_get($result, 'ResultDesc'),
            'receipt' => data_get($result, 'TransactionID') ?: ($params['TransactionReceipt'] ?? null),
            'recipient' => $params['ReceiverPartyPublicName'] ?? null,
        ];
    }

    /**
     * Records that Safaricom rejected the initiator. Their support is explicit
     * that retrying with a wrong password re-locks the operator, so every
     * further payout is refused until someone clears this deliberately.
     *
     * Kept in a file, not the cache: deploys run cache:clear, which would
     * silently lift the lock and let payouts retry into a locked operator.
     */
    public static function lockInitiator(string $code, ?string $description): void
    {
        Storage::disk('local')->put(self::LOCK_FILE, json_encode([
            'locked_at' => now()->toIso8601String(),
            'result_code' => $code,
            'result_desc' => $description,
        ]));
    }

    public static function initiatorLock(): ?array
    {
        $disk = Storage::disk('local');

        return $disk->exists(self::LOCK_FILE) ? json_decode((string) $disk->get(self::LOCK_FILE), true) : null;
    }

    public static function clearInitiatorLock(): void
    {
        Storage::disk('local')->delete(self::LOCK_FILE);
    }

    protected const LOCK_FILE = 'mpesa/initiator_lock.json';

    protected function assertInitiatorUsable(): void
    {
        if (! config('services.mpesa.b2c.initiator') || ! config('services.mpesa.b2c.initiator_password')) {
            throw new RuntimeException('Withdrawals are not configured yet.');
        }

        if ($lock = static::initiatorLock()) {
            Log::warning('B2C refused: initiator locked', $lock);

            throw new RuntimeException('Withdrawals are paused while we resolve an issue with our M-Pesa provider. Your balance is safe.');
        }
    }

    /** RSA-encrypts the initiator password with Safaricom's public certificate. */
    protected function securityCredential(): string
    {
        $file = config('services.mpesa.b2c.certificate');
        $key = is_file($file) ? openssl_pkey_get_public((string) file_get_contents($file)) : false;

        if ($key === false) {
            throw new RuntimeException('M-Pesa certificate is missing or unreadable.');
        }

        if (! openssl_public_encrypt((string) config('services.mpesa.b2c.initiator_password'), $encrypted, $key, OPENSSL_PKCS1_PADDING)) {
            throw new RuntimeException('Could not encrypt the M-Pesa initiator password.');
        }

        return base64_encode($encrypted);
    }

    /** Daraja tokens last one hour. STK/C2B and B2C are separate Daraja apps. */
    protected function token(string $app = 'stk'): string
    {
        if ($app === 'b2c') {
            $key = config('services.mpesa.b2c.consumer_key');
            $secret = config('services.mpesa.b2c.consumer_secret');
        } else {
            $credential = $this->credential();
            $key = $credential?->get('consumer_key') ?? config('services.mpesa.consumer_key');
            $secret = $credential?->get('consumer_secret') ?? config('services.mpesa.consumer_secret');
        }

        if (! $key || ! $secret) {
            throw new RuntimeException('M-Pesa is not configured for this organisation.');
        }

        return Cache::remember(
            'mpesa:token:'.md5($key),
            now()->addMinutes(50),
            function () use ($key, $secret) {
                $response = Http::withBasicAuth($key, $secret)
                    ->acceptJson()
                    ->timeout(30)
                    ->get($this->baseUrl().'/oauth/v1/generate?grant_type=client_credentials');

                $token = data_get($response->json(), 'access_token');

                if (! $token) {
                    throw new RuntimeException('M-Pesa authentication failed.');
                }

                return $token;
            }
        );
    }

    protected function credential(): ?IntegrationCredential
    {
        return IntegrationCredential::resolve('mpesa', $this->tenantId);
    }

    protected function baseUrl(): string
    {
        $sandbox = $this->credential()?->is_sandbox ?? config('services.mpesa.sandbox');

        return $sandbox ? self::SANDBOX_URL : self::LIVE_URL;
    }
}
