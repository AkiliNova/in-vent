<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Tenant;
use App\Models\TicketTier;
use App\Models\User;
use App\Services\OrderService;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function seedSale(string $org, float $price): Tenant
    {
        return TenantContext::withoutScoping(function () use ($org, $price) {
            $tenant = Tenant::create(['organization_name' => $org, 'slug' => str($org)->slug(), 'email' => str($org)->slug().'@x.com']);
            $event = Event::create(['tenant_id' => $tenant->id, 'title' => "{$org} Fest", 'slug' => 'fest', 'start_date' => now()->addWeek(), 'status' => 'published', 'is_public' => true]);
            $tier = TicketTier::create(['event_id' => $event->id, 'name' => 'GA', 'price' => $price, 'capacity' => 10, 'is_active' => true]);
            $order = app(OrderService::class)->createPendingOrder($event, [['ticket_tier_id' => $tier->id, 'quantity' => 1]], ['name' => 'Ada', 'email' => 'ada@x.com']);
            app(OrderService::class)->markPaid($order, 'mpesa', ['receipt' => 'R'.$org]);

            return $tenant;
        });
    }

    public function test_overview_totals_every_organiser(): void
    {
        config(['tikooh.platform_fee_percent' => 10]);
        $this->seedSale('Acme', 1000);
        $this->seedSale('Globex', 500);

        Sanctum::actingAs(User::create(['name' => 'Ops', 'email' => 'ops@x.com', 'password' => 'password123', 'role' => User::ROLE_SUPER_ADMIN]));

        $res = $this->getJson('/api/admin/dashboard?days=30')->assertOk();

        $this->assertSame(1500.0, (float) $res->json('money.gmv'));
        $this->assertSame(150.0, (float) $res->json('money.fees'));
        $this->assertSame(1350.0, (float) $res->json('money.owed_to_organisers'));
        $this->assertSame(2, $res->json('money.orders'));
        $this->assertSame('Acme', $res->json('top_organisers.0.name'));
        $this->assertCount(30, $res->json('daily'));
        $this->assertSame(1500.0, (float) collect($res->json('daily'))->sum('gmv'));
    }

    public function test_admin_can_suspend_and_set_a_fee_but_organisers_cannot(): void
    {
        $acme = $this->seedSale('Acme', 1000);
        $owner = User::create(['tenant_id' => $acme->id, 'name' => 'O', 'email' => 'o@acme.com', 'password' => 'password123', 'role' => User::ROLE_ORGANIZER]);

        Sanctum::actingAs($owner);
        $this->getJson('/api/admin/dashboard')->assertForbidden();
        $this->putJson("/api/admin/organisers/{$acme->id}", ['suspended' => true])->assertForbidden();

        Sanctum::actingAs(User::create(['name' => 'Ops', 'email' => 'ops@x.com', 'password' => 'password123', 'role' => User::ROLE_SUPER_ADMIN]));
        $this->putJson("/api/admin/organisers/{$acme->id}", ['suspended' => true, 'platform_fee_percent' => 7.5])->assertOk();

        $this->assertTrue($acme->fresh()->suspended);
        $this->assertSame(7.5, $acme->fresh()->feePercent());
        $this->assertSame(1000.0, (float) $this->getJson('/api/admin/organisers')->json('data.0.gmv'));
    }
}
