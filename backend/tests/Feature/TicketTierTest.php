<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Tenant;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TicketTierTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_early_bird_tier_can_set_only_a_sales_end_and_closes_after_it(): void
    {
        [$owner, $event] = TenantContext::withoutScoping(function () {
            $tenant = Tenant::create(['organization_name' => 'Acme', 'slug' => 'acme', 'email' => 'a@acme.com']);

            return [
                User::create(['tenant_id' => $tenant->id, 'name' => 'O', 'email' => 'o@acme.com', 'password' => 'password123', 'role' => User::ROLE_ORGANIZER]),
                Event::create(['tenant_id' => $tenant->id, 'title' => 'Gig', 'slug' => 'gig', 'start_date' => now()->addMonth(), 'status' => 'published', 'is_public' => true]),
            ];
        });

        Sanctum::actingAs($owner);

        $tier = $this->postJson("/api/events/{$event->uuid}/tiers", [
            'name' => 'Early bird', 'price' => 500, 'capacity' => 50, 'is_active' => true,
            'sales_end_at' => now()->addDay()->toIso8601String(),
        ])->assertCreated()->json();

        $order = fn () => $this->postJson("/api/public/events/{$event->uuid}/orders", [
            'items' => [['ticket_tier_id' => $tier['id'], 'quantity' => 1]],
            'buyer' => ['name' => 'Ada', 'email' => 'ada@example.com'],
        ]);

        $order()->assertCreated();

        $this->travel(2)->days();
        $order()->assertStatus(422);
    }
}
