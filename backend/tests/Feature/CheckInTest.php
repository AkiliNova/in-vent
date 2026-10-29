<?php

namespace Tests\Feature;

use App\Models\Attendee;
use App\Models\Event;
use App\Models\NfcTag;
use App\Models\Tenant;
use App\Models\Ticket;
use App\Services\CheckInService;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CheckInTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected Event $event;

    protected Attendee $attendee;

    protected Ticket $ticket;

    protected function setUp(): void
    {
        parent::setUp();

        TenantContext::withoutScoping(function () {
            $this->tenant = Tenant::create([
                'organization_name' => 'Acme', 'slug' => 'acme', 'email' => 'a@acme.com',
            ]);

            $this->event = Event::create([
                'tenant_id' => $this->tenant->id, 'title' => 'Summit', 'slug' => 'summit',
                'start_date' => now(), 'status' => 'live',
            ]);

            $this->attendee = Attendee::create([
                'tenant_id' => $this->tenant->id, 'event_id' => $this->event->id,
                'first_name' => 'Ada', 'last_name' => 'Lovelace', 'email' => 'ada@example.com',
                'category' => 'VIP',
            ]);

            $this->ticket = Ticket::create([
                'tenant_id' => $this->tenant->id, 'event_id' => $this->event->id,
                'attendee_id' => $this->attendee->id, 'status' => 'valid',
            ]);
        });
    }

    protected function service(): CheckInService
    {
        return app(CheckInService::class);
    }

    public function test_valid_qr_scan_checks_the_attendee_in(): void
    {
        TenantContext::withoutScoping(function () {
            $result = $this->service()->scan($this->event, $this->ticket->code);

            $this->assertSame('accepted', $result['result']);
            $this->assertSame('checked_in', $this->attendee->fresh()->status);
            $this->assertNotNull($this->attendee->fresh()->checked_in_at);
            $this->assertSame('used', $this->ticket->fresh()->status);
        });
    }

    public function test_second_entry_scan_is_a_duplicate(): void
    {
        TenantContext::withoutScoping(function () {
            $this->service()->scan($this->event, $this->ticket->code);
            $second = $this->service()->scan($this->event, $this->ticket->code);

            $this->assertSame('duplicate', $second['result']);
        });
    }

    public function test_re_entry_after_an_exit_scan_is_accepted(): void
    {
        TenantContext::withoutScoping(function () {
            $this->service()->scan($this->event, $this->ticket->code);
            $this->service()->scan($this->event, $this->ticket->code, direction: 'out');

            $reentry = $this->service()->scan($this->event, $this->ticket->code);

            $this->assertSame('accepted', $reentry['result']);
        });
    }

    public function test_unknown_code_is_rejected_and_still_recorded(): void
    {
        TenantContext::withoutScoping(function () {
            $result = $this->service()->scan($this->event, 'TK-NOPE-NOPE-NOPE');

            $this->assertSame('invalid', $result['result']);
            // Rejected scans must still appear in the door log.
            $this->assertDatabaseHas('check_ins', ['result' => 'invalid']);
        });
    }

    public function test_ticket_for_another_event_is_rejected(): void
    {
        TenantContext::withoutScoping(function () {
            $other = Event::create([
                'tenant_id' => $this->tenant->id, 'title' => 'Other', 'slug' => 'other',
                'start_date' => now(), 'status' => 'live',
            ]);

            $result = $this->service()->scan($other, $this->ticket->code);

            $this->assertSame('wrong_event', $result['result']);
        });
    }

    public function test_void_ticket_is_rejected(): void
    {
        TenantContext::withoutScoping(function () {
            $this->ticket->update(['status' => 'refunded']);

            $result = $this->service()->scan($this->event, $this->ticket->code);

            $this->assertSame('revoked', $result['result']);
            $this->assertNull($this->attendee->fresh()->checked_in_at);
        });
    }

    public function test_nfc_scan_resolves_through_the_tag(): void
    {
        TenantContext::withoutScoping(function () {
            $tag = NfcTag::create([
                'tenant_id' => $this->tenant->id, 'uid' => '04A1B2C3D4E5F6',
            ]);
            $tag->assignTo($this->attendee);

            $result = $this->service()->scan($this->event, '04A1B2C3D4E5F6', method: 'nfc');

            $this->assertSame('accepted', $result['result']);
            $this->assertSame('checked_in', $this->attendee->fresh()->status);
        });
    }

    public function test_offline_batch_replays_in_scan_order(): void
    {
        TenantContext::withoutScoping(function () {
            $results = $this->service()->syncOffline($this->event, [
                // Deliberately out of order — the earlier scan must win.
                ['code' => $this->ticket->code, 'scanned_at' => now()->subMinutes(5)->toIso8601String()],
                ['code' => $this->ticket->code, 'scanned_at' => now()->subMinutes(10)->toIso8601String()],
            ]);

            $this->assertSame('accepted', $results[0]['result']);
            $this->assertSame('duplicate', $results[1]['result']);

            $this->assertTrue(
                $this->attendee->fresh()->checked_in_at->lessThan(now()->subMinutes(9))
            );
        });
    }
}
