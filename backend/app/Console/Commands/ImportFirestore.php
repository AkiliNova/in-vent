<?php

namespace App\Console\Commands;

use App\Models\Attendee;
use App\Models\BlogPost;
use App\Models\Campaign;
use App\Models\Event;
use App\Models\EventSession;
use App\Models\PromoCode;
use App\Models\RegistrationField;
use App\Models\Speaker;
use App\Models\Tenant;
use App\Models\Ticket;
use App\Models\TicketTier;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Imports the Firestore export produced by scripts/export-firestore.mjs.
 *
 * Idempotent: every row is matched on its Firestore document id (stored in
 * `legacy_id`), so the command can be run repeatedly during a cutover — a dry
 * run first, then the real thing, then again to pick up late writes.
 */
class ImportFirestore extends Command
{
    protected $signature = 'tikooh:import-firestore
        {path : Path to the JSON export directory}
        {--dry-run : Report what would change without writing}
        {--only= : Comma-separated collections to import}';

    protected $description = 'Import a Firestore export into the relational database';

    protected array $counts = [];

    protected array $tenantMap = [];

    protected array $eventMap = [];

    public function handle(): int
    {
        $path = rtrim($this->argument('path'), '/\\');

        if (! is_dir($path)) {
            $this->error("Not a directory: {$path}");

            return self::FAILURE;
        }

        $only = $this->option('only')
            ? array_map('trim', explode(',', $this->option('only')))
            : null;

        $this->info($this->option('dry-run') ? 'DRY RUN — nothing will be written' : 'Importing…');

        // Scoping off throughout: the importer writes across every tenant.
        return TenantContext::withoutScoping(function () use ($path, $only) {
            DB::beginTransaction();

            try {
                $steps = [
                    'tenants' => fn () => $this->importTenants($path),
                    'events' => fn () => $this->importEvents($path),
                    'registration_fields' => fn () => $this->importRegistrationFields($path),
                    'guests' => fn () => $this->importGuests($path),
                    'tickets' => fn () => $this->importTickets($path),
                    'promo_codes' => fn () => $this->importPromoCodes($path),
                    'campaigns' => fn () => $this->importCampaigns($path),
                    'speakers' => fn () => $this->importSpeakers($path),
                    'sessions' => fn () => $this->importSessions($path),
                    'blog_posts' => fn () => $this->importBlogPosts($path),
                ];

                foreach ($steps as $name => $step) {
                    if ($only && ! in_array($name, $only, true)) {
                        continue;
                    }

                    $step();
                }

                if ($this->option('dry-run')) {
                    DB::rollBack();
                } else {
                    DB::commit();
                }
            } catch (\Throwable $e) {
                DB::rollBack();
                $this->error("Import failed: {$e->getMessage()}");
                $this->line($e->getTraceAsString());

                return self::FAILURE;
            }

            $this->newLine();
            $this->table(['Collection', 'Imported'], collect($this->counts)->map(
                fn ($count, $name) => [$name, $count]
            )->values());

            if ($this->option('dry-run')) {
                $this->warn('Dry run — rolled back. Re-run without --dry-run to apply.');
            } else {
                $this->info('Import complete.');
                $this->warn('Migrated users have no password. They must use the reset flow before signing in.');
            }

            return self::SUCCESS;
        });
    }

    protected function importTenants(string $path): void
    {
        foreach ($this->read($path, 'tenants') as $id => $row) {
            $tenant = Tenant::updateOrCreate(
                ['legacy_id' => $id],
                [
                    'organization_name' => $row['organizationName'] ?? 'Unnamed organisation',
                    'slug' => $this->slug($row['organizationName'] ?? 'org', Tenant::class),
                    'email' => $row['email'] ?? "tenant-{$id}@invalid.local",
                    'phone' => $row['phone'] ?? null,
                    'package' => $row['package'] ?? 'starter',
                    'suspended' => (bool) ($row['suspended'] ?? false),
                    'created_at' => $this->date($row['createdAt'] ?? null),
                ]
            );

            $this->tenantMap[$id] = $tenant->id;

            // The Firestore doc id was the Firebase Auth uid of the owner, so
            // the owner account maps 1:1 onto it.
            if (! empty($row['email'])) {
                User::updateOrCreate(
                    ['email' => strtolower($row['email'])],
                    [
                        'tenant_id' => $tenant->id,
                        'name' => $row['organizationName'] ?? 'Organizer',
                        'role' => User::ROLE_ORGANIZER,
                        'phone' => $row['phone'] ?? null,
                        'firebase_uid' => $id,
                        'password' => null,
                    ]
                );
            }

            $this->bump('tenants');
        }
    }

