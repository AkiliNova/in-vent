<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Tenant;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminEventsTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $acme;

    protected Tenant $globex;

    protected function setUp(): void
    {
        parent::setUp();

        TenantContext::withoutScoping(function () {
            $this->acme = Tenant::create(['organization_name' => 'Acme', 'slug' => 'acme', 'email' => 'a@acme.com']);
            $this->globex = Tenant::create(['organization_name' => 'Globex', 'slug' => 'globex', 'email' => 'g@globex.com']);
            Event::create(['tenant_id' => $this->acme->id, 'title' => 'Acme Gig', 'slug' => 'acme-gig', 'start_date' => now()->addWeek(), 'status' => 'published']);
            Event::create(['tenant_id' => $this->globex->id, 'title' => 'Globex Expo', 'slug' => 'globex-expo', 'start_date' => now()->addWeek(), 'status' => 'published']);
        });
    }

    protected function admin(): User
    {
        return User::create(['name' => 'Ops', 'email' => 'ops@x.com', 'password' => 'password123', 'role' => User::ROLE_SUPER_ADMIN]);
    }

    public function test_admin_sees_every_organisers_events_with_the_organiser(): void
    {
        Sanctum::actingAs($this->admin());

        $res = $this->getJson('/api/events?per_page=50')->assertOk();
        $this->assertEqualsCanonicalizing(['Acme Gig', 'Globex Expo'], collect($res->json('data'))->pluck('title')->all());
        $this->assertNotNull($res->json('data.0.tenant.organization_name'));

        $only = $this->getJson("/api/events?tenant_id={$this->globex->id}")->json('data');
        $this->assertSame(['Globex Expo'], collect($only)->pluck('title')->all());
    }

    public function test_admin_creates_edits_unpublishes_and_deletes_for_an_organiser(): void
    {
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/events', ['title' => 'Orphan', 'start_date' => now()->addMonth()->toIso8601String()])
            ->assertStatus(422)->assertJsonValidationErrors('tenant_id');

        $uuid = $this->postJson('/api/events', [
            'title' => 'Admin made', 'start_date' => now()->addMonth()->toIso8601String(), 'tenant_id' => $this->globex->id,
        ])->assertCreated()->json('uuid');

        $event = Event::withoutGlobalScope('tenant')->where('uuid', $uuid)->first();
        $this->assertSame($this->globex->id, $event->tenant_id);

        $this->putJson("/api/events/{$uuid}", ['title' => 'Renamed', 'status' => 'ended'])->assertOk();
        $this->assertSame('ended', $event->fresh()->status);

        $acmeGig = Event::withoutGlobalScope('tenant')->where('slug', 'acme-gig')->first();
        $this->putJson("/api/events/{$acmeGig->uuid}", ['status' => 'draft'])->assertOk();
        $this->assertSame('draft', $acmeGig->fresh()->status);

        $this->deleteJson("/api/events/{$uuid}")->assertNoContent();
    }

    public function test_organisers_can_unpublish_their_own_but_not_force_a_status_or_pick_a_tenant(): void
    {
        $owner = User::create(['tenant_id' => $this->acme->id, 'name' => 'O', 'email' => 'o@acme.com', 'password' => 'password123', 'role' => User::ROLE_ORGANIZER]);
        Sanctum::actingAs($owner);
        $gig = Event::withoutGlobalScope('tenant')->where('slug', 'acme-gig')->first();

        $this->putJson("/api/events/{$gig->uuid}", ['status' => 'draft'])->assertOk();
        $this->putJson("/api/events/{$gig->uuid}", ['status' => 'live'])->assertStatus(422);

        $uuid = $this->postJson('/api/events', [
            'title' => 'Mine', 'start_date' => now()->addMonth()->toIso8601String(), 'tenant_id' => $this->globex->id,
        ])->assertCreated()->json('uuid');
        $this->assertSame($this->acme->id, Event::withoutGlobalScope('tenant')->where('uuid', $uuid)->value('tenant_id'));

        $globexExpo = Event::withoutGlobalScope('tenant')->where('slug', 'globex-expo')->first();
        $this->putJson("/api/events/{$globexExpo->uuid}", ['status' => 'draft'])->assertNotFound();
    }
}
