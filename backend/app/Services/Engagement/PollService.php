<?php

namespace App\Services\Engagement;

use App\Events\PollResultsUpdated;
use App\Models\Attendee;
use App\Models\Poll;
use App\Models\PollVote;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Tikooh feature 7: instant polls and live voting. */
class PollService
{
    public function open(Poll $poll): Poll
    {
        $poll->forceFill(['status' => 'open', 'opened_at' => now(), 'closed_at' => null])->save();

        PollResultsUpdated::dispatch($poll);

        return $poll;
    }

    public function close(Poll $poll): Poll
    {
        $poll->forceFill(['status' => 'closed', 'closed_at' => now()])->save();

        PollResultsUpdated::dispatch($poll);

        return $poll;
    }

    /**
     * Records a vote and pushes fresh results to everyone watching.
     *
     * @param  array<int,int>  $optionIds  One id for single-choice, several for multi.
     * @param  string|null  $guestToken  Identifies an unauthenticated voter.
     */
    public function vote(
        Poll $poll,
        array $optionIds,
        ?Attendee $attendee = null,
        ?string $guestToken = null,
        ?int $rating = null,
        ?string $text = null,
    ): Poll {
        if (! $poll->isOpen()) {
            throw ValidationException::withMessages(['poll' => ['This poll is closed.']]);
        }

        if ($attendee === null && $guestToken === null) {
            throw ValidationException::withMessages(['poll' => ['Cannot identify the voter.']]);
        }

        if ($poll->type === 'single' && count($optionIds) > 1) {
            throw ValidationException::withMessages(['options' => ['Pick one option.']]);
        }

        DB::transaction(function () use ($poll, $optionIds, $attendee, $guestToken, $rating, $text) {
            if ($this->hasVoted($poll, $attendee, $guestToken)) {
                throw ValidationException::withMessages(['poll' => ['You have already voted.']]);
            }

            // Options must belong to this poll — an id from another poll would
            // otherwise let a voter inflate an unrelated result.
            $options = $poll->options()->whereIn('id', $optionIds)->get();

            if ($options->count() !== count($optionIds)) {
                throw ValidationException::withMessages(['options' => ['Invalid option.']]);
            }

            if ($options->isEmpty()) {
                PollVote::create([
                    'poll_id' => $poll->id,
                    'attendee_id' => $attendee?->id,
                    'guest_token' => $guestToken,
                    'rating_value' => $rating,
                    'text_value' => $text,
                    'ip_address' => request()->ip(),
                ]);
            }

            foreach ($options as $option) {
                PollVote::create([
                    'poll_id' => $poll->id,
                    'poll_option_id' => $option->id,
                    'attendee_id' => $attendee?->id,
                    'guest_token' => $guestToken,
                    'rating_value' => $rating,
                    'text_value' => $text,
                    'ip_address' => request()->ip(),
                ]);

                $option->increment('vote_count');
            }

            // One increment per voter, not per option, so percentages add to 100.
            $poll->increment('total_votes');
        });

        $poll->refresh()->load('options');

        PollResultsUpdated::dispatch($poll);

        return $poll;
    }

    public function hasVoted(Poll $poll, ?Attendee $attendee, ?string $guestToken): bool
    {
        return $poll->votes()
            ->when($attendee, fn ($q) => $q->where('attendee_id', $attendee->id))
            ->when(! $attendee && $guestToken, fn ($q) => $q->where('guest_token', $guestToken))
            ->exists();
    }

    /** Closes polls whose duration window has elapsed. Called by the scheduler. */
    public function closeExpired(): int
    {
        $closed = 0;

        Poll::query()
            ->where('status', 'open')
            ->whereNotNull('duration_seconds')
            ->whereNotNull('opened_at')
            ->each(function (Poll $poll) use (&$closed) {
                if ($poll->opened_at->addSeconds($poll->duration_seconds)->isPast()) {
                    $this->close($poll);
                    $closed++;
                }
            });

        return $closed;
    }
}
