<?php

namespace App\Services\Payments;

use App\Models\IntegrationCredential;
use App\Models\Order;
use App\Services\Sms\AdvantaSmsClient;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Pesapal v3, ported from php/payment/create_payment.php.
 *
 * Consumer key and secret are read from encrypted per-tenant credentials
 * server-side; the browser only ever sees the redirect URL.
 */
class PesapalGateway
{
    protected const LIVE_URL = 'https://pay.pesapal.com/v3';

    protected const SANDBOX_URL = 'https://cybqa.pesapal.com/pesapalv3';

    public function __construct(protected ?int $tenantId = null) {}

    /** Returns the hosted checkout URL the buyer is redirected to. */
    public function createOrder(Order $order, string $callbackUrl): string
    {
        [$names, $phone] = $this->splitBuyer($order);

        $response = Http::withToken($this->token())
            ->acceptJson()
            ->timeout(30)
            ->post($this->baseUrl().'/api/Transactions/SubmitOrderRequest', [
                'id' => $order->reference,
                'currency' => $order->currency,
                'amount' => (float) $order->total,
                'description' => 'Tickets for '.$order->event->title,
                'callback_url' => $callbackUrl,
                'notification_id' => $this->credential()?->get('ipn_id') ?? config('services.pesapal.ipn_id'),
                'billing_address' => [
                    'email_address' => $order->buyer_email,
                    'phone_number' => $phone,
                    'first_name' => $names[0],
                    'last_name' => $names[1],
                ],
            ]);

        $body = $response->json() ?? [];

        if (! $response->successful() || empty($body['redirect_url'])) {
            Log::error('Pesapal order failed', [
                'order' => $order->reference,
                'status' => $response->status(),
                'error' => data_get($body, 'error'),
            ]);

            throw new RuntimeException('Could not start the payment. Please try again.');
        }

        $order->update([
            'provider' => 'pesapal',
            'provider_reference' => $body['order_tracking_id'] ?? null,
        ]);

        return $body['redirect_url'];
    }

    /**
     * Confirms a transaction with Pesapal. Never trust the browser's word that
     * a payment succeeded — this is the only thing that marks an order paid.
     *
     * @return array{status: string, amount: float, method: ?string, raw: array}
     */
    public function verify(string $trackingId): array
    {
        $response = Http::withToken($this->token())
            ->acceptJson()
            ->timeout(30)
            ->get($this->baseUrl().'/api/Transactions/GetTransactionStatus', [
                'orderTrackingId' => $trackingId,
            ]);

        $body = $response->json() ?? [];

        // status_code: 0 invalid, 1 completed, 2 failed, 3 reversed
        $status = match ((int) data_get($body, 'status_code', 0)) {
            1 => 'completed',
            2 => 'failed',
            3 => 'reversed',
            default => 'pending',
        };

        return [
            'status' => $status,
            'amount' => (float) data_get($body, 'amount', 0),
            'method' => data_get($body, 'payment_method'),
            'raw' => $body,
        ];
    }

    /** Tokens live ~5 minutes; cache just under that. */
    protected function token(): string
    {
        $credential = $this->credential();

        $key = $credential?->get('consumer_key') ?? config('services.pesapal.consumer_key');
        $secret = $credential?->get('consumer_secret') ?? config('services.pesapal.consumer_secret');

        if (! $key || ! $secret) {
            throw new RuntimeException('Pesapal is not configured for this organisation.');
        }

        return Cache::remember(
            'pesapal:token:'.md5($key),
            now()->addMinutes(4),
            function () use ($key, $secret) {
                $response = Http::acceptJson()
                    ->timeout(30)
                    ->post($this->baseUrl().'/api/Auth/RequestToken', [
                        'consumer_key' => $key,
                        'consumer_secret' => $secret,
                    ]);

                $token = data_get($response->json(), 'token');

                if (! $token) {
                    Log::error('Pesapal auth failed', ['status' => $response->status()]);

                    throw new RuntimeException('Payment provider authentication failed.');
                }

                return $token;
            }
        );
    }

    protected function credential(): ?IntegrationCredential
    {
        return IntegrationCredential::resolve('pesapal', $this->tenantId);
    }

    protected function baseUrl(): string
    {
        $sandbox = $this->credential()?->is_sandbox ?? config('services.pesapal.sandbox');

        return $sandbox ? self::SANDBOX_URL : self::LIVE_URL;
    }

    /** @return array{0: array{0: string, 1: string}, 1: string} */
    protected function splitBuyer(Order $order): array
    {
        $parts = preg_split('/\s+/', trim($order->buyer_name), 2) ?: [];

        return [
            [$parts[0] ?? 'Guest', $parts[1] ?? ''],
            AdvantaSmsClient::normalise($order->buyer_phone ?? '') ?? '',
        ];
    }
}
