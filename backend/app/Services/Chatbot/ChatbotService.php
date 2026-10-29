<?php

namespace App\Services\Chatbot;

use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Core\Exceptions\RateLimitException;
use App\Models\ChatbotConversation;
use App\Models\ChatbotMessage;
use App\Models\Event;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Tikooh feature 12: the event chatbot.
 *
 * Runs a bounded tool-use loop against Claude. The loop is written out rather
 * than using the SDK's beta tool runner because each turn needs to persist to
 * chatbot_messages, record which records answered the question, and stop at a
 * hard iteration cap.
 */
class ChatbotService
{
    /** Recommended default per the current model line. */
    protected const MODEL = 'claude-opus-5';

    /** A tool call plus its follow-up counts as one iteration. */
    protected const MAX_TOOL_ITERATIONS = 6;

    public function __construct(protected ClaudeClientFactory $clients) {}

    /**
     * Answers one attendee message and persists both turns.
     *
     * @return array{reply: string, sources: array, escalate: bool}
     */
    public function reply(ChatbotConversation $conversation, string $userMessage): array
    {
        $event = $conversation->event;

        if (! $event) {
            throw new RuntimeException('Chatbot conversations must be attached to an event.');
        }

        ChatbotMessage::create([
            'chatbot_conversation_id' => $conversation->id,
            'role' => 'user',
            'content' => $userMessage,
        ]);

        $tools = new EventTools($event);
        $client = $this->clients->for($conversation->tenant_id);

        // History first, then this turn, so the model sees the conversation in order.
        $messages = $conversation->history(10);
        $messages[] = ['role' => 'user', 'content' => $userMessage];

        $sources = [];
        $startedAt = microtime(true);
        $inputTokens = 0;
        $outputTokens = 0;

        for ($iteration = 0; $iteration < self::MAX_TOOL_ITERATIONS; $iteration++) {
            $response = $this->call($client, $event, $messages, $tools->definitions());

            $inputTokens += $response->usage->inputTokens ?? 0;
            $outputTokens += $response->usage->outputTokens ?? 0;

            // Safety classifiers can decline a request; content is empty or partial.
            if ($response->stopReason === 'refusal') {
                return $this->escalate(
                    $conversation,
                    "I can't help with that one — I'm passing you to the events team.",
                    $startedAt,
                    $inputTokens,
                    $outputTokens
                );
            }

            $messages[] = ['role' => 'assistant', 'content' => $response->content];

            $toolUses = array_values(array_filter(
                $response->content,
                fn ($block) => $block->type === 'tool_use'
            ));

            if ($toolUses === []) {
                return $this->finish(
                    $conversation,
                    $this->textOf($response->content),
                    $sources,
                    $startedAt,
                    $inputTokens,
                    $outputTokens
                );
            }

            // All tool results for a turn go back in a single user message.
            $results = [];

            foreach ($toolUses as $call) {
                $outcome = $tools->run($call->name, $call->input);
                $sources = array_merge($sources, $outcome['sources']);

                $results[] = [
                    'type' => 'tool_result',
                    'tool_use_id' => $call->id,
                    'content' => $outcome['content'],
                ];
            }

            $messages[] = ['role' => 'user', 'content' => $results];
        }

        // Ran out of iterations without a final answer — hand off rather than loop.
        return $this->escalate(
            $conversation,
            "I'm having trouble finding that. Let me connect you with the events team.",
            $startedAt,
            $inputTokens,
            $outputTokens
        );
    }

    protected function call($client, Event $event, array $messages, array $tools)
    {
        try {
            return $client->messages->create(
                maxTokens: 2048,
                messages: $messages,
                model: self::MODEL,
                system: $this->systemPrompt($event),
                // A support chatbot is latency-sensitive and the questions are
                // lookups, not hard reasoning — low effort keeps replies snappy.
                outputConfig: ['effort' => 'low'],
                tools: $tools,
            );
        } catch (RateLimitException $e) {
            Log::warning('Chatbot rate limited', ['event_id' => $event->id]);

            throw new RuntimeException('The assistant is busy right now. Please try again shortly.', 0, $e);
        } catch (APIStatusException $e) {
            Log::error('Chatbot API error', ['event_id' => $event->id, 'message' => $e->getMessage()]);

            throw new RuntimeException('The assistant is unavailable right now.', 0, $e);
        }
    }

    protected function systemPrompt(Event $event): string
    {
        $venue = $event->venue?->name ?? $event->location_name ?? 'a venue to be announced';
        $dates = $event->start_date->format('j M Y')
            .($event->end_date ? ' to '.$event->end_date->format('j M Y') : '');

        return <<<PROMPT
        You are the assistant for "{$event->title}", an event hosted by {$event->host} at {$venue}, running {$dates}.
        You help attendees before, during and after the event.

        Use your tools to answer. The agenda, speakers and venue change during an event, so look
        them up rather than answering from memory — and never invent a session, time, room or
        speaker. If a tool returns nothing, say you don't have that detail and offer to pass the
        question to the organizers.

        Answer in two or three sentences. Give the specific detail the attendee asked for — a time,
        a room, a name — rather than a summary of everything you looked up. Match the attendee's
        language if they write in one other than English.

        Registration details are private: only look up a registration when the attendee has given
        you their own email address in this conversation, and never read one out to anyone else.
        You cannot change a booking, issue a refund, or check anyone in — for those, say the events
        team will take it from here.
        PROMPT;
    }

    /** @param array<int,object> $content */
    protected function textOf(array $content): string
    {
        $text = '';

        foreach ($content as $block) {
            if ($block->type === 'text') {
                $text .= $block->text;
            }
        }

        return trim($text);
    }

    protected function finish(
        ChatbotConversation $conversation,
        string $reply,
        array $sources,
        float $startedAt,
        int $inputTokens,
        int $outputTokens
    ): array {
        ChatbotMessage::create([
            'chatbot_conversation_id' => $conversation->id,
            'role' => 'assistant',
            'content' => $reply,
            'sources' => $sources ?: null,
            'input_tokens' => $inputTokens,
            'output_tokens' => $outputTokens,
            'latency_ms' => (int) ((microtime(true) - $startedAt) * 1000),
        ]);

        $conversation->update(['last_message_at' => now()]);

        return ['reply' => $reply, 'sources' => $sources, 'escalate' => false];
    }

    protected function escalate(
        ChatbotConversation $conversation,
        string $reply,
        float $startedAt,
        int $inputTokens,
        int $outputTokens
    ): array {
        ChatbotMessage::create([
            'chatbot_conversation_id' => $conversation->id,
            'role' => 'assistant',
            'content' => $reply,
            'escalated' => true,
            'input_tokens' => $inputTokens,
            'output_tokens' => $outputTokens,
            'latency_ms' => (int) ((microtime(true) - $startedAt) * 1000),
        ]);

        $conversation->update([
            'status' => 'escalated',
            'escalated_to_human' => true,
            'last_message_at' => now(),
        ]);

        return ['reply' => $reply, 'sources' => [], 'escalate' => true];
    }
}
