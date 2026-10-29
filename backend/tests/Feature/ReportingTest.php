<?php

namespace Tests\Feature;

use App\Models\Attendee;
use App\Models\CheckIn;
use App\Models\Event;
use App\Models\Order;
use App\Models\Tenant;
use App\Models\TicketTier;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The dashboard endpoints build raw date-grouping SQL that differs between
 * MySQL and SQLite, so they need exercising on whichever driver is configured.
 */
class ReportingTest extends TestCase
{
    use RefreshDatabase;

    protected User $organizer;

    protected Event $event;

    protected function setUp(): void
    {
        parent::setUp();

        TenantContext::withoutScoping(function () {
            $tenant = Tenant::create([
                'organization_name' => 'Acme', 'slug' => 'acme', 'email' => 'a@acme.com',
            ]);

            $this->organizer = User::create([
                'tenant_id' => $tenant->id, 'name' => 'Ada', 'email' => 'ada@acme.com',
                'password' => 'password123', 'role' => User::ROLE_ORGANIZER,
            ]);

            $this->event = Event::create([
                'tenant_id' => $tenant->id, 'title' => 'Summit', 'slug' => 'summit',
                'start_date' => now()->subDay(), 'end_date' => now(), 'status' => 'live',
            ]);

            $tier = TicketTier::create([
                'event_id' => $this->event->id, 'name' => 'General',
                'price' => 1000, 'capacity' => 100, 'sold' => 2,
            ]);

            $attendee = Attendee::create([
                'tenant_id' => $tenant->id, 'event_id' => $this->event->id,
                'first_name' => 'Grace', 'email' => 'grace@example.com',
                'category' => 'VIP', 'checked_in_at' => now()->subHours(2),
                'status' => 'checked_in',
            ]);

            $order = Order::create([
                'tenant_id' => $tenant->id, 'event_id' => $this->event->id,
                'buyer_name' => 'Grace', 'buyer_email' => 'grace@example.com',
                'subtotal' => 2000, 'total' => 2000, 'status' => 'paid',
                'paid_at' => now()->subDay(),
            ]);

            $order->items()->create([
                'ticket_tier_id' => $tier->id, 'tier_name' => 'General',
                'quantity' => 2, 'unit_price' => 1000, 'subtotal' => 2000,
            ]);

            CheckIn::create([
                'event_id' => $this->event->id, 'attendee_id' => $attendee->id,
                'method' => 'qr', 'direction' => 'in', 'result' => 'accepted',
                'scanned_at' => now()->subHours(2),
            ]);
        });
    }

    public function test_tenant_overview_groups_revenue_by_month(): void
    {
        $response = $this->actingAs($this->organizer)->getJson('/api/dashboard');

        $response->assertOk()
            ->assertJsonPath('events.total', 1)
            ->assertJsonPath('attendees.checked_in', 1)
            ->assertJsonPath('revenue.orders', 1);

        $byMonth = $response->json('revenue.by_month');

        $this->assertCount(1, $byMonth);
        // The grouping key must be a real YYYY-MM string on either driver.
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}$/', $byMonth[0]['month']);
        $this->assertEquals(2000, $byMonth[0]['revenue']);
    }

    public function test_event_report_groups_arrivals_by_hour(): void
    {
        $response = $this->actingAs($this->organizer)
            ->getJson("/api/events/{$this->event->uuid}/report");

        $response->assertOk()
            ->assertJsonPath('registration.registered', 1)
            ->assertJsonPath('registration.checked_in', 1)
            ->assertJsonPath('registration.attendance_rate', fn ($v) => (float) $v === 100.0);

        $arrivals = $response->json('arrivals_by_hour');

        $this->assertCount(1, $arrivals);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2} \d{2}:00$/', $arrivals[0]['hour']);
    }

    public function test_event_report_includes_tier_sell_through(): void
    {
        $response = $this->actingAs($this->organizer)
            ->getJson("/api/events/{$this->event->uuid}/report");

        $response->assertOk();

        $tier = $response->json('revenue.by_tier.0');

        $this->assertSame('General', $tier['name']);
        $this->assertSame(2, $tier['sold']);
        $this->assertEquals(2.0, $tier['sell_through']);
    }

    public function test_platform_overview_requires_super_admin(): void
    {
        $this->actingAs($this->organizer)
            ->getJson('/api/admin/overview')
            ->assertForbidden();
    }
}
