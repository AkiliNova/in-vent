<?php

namespace Tests\Feature;

use App\Events\PollResultsUpdated;
use App\Models\Attendee;
use App\Models\Event;
use App\Models\Poll;
use App\Models\Tenant;
use App\Services\Engagement\PollService;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event as EventFacade;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class PollVotingTest extends TestCase
{
    use RefreshDatabase;

    protected Event $event;

    protected Poll $poll;

    protected Attendee $attendee;

    protected function setUp(): void
    {
        parent::setUp();

        TenantContext::withoutScoping(function () {
            $tenant = Tenant::create([
                'organization_name' => 'Acme', 'slug' => 'acme', 'email' => 'a@acme.com',
            ]);

            $this->event = Event::create([
                'tenant_id' => $tenant->id, 'title' => 'Summit', 'slug' => 'summit',
                'start_date' => now(), 'status' => 'live',
            ]);

            $this->poll = $this->event->polls()->create([
                'question' => 'Which track next?', 'type' => 'single', 'status' => 'draft',
            ]);

            $this->poll->options()->createMany([
                ['label' => 'AI', 'sort_order' => 0],
                ['label' => 'Fintech', 'sort_order' => 1],
            ]);

            $this->attendee = Attendee::create([
                'tenant_id' => $tenant->id, 'event_id' => $this->event->id,
                'first_name' => 'Ada', 'email' => 'ada@example.com',
            ]);
        });
    }

    protected function service(): PollService
    {
        return app(PollService::class);
    }

    public function test_voting_on_a_closed_poll_is_rejected(): void
    {
        TenantContext::withoutScoping(function () {
            $this->expectException(ValidationException::class);

            $this->service()->vote(
                $this->poll,
                [$this->poll->options->first()->id],
                guestToken: 'guest-1'
            );
        });
    }

    public function test_vote_increments_the_option_and_the_total(): void
    {
        TenantContext::withoutScoping(function () {
            $this->service()->open($this->poll);
            $option = $this->poll->options->first();

            $this->service()->vote($this->poll, [$option->id], $this->attendee);

            $this->assertSame(1, $option->fresh()->vote_count);
            $this->assertSame(1, $this->poll->fresh()->total_votes);
        });
    }

    public function test_the_same_attendee_cannot_vote_twice(): void
    {
        TenantContext::withoutScoping(function () {
            $this->service()->open($this->poll);
            $option = $this->poll->options->first();

            $this->service()->vote($this->poll, [$option->id], $this->attendee);

            $this->expectException(ValidationException::class);
            $this->service()->vote($this->poll, [$option->id], $this->attendee);
        });
    }

    public function test_a_guest_token_can_only_vote_once(): void
    {
        TenantContext::withoutScoping(function () {
            $this->service()->open($this->poll);
            $option = $this->poll->options->first();

            $this->service()->vote($this->poll, [$option->id], guestToken: 'device-abc');

            $this->expectException(ValidationException::class);
            $this->service()->vote($this->poll, [$option->id], guestToken: 'device-abc');
        });
    }

    public function test_an_option_from_another_poll_is_rejected(): void
    {
        TenantContext::withoutScoping(function () {
            $this->service()->open($this->poll);

            $other = $this->event->polls()->create([
                'question' => 'Unrelated', 'type' => 'single', 'status' => 'open',
            ]);
            $foreign = $other->options()->create(['label' => 'Elsewhere']);

            $this->expectException(ValidationException::class);
            $this->service()->vote($this->poll, [$foreign->id], $this->attendee);
        });
    }

    public function test_single_choice_poll_rejects_multiple_options(): void
    {
        TenantContext::withoutScoping(function () {
            $this->service()->open($this->poll);

            $this->expectException(ValidationException::class);
            $this->service()->vote($this->poll, $this->poll->options->pluck('id')->all(), $this->attendee);
        });
    }

    public function test_results_percentages_sum_to_one_hundred(): void
    {
        TenantContext::withoutScoping(function () {
            $this->service()->open($this->poll);
            [$ai, $fintech] = $this->poll->options->all();

            $this->service()->vote($this->poll, [$ai->id], guestToken: 'a');
            $this->service()->vote($this->poll, [$ai->id], guestToken: 'b');
            $this->service()->vote($this->poll, [$fintech->id], guestToken: 'c');

            $payload = $this->poll->fresh()->load('options')->resultsPayload();

            $this->assertSame(3, $payload['total_votes']);
            $this->assertSame(100.0, array_sum(array_column($payload['options'], 'percentage')));
        });
    }

    public function test_timed_poll_stops_accepting_votes_after_its_window(): void
    {
        TenantContext::withoutScoping(function () {
            $this->poll->update(['duration_seconds' => 30]);
            $this->service()->open($this->poll);

            $this->travel(31)->seconds();

            $this->assertFalse($this->poll->fresh()->isOpen());
        });
    }

    public function test_opening_a_poll_broadcasts_results(): void
    {
        EventFacade::fake([PollResultsUpdated::class]);

        TenantContext::withoutScoping(fn () => $this->service()->open($this->poll));

        EventFacade::assertDispatched(PollResultsUpdated::class);
    }
}
