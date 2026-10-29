<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendee;
use App\Models\Event;
use App\Models\FeedbackForm;
use App\Models\FeedbackResponse;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Tikooh feature 8: post-session and post-event feedback. */
class FeedbackController extends Controller
{
    public function index(Event $event): JsonResponse
    {
        return response()->json(
            $event->feedbackForms()
                ->withCount('responses')
                ->withAvg('responses as average_rating', 'overall_rating')
                ->get()
        );
    }

    public function store(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'intro' => ['nullable', 'string'],
            'event_session_id' => ['nullable', 'integer', 'exists:event_sessions,id'],
            'trigger' => ['required', 'in:session_end,event_end,check_out,manual'],
            'delay_minutes' => ['nullable', 'integer', 'min:0', 'max:10080'],
            'target' => ['required', 'in:session,speaker,venue,event,catering'],
            'questions' => ['required', 'array', 'min:1'],
            'questions.*.key' => ['required', 'string', 'max:64'],
            'questions.*.label' => ['required', 'string', 'max:500'],
            'questions.*.type' => ['required', 'in:rating,nps,choice,multichoice,text,textarea'],
            'questions.*.required' => ['boolean'],
            'questions.*.scale' => ['nullable', 'integer', 'min:2', 'max:10'],
            'questions.*.options' => ['nullable', 'array'],
            'is_anonymous' => ['boolean'],
            'send_reminder' => ['boolean'],
        ]);

        return response()->json($event->feedbackForms()->create($data), 201);
    }

    /**
     * Forms the attendee should be shown right now — this is what drives the
     * automatic rating pop-up described in the brief.
     */
    public function due(Request $request, string $eventUuid): JsonResponse
    {
        $event = TenantContext::withoutScoping(
            fn () => Event::publiclyVisible()->where('uuid', $eventUuid)->firstOrFail()
        );

        $attendee = $this->attendee($request, $event);

        if (! $attendee) {
            return response()->json(['forms' => []]);
        }

        $forms = TenantContext::withoutScoping(fn () => $event->feedbackForms()
            ->where('is_active', true)
            ->with('session:id,title,ends_at')
            ->get()
            ->filter(fn (FeedbackForm $form) => $this->isDue($form, $attendee))
            ->values());

        return response()->json([
            'forms' => $forms->map(fn (FeedbackForm $f) => [
                'uuid' => $f->uuid,
                'title' => $f->title,
                'intro' => $f->intro,
                'session' => $f->session?->only(['id', 'title']),
                'questions' => $f->questions,
                'is_anonymous' => $f->is_anonymous,
            ]),
        ]);
    }

    public function submit(Request $request, string $eventUuid, string $formUuid): JsonResponse
    {
        $event = TenantContext::withoutScoping(
            fn () => Event::publiclyVisible()->where('uuid', $eventUuid)->firstOrFail()
        );

        $form = TenantContext::withoutScoping(
            fn () => $event->feedbackForms()->where('uuid', $formUuid)->firstOrFail()
        );

        $data = $request->validate($form->validationRules() + [
            'comment' => ['nullable', 'string', 'max:4000'],
            'speaker_id' => ['nullable', 'integer', 'exists:speakers,id'],
        ]);

        $attendee = $this->attendee($request, $event);

        if ($attendee && $form->responses()->where('attendee_id', $attendee->id)->exists()) {
            return response()->json(['message' => 'You have already given feedback.'], 422);
        }

        // Pulled out of answers so aggregate queries stay cheap.
        $overall = collect($form->questions)
            ->firstWhere('type', 'rating')['key'] ?? null;

        $response = TenantContext::withoutScoping(fn () => FeedbackResponse::create([
            'feedback_form_id' => $form->id,
            'event_id' => $event->id,
            'event_session_id' => $form->event_session_id,
            'attendee_id' => $form->is_anonymous ? null : $attendee?->id,
            'speaker_id' => $data['speaker_id'] ?? null,
            'overall_rating' => $overall ? ($data['answers'][$overall] ?? null) : null,
            'answers' => $data['answers'] ?? [],
            'comment' => $data['comment'] ?? null,
            'nps_score' => collect($form->questions)->firstWhere('type', 'nps')
                ? ($data['answers'][collect($form->questions)->firstWhere('type', 'nps')['key']] ?? null)
                : null,
            'submitted_at' => now(),
        ]));

        // Anonymous forms still need one-response-per-attendee, so the guard row
        // is written even when the response itself carries no attendee.
        if ($form->is_anonymous && $attendee) {
            $response->forceFill(['attendee_id' => null])->save();
        }

        $response->speaker?->recalculateRating();

        return response()->json(['message' => 'Thanks for the feedback.'], 201);
    }

    /** Aggregated results for the organizer. */
    public function results(Event $event, FeedbackForm $form): JsonResponse
    {
        abort_if($form->event_id !== $event->id, 404);

        $responses = $form->responses()->get();

        $breakdown = collect($form->questions)->mapWithKeys(function ($question) use ($responses) {
            $key = $question['key'];
            $values = $responses->pluck("answers.{$key}")->filter(fn ($v) => $v !== null);

            return [$key => match ($question['type']) {
                'rating', 'nps' => [
                    'average' => $values->isEmpty() ? null : round($values->avg(), 2),
                    'distribution' => $values->countBy()->sortKeys(),
                ],
                'choice', 'multichoice' => ['counts' => $values->flatten()->countBy()],
                default => ['responses' => $values->take(200)->values()],
            }];
        });

        return response()->json([
            'total_responses' => $responses->count(),
            'average_rating' => $form->averageRating(),
            'nps' => $this->nps($responses->pluck('nps_score')->filter()),
            'questions' => $breakdown,
            'comments' => $responses->pluck('comment')->filter()->take(200)->values(),
        ]);
    }

    /** Standard NPS: promoters (9-10) minus detractors (0-6), as a percentage. */
    protected function nps($scores): ?float
    {
        if ($scores->isEmpty()) {
            return null;
        }

        $promoters = $scores->filter(fn ($s) => $s >= 9)->count();
        $detractors = $scores->filter(fn ($s) => $s <= 6)->count();

        return round(($promoters - $detractors) / $scores->count() * 100, 1);
    }

    protected function isDue(FeedbackForm $form, Attendee $attendee): bool
    {
        if ($form->responses()->where('attendee_id', $attendee->id)->exists()) {
            return false;
        }

        return match ($form->trigger) {
            'session_end' => $form->session
                && $form->session->ends_at->addMinutes($form->delay_minutes)->isPast()
                && $attendee->sessions()
                    ->where('event_sessions.id', $form->event_session_id)
                    ->wherePivotNotNull('attended_at')
                    ->exists(),
            'event_end' => $form->event->end_date?->addMinutes($form->delay_minutes)->isPast() ?? false,
            'check_out' => $attendee->checkIns()->where('direction', 'out')->exists(),
            default => false,
        };
    }

    protected function attendee(Request $request, Event $event): ?Attendee
    {
        if (! $request->user()) {
            return null;
        }

        return TenantContext::withoutScoping(fn () => Attendee::query()
            ->where('event_id', $event->id)
            ->where('user_id', $request->user()->id)
            ->first());
    }
}
