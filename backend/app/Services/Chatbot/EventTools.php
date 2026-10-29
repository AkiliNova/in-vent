<?php

namespace App\Services\Chatbot;

use App\Models\Attendee;
use App\Models\ChatbotKnowledge;
use App\Models\Event;
use Illuminate\Support\Carbon;

/**
 * The tools the Tikooh chatbot can call. Each returns live event data rather
 * than relying on anything baked into the prompt, so answers stay correct when
 * the organizer changes the agenda mid-event.
 *
 * Every tool is scoped to a single Event — the chatbot can never read another
 * tenant's data, because the Event is resolved before the tools are built.
 */
class EventTools
{
    public function __construct(protected Event $event) {}

    /** Tool schemas sent to the model. */
    public function definitions(): array
    {
        return [
            [
                'name' => 'lookup_agenda',
                'description' => 'Look up sessions on the event agenda. Call this whenever the '
                    .'attendee asks what is on, when something starts, where a session is held, '
                    .'or what is happening now or next. Returns session titles, times, rooms and speakers.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'query' => [
                            'type' => 'string',
                            'description' => 'Free-text match against session title, track or description. Omit to list everything.',
                        ],
                        'when' => [
                            'type' => 'string',
                            'enum' => ['now', 'next', 'today', 'all'],
                            'description' => 'Time filter. Defaults to all.',
                        ],
                    ],
                ],
            ],
            [
                'name' => 'lookup_speaker',
                'description' => 'Look up a speaker by name and return their bio, title, company '
                    .'and the sessions they are presenting. Call this when the attendee asks who '
                    .'someone is or what they are speaking about.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'name' => ['type' => 'string', 'description' => 'Full or partial speaker name.'],
                    ],
                    'required' => ['name'],
                ],
            ],
            [
                'name' => 'lookup_venue',
                'description' => 'Return the event venue: name, address, map link and the rooms '
                    .'inside it. Call this for directions, parking, or "where is X" questions.',
                'input_schema' => ['type' => 'object', 'properties' => (object) []],
            ],
            [
                'name' => 'lookup_registration',
                'description' => 'Look up an attendee registration by email address and return '
                    .'their ticket type, check-in status and badge status. Call this only when the '
                    .'attendee has given their email and is asking about their own registration.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'email' => ['type' => 'string', 'description' => 'The attendee email address.'],
                    ],
                    'required' => ['email'],
                ],
            ],
            [
                'name' => 'search_faq',
                'description' => 'Search the organizer-authored FAQ for this event. Call this for '
                    .'policy questions (refunds, dress code, wifi, catering) that the other tools do not cover.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'query' => ['type' => 'string', 'description' => 'What the attendee wants to know.'],
                    ],
                    'required' => ['query'],
                ],
            ],
        ];
    }

    /**
     * Executes a tool call and returns the result plus the records it came from,
     * so the caller can record sources on the message.
     *
     * @return array{content: string, sources: array}
     */
    public function run(string $name, array $input): array
    {
        return match ($name) {
            'lookup_agenda' => $this->lookupAgenda($input),
            'lookup_speaker' => $this->lookupSpeaker($input),
            'lookup_venue' => $this->lookupVenue(),
            'lookup_registration' => $this->lookupRegistration($input),
            'search_faq' => $this->searchFaq($input),
            default => ['content' => "Unknown tool: {$name}", 'sources' => []],
        };
    }

    protected function lookupAgenda(array $input): array
    {
        $sessions = $this->event->sessions()
            ->with('speakers:id,name', 'venueSpace:id,name')
            ->when($input['query'] ?? null, fn ($q, $term) => $q->where(
                fn ($w) => $w->where('title', 'like', "%{$term}%")
                    ->orWhere('track', 'like', "%{$term}%")
                    ->orWhere('description', 'like', "%{$term}%")
            ))
            ->when(($input['when'] ?? 'all') === 'now', fn ($q) => $q->live())
            ->when(($input['when'] ?? 'all') === 'next', fn ($q) => $q->where('starts_at', '>', now())->limit(3))
            ->when(($input['when'] ?? 'all') === 'today', fn ($q) => $q->whereDate('starts_at', today()))
            ->limit(25)
            ->get();

        if ($sessions->isEmpty()) {
            return ['content' => 'No sessions match that.', 'sources' => []];
        }

        $lines = $sessions->map(fn ($s) => sprintf(
            '%s | %s–%s | %s | speakers: %s',
            $s->title,
            $s->starts_at->format('D H:i'),
            $s->ends_at->format('H:i'),
            $s->venueSpace?->name ?? $s->room_label ?? 'TBC',
            $s->speakers->pluck('name')->implode(', ') ?: 'none listed'
        ));

        return [
            'content' => $lines->implode("\n"),
            'sources' => $sessions->map(fn ($s) => ['type' => 'session', 'id' => $s->id])->all(),
        ];
    }

    protected function lookupSpeaker(array $input): array
    {
        $speaker = $this->event->speakers()
            ->with('sessions:id,title,starts_at')
            ->where('name', 'like', '%'.$input['name'].'%')
            ->first();

        if (! $speaker) {
            return ['content' => "No speaker found matching \"{$input['name']}\".", 'sources' => []];
        }

        $sessions = $speaker->sessions
            ->map(fn ($s) => $s->title.' at '.Carbon::parse($s->starts_at)->format('D H:i'))
            ->implode('; ');

        return [
            'content' => sprintf(
                "%s — %s%s\n%s\nSessions: %s",
                $speaker->name,
                $speaker->title ?: 'Speaker',
                $speaker->company ? ' at '.$speaker->company : '',
                $speaker->bio ?: 'No bio provided.',
                $sessions ?: 'none scheduled'
            ),
            'sources' => [['type' => 'speaker', 'id' => $speaker->id]],
        ];
    }

    protected function lookupVenue(): array
    {
        $venue = $this->event->venue;

        if (! $venue) {
            return [
                'content' => 'Venue: '.($this->event->location_name ?: 'not yet announced')
                    .($this->event->city ? ', '.$this->event->city : '')
                    .($this->event->location_map_link ? "\nMap: ".$this->event->location_map_link : ''),
                'sources' => [],
            ];
        }

        $spaces = $venue->spaces()->where('is_active', true)->pluck('name')->implode(', ');

        return [
            'content' => sprintf(
                "%s\n%s%s\nMap: %s\nRooms: %s",
                $venue->name,
                $venue->address ?: '',
                $venue->city ? ', '.$venue->city : '',
                $venue->map_link ?: 'not provided',
                $spaces ?: 'not listed'
            ),
            'sources' => [['type' => 'venue', 'id' => $venue->id]],
        ];
    }

    protected function lookupRegistration(array $input): array
    {
        $attendee = Attendee::withoutGlobalScope('tenant')
            ->where('event_id', $this->event->id)
            ->where('email', strtolower(trim($input['email'])))
            ->first();

        if (! $attendee) {
            return [
                'content' => 'No registration found for that email address on this event.',
                'sources' => [],
            ];
        }

        return [
            'content' => sprintf(
                "Name: %s\nTicket: %s\nStatus: %s\nChecked in: %s",
                $attendee->full_name,
                $attendee->category,
                $attendee->status,
                $attendee->checked_in_at?->format('D H:i') ?? 'not yet'
            ),
            'sources' => [['type' => 'attendee', 'id' => $attendee->id]],
        ];
    }

    protected function searchFaq(array $input): array
    {
        $entries = ChatbotKnowledge::withoutGlobalScope('tenant')
            ->where('tenant_id', $this->event->tenant_id)
            ->where(fn ($q) => $q->where('event_id', $this->event->id)->orWhereNull('event_id'))
            ->where('is_active', true)
            ->search($input['query'])
            ->limit(5)
            ->get();

        if ($entries->isEmpty()) {
            return ['content' => 'Nothing in the FAQ covers that.', 'sources' => []];
        }

        $entries->each(fn ($e) => $e->increment('hit_count'));

        return [
            'content' => $entries->map(fn ($e) => "Q: {$e->question}\nA: {$e->answer}")->implode("\n\n"),
            'sources' => $entries->map(fn ($e) => ['type' => 'knowledge', 'id' => $e->id])->all(),
        ];
    }
}
