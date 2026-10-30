<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Tenant;
use App\Models\TicketTier;
use App\Models\User;
use App\Models\WalletEntry;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DoorRegistrationTest extends TestCase
{
    use RefreshDatabase;

    protected Event $event;

    protected TicketTier $tier;

    protected function setUp(): void
    {
        parent::setUp();

        TenantContext::withoutScoping(function () {
            $tenant = Tenant::create(['organization_name' => 'Acme', 'slug' => 'acme', 'email' => 'a@acme.com']);
            $this->event = Event::create(['tenant_id' => $tenant->id, 'title' => 'Gig', 'slug' => 'gig', 'start_date' => now()->addHour(), 'status' => 'published', 'is_public' => true]);
            $this->tier = TicketTier::create(['event_id' => $this->event->id, 'name' => 'GA', 'price' => 1000, 'capacity' => 5, 'is_active' => true]);
            Sanctum::actingAs(User::create(['tenant_id' => $tenant->id, 'name' => 'Door', 'email' => 'door@acme.com', 'password' => 'password123', 'role' => User::ROLE_STAFF]));
        });
    }

    protected function register(array $overrides = [])
    {
        return $this->postJson("/api/events/{$this->event->uuid}/registrations", $overrides + [
            'ticket_tier_id' => $this->tier->id, 'name' => 'Walk In', 'payment' => 'cash',
        ]);
    }

    public function test_a_complimentary_guest_gets_a_ticket_the_scanner_accepts(): void
    {
        $code = $this->register(['payment' => 'complimentary', 'email' => 'vip@x.com'])
            ->assertCreated()->assertJsonPath('total', '0.00')->json('tickets.0.code');

        $this->postJson("/api/events/{$this->event->uuid}/check-in/scan", ['code' => $code])->assertOk()->assertJsonPath('result', 'accepted');
        $this->assertSame(0, WalletEntry::withoutGlobalScope('tenant')->count());
    }

    public function test_door_cash_counts_the_sale_but_never_reaches_the_wallet(): void
    {
        $this->register()->assertCreated()->assertJsonPath('total', '1000.00');

        $this->assertSame(1, $this->tier->fresh()->sold);
        $this->assertSame(0, WalletEntry::withoutGlobalScope('tenant')->count());
    }

    public function test_walk_ins_without_an_email_can_still_be_registered(): void
    {
        $this->register()->assertCreated();
        $this->register(['name' => 'Second Guest'])->assertCreated();

        $this->assertCount(2, $this->getJson("/api/events/{$this->event->uuid}/registrations")->json());
    }
}
