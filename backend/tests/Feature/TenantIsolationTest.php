<?php

namespace Tests\Feature;

use App\Models\Attendee;
use App\Models\Event;
use App\Models\Tenant;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The failure this whole rewrite exists to prevent: one organizer reading
 * another organizer's data.
 */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $acme;

    protected Tenant $globex;

    protected User $acmeOwner;

    protected Event $acmeEvent;

    protected Event $globexEvent;

    protected function setUp(): void
    {
        parent::setUp();

        TenantContext::withoutScoping(function () {
            $this->acme = Tenant::create([
                'organization_name' => 'Acme Events', 'slug' => 'acme', 'email' => 'acme@example.com',
            ]);
            $this->globex = Tenant::create([
                'organization_name' => 'Globex', 'slug' => 'globex', 'email' => 'globex@example.com',
            ]);

            $this->acmeOwner = User::create([
                'tenant_id' => $this->acme->id, 'name' => 'Ada', 'email' => 'ada@acme.com',
                'password' => 'password123', 'role' => User::ROLE_ORGANIZER,
            ]);

            $this->acmeEvent = Event::create([
                'tenant_id' => $this->acme->id, 'title' => 'Acme Summit', 'slug' => 'acme-summit',
                'start_date' => now()->addWeek(), 'status' => 'published',
            ]);
            $this->globexEvent = Event::create([
                'tenant_id' => $this->globex->id, 'title' => 'Globex Expo', 'slug' => 'globex-expo',
                'start_date' => now()->addWeek(), 'status' => 'published',
            ]);
        });
    }

    public function test_event_list_only_returns_the_callers_tenant(): void
    {
        $response = $this->actingAs($this->acmeOwner)->getJson('/api/events');

        $response->assertOk();

        $titles = collect($response->json('data'))->pluck('title');

        $this->assertContains('Acme Summit', $titles);
        $this->assertNotContains('Globex Expo', $titles);
    }

    /**
     * actingAs() puts the user on the guard before middleware runs, which hid
     * a bug: with a real bearer token the tenant was never resolved, so lists
     * were unscoped and creates failed on a null tenant_id.
     */
    public function test_bearer_token_requests_are_scoped_to_the_callers_tenant(): void
    {
        $token = $this->acmeOwner->createToken('web', $this->acmeOwner->tokenAbilities())->plainTextToken;
        $auth = ['Authorization' => "Bearer {$token}"];

        $titles = collect($this->getJson('/api/events', $auth)->assertOk()->json('data'))->pluck('title');
        $this->assertContains('Acme Summit', $titles);
        $this->assertNotContains('Globex Expo', $titles);

        $this->getJson("/api/events/{$this->acmeEvent->uuid}", $auth)->assertOk();
        $this->getJson("/api/events/{$this->globexEvent->uuid}", $auth)->assertNotFound();

        $created = $this->postJson('/api/events', ['title' => 'New', 'start_date' => now()->addMonth()->toIso8601String()], $auth)
            ->assertCreated();
        $this->assertSame($this->acme->id, Event::withoutGlobalScope('tenant')->find($created->json('id'))->tenant_id);
    }

    /** Browsers send Origin; that must not turn a token login into a CSRF 419. */
    public function test_browser_login_from_the_frontend_origin_is_not_csrf_checked(): void
    {
        config(['sanctum.stateful' => ['tikooh.com', 'localhost:5173']]);

        $this->postJson('/api/auth/login', ['email' => 'ada@acme.com', 'password' => 'password123'], [
            'Origin' => 'https://tikooh.com',
            'Referer' => 'https://tikooh.com/admin/login',
        ])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_cannot_read_another_tenants_event_by_id(): void
    {
        // Guard against the test passing for the wrong reason: the caller can
        // fetch their OWN event by the same route, so a 404 on the other
        // tenant's uuid is the scope working, not a routing miss.
        $this->actingAs($this->acmeOwner)
            ->getJson("/api/events/{$this->acmeEvent->uuid}")
            ->assertOk();

        $this->actingAs($this->acmeOwner)
            ->getJson("/api/events/{$this->globexEvent->uuid}")
            ->assertNotFound();
    }

    public function test_cannot_read_another_tenants_attendees(): void
    {
        TenantContext::withoutScoping(fn () => Attendee::create([
            'tenant_id' => $this->globex->id,
            'event_id' => $this->globexEvent->id,
            'first_name' => 'Private', 'last_name' => 'Person',
            'email' => 'private@globex.com',
        ]));

        $this->actingAs($this->acmeOwner)
            ->getJson("/api/events/{$this->globexEvent->uuid}/attendees")
            ->assertNotFound();
    }

    public function test_global_scope_hides_other_tenants_from_direct_queries(): void
    {
        TenantContext::set($this->acme);

        $this->assertSame(1, Event::count());
        $this->assertNull(Event::find($this->globexEvent->id));

        TenantContext::clear();
    }

    public function test_suspended_tenant_is_locked_out(): void
    {
        $this->acme->update(['suspended' => true]);

        $this->actingAs($this->acmeOwner)
            ->getJson('/api/events')
            ->assertForbidden();
    }

    public function test_staff_cannot_create_events(): void
    {
        $staff = TenantContext::withoutScoping(fn () => User::create([
            'tenant_id' => $this->acme->id, 'name' => 'Desk', 'email' => 'desk@acme.com',
            'password' => 'password123', 'role' => User::ROLE_STAFF,
        ]));

        $this->actingAs($staff)
            ->postJson('/api/events', ['title' => 'Sneaky', 'start_date' => now()->addWeek()->toDateTimeString()])
            ->assertForbidden();
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/events')->assertUnauthorized();
    }
}
