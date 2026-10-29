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

    protected User $admin;

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
            'services.telegram' => ['bot_token' => 'bot-token', 'chat_id' => '42'],
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

            $this->admin = User::create([
                'name' => 'Ops', 'email' => 'ops@tikooh.com',
                'password' => 'password123', 'role' => User::ROLE_SUPER_ADMIN,
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
            'api.telegram.org/*' => Http::response(['ok' => true]),
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

    protected function sellOneTicket(): void
    {
        TenantContext::withoutScoping(fn () => app(OrderService::class)->markPaid($this->order(), 'mpesa', ['receipt' => 'A1']));
    }

    protected function requestPayout(int $amount = 500): Payout
    {
        Sanctum::actingAs($this->organizer);
        $this->postJson('/api/wallet/withdraw', ['amount' => $amount, 'password' => 'password123'])->assertCreated();

        return Payout::withoutGlobalScope('tenant')->latest('id')->first();
    }

    protected function approve(Payout $payout)
    {
        Sanctum::actingAs($this->admin);

        return $this->postJson("/api/admin/payouts/{$payout->id}/approve");
    }

    public function test_a_withdrawal_is_a_request_that_holds_the_money_and_alerts_ops(): void
    {
        $this->fakeB2c();
        $this->sellOneTicket();

        $this->travelTo(now()->startOfMinute());
        $payout = $this->requestPayout(500);

        $this->assertSame('requested', $payout->status);
        $this->assertTrue($payout->due_at->equalTo(now()->addHours(24)));
        $this->assertSame(400.0, $this->balance());

        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'b2c'));
        Http::assertSent(fn ($r) => str_contains($r->url(), 'api.telegram.org') && str_contains($r['text'], 'Withdrawal requested'));
    }

    public function test_admin_approval_sends_b2c_and_a_successful_result_settles_it(): void
    {
        $this->fakeB2c();
        $this->sellOneTicket();
        $payout = $this->requestPayout(500);

        $this->approve($payout)->assertOk();

        $payout->refresh();
        $this->assertSame('processing', $payout->status);
        Http::assertSent(fn ($r) => str_contains($r->url(), 'b2c') && $r['PartyB'] === '254712345678' && $r['Amount'] === 500);

        $this->b2cResult($payout, '0')->assertOk();

        $this->assertSame('paid', $payout->fresh()->status);
        $this->assertSame('RKT1234XYZ', $payout->fresh()->mpesa_receipt);
        $this->assertSame(400.0, $this->balance());
    }

    public function test_a_failed_b2c_result_requeues_without_refunding(): void
    {
        $this->fakeB2c();
        $this->sellOneTicket();
        $payout = $this->requestPayout(500);
        $this->approve($payout)->assertOk();

        // e.g. the B2C account was not funded yet
        $this->b2cResult($payout->fresh(), '1')->assertOk();
        $this->b2cResult($payout->fresh(), '1')->assertOk();

        $this->assertSame('requested', $payout->fresh()->status);
        $this->assertSame(400.0, $this->balance());

        // The admin can try again once funded.
        $this->approve($payout)->assertOk();
        $this->assertSame('processing', $payout->fresh()->status);
    }

    public function test_reject_and_cancel_return_the_money_once(): void
    {
        $this->fakeB2c();
        $this->sellOneTicket();

        $first = $this->requestPayout(300);
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/admin/payouts/{$first->id}/reject", ['reason' => 'Name mismatch'])->assertOk();
        $this->postJson("/api/admin/payouts/{$first->id}/reject", ['reason' => 'again'])->assertStatus(422);
        $this->assertSame(900.0, $this->balance());

        $second = $this->requestPayout(200);
        $this->postJson("/api/wallet/withdrawals/{$second->id}/cancel")->assertOk();
        $this->assertSame('cancelled', $second->fresh()->status);
        $this->assertSame(900.0, $this->balance());
    }

    public function test_a_request_already_being_sent_cannot_be_cancelled(): void
    {
        $this->fakeB2c();
        $this->sellOneTicket();
        $payout = $this->requestPayout(500);
        $this->approve($payout)->assertOk();

        Sanctum::actingAs($this->organizer);
        $this->postJson("/api/wallet/withdrawals/{$payout->id}/cancel")->assertStatus(422);
        $this->assertSame(400.0, $this->balance());
    }

    public function test_admin_can_record_a_manual_payout(): void
    {
        $this->fakeB2c();
        $this->sellOneTicket();
        $payout = $this->requestPayout(500);

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/admin/payouts/{$payout->id}/mark-paid", ['receipt' => 'sk12abc'])->assertOk();

        $payout->refresh();
        $this->assertSame('paid', $payout->status);
        $this->assertSame('manual', $payout->payment_method);
        $this->assertSame('SK12ABC', $payout->mpesa_receipt);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'b2c'));
    }

    public function test_only_platform_admins_can_approve(): void
    {
        $this->fakeB2c();
        $this->sellOneTicket();
        $payout = $this->requestPayout(500);

        Sanctum::actingAs($this->organizer);
        $this->postJson("/api/admin/payouts/{$payout->id}/approve")->assertForbidden();
        $this->postJson("/api/admin/payouts/{$payout->id}/mark-paid", ['receipt' => 'X'])->assertForbidden();

        $this->assertSame('requested', $payout->fresh()->status);
    }

    public function test_a_locked_initiator_blocks_further_b2c_sends(): void
    {
        $this->fakeB2c();
        $this->sellOneTicket();
        $first = $this->requestPayout(100);
        $second = $this->requestPayout(100);

        $this->approve($first)->assertOk();
        $this->b2cResult($first->fresh(), '8006')->assertOk();
        $this->assertNotNull(MpesaGateway::initiatorLock());

        $this->approve($second)->assertStatus(422);

        $this->assertSame('requested', $second->fresh()->status);
        // 2 request alerts, 1 OAuth token, 1 B2C call, then one failure alert
        // each for the 8006 result and the refused second send. No second B2C.
        Http::assertSentCount(6);
        $this->assertCount(1, collect(Http::recorded())->filter(fn ($p) => str_contains($p[0]->url(), 'paymentrequest')));
    }

    public function test_reminders_fire_once_before_due_and_once_when_overdue(): void
    {
        $this->fakeB2c();
        $this->sellOneTicket();
        $payout = $this->requestPayout(500);

        $telegram = fn () => collect(Http::recorded())->filter(fn ($pair) => str_contains($pair[0]->url(), 'api.telegram.org'))
            ->map(fn ($pair) => $pair[0]['text'])->values();

        $this->artisan('tikooh:payout-reminders')->assertSuccessful();
        $this->assertCount(1, $telegram()); // only the request alert so far

        $this->travelTo($payout->due_at->copy()->subHours(2));
        $this->artisan('tikooh:payout-reminders')->assertSuccessful();
        $this->artisan('tikooh:payout-reminders')->assertSuccessful();
        $this->assertCount(2, $telegram());
        $this->assertStringContainsString('due soon', $telegram()->last());

        $this->travelTo($payout->due_at->copy()->addMinute());
        $this->artisan('tikooh:payout-reminders')->assertSuccessful();
        $this->artisan('tikooh:payout-reminders')->assertSuccessful();
        $this->assertCount(3, $telegram());
        $this->assertStringContainsString('OVERDUE', $telegram()->last());
    }

    public function test_withdrawal_needs_the_password_and_enough_balance(): void
    {
        $this->fakeB2c();
        $this->sellOneTicket();
        Sanctum::actingAs($this->organizer);

        $this->postJson('/api/wallet/withdraw', ['amount' => 100, 'password' => 'wrong'])
            ->assertStatus(422)->assertJsonValidationErrors('password');

        $this->postJson('/api/wallet/withdraw', ['amount' => 5000, 'password' => 'password123'])
            ->assertStatus(422)->assertJsonValidationErrors('amount');

        Http::assertNothingSent();
        $this->assertSame(900.0, $this->balance());
    }
}