    protected function importEvents(string $path): void
    {
        foreach ($this->read($path, 'events') as $id => $row) {
            $tenantId = $this->tenantMap[$row['_tenantId'] ?? ''] ?? null;

            if (! $tenantId) {
                $this->warn("Skipping event {$id}: unknown tenant");

                continue;
            }

            $event = Event::updateOrCreate(
                ['legacy_id' => $id],
                [
                    'tenant_id' => $tenantId,
                    'title' => $row['title'] ?? 'Untitled event',
                    'slug' => $this->slug($row['title'] ?? 'event', Event::class),
                    'description' => $row['description'] ?? null,
                    'host' => $row['host'] ?? null,
                    'event_type' => $row['eventType'] ?? null,
                    'start_date' => $this->date($row['startDate'] ?? null) ?? now(),
                    'end_date' => $this->date($row['endDate'] ?? null),
                    'location_name' => $row['locationName'] ?? null,
                    'city' => $row['city'] ?? null,
                    'location_map_link' => $row['locationMapLink'] ?? null,
                    'cover_image_path' => $row['images'][0] ?? null,
                    'status' => ($row['status'] ?? 'draft') === 'published' ? 'published' : 'draft',
                    'base_price' => (float) ($row['price'] ?? 0),
                    'waitlist_enabled' => true,
                ]
            );

            $this->eventMap[$id] = $event->id;

            foreach ($row['images'] ?? [] as $i => $image) {
                $event->images()->updateOrCreate(['path' => $image], ['sort_order' => $i]);
            }

            foreach ($row['ticketTiers'] ?? [] as $i => $tier) {
                TicketTier::updateOrCreate(
                    ['event_id' => $event->id, 'name' => $tier['name'] ?? "Tier {$i}"],
                    [
                        'description' => $tier['description'] ?? null,
                        'price' => (float) ($tier['price'] ?? 0),
                        'capacity' => (int) ($tier['capacity'] ?? 0),
                        'sold' => (int) ($tier['sold'] ?? 0),
                        'sort_order' => $i,
                    ]
                );
            }

            $this->bump('events');
        }
    }

    protected function importRegistrationFields(string $path): void
    {
        foreach ($this->read($path, 'registration_fields') as $id => $row) {
            $tenantId = $this->tenantMap[$row['_tenantId'] ?? ''] ?? null;

            if (! $tenantId) {
                continue;
            }

            RegistrationField::updateOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'event_id' => null,
                    'key' => Str::snake(Str::ascii($row['label'] ?? "field_{$id}")),
                ],
                [
                    'label' => $row['label'] ?? 'Field',
                    'type' => $this->fieldType($row['type'] ?? 'text'),
                    'required' => (bool) ($row['required'] ?? false),
                    'step' => (int) ($row['step'] ?? 1),
                    'sort_order' => (int) ($row['order'] ?? 0),
                    'placeholder' => $row['placeholder'] ?? null,
                    'options' => $row['options'] ?? null,
                    'enabled' => (bool) ($row['enabled'] ?? true),
                ]
            );

