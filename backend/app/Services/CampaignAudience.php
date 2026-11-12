<?php

namespace App\Services;

use App\Models\Attendee;
use App\Models\Campaign;
use App\Models\Contact;
use App\Models\Event;
use App\Models\Suppression;
use App\Models\User;
use App\Services\Sms\PhoneCheck;
use App\Services\Sms\SmsMessage;
use Generator;
use Illuminate\Database\Eloquent\Builder;

/**
 * Works out who a campaign reaches.
 *
 * audience_filter.source:
 *   event    — attendees of the chosen event(s) (event_ids, or campaign.event_id)
 *   all      — everyone this organiser has ever had: attendees of all their
 *              events plus their imported contacts
 *   platform — super admin only: every attendee on Tikooh plus the sending
 *              tenant's own imported contacts (and, when the admin narrows to
 *              specific organisers, those organisers' imported contacts).
 *
 * Narrowing filters (all optional, combined with AND):
 *   event_ids, tenant_ids (admin), ticket_tier_id, category, status,
 *   attendance (checked_in|no_show), paid (paid|free), consent (bool),
 *   country, registered_from/to, event_from/to, q (name/email/phone/company)
 *
 * Hand-picking:
 *   include — ["a:12", "c:5"]: send to exactly these people (filters ignored)
 *   exclude — ["a:9"]: drop these people from whatever the filters match
 *
 * The same person usually appears once per event they attended, so
 * recipients are de-duplicated by destination; the sending tenant's
 * suppression list (unsubscribed, bounced) is honoured, and SMS numbers are
 * checked (PhoneCheck) so nobody pays for texts that can't arrive.
 */
class CampaignAudience
{
    public const SOURCES = ['event', 'all', 'platform'];

    /** Every state scan() can report. Only "ok" is sent. */
    public const STATES = ['ok', 'invalid', 'unsupported', 'blocked', 'duplicate', 'suppressed', 'missing'];

    /** Filters that only make sense for attendees; any of them leaves imported contacts out. */
    protected const ATTENDEE_ONLY = [
        'event_ids', 'ticket_tier_id', 'category', 'status', 'attendance', 'checked_in',
        'paid', 'consent', 'country', 'registered_from', 'registered_to', 'event_from', 'event_to',
    ];

    public static function source(Campaign $campaign): string
    {
        $source = $campaign->audience_filter['source'] ?? null;

        return in_array($source, self::SOURCES, true) ? $source : ($campaign->event_id ? 'event' : 'all');
    }

    /**
     * Everyone the filters match, each with a verdict. One pass, streaming:
     * memory stays flat whatever the audience size.
     *
     * @return Generator<int, array{key: string, attendee_id: ?int, contact_id: ?int, event_id: ?int, raw: ?string, destination: ?string, first_name: ?string, last_name: ?string, company: ?string, category: ?string, state: string, network: ?string, reason: ?string, segments: int}>
     */
    public static function scan(Campaign $campaign): Generator
    {
        $sms = $campaign->channel === 'sms';
        $channel = $sms ? 'sms' : 'email';
        $field = $sms ? 'phone' : 'email';
        $body = (string) $campaign->body;
        $personalised = str_contains($body, '{{');
        $flatSegments = $sms ? SmsMessage::segments($body) : 1;

        $suppressed = array_flip(Suppression::withoutGlobalScope('tenant')
            ->where('tenant_id', $campaign->tenant_id)
            ->where('channel', $channel)
            ->pluck('destination')
            ->all());

        // The sender's own confirmation numbers get their copy separately (and
        // first); if one is also in the audience, that's a duplicate.
        $seen = [];
        if ($sms) {
            foreach (self::monitors($campaign) as $m) {
                $seen[$m['destination']] = 'your confirmation copy';
            }
        }

        foreach (self::sources($campaign) as $query) {
            foreach ($query->lazyById(500) as $person) {
                $isAttendee = $person instanceof Attendee;
                $raw = $person->{$field} !== null ? trim((string) $person->{$field}) : null;

                $row = [
                    'key' => ($isAttendee ? 'a:' : 'c:').$person->id,
                    'attendee_id' => $isAttendee ? $person->id : null,
                    'contact_id' => $isAttendee ? null : $person->id,
                    'event_id' => $isAttendee ? $person->event_id : null,
                    'raw' => $raw,
                    'destination' => null,
                    'first_name' => $person->first_name ?: null,
                    'last_name' => $person->last_name ?: null,
                    'company' => $isAttendee ? ($person->company ?: null) : null,
                    'category' => $isAttendee ? ($person->category ?: null) : null,
                    'state' => 'ok',
                    'network' => null,
                    'reason' => null,
                    'segments' => 0,
                ];

                if ($raw === null || $raw === '' || (! $sms && Attendee::isPlaceholderEmail($raw))) {
                    yield ['state' => 'missing', 'reason' => $sms ? 'No phone number' : 'No email address'] + $row;

                    continue;
                }

                if ($sms) {
                    $check = PhoneCheck::classify($raw);
                    $row['destination'] = $check['number'];
                    $row['network'] = $check['network'];

                    if ($check['status'] !== 'ok') {
                        yield ['state' => $check['status'], 'reason' => $check['reason']] + $row;

                        continue;
                    }
                } else {
                    $row['destination'] = self::normalise('email', $raw);

                    if ($row['destination'] === null) {
                        yield ['state' => 'invalid', 'reason' => 'Not a valid email address'] + $row;

                        continue;
                    }
                }

                $destination = $row['destination'];

                if (isset($suppressed[$destination])) {
                    yield ['state' => 'suppressed', 'reason' => 'Unsubscribed'] + $row;

                    continue;
                }

                if (isset($seen[$destination])) {
                    yield ['state' => 'duplicate', 'reason' => 'Same '.($sms ? 'number' : 'email').' as '.$seen[$destination]] + $row;

                    continue;
                }

                $seen[$destination] = trim(($row['first_name'] ?? '').' '.($row['last_name'] ?? '')) ?: $destination;

                $row['segments'] = ! $sms ? 1 : ($personalised
                    ? SmsMessage::segments(SmsMessage::personalise($body, $row['first_name'], $row['last_name'], $row['company'], $row['category']))
                    : $flatSegments);

                yield $row;
            }
        }
    }

