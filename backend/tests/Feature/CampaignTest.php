<?php

namespace Tests\Feature;

use App\Jobs\SendCampaign;
use App\Mail\CampaignMail;
use App\Models\Attendee;
use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Models\Contact;
use App\Models\Event;
use App\Models\Suppression;
use App\Models\Tenant;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CampaignTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $acme;

    protected Tenant $other;

    protected Event $gig;

    protected Event $party;

    protected User $organiser;

    protected function setUp(): void
    {
        parent::setUp();

        TenantContext::withoutScoping(function () {
            $this->acme = Tenant::create(['organization_name' => 'Acme Live', 'slug' => 'acme', 'email' => 'a@acme.com']);
            $this->other = Tenant::create(['organization_name' => 'Other', 'slug' => 'other', 'email' => 'o@other.com']);

            $this->gig = Event::create(['tenant_id' => $this->acme->id, 'title' => 'Gig', 'slug' => 'gig', 'start_date' => now()->subMonth(), 'status' => 'ended']);
            $this->party = Event::create(['tenant_id' => $this->acme->id, 'title' => 'Party', 'slug' => 'party', 'start_date' => now()->subWeek(), 'status' => 'ended']);
            $elsewhere = Event::create(['tenant_id' => $this->other->id, 'title' => 'Elsewhere', 'slug' => 'elsewhere', 'start_date' => now()->subWeek(), 'status' => 'ended']);

            // Ada came to both Acme events — she must get one email, not two.
            $this->attend($this->gig, 'Ada', 'ADA@example.com');
            $this->attend($this->party, 'Ada', 'ada@example.com');
            $this->attend($this->party, 'Grace', 'grace@example.com');
            $this->attend($this->party, 'Gone', 'gone@example.com');
            // Walk-in / imported guests without email: never emailed.
            $this->attend($this->party, 'Walkin', 'guest+20261102@door.tikooh.com');
            $this->attend($this->party, 'Imported', '254712000000@import.tikooh.com');
            $this->attend($elsewhere, 'Linus', 'linus@example.com');

            Contact::create(['tenant_id' => $this->acme->id, 'email' => 'old@guest.com', 'first_name' => 'Olive']);
            Contact::create(['tenant_id' => $this->acme->id, 'email' => 'grace@example.com']);
            Contact::create(['tenant_id' => $this->other->id, 'email' => 'theirs@list.com']);

            Suppression::create(['tenant_id' => $this->acme->id, 'channel' => 'email', 'destination' => 'gone@example.com']);

            $this->organiser = User::create(['tenant_id' => $this->acme->id, 'name' => 'Owner', 'email' => 'owner@acme.com', 'password' => 'password123', 'role' => User::ROLE_ORGANIZER]);
        });

        Sanctum::actingAs($this->organiser);
    }

    protected function attend(Event $event, string $name, string $email): Attendee
    {
        return Attendee::create(['tenant_id' => $event->tenant_id, 'event_id' => $event->id, 'first_name' => $name, 'last_name' => 'X', 'email' => $email]);
    }

    protected function draft(array $overrides = [])
    {
        return $this->postJson('/api/campaigns', $overrides + [
            'name' => 'New season', 'channel' => 'email', 'subject' => 'Hi {{first_name}}',
            'body' => 'Big news, {{first_name}}.', 'audience_filter' => ['source' => 'all'],
        ]);
    }

    public function test_all_past_guests_are_deduplicated_and_unsubscribes_are_skipped(): void
    {
        $this->postJson('/api/campaigns/audience', ['channel' => 'email', 'audience_filter' => ['source' => 'all']])
            ->assertOk()
            // ada (twice → once), grace (attendee + contact → once), olive; gone is suppressed; other tenants excluded
            ->assertJsonPath('recipient_count', 3);
    }

    public function test_sending_delivers_one_personalised_email_each_with_one_click_unsubscribe(): void
    {
        Mail::fake();

        $uuid = $this->draft(['featured_event_id' => $this->party->id])->assertCreated()->json('uuid');
        $this->postJson("/api/campaigns/{$uuid}/send")->assertStatus(202);

        Mail::assertSent(CampaignMail::class, 3);
        Mail::assertSent(CampaignMail::class, fn (CampaignMail $m) => $m->hasTo('old@guest.com')
            && $m->subjectLine === 'Hi Olive'
            && $m->senderName === 'Acme Live via Tikooh'
            && str_contains($m->headers()->text['List-Unsubscribe'] ?? '', '/api/unsubscribe/'));

        $campaign = Campaign::withoutGlobalScope('tenant')->where('uuid', $uuid)->first();
        $this->assertSame('sent', $campaign->status);
        $this->assertSame(3, $campaign->recipients()->where('status', 'sent')->count());
    }

    public function test_a_campaign_is_only_ever_sent_once(): void
    {
        Mail::fake();

        $uuid = $this->draft()->json('uuid');
        $this->postJson("/api/campaigns/{$uuid}/send")->assertStatus(202);
        $this->postJson("/api/campaigns/{$uuid}/send")->assertStatus(422);
        SendCampaign::dispatchSync(Campaign::withoutGlobalScope('tenant')->where('uuid', $uuid)->first());

        Mail::assertSent(CampaignMail::class, 3);
    }

    public function test_organisers_cannot_message_the_whole_platform_but_admins_can(): void
    {
        $this->draft(['audience_filter' => ['source' => 'platform']])->assertForbidden();

        $admin = TenantContext::withoutScoping(fn () => User::create(['tenant_id' => $this->acme->id, 'name' => 'Admin', 'email' => 'admin@tikooh.com', 'password' => 'password123', 'role' => User::ROLE_SUPER_ADMIN]));
        Sanctum::actingAs($admin);

        $this->postJson('/api/campaigns/audience', ['channel' => 'email', 'audience_filter' => ['source' => 'platform']])
            ->assertOk()
            // every attendee on Tikooh (ada, grace, linus) + the admin tenant's own contacts (olive); never another tenant's imported list
            ->assertJsonPath('recipient_count', 4);
    }

    public function test_organisers_cannot_target_another_organisers_event(): void
    {
        $theirs = TenantContext::withoutScoping(fn () => Event::where('slug', 'elsewhere')->first());

        $this->draft(['audience_filter' => ['source' => 'event'], 'event_id' => $theirs->id])->assertStatus(422);
    }

    public function test_unsubscribe_needs_the_button_press_and_a_valid_signature(): void
    {
        Mail::fake();
        $uuid = $this->draft()->json('uuid');
        $this->postJson("/api/campaigns/{$uuid}/send");
        $recipient = CampaignRecipient::where('destination', 'old@guest.com')->first();
        $url = URL::signedRoute('campaign.unsubscribe', ['recipient' => $recipient->id], absolute: false);

        $this->get($url)->assertOk()->assertSee('Yes, unsubscribe me');
        $this->assertFalse(Suppression::blocks($this->acme->id, 'email', 'old@guest.com'), 'a GET (link scanner) must not unsubscribe');

        $this->post(str_replace('signature=', 'signature=x', $url))->assertForbidden();
        $this->post($url)->assertOk()->assertSee("You're unsubscribed", false);
        $this->assertTrue(Suppression::blocks($this->acme->id, 'email', 'old@guest.com'));
    }

    public function test_contacts_import_from_an_excel_csv(): void
    {
        $csv = "\xEF\xBB\xBFFull Name,E-mail,Mobile\nJane Doe,JANE@x.com,0712 345 678\nNo Contact,,\nOlive Updated,old@guest.com,\n";
        $file = UploadedFile::fake()->createWithContent('past-guests.csv', $csv);

        $this->post('/api/contacts/import', ['file' => $file], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJson(['added' => 1, 'updated' => 1, 'skipped' => 1]);

        $jane = Contact::withoutGlobalScope('tenant')->where('email', 'jane@x.com')->first();
        $this->assertSame('Jane', $jane->first_name);
        $this->assertSame('Doe', $jane->last_name);
        $this->assertSame('past-guests.csv', $jane->source);
        $this->assertNotNull($jane->phone);
    }
}