            $this->bump('registration_fields');
        }
    }

    protected function importGuests(string $path): void
    {
        foreach ($this->read($path, 'guests') as $id => $row) {
            $tenantId = $this->tenantMap[$row['_tenantId'] ?? ''] ?? null;
            $eventId = $this->eventMap[$row['eventId'] ?? ''] ?? null;

            if (! $tenantId || ! $eventId) {
                continue;
            }

            $email = strtolower(trim($row['email'] ?? ''));

            if ($email === '') {
                // Guests without an email cannot be de-duplicated; synthesise one
                // so the unique index holds and the record is still migrated.
                $email = "legacy-{$id}@no-email.invalid";
            }

            Attendee::updateOrCreate(
                ['event_id' => $eventId, 'email' => $email],
                [
                    'tenant_id' => $tenantId,
                    'legacy_id' => $id,
                    'first_name' => $row['firstName'] ?? ($row['name'] ?? 'Guest'),
                    'last_name' => $row['lastName'] ?? '',
                    'phone' => $row['phone'] ?? null,
                    'company' => $row['companyOrIndividual'] ?? null,
                    'category' => $row['guestCategory'] ?? ($row['ticketType'] ?? 'General'),
                    'status' => match ($row['status'] ?? 'pending') {
                        'checked-in' => 'checked_in',
                        'no-show' => 'no_show',
                        default => 'registered',
                    },
                    'amount_paid' => (float) ($row['amountPaid'] ?? 0),
                    'registered_at' => $this->date($row['registeredAt'] ?? $row['createdAt'] ?? null),
                    'checked_in_at' => $this->date($row['checkedInAt'] ?? null),
                    'custom_fields' => $row['customFields'] ?? null,
                ]
            );

            $this->bump('guests');
        }
    }

    protected function importTickets(string $path): void
    {
        foreach ($this->read($path, 'tickets') as $id => $row) {
            $eventId = $this->eventMap[$row['eventId'] ?? ''] ?? null;
            $tenantId = $this->tenantMap[$row['tenantId'] ?? ''] ?? null;

            if (! $eventId || ! $tenantId) {
                continue;
            }

            $attendee = Attendee::where('event_id', $eventId)
                ->where('email', strtolower($row['buyerEmail'] ?? ''))
                ->first();

            Ticket::updateOrCreate(
                ['legacy_id' => $id],
                [
                    'tenant_id' => $tenantId,
                    'event_id' => $eventId,
                    'attendee_id' => $attendee?->id,
                    // The Firestore doc id was the order reference.
                    'code' => 'TK-'.strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $id), 0, 12)),
                    'holder_name' => $row['buyerName'] ?? null,
                    'holder_email' => strtolower($row['buyerEmail'] ?? '') ?: null,
                    'price_paid' => (float) ($row['amount'] ?? 0),
                    'status' => ($row['status'] ?? '') === 'COMPLETED' ? 'valid' : 'void',
                    'created_at' => $this->date($row['createdAt'] ?? null),
                ]
            );

            $this->bump('tickets');
        }
    }

    protected function importPromoCodes(string $path): void
    {
        foreach ($this->read($path, 'promo_codes') as $id => $row) {
            $tenantId = $this->tenantMap[$row['_tenantId'] ?? ''] ?? null;

            if (! $tenantId) {
                continue;
            }

            PromoCode::updateOrCreate(
                ['tenant_id' => $tenantId, 'code' => strtoupper($row['code'] ?? $id)],
                [
                    'discount_type' => $row['discountType'] ?? 'percent',
                    'discount_value' => (float) ($row['discountValue'] ?? 0),
                    'max_uses' => (int) ($row['maxUses'] ?? 0),
                    'used_count' => (int) ($row['usedCount'] ?? 0),
                    'expires_at' => $this->date($row['expiresAt'] ?? null),
                    'active' => (bool) ($row['active'] ?? true),
                ]
            );

            $this->bump('promo_codes');
        }
    }

    protected function importCampaigns(string $path): void
    {
        foreach ($this->read($path, 'campaigns') as $id => $row) {
            $tenantId = $this->tenantMap[$row['_tenantId'] ?? ''] ?? null;

            if (! $tenantId) {
                continue;
            }

            Campaign::updateOrCreate(
                ['legacy_id' => $id],
                [
                    'tenant_id' => $tenantId,
                    'name' => $row['name'] ?? 'Campaign',
                    'channel' => $row['type'] ?? 'sms',
                    // Historic campaigns are imported as already-sent so the
                    // scheduler never re-fires them.
                    'status' => in_array($row['status'] ?? '', ['sent', 'sending'], true) ? 'sent' : 'draft',
                    'subject' => $row['subject'] ?? null,
                    'body' => $row['message'] ?? '',
                    'image_path' => $row['imageUrl'] ?? null,
                    'audience_label' => $row['audience'] ?? null,
                    'sent_count' => (int) ($row['sent'] ?? 0),
                    'delivered_count' => (int) ($row['delivered'] ?? 0),
                    'completed_at' => $this->date($row['sentAt'] ?? null),
                ]
            );

            $this->bump('campaigns');
        }
    }

    protected function importSpeakers(string $path): void
    {
        foreach ($this->read($path, 'speakers') as $id => $row) {
            $eventId = $this->eventMap[$row['_eventId'] ?? ''] ?? null;
            $tenantId = $this->tenantMap[$row['_tenantId'] ?? ''] ?? null;

            if (! $eventId || ! $tenantId) {
                continue;
            }

            Speaker::updateOrCreate(
                ['legacy_id' => $id],
                [
                    'tenant_id' => $tenantId,
                    'event_id' => $eventId,
                    'name' => $row['name'] ?? 'Speaker',
                    'bio' => $row['bio'] ?? null,
                    'photo_path' => $row['photoUrl'] ?? null,
                    'twitter' => $row['twitter'] ?? null,
                    'linkedin' => $row['linkedin'] ?? null,
                    'website' => $row['website'] ?? null,
                ]
            );

            $this->bump('speakers');
        }
    }

    protected function importSessions(string $path): void
    {
        foreach ($this->read($path, 'sessions') as $id => $row) {
            $eventId = $this->eventMap[$row['_eventId'] ?? ''] ?? null;

            if (! $eventId) {
                continue;
            }

            $session = EventSession::updateOrCreate(
                ['legacy_id' => $id],
                [
                    'event_id' => $eventId,
                    'title' => $row['title'] ?? 'Session',
                    'description' => $row['description'] ?? null,
                    'room_label' => $row['room'] ?? null,
                    'starts_at' => $this->date($row['startTime'] ?? null) ?? now(),
                    'ends_at' => $this->date($row['endTime'] ?? null) ?? now()->addHour(),
                    'sort_order' => (int) ($row['order'] ?? 0),
                ]
            );

            $speakerIds = Speaker::whereIn('legacy_id', $row['speakerIds'] ?? [])->pluck('id');

            if ($speakerIds->isNotEmpty()) {
                $session->speakers()->sync($speakerIds);
            }

            $this->bump('sessions');
        }
    }

    protected function importBlogPosts(string $path): void
    {
        foreach ($this->read($path, 'blog_posts') as $id => $row) {
            BlogPost::updateOrCreate(
                ['legacy_id' => $id],
                [
                    'title' => $row['title'] ?? 'Untitled',
                    'slug' => $this->slug($row['title'] ?? 'post', BlogPost::class),
                    'excerpt' => $row['excerpt'] ?? null,
                    'body' => $row['body'] ?? ($row['content'] ?? ''),
                    'cover_image_path' => $row['coverImage'] ?? null,
                    'tags' => $row['tags'] ?? null,
                    'published' => (bool) ($row['published'] ?? false),
                    'published_at' => $this->date($row['publishedAt'] ?? $row['createdAt'] ?? null),
                ]
            );

            $this->bump('blog_posts');
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** @return array<string,array> */
    protected function read(string $path, string $collection): array
    {
        $file = "{$path}/{$collection}.json";

        if (! is_file($file)) {
            $this->line("  <fg=gray>no {$collection}.json — skipping</>");

            return [];
        }

        $decoded = json_decode((string) file_get_contents($file), true);

        if (! is_array($decoded)) {
            $this->warn("  {$collection}.json is not valid JSON — skipping");

            return [];
        }

        $this->line("  reading {$collection} (".count($decoded).' documents)');

        return $decoded;
    }

    /** Firestore timestamps export either as ISO strings or {_seconds,…}. */
    protected function date(mixed $value): ?Carbon
    {
        if (empty($value)) {
            return null;
        }

        try {
            if (is_array($value) && isset($value['_seconds'])) {
                return Carbon::createFromTimestamp($value['_seconds']);
            }

            if (is_numeric($value)) {
                return Carbon::createFromTimestamp((int) $value);
            }

            return Carbon::parse((string) $value);
        } catch (\Throwable) {
            return null;
        }
    }

    protected function fieldType(string $type): string
    {
        return in_array($type, [
            'text', 'email', 'phone', 'number', 'date',
            'select', 'multiselect', 'checkbox', 'textarea', 'file',
        ], true) ? $type : 'text';
    }

    /** @param class-string $model */
    protected function slug(string $value, string $model): string
    {
        $base = Str::slug($value) ?: 'item';
        $slug = $base;
        $n = 1;

        while ($model::withoutGlobalScope('tenant')->where('slug', $slug)->exists()) {
            $slug = $base.'-'.(++$n);
        }

        return $slug;
    }

    protected function bump(string $key): void
    {
        $this->counts[$key] = ($this->counts[$key] ?? 0) + 1;
    }
}
