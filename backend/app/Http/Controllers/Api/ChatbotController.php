<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendee;
use App\Models\ChatbotConversation;
use App\Models\ChatbotKnowledge;
use App\Models\ChatbotMessage;
use App\Models\Event;
use App\Services\Chatbot\ChatbotService;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/** Tikooh feature 12: the Tikooh chatbot. */
class ChatbotController extends Controller
{
    public function __construct(protected ChatbotService $chatbot) {}

    /** Public endpoint — anonymous visitors get a session token, not an account. */
    public function ask(Request $request, string $eventUuid): JsonResponse
    {
        $data = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
            'session_token' => ['nullable', 'string', 'max:64'],
            'channel' => ['nullable', 'in:web,mobile,whatsapp,kiosk'],
        ]);

        $event = TenantContext::withoutScoping(
            fn () => Event::publiclyVisible()->where('uuid', $eventUuid)->firstOrFail()
        );

        if (! $event->chatbot_enabled) {
            return response()->json(['message' => 'The assistant is not available for this event.'], 404);
        }

        $token = $data['session_token'] ?: (string) Str::uuid();

        $conversation = TenantContext::withoutScoping(fn () => ChatbotConversation::firstOrCreate(
            ['session_token' => $token, 'event_id' => $event->id],
            [
                'tenant_id' => $event->tenant_id,
                'attendee_id' => $this->attendeeId($request, $event),
                'channel' => $data['channel'] ?? 'web',
            ]
        ));

        try {
            $result = TenantContext::withoutScoping(
                fn () => $this->chatbot->reply($conversation, $data['message'])
            );
        } catch (\RuntimeException $e) {
            return response()->json([
                'session_token' => $token,
                'reply' => $e->getMessage(),
                'escalate' => true,
            ], 503);
        }

        return response()->json([
            'session_token' => $token,
            'reply' => $result['reply'],
            'escalate' => $result['escalate'],
        ]);
    }

    public function history(Request $request, string $eventUuid): JsonResponse
    {
        $data = $request->validate(['session_token' => ['required', 'string', 'max:64']]);

        $conversation = TenantContext::withoutScoping(fn () => ChatbotConversation::query()
            ->whereHas('event', fn ($q) => $q->where('uuid', $eventUuid))
            ->where('session_token', $data['session_token'])
            ->first());

        if (! $conversation) {
            return response()->json(['messages' => []]);
        }

        return response()->json([
            'messages' => $conversation->messages()
                ->get(['role', 'content', 'created_at'])
                ->map(fn ($m) => $m->only(['role', 'content', 'created_at'])),
        ]);
    }

    /** Thumbs up/down on an answer — drives FAQ improvements. */
    public function rate(Request $request, int $messageId): JsonResponse
    {
        $data = $request->validate(['helpful' => ['required', 'integer', 'in:-1,1']]);

        $message = ChatbotMessage::findOrFail($messageId);
        $message->update(['helpful' => $data['helpful']]);

        return response()->json(['ok' => true]);
    }

    // ── Knowledge base (organizer) ──────────────────────────────────────────

    public function knowledge(Request $request, Event $event): JsonResponse
    {
        return response()->json(
            ChatbotKnowledge::query()
                ->where(fn ($q) => $q->where('event_id', $event->id)->orWhereNull('event_id'))
                ->when($request->string('topic')->toString(), fn ($q, $t) => $q->where('topic', $t))
                ->orderByDesc('hit_count')
                ->paginate($request->integer('per_page', 50))
        );
    }

    public function storeKnowledge(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'question' => ['required', 'string', 'max:1000'],
            'answer' => ['required', 'string', 'max:5000'],
            'topic' => ['nullable', 'string', 'max:64'],
            'keywords' => ['nullable', 'array'],
            'event_wide' => ['boolean'],
        ]);

        $entry = ChatbotKnowledge::create([
            'tenant_id' => $event->tenant_id,
            'event_id' => ($data['event_wide'] ?? true) ? $event->id : null,
            'question' => $data['question'],
            'answer' => $data['answer'],
            'topic' => $data['topic'] ?? null,
            'keywords' => $data['keywords'] ?? null,
        ]);

        return response()->json($entry, 201);
    }

    public function destroyKnowledge(Event $event, ChatbotKnowledge $knowledge): JsonResponse
    {
        abort_if($knowledge->event_id !== null && $knowledge->event_id !== $event->id, 404);

        $knowledge->delete();

        return response()->json(null, 204);
    }

    /** Conversations that hit escalation, for the support desk. */
    public function escalations(Event $event): JsonResponse
    {
        return response()->json(
            ChatbotConversation::query()
                ->where('event_id', $event->id)
                ->where('escalated_to_human', true)
                ->where('status', 'escalated')
                ->with('attendee:id,first_name,last_name,email', 'messages')
                ->latest('last_message_at')
                ->paginate(25)
        );
    }

    protected function attendeeId(Request $request, Event $event): ?int
    {
        if (! $request->user()) {
            return null;
        }

        return TenantContext::withoutScoping(fn () => Attendee::query()
            ->where('event_id', $event->id)
            ->where('user_id', $request->user()->id)
            ->value('id'));
    }
}
