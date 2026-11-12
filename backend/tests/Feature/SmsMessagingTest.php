<?php

namespace Tests\Feature;

use App\Jobs\SendCampaign;
use App\Models\Attendee;
use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Models\Event;
use App\Models\SmsNumberFlag;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Sms\PhoneCheck;
use App\Services\Sms\SmsMessage;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SmsMessagingTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $acme;

    protected Tenant $other;

    protected Event $gig;

    protected Event $party;

    protected Event $theirs;

    protected User $organiser;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        PhoneCheck::reset();

        config([
            'services.sms.provider' => 'africastalking',
            'services.sms.cost_per_segment' => 0.8,
            'services.africastalking' => ['username' => 'tikooh', 'api_key' => 'k', 'sender_id' => 'TIKOOH', 'sandbox' => false],
        ]);

        TenantContext::withoutScoping(function () {
            $this->acme = Tenant::create(['organization_name' => 'Acme Live', 'slug' => 'acme', 'email' => 'a@acme.com']);
            $this->other = Tenant::create(['organization_name' => 'Other', 'slug' => 'other', 'email' => 'o@other.com']);

            $this->gig = Event::create(['tenant_id' => $this->acme->id, 'title' => 'Gig', 'slug' => 'gig', 'start_date' => '2026-03-10', 'status' => 'ended']);
            $this->party = Event::create(['tenant_id' => $this->acme->id, 'title' => 'Party', 'slug' => 'party', 'start_date' => '2026-09-01', 'status' => 'ended']);
            $this->theirs = Event::create(['tenant_id' => $this->other->id, 'title' => 'Theirs', 'slug' => 'theirs', 'start_date' => '2026-09-01', 'status' => 'ended']);

            // Gig: paid + checked in Safaricom, free no-show Airtel, a landline, a short number.
            $this->guest($this->gig, 'Wanjiru', '0712 345 678', ['amount_paid' => 1500, 'checked_in_at' => now()]);
            $this->guest($this->gig, 'Otieno', '+254 733 111 222');
            $this->guest($this->gig, 'Office', '020 2222 333');
            $this->guest($this->gig, 'Annet', '075824871');
            // Party: Wanjiru again (duplicate), a Ugandan number, a Telkom number, no phone.
            $this->guest($this->party, 'Wanjiru', '254712345678', [], 'wanjiru2@x.com');
            $this->guest($this->party, 'Okello', '+256 772 123 456');
            $this->guest($this->party, 'Kamau', '0770123456', ['consent_marketing' => true]);
            $this->guest($this->party, 'Nophone', null);
            // Another organiser's guest.
            $this->guest($this->theirs, 'Linus', '0722000111');

            $this->organiser = User::create(['tenant_id' => $this->acme->id, 'name' => 'Owner', 'email' => 'owner@acme.com', 'password' => 'password123', 'role' => User::ROLE_ORGANIZER]);
            $this->admin = User::create(['name' => 'Root', 'email' => 'root@tikooh.com', 'password' => 'password123', 'role' => 'super_admin']);
        });

        Sanctum::actingAs($this->organiser);
    }

    protected function guest(Event $event, string $name, ?string $phone, array $extra = [], ?string $email = null): Attendee
    {
        return Attendee::create($extra + [
            'tenant_id' => $event->tenant_id, 'event_id' => $event->id, 'first_name' => $name, 'last_name' => 'K',
            'email' => $email ?? strtolower($name).'@x.com', 'phone' => $phone,
        ]);
    }

    protected function audience(array $filter, string $body = 'Hi {{first_name}}, tickets are live!')
    {
        return $this->postJson('/api/campaigns/audience', ['channel' => 'sms', 'body' => $body, 'audience_filter' => $filter + ['source' => 'all']]);
    }

    public function test_segments_follow_gsm7_and_unicode_rules(): void
    {
        $this->assertSame(1, SmsMessage::segments(str_repeat('a', 160)));
        $this->assertSame(2, SmsMessage::segments(str_repeat('a', 161)));
        $this->assertSame(3, SmsMessage::segments(str_repeat('a', 307)));
        // € is in the extension table: two characters each.
        $this->assertSame(2, SmsMessage::segments(str_repeat('€', 81)));

        $emoji = SmsMessage::analyse('Party tonight 🔥');
        $this->assertSame('UCS-2', $emoji['encoding']);
        $this->assertSame(['🔥'], $emoji['unicode_chars']);
        $this->assertSame(2, SmsMessage::segments(str_repeat('a', 69).'🔥'), 'an emoji is two UCS-2 units: 71 > 70');
        $this->assertSame('UCS-2', SmsMessage::analyse('It’s on')['encoding'], 'curly apostrophe from Word');
    }

    public function test_numbers_are_classified_by_network_and_support(): void
    {
        $this->assertSame(['254712345678', 'ok', 'Safaricom'], array_values(array_slice(PhoneCheck::classify('0712 345 678'), 0, 3)));
        $this->assertSame('Airtel', PhoneCheck::classify('0733111222')['network']);
        $this->assertSame('Telkom', PhoneCheck::classify('0770123456')['network']);
        $this->assertSame('Safaricom', PhoneCheck::classify('0110123456')['network']);
        $this->assertSame('Safaricom', PhoneCheck::classify('727288201')['network'], 'Excel dropped the 0');
        $this->assertSame('ok', PhoneCheck::classify('00254712345678')['status']);
        $this->assertSame('invalid', PhoneCheck::classify('075824871')['status']);
        $this->assertSame('unsupported', PhoneCheck::classify('020 2222 333')['status']);
        $this->assertSame('unsupported', PhoneCheck::classify('+256772123456')['status']);

        config(['services.sms.countries' => '254,256']);
        $this->assertSame('ok', PhoneCheck::classify('+256772123456')['status']);

        SmsNumberFlag::create(['number' => '254712345678', 'reason' => 'UserInBlacklist']);
        PhoneCheck::reset();
        $blocked = PhoneCheck::classify('0712345678');
        $this->assertSame('blocked', $blocked['status']);
        $this->assertStringContainsString('blocked promotional SMS', $blocked['reason']);
    }

    public function test_summary_counts_credits_per_person_and_flags_bad_numbers(): void
    {
        $r = $this->audience([])->assertOk();

        // Wanjiru, Otieno, Kamau can be texted; Wanjiru's second registration is a duplicate.
        $r->assertJson([
            'recipient_count' => 3,
            'states' => ['ok' => 3, 'duplicate' => 1, 'invalid' => 1, 'unsupported' => 2, 'missing' => 1, 'blocked' => 0],
            'skipped' => 3,
            'networks' => ['Safaricom' => 1, 'Airtel' => 1, 'Telkom' => 1],
            'credits' => 3,
            'estimated_cost' => 2.4,
            'encoding' => 'GSM-7',
        ]);

        // Personalisation: a body that's 1 part for short names becomes 2 for a long one.
        TenantContext::withoutScoping(fn () => $this->guest($this->gig, str_repeat('Long', 10), '0799000111'));
        $body = '{{first_name}} '.str_repeat('x', 130);
        $this->audience([], $body)->assertJson(['recipient_count' => 4, 'credits' => 5, 'max_segments' => 2]);

        // An emoji turns the same audience into Unicode pricing.
        $this->audience([], 'Hi {{first_name}} 🔥 '.str_repeat('x', 60))
            ->assertJson(['encoding' => 'UCS-2', 'unicode_chars' => ['🔥'], 'credits' => 8]);
    }

    public function test_filters_narrow_down_to_the_last_person(): void
    {
        $count = fn (array $f) => $this->audience($f)->assertOk()->json('recipient_count');

        $this->assertSame(2, $count(['source' => 'event', 'event_ids' => [$this->gig->id]]));
        $this->assertSame(1, $count(['event_ids' => [$this->gig->id], 'attendance' => 'checked_in']));
        $this->assertSame(1, $count(['event_ids' => [$this->gig->id], 'attendance' => 'no_show']));
        $this->assertSame(1, $count(['paid' => 'paid']));
        $this->assertSame(1, $count(['consent' => true]));
        $this->assertSame(1, $count(['q' => 'otie']));
        $this->assertSame(1, $count(['q' => '733111']), 'search by phone digits');
        $this->assertSame(2, $count(['event_from' => '2026-08-01']), 'party only: Wanjiru + Kamau');
        $this->assertSame(0, $count(['event_ids' => [$this->gig->id, $this->party->id], 'registered_to' => '2020-01-01']));

        $otieno = Attendee::withoutGlobalScope('tenant')->where('first_name', 'Otieno')->value('id');
        $kamau = Attendee::withoutGlobalScope('tenant')->where('first_name', 'Kamau')->value('id');
        $this->assertSame(2, $count(['exclude' => ["a:{$otieno}"]]));
        $this->assertSame(1, $count(['include' => ["a:{$kamau}"], 'paid' => 'paid']), 'hand-picked ignores filters');

        // An organiser can't hand-pick another organiser's guests.
        $linus = Attendee::withoutGlobalScope('tenant')->where('first_name', 'Linus')->value('id');
        $this->assertSame(0, $count(['include' => ["a:{$linus}"]]));
    }

    public function test_review_list_shows_why_people_are_skipped(): void
    {
        $r = $this->postJson('/api/campaigns/audience/people', [
            'channel' => 'sms', 'body' => 'Hi', 'audience_filter' => ['source' => 'all'], 'state' => 'skipped',
        ])->assertOk();

        $r->assertJsonPath('total', 3);
        $reasons = collect($r->json('data'))->pluck('reason', 'first_name');
        $this->assertStringContainsString('Wrong length', $reasons['Annet']);
        $this->assertStringContainsString('Landline', $reasons['Office']);
        $this->assertStringContainsString('+256', $reasons['Okello']);
        $this->assertSame('Gig', collect($r->json('data'))->firstWhere('first_name', 'Annet')['event']);

        $this->postJson('/api/campaigns/audience/people', [
            'channel' => 'sms', 'body' => 'Hi', 'audience_filter' => ['source' => 'all'], 'per_page' => 2, 'page' => 2,
        ])->assertJsonPath('total', 8)->assertJsonCount(2, 'data');
    }

    public function test_admin_reaches_across_organisers_but_organisers_cannot(): void
    {
        $this->audience(['source' => 'event', 'event_ids' => [$this->theirs->id]])->assertStatus(422);
        $this->audience(['tenant_ids' => [$this->other->id]])->assertForbidden();

        Sanctum::actingAs($this->admin);
        $this->audience(['source' => 'event', 'event_ids' => [$this->theirs->id]])->assertJson(['recipient_count' => 1]);
        $this->audience(['source' => 'platform', 'tenant_ids' => [$this->acme->id]])->assertJson(['recipient_count' => 3]);
        $this->audience(['source' => 'platform'])->assertJson(['recipient_count' => 4]);

        $this->postJson('/api/campaigns/audience/facets', ['channel' => 'sms', 'audience_filter' => ['source' => 'platform', 'event_ids' => [$this->gig->id]]])
            ->assertOk()->assertJsonPath('categories', ['General']);
    }

    public function test_admin_picking_an_event_gets_its_attendees_whatever_the_source_card(): void
    {
        Sanctum::actingAs($this->admin);

        // Regression: picking events while "My account's guests" was selected returned nobody.
        foreach (['all', 'event', 'platform'] as $source) {
            $this->postJson('/api/campaigns/audience', ['channel' => 'email', 'body' => 'Hi', 'audience_filter' => ['source' => $source, 'event_ids' => [$this->gig->id]]])
                ->assertOk()->assertJsonPath('recipient_count', 4, "source={$source}");
        }

        $this->postJson('/api/campaigns/audience', ['channel' => 'email', 'body' => 'Hi', 'audience_filter' => ['source' => 'all', 'event_ids' => [$this->theirs->id]]])
            ->assertJsonPath('recipient_count', 1);
    }

    public function test_send_is_refused_when_the_africas_talking_balance_is_too_low(): void
    {
        Bus::fake();
        Http::fake(['api.africastalking.com/version1/user*' => Http::sequence()
            ->push(['UserData' => ['balance' => 'KES 1.5000']])
            ->push(['UserData' => ['balance' => 'KES 500.0000']])]);

        $uuid = $this->postJson('/api/campaigns', ['name' => 'Promo', 'channel' => 'sms', 'body' => 'Hi {{first_name}}', 'audience_filter' => ['source' => 'all']])
            ->assertCreated()->json('uuid');

        // 3 people × 1 part × KES 0.80 = 2.40 > 1.50
        $this->postJson("/api/campaigns/{$uuid}/send")->assertStatus(422)
            ->assertJsonFragment(['message' => 'SMS sending is temporarily unavailable. Please try again later or contact Tikooh support.']);

        Sanctum::actingAs($this->admin);
        $this->getJson('/api/campaigns/sms-status')->assertOk()
            ->assertJson(['provider' => 'africastalking', 'balance' => ['ok' => true, 'currency' => 'KES', 'amount' => 1.5]]);

        // The status check above was served from cache; send re-checks fresh and gets the topped-up balance.
        Sanctum::actingAs($this->organiser);
        $this->postJson("/api/campaigns/{$uuid}/send")->assertStatus(202);
        Bus::assertDispatched(SendCampaign::class);
    }

    public function test_sending_skips_bad_numbers_and_remembers_provider_rejections(): void
    {
        Http::fake([
            'api.africastalking.com/version1/user*' => Http::response(['UserData' => ['balance' => 'KES 500.0000']]),
            'api.africastalking.com/version1/messaging' => function ($request) {
                $to = ltrim($request['to'], '+');
                $status = $to === '254733111222' ? ['statusCode' => 406, 'status' => 'UserInBlacklist'] : ['statusCode' => 101, 'status' => 'Success'];

                return Http::response(['SMSMessageData' => ['Message' => 'Sent', 'Recipients' => [
                    $status + ['number' => '+'.$to, 'messageId' => 'ATX'.$to, 'cost' => 'KES 0.8000'],
                ]]]);
            },
        ]);

        $uuid = $this->postJson('/api/campaigns', ['name' => 'Promo', 'channel' => 'sms', 'body' => 'Hi {{first_name}}', 'audience_filter' => ['source' => 'all']])->json('uuid');
        $this->postJson("/api/campaigns/{$uuid}/send")->assertStatus(202);

        $campaign = Campaign::withoutGlobalScope('tenant')->where('uuid', $uuid)->first();
        $rows = CampaignRecipient::where('campaign_id', $campaign->id)->get()->keyBy('first_name');

        $this->assertSame('sent', $rows['Wanjiru']->status);
        $this->assertEquals(0.8, $rows['Wanjiru']->cost);
        $this->assertSame('failed', $rows['Otieno']->status);
        $this->assertSame('skipped', $rows['Office']->status);
        $this->assertStringContainsString('Landline', $rows['Office']->error);
        $this->assertSame('skipped', $rows['Annet']->status);
        $this->assertSame(3, $campaign->fresh()->recipient_count);

        // Otieno's number is now flagged and drops out of the next audience.
        $this->assertDatabaseHas('sms_number_flags', ['number' => '254733111222', 'reason' => 'UserInBlacklist']);
        PhoneCheck::reset();
        $this->audience([])->assertJson(['recipient_count' => 2, 'states' => ['blocked' => 1]]);
    }

    protected function fakeAt(): void
    {
        Http::fake([
            'api.africastalking.com/version1/user*' => Http::response(['UserData' => ['balance' => 'KES 500.0000']]),
            'api.africastalking.com/version1/messaging' => fn ($request) => Http::response(['SMSMessageData' => ['Message' => 'Sent', 'Recipients' => [
                ['statusCode' => 101, 'status' => 'Success', 'number' => $request['to'], 'messageId' => 'ATX'.ltrim($request['to'], '+'), 'cost' => 'KES 0.8000'],
            ]]]),
        ]);
    }

    public function test_confirmation_numbers_get_their_copy_first_and_are_remembered(): void
    {
        $this->fakeAt();
        $base = ['name' => 'Promo', 'channel' => 'sms', 'body' => 'Hi {{first_name}}', 'audience_filter' => ['source' => 'all']];

        $this->postJson('/api/campaigns', $base + ['monitor_numbers' => ['0711000222', '020 2222 333']])
            ->assertStatus(422)->assertJsonFragment(['message' => 'Confirmation number 020 2222 333 can\'t receive SMS: Landline: can\'t receive SMS.']);
        $this->postJson('/api/campaigns', $base + ['monitor_numbers' => ['1', '2', '3', '4']])->assertStatus(422);

        // The second number is also Wanjiru's: she becomes a duplicate, not a double send.
        $this->postJson('/api/campaigns/audience', $base + ['monitor_numbers' => ['0711 000 222', '0712345678']])
            ->assertJson(['recipient_count' => 2, 'monitor_count' => 2, 'credits' => 4, 'states' => ['duplicate' => 2]]);

        $uuid = $this->postJson('/api/campaigns', $base + ['monitor_numbers' => ['0711 000 222']])->assertCreated()->json('uuid');
        $this->assertSame(['254711000222'], $this->organiser->fresh()->sms_monitor_numbers);
        $this->getJson('/api/campaigns/sms-status')->assertJsonPath('monitor_numbers', ['254711000222']);

        $this->postJson("/api/campaigns/{$uuid}/send")->assertStatus(202);

        $campaign = Campaign::withoutGlobalScope('tenant')->where('uuid', $uuid)->first();
        $first = CampaignRecipient::where('campaign_id', $campaign->id)->orderBy('id')->first();
        $this->assertTrue($first->is_monitor);
        $this->assertSame('254711000222', $first->destination);
        $this->assertSame('sent', $first->status);
        $this->assertSame('Owner', $first->first_name, 'personalised with the sender\'s name');

        $fresh = $campaign->fresh();
        $this->assertSame(3, $fresh->recipient_count, 'copies are not counted as audience');
        $this->assertSame(3, $fresh->sent_count);

        $this->getJson("/api/campaigns/{$uuid}/report")->assertJsonPath('monitors.0.destination', '254711000222')
            ->assertJsonPath('monitors.0.status', 'sent');
    }

    public function test_test_sms_goes_only_to_confirmation_numbers(): void
    {
        $this->fakeAt();

        $uuid = $this->postJson('/api/campaigns', ['name' => 'Promo', 'channel' => 'sms', 'body' => 'Hi {{first_name}}', 'audience_filter' => ['source' => 'all'], 'monitor_numbers' => ['0711000222', '0733999888']])->json('uuid');

        $this->postJson("/api/campaigns/{$uuid}/test")->assertOk()
            ->assertJson(['message' => 'Test SMS sent to +254711000222, +254733999888.'])
            ->assertJsonCount(2, 'results');

        Http::assertSentCount(2);
        Http::assertSent(fn ($r) => $r['message'] === 'Hi Owner');

        $none = $this->postJson('/api/campaigns', ['name' => 'P2', 'channel' => 'sms', 'body' => 'Hi', 'audience_filter' => ['source' => 'all']])->json('uuid');
        $this->organiser->forceFill(['phone' => null, 'sms_monitor_numbers' => null])->save();
        $this->postJson("/api/campaigns/{$none}/test")->assertStatus(422);
    }

    public function test_delivery_reports_update_status_and_flag_dead_numbers(): void
    {
        $this->fakeAt();
        $uuid = $this->postJson('/api/campaigns', ['name' => 'Promo', 'channel' => 'sms', 'body' => 'Hi', 'audience_filter' => ['source' => 'all'], 'monitor_numbers' => ['0711000222']])->json('uuid');
        $this->postJson("/api/campaigns/{$uuid}/send")->assertStatus(202);
        $campaign = Campaign::withoutGlobalScope('tenant')->where('uuid', $uuid)->first();

        $this->post('/api/webhooks/africastalking/delivery', ['id' => 'ATX254711000222', 'status' => 'Success', 'phoneNumber' => '+254711000222'])->assertOk();
        $this->post('/api/webhooks/africastalking/delivery', ['id' => 'ATX254712345678', 'status' => 'Success', 'phoneNumber' => '+254712345678'])->assertOk();
        $this->post('/api/webhooks/africastalking/delivery', ['id' => 'ATX254733111222', 'status' => 'Failed', 'failureReason' => 'UserInBlackList', 'phoneNumber' => '+254733111222'])->assertOk();
        $this->post('/api/webhooks/africastalking/delivery', ['id' => 'nope', 'status' => 'Buffered'])->assertOk();

        $rows = CampaignRecipient::where('campaign_id', $campaign->id)->get()->keyBy('destination');
        $this->assertSame('delivered', $rows['254711000222']->status);
        $this->assertNotNull($rows['254711000222']->delivered_at);
        $this->assertSame('failed', $rows['254733111222']->status);
        $this->assertSame('UserInBlackList', $rows['254733111222']->error);

        $fresh = $campaign->fresh();
        $this->assertSame(1, $fresh->delivered_count, 'audience only, not the copy');
        $this->assertSame(1, $fresh->failed_count);
        $this->assertDatabaseHas('sms_number_flags', ['number' => '254733111222', 'reason' => 'UserInBlackList']);
    }

    public function test_admin_number_checker_and_flag_management(): void
    {
        $this->postJson('/api/admin/sms/check-numbers', ['numbers' => '0712345678'])->assertForbidden();

        Sanctum::actingAs($this->admin);
        $this->postJson('/api/admin/sms/check-numbers', ['numbers' => "0712345678, 0733111222\n020 2222333; 07123\n+256 772 123 456"])
            ->assertOk()
            ->assertJson(['counts' => ['ok' => 2, 'unsupported' => 2, 'invalid' => 1, 'total' => 5], 'networks' => ['Safaricom' => 1, 'Airtel' => 1]]);

        $flag = SmsNumberFlag::create(['number' => '254712345678', 'reason' => 'InvalidPhoneNumber', 'last_failed_at' => now()]);
        $this->getJson('/api/admin/sms/flags')->assertOk()->assertJsonPath('total', 1);
        $this->deleteJson("/api/admin/sms/flags/{$flag->id}")->assertNoContent();
        $this->assertSame('ok', PhoneCheck::classify('0712345678')['status']);
    }
}
