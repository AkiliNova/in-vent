<?php

namespace App\Http\Controllers\Api;

use App\Events\QuestionPosted;
use App\Http\Controllers\Controller;
use App\Models\Attendee;
use App\Models\Event;
use App\Models\Poll;
use App\Models\Question;
use App\Models\QuestionUpvote;
use App\Services\Engagement\PollService;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Tikooh feature 7: live polls, voting and Q&A. */
class EngagementController extends Controller
{
    public function __construct(protected PollService $polls) {}

    // ── Polls (organizer) ───────────────────────────────────────────────────

    public function listPolls(Request $request, Event $event): JsonResponse
    {
        return response()->json(
            $event->polls()
                ->with('options')
                ->when($request->integer('session_id'), fn ($q, $id) => $q->where('event_session_id', $id))
                ->orderBy('sort_order')
                ->get()
        );
    }

    public function createPoll(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'question' => ['required', 'string', 'max:1000'],
            'type' => ['required', 'in:single,multiple,rating,word_cloud,yes_no'],
            'event_session_id' => ['nullable', 'integer', 'exists:event_sessions,id'],
            'is_anonymous' => ['boolean'],
            'show_results_live' => ['boolean'],
            'duration_seconds' => ['nullable', 'integer', 'min:5', 'max:3600'],
            'options' => ['nullable', 'array', 'max:12'],
            'options.*.label' => ['required_with:options', 'string', 'max:255'],
            'options.*.colour' => ['nullable', 'string', 'max:9'],
        ]);

        $poll = $event->polls()->create(array_diff_key($data, ['options' => null]) + [
            'created_by' => $request->user()->id,
        ]);

        foreach ($data['options'] ?? [] as $i => $option) {
            $poll->options()->create($option + ['sort_order' => $i]);
        }

        return response()->json($poll->load('options'), 201);
    }

    public function openPoll(Event $event, Poll $poll): JsonResponse
    {
        abort_if($poll->event_id !== $event->id, 404);

        return response()->json($this->polls->open($poll)->load('options'));
    }

    public function closePoll(Event $event, Poll $poll): JsonResponse
    {
        abort_if($poll->event_id !== $event->id, 404);

        return response()->json($this->polls->close($poll)->load('options'));
    }

    public function pollResults(Event $event, Poll $poll): JsonResponse
    {
        abort_if($poll->event_id !== $event->id, 404);

        return response()->json($poll->load('options')->resultsPayload());
    }

    // ── Polls (attendee) ────────────────────────────────────────────────────

    /** Open polls for the attendee's live view. Public: guests can vote too. */
    public function livePolls(Request $request, string $eventUuid): JsonResponse
    {
        $event = $this->publicEvent($eventUuid);
        $guestToken = $request->header('X-Guest-Token');
        $attendee = $this->attendeeFor($request, $event);

        $polls = TenantContext::withoutScoping(fn () => $event->polls()
            ->open()
            ->with('options')
            ->when($request->integer('session_id'), fn ($q, $id) => $q->where('event_session_id', $id))
            ->get());

        return response()->json($polls->map(fn (Poll $poll) => [
            'uuid' => $poll->uuid,
            'question' => $poll->question,
            'type' => $poll->type,
            'options' => $poll->options->map->only(['id', 'label', 'colour']),
            'has_voted' => $this->polls->hasVoted($poll, $attendee, $guestToken),
            'results' => $poll->show_results_live ? $poll->resultsPayload() : null,
        ]));
    }

    public function vote(Request $request, string $eventUuid, string $pollUuid): JsonResponse
    {
        $data = $request->validate([
            'option_ids' => ['nullable', 'array', 'max:12'],
            'option_ids.*' => ['integer'],
            'rating' => ['nullable', 'integer', 'min:1', 'max:10'],
            'text' => ['nullable', 'string', 'max:120'],
        ]);

        $event = $this->publicEvent($eventUuid);

        $poll = TenantContext::withoutScoping(
            fn () => $event->polls()->where('uuid', $pollUuid)->firstOrFail()
        );

        $poll = TenantContext::withoutScoping(fn () => $this->polls->vote(
            poll: $poll,
            optionIds: $data['option_ids'] ?? [],
            attendee: $this->attendeeFor($request, $event),
            guestToken: $request->header('X-Guest-Token'),
            rating: $data['rating'] ?? null,
            text: $data['text'] ?? null,
        ));

        return response()->json($poll->show_results_live ? $poll->resultsPayload() : ['recorded' => true]);
    }

    // ── Q&A ─────────────────────────────────────────────────────────────────

    /** Public feed: only approved and answered questions. */
    public function listQuestions(Request $request, string $eventUuid): JsonResponse
    {
        $event = $this->publicEvent($eventUuid);

        $questions = TenantContext::withoutScoping(fn () => $event->questions()
            ->visible()
            ->when($request->integer('session_id'), fn ($q, $id) => $q->where('event_session_id', $id))
            ->ranked()
            ->limit(100)
            ->get());

        return response()->json($questions->map(fn (Question $q) => [
            'uuid' => $q->uuid,
            'body' => $q->body,
            'author' => $q->displayName(),
            'upvotes' => $q->upvote_count,
            'status' => $q->status,
            'answer' => $q->answer,
        ]));
    }

    public function askQuestion(Request $request, string $eventUuid): JsonResponse
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'max:1000'],
            'event_session_id' => ['nullable', 'integer'],
            'is_anonymous' => ['boolean'],
        ]);

        $event = $this->publicEvent($eventUuid);
        $attendee = $this->attendeeFor($request, $event);

        $question = TenantContext::withoutScoping(fn () => $event->questions()->create([
            'event_session_id' => $data['event_session_id'] ?? null,
            'attendee_id' => $attendee?->id,
            'body' => $data['body'],
            'is_anonymous' => $data['is_anonymous'] ?? false,
            'author_name' => $attendee?->full_name,
            // Organizers can turn moderation off per event.
            'status' => data_get($event->settings, 'qa.auto_approve', false) ? 'approved' : 'pending',
        ]));

        QuestionPosted::dispatch($question);

        return response()->json(['uuid' => $question->uuid, 'status' => $question->status], 201);
    }

    public function upvoteQuestion(Request $request, string $eventUuid, string $questionUuid): JsonResponse
    {
        $event = $this->publicEvent($eventUuid);
        $attendee = $this->attendeeFor($request, $event);
        $guestToken = $request->header('X-Guest-Token');

        $question = TenantContext::withoutScoping(
            fn () => $event->questions()->where('uuid', $questionUuid)->firstOrFail()
        );

        $already = $question->upvotes()
            ->when($attendee, fn ($q) => $q->where('attendee_id', $attendee->id))
            ->when(! $attendee && $guestToken, fn ($q) => $q->where('guest_token', $guestToken))
            ->exists();

        if ($already) {
            return response()->json(['upvotes' => $question->upvote_count]);
        }

        QuestionUpvote::create([
            'question_id' => $question->id,
            'attendee_id' => $attendee?->id,
            'guest_token' => $attendee ? null : $guestToken,
        ]);

        $question->increment('upvote_count');

        QuestionPosted::dispatch($question->fresh());

        return response()->json(['upvotes' => $question->fresh()->upvote_count]);
    }

    /** Moderation queue — organizer side. */
    public function moderateQuestion(Request $request, Event $event, Question $question): JsonResponse
    {
        abort_if($question->event_id !== $event->id, 404);

        $data = $request->validate([
            'status' => ['required', 'in:approved,rejected,answered,archived'],
            'answer' => ['nullable', 'string', 'max:4000'],
            'answered_by_speaker_id' => ['nullable', 'integer', 'exists:speakers,id'],
        ]);

        $question->update($data + [
            'moderated_by' => $request->user()->id,
            'answered_at' => $data['status'] === 'answered' ? now() : null,
        ]);

        QuestionPosted::dispatch($question->fresh());

        return response()->json($question->fresh());
    }

    public function moderationQueue(Event $event): JsonResponse
    {
        return response()->json(
            $event->questions()
                ->with('attendee:id,first_name,last_name,company')
                ->where('status', 'pending')
                ->ranked()
                ->paginate(50)
        );
    }

    protected function publicEvent(string $uuid): Event
    {
        return TenantContext::withoutScoping(
            fn () => Event::publiclyVisible()->where('uuid', $uuid)->firstOrFail()
        );
    }

    /** Resolves the caller to an attendee record, if they are signed in. */
    protected function attendeeFor(Request $request, Event $event): ?Attendee
    {
        $user = $request->user();

        if (! $user) {
            return null;
        }

        return TenantContext::withoutScoping(fn () => Attendee::query()
            ->where('event_id', $event->id)
            ->where('user_id', $user->id)
            ->first());
    }
}
