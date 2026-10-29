<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\MpesaC2bTransaction;
use App\Models\Order;
use App\Models\Payout;
use App\Models\Tenant;
use App\Models\Ticket;
use App\Models\TicketTier;
use App\Models\User;
use App\Services\OrderService;
use App\Services\Payments\MpesaGateway;
use App\Services\WalletService;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WalletTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $organizer;

    protected Event $event;

    protected TicketTier $tier;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'tikooh.platform_fee_percent' => 10,
            'services.mpesa.c2b_token' => 'secret-token',
            'services.mpesa.callback_ips' => ['196.201.214.200'],
            'services.mpesa.enforce_callback_ips' => true,
            'services.mpesa.sandbox' => true,
            'services.mpesa.b2c' => [
                'consumer_key' => 'k', 'consumer_secret' => 's', 'shortcode' => '600000',
                'initiator' => 'api', 'initiator_password' => 'pw', 'command_id' => 'BusinessPayment',
                'certificate' => resource_path('mpesa/ProductionCertificate.cer'),
            ],
        ]);

        TenantContext::withoutScoping(function () {
            $this->tenant = Tenant::create([
                'organization_name' => 'Acme', 'slug' => 'acme', 'email' => 'a@acme.com',
                'payout_phone' => '254712345678',
            ]);

            $this->organizer = User::create([
                'tenant_id' => $this->tenant->id, 'name' => 'Owner', 'email' => 'owner@acme.com',
                'password' => 'password123', 'role' => User::ROLE_ORGANIZER,
            ]);

            $this->event = Event::create([
                'tenant_id' => $this->tenant->id, 'title' => 'Summit', 'slug' => 'summit',
                'start_date' => now()->addWeek(), 'status' => 'published', 'is_public' => true,
            ]);

            $this->tier = TicketTier::create([
                'event_id' => $this->event->id, 'name' => 'General',
                'price' => 1000, 'capacity' => 10, 'is_active' => true,
            ]);
        });
    }

    protected function order(int $quantity = 1): Order
    {
        return TenantContext::withoutScoping(fn () => app(OrderService::class)->createPendingOrder(
            $this->event,
            [['ticket_tier_id' => $this->tier->id, 'quantity' => $quantity]],
            ['name' => 'Ada Lovelace', 'email' => 'ada@example.com']
        ));
    }

    protected function balance(): float
    {
        return app(WalletService::class)->balance($this->tenant->id);
    }

    protected function c2b(Order $order, float $amount, string $transId = 'QK1234ABCD', string $ip = '196.201.214.200', string $token = 'secret-token')
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson("/api/webhooks/daraja/c2b/{$token}/confirm", [
                'TransactionType' => 'Pay Bill', 'TransID' => $transId, 'TransTime' => '20261029120000',
                'TransAmount' => (string) $amount, 'BusinessShortCode' => '600000',
                'BillRefNumber' => strtolower($order->pay_code), 'MSISDN' => '2547XXXXX678', 'FirstName' => 'ADA',
            ]);
    }

    protected function fakeB2c(): void
    {
        Http::fake([
            '*/oauth/v1/generate*' => Http::response(['access_token' => 't', 'expires_in' => 3599]),
            '*/mpesa/b2c/v3/paymentrequest' => Http::response([
                'ConversationID' => 'AG_1', 'OriginatorConversationID' => 'x',
                'ResponseCode' => '0', 'ResponseDescription' => 'Accept the service request successfully.',
            ]),
        ]);
    }

    protected function b2cResult(Payout $payout, string $code, string $token = 'secret-token')
    {
        return $this->withServerVariables(['REMOTE_ADDR' => '196.201.214.200'])
            ->postJson("/api/webhooks/daraja/b2c/{$token}/result", ['Result' => [
                'ResultType' => 0, 'ResultCode' => $code, 'ResultDesc' => $code === '0' ? 'Success' : 'Failed',
                'OriginatorConversationID' => $payout->originator_conversation_id,
                'ConversationID' => 'AG_1', 'TransactionID' => 'RKT1234XYZ',
            ]]);
    }

    public function test_a_paid_order_credits_the_wallet_net_of_the_fee_exactly_once(): void
    {
        $order = $this->order(2);

        TenantContext::withoutScoping(function () use ($order) {
            app(OrderService::class)->markPaid($order, 'mpesa', ['receipt' => 'A1']);
            app(OrderService::class)->markPaid($order, 'mpesa', ['receipt' => 'A1']);
        });

        $this->assertSame(1800.0, $this->balance());
    }

    public function test_c2b_payment_with_the_pay_code_issues_tickets_and_ignores_replays(): void
    {
        $order = $this->order();

        $this->c2b($order, 1000)->assertOk()->assertJson(['ResultCode' => '0']);
        $this->c2b($order, 1000)->assertOk();

        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame(1, Ticket::withoutGlobalScope('tenant')->count());
        $this->assertSame(900.0, $this->balance());
        $this->assertSame('matched', MpesaC2bTransaction::first()->status);
    }

    public function test_c2b_rejects_a_wrong_token_or_a_non_safaricom_address(): void
    {
        $order = $this->order();

        $this->c2b($order, 1000, token: 'guess')->assertNotFound();
        $this->c2b($order, 1000, ip: '8.8.8.8')->assertForbidden();

        $this->assertSame('pending', $order->fresh()->status);
    }

    public function test_c2b_underpayment_is_recorded_but_not_honoured(): void
    {
        $order = $this->order();

        $this->c2b($order, 500)->assertOk();

        $this->assertSame('pending', $order->fresh()->status);
        $this->assertSame('underpaid', MpesaC2bTransaction::first()->status);
    }

    public function test_a_late_c2b_payment_revives_an_expired_order(): void
    {
        $order = $this->order();
        TenantContext::withoutScoping(fn () => app(OrderService::class)->expire($order));
        $this->assertSame(0, $this->tier->fresh()->reserved);

        $this->c2b($order, 1000)->assertOk();

        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame(1, $this->tier->fresh()->sold);
        $this->assertSame(0, $this->tier->fresh()->reserved);
    }

    public function test_withdrawal_debits_then_settles_on_a_successful_result(): void
    {
        $this->fakeB2c();
        TenantContext::withoutScoping(fn () => app(OrderService::class)->markPaid($this->order(), 'mpesa', ['receipt' => 'A1']));
        Sanctum::actingAs($this->organizer);

        $this->postJson('/api/wallet/withdraw', ['amount' => 500, 'password' => 'password123'])
            ->assertCreated();

        $this->assertSame(400.0, $this->balance());
        $payout = Payout::withoutGlobalScope('tenant')->first();
        $this->assertSame('processing', $payout->status);

        Http::assertSent(fn ($r) => str_contains($r->url(), 'b2c') && $r['PartyB'] === '254712345678' && $r['Amount'] === 500);

        $this->b2cResult($payout, '0')->assertOk();

        $this->assertSame('paid', $payout->fresh()->status);
        $this->assertSame('RKT1234XYZ', $payout->fresh()->mpesa_receipt);
        $this->assertSame(400.0, $this->balance());
    }

    public function test_a_failed_b2c_result_refunds_the_wallet_once(): void
    {
        $this->fakeB2c();
        TenantContext::withoutScoping(fn () => app(OrderService::class)->markPaid($this->order(), 'mpesa', ['receipt' => 'A1']));
        Sanctum::actingAs($this->organizer);

        $this->postJson('/api/wallet/withdraw', ['amount' => 500, 'password' => 'password123'])->assertCreated();
        $payout = Payout::withoutGlobalScope('tenant')->first();

        $this->b2cResult($payout, '1')->assertOk();
        $this->b2cResult($payout, '1')->assertOk();

        $this->assertSame('rejected', $payout->fresh()->status);
        $this->assertSame(900.0, $this->balance());
    }

    public function test_a_locked_initiator_pauses_all_further_withdrawals(): void
    {
        $this->fakeB2c();
        TenantContext::withoutScoping(fn () => app(OrderService::class)->markPaid($this->order(), 'mpesa', ['receipt' => 'A1']));
        Sanctum::actingAs($this->organizer);

        $this->postJson('/api/wallet/withdraw', ['amount' => 100, 'password' => 'password123'])->assertCreated();
        $this->b2cResult(Payout::withoutGlobalScope('tenant')->first(), '8006')->assertOk();

        $this->assertNotNull(MpesaGateway::initiatorLock());

        $this->postJson('/api/wallet/withdraw', ['amount' => 100, 'password' => 'password123'])
            ->assertStatus(422);

        $this->assertSame(900.0, $this->balance());
        Http::assertSentCount(2); // token + the first payout only
    }

    public function test_withdrawal_needs_the_password_and_enough_balance(): void
    {
        $this->fakeB2c();
        TenantContext::withoutScoping(fn () => app(OrderService::class)->markPaid($this->order(), 'mpesa', ['receipt' => 'A1']));
        Sanctum::actingAs($this->organizer);

        $this->postJson('/api/wallet/withdraw', ['amount' => 100, 'password' => 'wrong'])
            ->assertStatus(422)->assertJsonValidationErrors('password');

        $this->postJson('/api/wallet/withdraw', ['amount' => 5000, 'password' => 'password123'])
            ->assertStatus(422)->assertJsonValidationErrors('amount');

        Http::assertNothingSent();
        $this->assertSame(900.0, $this->balance());
    }
}
