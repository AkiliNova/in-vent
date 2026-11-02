<?php

namespace App\Services;

use App\Models\Attendee;
use App\Models\Campaign;
use App\Models\Contact;
use App\Models\Suppression;
use App\Services\Sms\AdvantaSmsClient;
use Generator;
use Illuminate\Database\Eloquent\Builder;

/**
 * Works out who a campaign reaches.
 *
 * audience_filter.source:
 *   event    — attendees of campaign.event_id (the default when an event is set)
 *   all      — everyone this organiser has ever had: attendees of all their
 *              events plus their imported contacts
 *   platform — super admin only: every attendee on Tikooh plus the sending
 *              tenant's own imported contacts. Other organisers' imported
 *              lists are never included.
 *
 * The same person usually appears once per event they attended, so
 * recipients are de-duplicated by destination, and anyone on the sending
 * tenant's suppression list (unsubscribed, bounced) is dropped.
 */
class CampaignAudience
{
    public const SOURCES = ['event', 'all', 'platform'];

    public static function source(Campaign $campaign): string
    {
        $source = $campaign->audience_filter['source'] ?? null;

        return in_array($source, self::SOURCES, true) ? $source : ($campaign->event_id ? 'event' : 'all');
    }

    /** @return Generator<int, array{attendee_id: ?int, destination: string, first_name: ?string, last_name: ?string}> */
    public static function each(Campaign $campaign): Generator
    {
        $channel = $campaign->channel === 'sms' ? 'sms' : 'email';
        $field = $channel === 'email' ? 'email' : 'phone';

        $suppressed = array_flip(Suppression::withoutGlobalScope('tenant')
            ->where('tenant_id', $campaign->tenant_id)
            ->where('channel', $channel)
            ->pluck('destination')
            ->all());

        $seen = [];

        foreach (self::sources($campaign) as $query) {
            foreach ($query->whereNotNull($field)->lazyById(500) as $person) {
                $destination = self::normalise($channel, (string) $person->{$field});

                if ($destination === null || isset($seen[$destination]) || isset($suppressed[$destination])) {
                    continue;
                }

                $seen[$destination] = true;

                yield [
                    'attendee_id' => $person instanceof Attendee ? $person->id : null,
                    'destination' => $destination,
                    'first_name' => $person->first_name ?: null,
                    'last_name' => $person->last_name ?: null,
                ];
            }
        }
    }

    public static function count(Campaign $campaign): int
    {
        $n = 0;

        foreach (self::each($campaign) as $_) {
            $n++;
        }

        return $n;
    }

    /** @return array<int, array{name: string, destination: string}> */
    public static function sample(Campaign $campaign, int $limit = 5): array
    {
        $out = [];

        foreach (self::each($campaign) as $r) {
            $out[] = ['name' => trim(($r['first_name'] ?? '').' '.($r['last_name'] ?? '')), 'destination' => $r['destination']];

            if (count($out) >= $limit) {
                break;
            }
        }

        return $out;
    }

    public static function normalise(string $channel, string $raw): ?string
    {
        if ($channel === 'sms') {
            return AdvantaSmsClient::normalise($raw) ?: null;
        }

        $email = strtolower(trim($raw));

        return filter_var($email, FILTER_VALIDATE_EMAIL) && ! Attendee::isPlaceholderEmail($email) ? $email : null;
    }

    /**
     * Attendees first, so a person who is both an attendee and an imported
     * contact keeps the attendee link (and its personalisation fields).
     *
     * @return array<int, Builder>
     */
    protected static function sources(Campaign $campaign): array
    {
        $source = self::source($campaign);
        $filter = $campaign->audience_filter ?? [];

        $attendees = Attendee::withoutGlobalScope('tenant')
            ->when($source !== 'platform', fn ($q) => $q->where('tenant_id', $campaign->tenant_id))
            ->when($source === 'event', fn ($q) => $q->where('event_id', $campaign->event_id ?? 0));

        foreach (['category', 'status'] as $key) {
            if (! empty($filter[$key])) {
                $attendees->whereIn($key, (array) $filter[$key]);
            }
        }

        if (! empty($filter['ticket_tier_id'])) {
            $attendees->whereHas('tickets', fn ($q) => $q
                ->withoutGlobalScope('tenant')
                ->whereIn('ticket_tier_id', (array) $filter['ticket_tier_id']));
        }

        if (! empty($filter['checked_in'])) {
            $attendees->whereNotNull('checked_in_at');
        }

        $queries = [$attendees];

        // Imported contacts never "checked in" or bought a tier, so any of
        // those filters means attendees only.
        $attendeeOnly = ! empty($filter['checked_in']) || ! empty($filter['ticket_tier_id'])
            || ! empty($filter['category']) || ! empty($filter['status']);

        if ($source !== 'event' && ! $attendeeOnly && ($filter['include_contacts'] ?? true)) {
            $queries[] = Contact::withoutGlobalScope('tenant')->where('tenant_id', $campaign->tenant_id);
        }

        return $queries;
    }
}
