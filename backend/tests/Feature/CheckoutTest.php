<?php

namespace Tests\Feature;

use App\Models\Attendee;
use App\Models\Event;
use App\Models\PromoCode;
use App\Models\Tenant;
use App\Models\Ticket;
use App\Models\TicketTier;
use App\Services\OrderService;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CheckoutTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected Event $event;

    protected TicketTier $tier;

    protected function setUp(): void
    {
        parent::setUp();

        TenantContext::withoutScoping(function () {
            $this->tenant = Tenant::create([
                'organization_name' => 'Acme', 'slug' => 'acme', 'email' => 'a@acme.com',
            ]);

            $this->event = Event::create([
                'tenant_id' => $this->tenant->id, 'title' => 'Summit', 'slug' => 'summit',
                'start_date' => now()->addWeek(), 'status' => 'published', 'is_public' => true,
            ]);

            $this->tier = TicketTier::create([
                'event_id' => $this->event->id, 'name' => 'General',
                'price' => 1000, 'capacity' => 3, 'is_active' => true,
            ]);
        });
    }

    protected function orders(): OrderService
    {
        return app(OrderService::class);
    }

    public function test_paying_issues_one_ticket_per_seat_and_creates_an_attendee(): void
    {
        TenantContext::withoutScoping(function () {
            $order = $this->orders()->createPendingOrder(
                $this->event,
                [['ticket_tier_id' => $this->tier->id, 'quantity' => 2]],
                ['name' => 'Ada Lovelace', 'email' => 'ada@example.com', 'phone' => '0712345678']
            );

            $this->assertSame(2000.0, (float) $order->total);
            $this->assertSame(2, $this->tier->fresh()->reserved);
            $this->assertSame(0, $this->tier->fresh()->sold);

            $this->orders()->markPaid($order, 'mpesa', ['receipt' => 'ABC123']);

            $this->assertSame(2, Ticket::withoutGlobalScope('tenant')->count());
            $this->assertSame(2, $this->tier->fresh()->sold);
            $this->assertSame(0, $this->tier->fresh()->reserved);

            $attendee = Attendee::withoutGlobalScope('tenant')->where('email', 'ada@example.com')->first();
            $this->assertNotNull($attendee);
            $this->assertSame(2000.0, (float) $attendee->amount_paid);
        });
    }

    public function test_marking_paid_twice_does_not_issue_duplicate_tickets(): void
    {
        TenantContext::withoutScoping(function () {
            $order = $this->orders()->createPendingOrder(
                $this->event,
                [['ticket_tier_id' => $this->tier->id, 'quantity' => 1]],
                ['name' => 'Ada', 'email' => 'ada@example.com']
            );

            // Providers retry callbacks; a retry must be a no-op.
            $this->orders()->markPaid($order, 'pesapal', ['reference' => 'X']);
            $this->orders()->markPaid($order, 'pesapal', ['reference' => 'X']);

            $this->assertSame(1, Ticket::withoutGlobalScope('tenant')->count());
            $this->assertSame(1, $this->tier->fresh()->sold);
        });
    }

    public function test_cannot_oversell_a_tier(): void
    {
        TenantContext::withoutScoping(function () {
            $this->orders()->createPendingOrder(
                $this->event,
                [['ticket_tier_id' => $this->tier->id, 'quantity' => 3]],
                ['name' => 'First', 'email' => 'first@example.com']
            );

            $this->expectException(ValidationException::class);

            $this->orders()->createPendingOrder(
                $this->event,
                [['ticket_tier_id' => $this->tier->id, 'quantity' => 1]],
                ['name' => 'Second', 'email' => 'second@example.com']
            );
        });
    }

    public function test_expiring_an_order_releases_the_held_stock(): void
    {
        TenantContext::withoutScoping(function () {
            $order = $this->orders()->createPendingOrder(
                $this->event,
                [['ticket_tier_id' => $this->tier->id, 'quantity' => 2]],
                ['name' => 'Ada', 'email' => 'ada@example.com']
            );

            $this->assertSame(2, $this->tier->fresh()->reserved);

            $this->orders()->expire($order);

            $this->assertSame(0, $this->tier->fresh()->reserved);
            $this->assertSame('expired', $order->fresh()->status);
        });
    }

    public function test_percentage_promo_code_is_applied(): void
    {
        TenantContext::withoutScoping(function () {
            PromoCode::create([
                'tenant_id' => $this->tenant->id, 'event_id' => $this->event->id,
                'code' => 'EARLY20', 'discount_type' => 'percent', 'discount_value' => 20,
                'active' => true,
            ]);

            $order = $this->orders()->createPendingOrder(
                $this->event,
                [['ticket_tier_id' => $this->tier->id, 'quantity' => 1]],
                ['name' => 'Ada', 'email' => 'ada@example.com'],
                'early20'
            );

            $this->assertSame(200.0, (float) $order->discount_amount);
            $this->assertSame(800.0, (float) $order->total);
        });
    }

    public function test_expired_promo_code_is_rejected(): void
    {
        TenantContext::withoutScoping(function () {
            PromoCode::create([
                'tenant_id' => $this->tenant->id, 'code' => 'GONE',
                'discount_type' => 'percent', 'discount_value' => 50,
                'expires_at' => now()->subDay(), 'active' => true,
            ]);

            $this->expectException(ValidationException::class);

            $this->orders()->createPendingOrder(
                $this->event,
                [['ticket_tier_id' => $this->tier->id, 'quantity' => 1]],
                ['name' => 'Ada', 'email' => 'ada@example.com'],
                'GONE'
            );
        });
    }

    public function test_free_order_is_paid_immediately_without_a_provider(): void
    {
        TenantContext::withoutScoping(function () {
            $free = TicketTier::create([
                'event_id' => $this->event->id, 'name' => 'Free', 'price' => 0,
                'capacity' => 10, 'is_active' => true,
            ]);

            $order = $this->orders()->createPendingOrder(
                $this->event,
                [['ticket_tier_id' => $free->id, 'quantity' => 1]],
                ['name' => 'Ada', 'email' => 'ada@example.com']
            );

            $this->assertSame('paid', $order->fresh()->status);
            $this->assertSame(1, Ticket::withoutGlobalScope('tenant')->count());
        });
    }
}