    /** Only the people who will actually be sent to. */
    public static function each(Campaign $campaign): Generator
    {
        foreach (self::scan($campaign) as $row) {
            if ($row['state'] === 'ok') {
                yield $row;
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

    /**
     * Everything the composer shows in one pass: who gets it, who doesn't
     * and why, the network split, and the exact SMS credits.
     */
    public static function summary(Campaign $campaign, int $sampleSize = 5): array
    {
        $states = array_fill_keys(self::STATES, 0);
        $networks = [];
        $credits = 0;
        $maxSegments = 0;
        $sample = [];

        foreach (self::scan($campaign) as $row) {
            $states[$row['state']]++;

            if ($row['state'] !== 'ok') {
                continue;
            }

            $credits += $row['segments'];
            $maxSegments = max($maxSegments, $row['segments']);

            if ($row['network']) {
                $networks[$row['network']] = ($networks[$row['network']] ?? 0) + 1;
            }

            if (count($sample) < $sampleSize) {
                $sample[] = ['name' => trim(($row['first_name'] ?? '').' '.($row['last_name'] ?? '')), 'destination' => $row['destination']];
            }
        }

        arsort($networks);

        $monitors = $campaign->channel === 'sms' ? self::monitors($campaign) : [];

        return [
            'recipient_count' => $states['ok'],
            'states' => $states,
            'skipped' => $states['invalid'] + $states['unsupported'] + $states['blocked'],
            'networks' => $networks,
            'monitor_count' => count($monitors),
            'monitor_numbers' => array_column($monitors, 'destination'),
            'credits' => $campaign->channel === 'sms' ? $credits + array_sum(array_column($monitors, 'segments')) : 0,
            'max_segments' => $maxSegments,
            'sample' => $sample,
        ];
    }

    /**
     * One page of the people a campaign matches, for the review screen.
     *
     * @return array{data: array<int, array>, total: int, page: int, per_page: int}
     */
    public static function people(Campaign $campaign, ?string $state = null, ?string $search = null, int $page = 1, int $perPage = 50): array
    {
        $search = $search !== null ? mb_strtolower(trim($search)) : '';
        $from = ($page - 1) * $perPage;
        $rows = [];
        $total = 0;

        foreach (self::scan($campaign) as $row) {
            if ($state === 'skipped' ? ! in_array($row['state'], ['invalid', 'unsupported', 'blocked'], true) : ($state && $row['state'] !== $state)) {
                continue;
            }

            if ($search !== '' && ! str_contains(mb_strtolower(implode(' ', [$row['first_name'], $row['last_name'], $row['raw'], $row['destination'], $row['company']])), $search)) {
                continue;
            }

            if ($total >= $from && count($rows) < $perPage) {
                $rows[] = $row;
            }

            $total++;
        }

        $titles = Event::withoutGlobalScope('tenant')
            ->whereIn('id', array_filter(array_column($rows, 'event_id')))
            ->pluck('title', 'id');

        foreach ($rows as &$row) {
            $row['event'] = $row['event_id'] ? ($titles[$row['event_id']] ?? null) : null;
        }

        return ['data' => $rows, 'total' => $total, 'page' => $page, 'per_page' => $perPage];
    }

    /** @return array<int, array{name: string, destination: string}> */
    public static function sample(Campaign $campaign, int $limit = 5): array
    {
        return self::summary($campaign, $limit)['sample'];
    }

    public static function normalise(string $channel, string $raw): ?string
    {
        if ($channel === 'sms') {
            $check = PhoneCheck::classify($raw);

            return $check['status'] === 'ok' ? $check['number'] : null;
        }

        $email = strtolower(trim($raw));

        return filter_var($email, FILTER_VALIDATE_EMAIL) && ! Attendee::isPlaceholderEmail($email) ? $email : null;
    }

    /**
     * Up to three of the sender's own numbers that get a copy of the SMS,
     * personalised with the sender's name, so they see exactly what landed.
     * Numbers that can't be texted are dropped (validation reports them).
     *
     * @return array<int, array{destination: string, first_name: ?string, last_name: ?string, segments: int}>
     */
    public static function monitors(Campaign $campaign): array
    {
        if ($campaign->channel !== 'sms' || empty($campaign->monitor_numbers)) {
            return [];
        }

        $creator = $campaign->relationLoaded('creator') ? $campaign->creator : ($campaign->created_by ? User::find($campaign->created_by) : null);
        [$first, $last] = array_pad(preg_split('/\s+/', trim((string) $creator?->name), 2) ?: [], 2, null);

        $out = [];
        foreach (array_slice((array) $campaign->monitor_numbers, 0, 3) as $raw) {
            $check = PhoneCheck::classify((string) $raw);

            if ($check['status'] === 'ok' && ! isset($out[$check['number']])) {
                $out[$check['number']] = [
                    'destination' => $check['number'],
                    'first_name' => $first ?: null,
                    'last_name' => $last ?: null,
                    'segments' => SmsMessage::segments(SmsMessage::personalise((string) $campaign->body, $first ?: null, $last ?: null)),
                ];
            }
        }

        return array_values($out);
    }

    /** Event ids the audience is limited to (event source, or an explicit event filter). */
    public static function eventIds(Campaign $campaign): array
    {
        $ids = array_map('intval', (array) ($campaign->audience_filter['event_ids'] ?? []));

        if ($campaign->event_id && self::source($campaign) === 'event') {
            $ids[] = (int) $campaign->event_id;
        }

        return array_values(array_unique(array_filter($ids)));
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
        $admin = self::byAdmin($campaign);
        $tenantIds = $admin ? array_map('intval', (array) ($filter['tenant_ids'] ?? [])) : [];
        [$includeA, $includeC] = self::keys($filter['include'] ?? []);
        [$excludeA, $excludeC] = self::keys($filter['exclude'] ?? []);
        $handPicked = $includeA !== [] || $includeC !== [];

        // Whose attendees are in reach at all. Admins reach across organisers
        // for the platform and event sources; "all my past guests" stays theirs.
        // Picking events says whose guests these are, whatever card is selected.
        $platformWide = $admin && ($source === 'platform' || $source === 'event' || $handPicked || self::eventIds($campaign) !== []);

        $attendees = Attendee::withoutGlobalScope('tenant')
            ->select(['id', 'tenant_id', 'event_id', 'first_name', 'last_name', 'email', 'phone', 'company', 'category'])
            ->when(! $platformWide, fn ($q) => $q->where('tenant_id', $campaign->tenant_id))
            ->when($tenantIds, fn ($q) => $q->whereIn('tenant_id', $tenantIds));

        // Contacts: the sending tenant's own list, plus — for an admin who
        // chose specific organisers — those organisers' imported lists.
        $contactTenants = array_values(array_unique(array_merge([(int) $campaign->tenant_id], $tenantIds)));
        $contacts = Contact::withoutGlobalScope('tenant')
            ->select(['id', 'tenant_id', 'first_name', 'last_name', 'email', 'phone'])
            ->whereIn('tenant_id', $tenantIds ?: $contactTenants);

        if ($handPicked) {
            $attendees->whereIn('id', $includeA ?: [0]);
            $contacts->whereIn('id', $includeC ?: [0]);

            return [$attendees, $contacts];
        }

        if ($events = self::eventIds($campaign)) {
            $attendees->whereIn('event_id', $events);
        } elseif ($source === 'event') {
            $attendees->whereRaw('1 = 0');
        }

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

        $attendance = $filter['attendance'] ?? (! empty($filter['checked_in']) ? 'checked_in' : null);
        if ($attendance === 'checked_in') {
            $attendees->whereNotNull('checked_in_at');
        } elseif ($attendance === 'no_show') {
            $attendees->whereNull('checked_in_at');
        }

        if (($filter['paid'] ?? null) === 'paid') {
            $attendees->where('amount_paid', '>', 0);
        } elseif (($filter['paid'] ?? null) === 'free') {
            $attendees->where('amount_paid', '<=', 0);
        }

        if (! empty($filter['consent'])) {
            $attendees->where('consent_marketing', true);
        }

        if (! empty($filter['country'])) {
            $attendees->whereIn('country', (array) $filter['country']);
        }

        if (! empty($filter['registered_from'])) {
            $attendees->whereRaw('COALESCE(registered_at, created_at) >= ?', [date('Y-m-d 00:00:00', strtotime($filter['registered_from']))]);
        }

        if (! empty($filter['registered_to'])) {
            $attendees->whereRaw('COALESCE(registered_at, created_at) <= ?', [date('Y-m-d 23:59:59', strtotime($filter['registered_to']))]);
        }

        if (! empty($filter['event_from']) || ! empty($filter['event_to'])) {
            $attendees->whereHas('event', fn ($q) => $q->withoutGlobalScope('tenant')
                ->when($filter['event_from'] ?? null, fn ($w, $d) => $w->where('start_date', '>=', date('Y-m-d 00:00:00', strtotime($d))))
                ->when($filter['event_to'] ?? null, fn ($w, $d) => $w->where('start_date', '<=', date('Y-m-d 23:59:59', strtotime($d)))));
        }

        // Every word must match somewhere: "mary nyeri" finds Mary from Nyeri Co.
        foreach (preg_split('/\s+/', trim((string) ($filter['q'] ?? ''))) ?: [] as $term) {
            if ($term === '') {
                continue;
            }

            $like = '%'.addcslashes($term, '%_\\').'%';
            $digits = preg_replace('/\D+/', '', $term);
            $match = fn ($w, bool $company) => $w->where(fn ($x) => $x
                ->where('first_name', 'like', $like)
                ->orWhere('last_name', 'like', $like)
                ->orWhere('email', 'like', $like)
                // Phones are stored as typed ("+254 733 111 222"), so compare digits only.
                ->when(strlen($digits) >= 4, fn ($y) => $y->orWhereRaw(
                    "REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '.', '') like ?",
                    ['%'.(str_starts_with($digits, '0') ? substr($digits, 1) : $digits).'%']
                ))
                ->when($company, fn ($y) => $y->orWhere('company', 'like', $like)));
            $match($attendees, true);
            $match($contacts, false);
        }

        // "Who still needs to give us a phone number?" (or the reverse).
        if (in_array($filter['phone'] ?? null, ['missing', 'present'], true)) {
            $missing = ($filter['phone'] === 'missing');
            foreach ([$attendees, $contacts] as $q) {
                $missing
                    ? $q->where(fn ($w) => $w->whereNull('phone')->orWhere('phone', ''))
                    : $q->whereNotNull('phone')->where('phone', '!=', '');
            }
        }

        if ($excludeA) {
            $attendees->whereNotIn('id', $excludeA);
        }

        if ($excludeC) {
            $contacts->whereNotIn('id', $excludeC);
        }

        $queries = [$attendees];

        $attendeeOnly = $source === 'event';
        foreach (self::ATTENDEE_ONLY as $key) {
            $attendeeOnly = $attendeeOnly || ! empty($filter[$key]);
        }

        if (! $attendeeOnly && ($filter['include_contacts'] ?? true)) {
            $queries[] = $contacts;
        }

        return $queries;
    }

    /** Campaigns created by platform staff may reach across organisers. */
    protected static function byAdmin(Campaign $campaign): bool
    {
        if (! $campaign->created_by) {
            return false;
        }

        $creator = $campaign->relationLoaded('creator') ? $campaign->creator : User::find($campaign->created_by);

        return (bool) $creator?->isSuperAdmin();
    }

    /** @return array{0: array<int,int>, 1: array<int,int>} attendee ids, contact ids */
    protected static function keys(array $keys): array
    {
        $a = $c = [];

        foreach ($keys as $key) {
            if (preg_match('/^([ac]):(\d+)$/', (string) $key, $m)) {
                $m[1] === 'a' ? $a[] = (int) $m[2] : $c[] = (int) $m[2];
            }
        }

        return [$a, $c];
    }
}
