<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\MessageLog;
use App\Models\PlatformSetting;
use App\Models\Tenant;
use App\Models\TicketTier;
use App\Models\User;
use App\Services\OrderService;
use App\Services\Sms\AfricasTalkingSmsClient;
use App\Services\Sms\Sms;
use App\Support\PlatformSettings;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PlatformSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;

    protected User $organiser;

    protected function setUp(): void
    {
        parent::setUp();

        TenantContext::withoutScoping(function () {
            $tenant = Tenant::create(['organization_name' => 'Acme', 'slug' => 'acme', 'email' => 'a@acme.com']);
            $this->admin = User::create(['name' => 'Ops', 'email' => 'ops@tikooh.com', 'password' => 'password123', 'role' => User::ROLE_SUPER_ADMIN]);
            $this->organiser = User::create(['tenant_id' => $tenant->id, 'name' => 'Owner', 'email' => 'o@acme.com', 'password' => 'password123', 'role' => User::ROLE_ORGANIZER]);
        });
    }

    protected function field(array $groups, string $key): array
    {
        return collect($groups)->flatMap(fn ($g) => $g['fields'])->firstWhere('key', $key);
    }

    public function test_admin_saves_settings_that_take_effect_and_secrets_never_come_back(): void
    {
        Sanctum::actingAs($this->admin);

        $groups = $this->putJson('/api/admin/settings', ['values' => [
            'services.sms.provider' => 'africastalking',
            'services.africastalking.username' => 'tikooh',
            'services.africastalking.api_key' => 'atsk_supersecret_9f2c',
            'tikooh.platform_fee_percent' => '8',
        ]])->assertOk()->json('groups');

        $key = $this->field($groups, 'services.africastalking.api_key');
        $this->assertNull($key['value']);
        $this->assertSame('••••9f2c', $key['hint']);
        $this->assertStringNotContainsString('supersecret', json_encode($groups));
        $this->assertSame('saved', $this->field($groups, 'tikooh.platform_fee_percent')['source']);

        // Encrypted at rest, and applied on the next boot.
        $raw = DB::table('platform_settings')->where('key', 'services.africastalking.api_key')->value('value');
        $this->assertStringNotContainsString('supersecret', $raw);
        PlatformSettings::apply();
        $this->assertSame(8, config('tikooh.platform_fee_percent'));
        $this->assertInstanceOf(AfricasTalkingSmsClient::class, Sms::client());
    }

    public function test_a_blank_secret_keeps_the_old_one_and_reset_goes_back_to_the_server_value(): void
    {
        Sanctum::actingAs($this->admin);

        $this->putJson('/api/admin/settings', ['values' => ['services.telegram.bot_token' => 'old-token-1234', 'tikooh.payout_hours' => 6]])->assertOk();
        $this->assertSame(6, config('tikooh.payout_hours'));

        $this->putJson('/api/admin/settings', ['values' => ['services.telegram.bot_token' => '']])->assertOk();
        $this->assertSame('old-token-1234', config('services.telegram.bot_token'));

        $groups = $this->putJson('/api/admin/settings', ['reset' => ['tikooh.payout_hours']])->assertOk()->json('groups');
        $this->assertSame(24, config('tikooh.payout_hours'));
        $this->assertSame('server', $this->field($groups, 'tikooh.payout_hours')['source']);
        $this->assertSame(0, PlatformSetting::where('key', 'tikooh.payout_hours')->count());
    }

    public function test_invalid_values_are_rejected_and_organisers_cannot_see_settings(): void
    {
        Sanctum::actingAs($this->admin);
        $this->putJson('/api/admin/settings', ['values' => ['tikooh.platform_fee_percent' => 90]])->assertStatus(422);
        $this->putJson('/api/admin/settings', ['values' => ['services.sms.provider' => 'carrier-pigeon']])->assertStatus(422);

        Sanctum::actingAs($this->organiser);
        $this->getJson('/api/admin/settings')->assertForbidden();
        $this->getJson('/api/admin/messages')->assertForbidden();
    }

    public function test_africas_talking_sends_and_every_sms_is_logged(): void
    {
        config(['services.africastalking' => ['username' => 'tikooh', 'api_key' => 'k', 'sender_id' => 'TIKOOH', 'sandbox' => false]]);
        Http::fake(['api.africastalking.com/*' => Http::response(['SMSMessageData' => ['Message' => 'Sent to 1/2', 'Recipients' => [
            ['statusCode' => 101, 'number' => '+254712345678', 'status' => 'Success', 'cost' => 'KES 0.8000', 'messageId' => 'ATXid_1'],
            ['statusCode' => 403, 'number' => '+254700000000', 'status' => 'InvalidPhoneNumber'],
        ]]], 201)]);

        $out = (new AfricasTalkingSmsClient)->about('test')->send(['0712 345 678', '0700000000'], 'Hello');

        $this->assertSame(1, $out['sent']);
        $this->assertSame('InvalidPhoneNumber', $out['failed'][0]['error']);
        Http::assertSent(fn ($r) => $r->hasHeader('apiKey', 'k') && $r['from'] === 'TIKOOH' && $r['to'] === '+254712345678,+254700000000');
        $this->assertSame(['sent', 'failed'], MessageLog::where('channel', 'sms')->orderBy('id')->pluck('status')->all());
        $this->assertSame('ATXid_1', MessageLog::where('status', 'sent')->value('provider_message_id'));
    }

    public function test_ticket_emails_are_logged_with_their_content_and_template_wording(): void
    {
        Http::fake();
        config(['tikooh.templates.ticket_subject' => 'Welcome to {event}!']);

        TenantContext::withoutScoping(function () {
            $tenant = Tenant::first();
            $event = Event::create(['tenant_id' => $tenant->id, 'title' => 'Summit', 'slug' => 'summit', 'start_date' => now()->addWeek(), 'status' => 'published', 'is_public' => true]);
            $tier = TicketTier::create(['event_id' => $event->id, 'name' => 'GA', 'price' => 1000, 'capacity' => 5, 'is_active' => true]);
            $orders = app(OrderService::class);
            $order = $orders->createPendingOrder($event, [['ticket_tier_id' => $tier->id, 'quantity' => 1]], ['name' => 'Ada Lovelace', 'email' => 'ada@example.com']);
            $orders->markPaid($order, 'mpesa', ['receipt' => 'X1']);
        });

        $log = MessageLog::where('type', 'ticket_confirmation')->sole();
        $this->assertSame('ada@example.com', $log->to);
        $this->assertSame('Welcome to Summit!', $log->subject);
        $this->assertSame('order', $log->related_type);
        $this->assertStringContainsString('TK-', $log->body);
        $this->assertStringContainsString('data:image/png;base64,', $log->body);
        $this->assertStringNotContainsString('cid:', $log->body);

        Sanctum::actingAs($this->admin);
        $this->getJson('/api/admin/messages?q=ada@')->assertOk()->assertJsonPath('total', 1)->assertJsonMissingPath('data.0.body');
        $this->getJson("/api/admin/messages/{$log->id}")->assertOk()->assertJsonPath('subject', 'Welcome to Summit!');
    }

    public function test_template_previews_render_for_admins(): void
    {
        Sanctum::actingAs($this->admin);

        $this->get('/api/admin/templates/ticket/preview')->assertOk()->assertSee('TK-7Q4M-X2PA-9KDW');
        $this->get('/api/admin/templates/campaign/preview')->assertOk()->assertSee('Get tickets');
    }
}
