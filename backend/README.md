# Tikooh backend

Laravel 12 API for the Tikooh event management platform. Replaces the Firestore
data model and the loose PHP scripts in `../php/`.

## Why this exists

The React app previously talked to Firestore directly and called unauthenticated
PHP scripts for payments and SMS. That arrangement had three structural problems
this backend fixes:

1. **Credentials reached the browser.** `sendSms.ts` fetched the Advanta API key
   from Firestore and posted it to the proxy, which trusted it from the request
   body. Provider secrets now live in `integration_credentials`, encrypted at
   rest, and are only ever read server-side.
2. **Tenancy was client-asserted.** The tenant id came from `localStorage`.
   It now comes from the authenticated user, enforced by a global query scope
   (`BelongsToTenant`) that every tenant-owned model carries.
3. **Aggregates were impractical.** Reporting, capacity enforcement and lead
   attribution all need joins. They are ordinary SQL here.

## Setup

```bash
composer install
cp .env.example .env
php artisan key:generate

# create the database, then:
php artisan migrate

# background work: campaign sends, badge PDFs
php artisan queue:work

# websockets: live polls, Q&A, chat, door feed
php artisan reverb:start
```

## Layout

| Path | What's in it |
|---|---|
| `database/migrations/2026_08_09_*` | 77 tables, grouped one migration per module |
| `app/Models` | Eloquent models; tenant-owned ones use `BelongsToTenant` |
| `app/Services` | Domain logic — orders, check-in, badges, polls, chatbot, providers |
| `app/Http/Controllers/Api` | 144 routes across all 15 Tikooh modules |
| `app/Events` | Reverb broadcasts (`ShouldBroadcastNow` — stage-latency matters) |
| `app/Jobs` | Queued campaign delivery and badge rendering |
| `routes/channels.php` | Channel authorisation — who may listen to what |

## Tenancy

`ResolveTenant` middleware sets `TenantContext` from the authenticated user.
`BelongsToTenant` adds a global scope so every query is filtered automatically.

Two escape hatches, both deliberate:

- `TenantContext::withoutScoping(fn () => …)` — public endpoints (a buyer has no
  tenant), the Firestore importer, and platform-wide reporting.
- `Model::withoutGlobalScope('tenant')` — targeted single-query bypass.

Anything else is scoped. `tests/Feature/TenantIsolationTest.php` covers this.

## Migrating from Firestore

```bash
# 1. Export the live database (needs a service-account key)
npm i firebase-admin
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
  node scripts/export-firestore.mjs ./firestore-export

# 2. Rehearse — runs inside a transaction and rolls back
php artisan tikooh:import-firestore ./firestore-export --dry-run

# 3. Apply
php artisan tikooh:import-firestore ./firestore-export
```

The importer matches on Firestore document ids (kept in `legacy_id`), so it is
safe to re-run to pick up writes that landed after the first pass.

**Migrated users have no password.** Their Firebase uid is recorded on
`users.firebase_uid` and `password` is null; `AuthController@login` detects this
and directs them to the reset flow.

## Tests

```bash
php artisan test        # 33 tests, SQLite in-memory
./vendor/bin/pint       # code style
```

Coverage is deliberately weighted to the parts where a bug costs money or leaks
data: tenant isolation, checkout and overselling, and check-in state transitions.

## Not yet wired

- Push notifications: `device_tokens` exists, no FCM/APNs sender yet.
- CRM sync: `leads.synced_to_crm` exists, no connector yet.
- Certificates: table and model exist, no renderer yet (badge renderer is the
  pattern to copy).
