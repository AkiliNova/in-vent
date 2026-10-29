<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Points the paybill's C2B notifications at this app. Dry run unless
 * --confirm: registering replaces whatever URL the shortcode reports to now,
 * so a wrong APP_URL silently stops live payment notifications.
 */
Artisan::command('tikooh:register-c2b {--confirm}', function () {
    $token = config('services.mpesa.c2b_token');

    if (! $token) {
        $this->error('Set MPESA_C2B_TOKEN first (e.g. php -r "echo bin2hex(random_bytes(16));").');

        return 1;
    }

    $confirm = route('webhooks.daraja.c2b.confirm', ['token' => $token]);
    $validate = route('webhooks.daraja.c2b.validate', ['token' => $token]);

    $this->line(sprintf(
        'This will replace the registered C2B URLs for shortcode %s (%s) with:',
        config('services.mpesa.shortcode'),
        config('services.mpesa.sandbox') ? 'sandbox' : 'production'
    ));
    $this->line('  confirm:  '.preg_replace('#/c2b/[^/]+/#', '/c2b/<token>/', $confirm));
    $this->line('  validate: '.preg_replace('#/c2b/[^/]+/#', '/c2b/<token>/', $validate));

    if (! $this->option('confirm')) {
        $this->warn('Dry run. Re-run with --confirm to register.');

        return 1;
    }

    $result = (new \App\Services\Payments\MpesaGateway)->registerC2bUrls($confirm, $validate);
    $this->line(json_encode($result, JSON_PRETTY_PRINT));

    return ($result['ResponseCode'] ?? null) === '0' ? 0 : 1;
})->purpose('Register the C2B confirmation/validation URLs with Safaricom');

/*
 * B2C refuses to run after Safaricom rejects the initiator (2001/8006),
 * because retrying with a wrong password re-locks it. Clear only after the
 * operator password has been reset on the M-Pesa Org portal and updated in .env.
 */
Artisan::command('tikooh:b2c-unlock {--confirm}', function () {
    $lock = \App\Services\Payments\MpesaGateway::initiatorLock();

    if (! $lock) {
        $this->info('B2C is not locked.');

        return 0;
    }

    $this->line('Locked: '.json_encode($lock));

    if (! $this->option('confirm')) {
        $this->warn('Re-run with --confirm once the initiator password is fixed.');

        return 1;
    }

    \App\Services\Payments\MpesaGateway::clearInitiatorLock();
    $this->info('B2C unlocked.');

    return 0;
})->purpose('Clear the B2C initiator lock after fixing the password');

/*
 * Nudges the ops chat about withdrawal requests: once when one is close to
 * its due time (time to move money from the paybill to B2C), and once if it
 * passes the due time unpaid.
 */
Artisan::command('tikooh:payout-reminders', function () {
    $window = now()->addHours((int) config('tikooh.payout_reminder_hours'));

    \App\Support\TenantContext::withoutScoping(function () use ($window) {
        $line = fn (\App\Models\Payout $p) => '• #'.$p->id.' '.\App\Services\Notify\Telegram::e($p->tenant?->organization_name)
            .' — KES '.number_format((float) $p->net_amount)
            .' (due '.$p->due_at->timezone('Africa/Nairobi')->format('D H:i').')';

        $soon = \App\Models\Payout::with('tenant:id,organization_name')
            ->where('status', 'requested')->whereNull('reminded_at')
            ->where('due_at', '>', now())->where('due_at', '<=', $window)->get();

        if ($soon->isNotEmpty()) {
            \App\Services\Notify\Telegram::send(
                "⏰ <b>Merchants waiting — payouts due soon</b>\nTotal KES ".number_format((float) $soon->sum('net_amount'))."\n"
                .$soon->map($line)->implode("\n")
                ."\nMove the money from the paybill to B2C, then approve."
            );
            \App\Models\Payout::whereKey($soon->modelKeys())->update(['reminded_at' => now()]);
        }

        $late = \App\Models\Payout::with('tenant:id,organization_name')
            ->whereIn('status', ['requested', 'processing'])->whereNull('overdue_notified_at')
            ->where('due_at', '<=', now())->get();

        if ($late->isNotEmpty()) {
            \App\Services\Notify\Telegram::send(
                "🚨 <b>OVERDUE payouts</b> — merchants were promised this money\n"
                .$late->map($line)->implode("\n")
            );
            \App\Models\Payout::whereKey($late->modelKeys())->update(['overdue_notified_at' => now()]);
        }

        $this->info("reminded {$soon->count()}, overdue {$late->count()}");
    });
})->purpose('Telegram reminders for withdrawal requests nearing or past their due time');

/* Server health: stuck queue, new failed jobs, low disk. Alerts dedupe for an hour. */
Artisan::command('tikooh:health', function () {
    $problems = [];

    $oldest = \Illuminate\Support\Facades\DB::table('jobs')->whereNull('reserved_at')->min('available_at');
    if ($oldest && now()->timestamp - $oldest > 600) {
        $problems[] = 'Queue stuck: a job has waited '.round((now()->timestamp - $oldest) / 60).' min. Is tikooh-queue running?';
    }

    $failed = \Illuminate\Support\Facades\DB::table('failed_jobs')->count();
    $seen = (int) \Illuminate\Support\Facades\Cache::get('health:failed_jobs', $failed);
    if ($failed > $seen) {
        $problems[] = ($failed - $seen).' new failed job(s). Run: php artisan queue:failed';
    }
    \Illuminate\Support\Facades\Cache::forever('health:failed_jobs', $failed);

    $free = @disk_free_space(base_path());
    $total = @disk_total_space(base_path());
    if ($free && $total && $free / $total < 0.10) {
        $problems[] = 'Disk almost full: '.round(100 * $free / $total).'% free.';
    }

    foreach ($problems as $p) {
        \App\Services\Notify\Telegram::send('🩺 <b>Tikooh server</b>: '.\App\Services\Notify\Telegram::e($p), dedupeKey: 'health:'.$p, dedupeMinutes: 60);
    }

    $this->info($problems ? implode("\n", $problems) : 'healthy');
})->purpose('Check queue, failed jobs and disk; alert Telegram on problems');

Artisan::command('tikooh:telegram-test', function () {
    if (! \App\Services\Notify\Telegram::enabled()) {
        $this->error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID first.');

        return 1;
    }

    $ok = \App\Services\Notify\Telegram::send('👋 Tikooh alerts are connected ('.config('app.url').').');
    $ok ? $this->info('Sent.') : $this->error('Telegram refused it — check the token, and that the bot is in the chat.');

    return $ok ? 0 : 1;
})->purpose('Send a test message to the ops Telegram chat');

/* Promotes an existing account to platform admin (approves payouts). */
Artisan::command('tikooh:make-admin {email}', function (string $email) {
    $user = \App\Models\User::where('email', $email)->first();

    if (! $user) {
        $this->error('No account with that email. Sign up on the site first, then run this.');

        return 1;
    }

    $user->update(['role' => \App\Models\User::ROLE_SUPER_ADMIN]);
    $user->tokens()->delete(); // abilities are baked into tokens; force a fresh login
    $this->info("{$email} is now a platform admin. Sign in again.");

    return 0;
})->purpose('Make an existing user a platform admin');

\Illuminate\Support\Facades\Schedule::command('tikooh:payout-reminders')->everyFifteenMinutes()->withoutOverlapping();
\Illuminate\Support\Facades\Schedule::command('tikooh:health')->everyFiveMinutes()->withoutOverlapping();

/*
 * Imports events from the old Firestore project (public read) as Tikooh
 * events, so the platform's real history shows as past events. Re-runnable:
 * matches on the Firestore document id kept in `legacy_id`. Drafts skipped.
 *
 *   php artisan tikooh:import-legacy-events            # dry run
 *   php artisan tikooh:import-legacy-events --apply
 */
Artisan::command('tikooh:import-legacy-events {--project=in-vent-app} {--file= : runQuery JSON saved elsewhere (Google blocks some server IPs)} {--apply}', function () {
    if ($file = $this->option('file')) {
        $rows = json_decode((string) file_get_contents($file), true);
    } else {
        $res = \Illuminate\Support\Facades\Http::timeout(30)->post(
            'https://firestore.googleapis.com/v1/projects/'.$this->option('project').'/databases/(default)/documents:runQuery',
            ['structuredQuery' => ['from' => [['collectionId' => 'events', 'allDescendants' => true]], 'limit' => 1000]]
        );

        if (! $res->successful()) {
            $this->error("Firestore answered HTTP {$res->status()}. Fetch it from another machine and pass --file.");

            return 1;
        }

        $rows = $res->json();
    }

    $value = function ($f) use (&$value) {
        if (! is_array($f)) {
            return null;
        }
        $k = array_key_first($f);
        $x = $f[$k];

        return match ($k) {
            'arrayValue' => array_map($value, $x['values'] ?? []),
            'mapValue' => array_map($value, $x['fields'] ?? []),
            'integerValue' => (int) $x,
            'doubleValue' => (float) $x,
            'nullValue' => null,
            default => $x,
        };
    };

    $apply = (bool) $this->option('apply');
    $count = 0;

    \App\Support\TenantContext::withoutScoping(function () use ($rows, $value, $apply, &$count) {
        foreach ($rows ?? [] as $row) {
            if (empty($row['document'])) {
                continue;
            }

            preg_match('#tenants/([^/]+)/events/([^/]+)$#', $row['document']['name'], $m);
            [, $legacyTenant, $legacyEvent] = $m;
            $f = array_map($value, $row['document']['fields'] ?? []);

            if (($f['status'] ?? 'draft') !== 'published' || empty($f['title']) || empty($f['startDate'])) {
                $this->line("skip  {$legacyEvent} ".($f['title'] ?? '').' ('.($f['status'] ?? 'no status').')');
                continue;
            }

            $start = \Illuminate\Support\Carbon::parse($f['startDate'], 'Africa/Nairobi');
            $this->line(($apply ? 'save  ' : 'would ').$start->toDateString().'  '.$f['title']);
            $count++;

            if (! $apply) {
                continue;
            }

            $tenant = \App\Models\Tenant::withTrashed()->firstOrCreate(
                ['legacy_id' => $legacyTenant],
                [
                    'organization_name' => $f['host'] ?? 'Tikooh organiser',
                    'slug' => 'legacy-'.strtolower(substr($legacyTenant, 0, 10)),
                    'email' => 'legacy+'.strtolower(substr($legacyTenant, 0, 10)).'@tikooh.com',
                    'settings' => ['legacy' => true],
                ]
            );

            $event = \App\Models\Event::withTrashed()->firstOrNew(['legacy_id' => $legacyEvent]);
            $event->fill([
                'tenant_id' => $tenant->id,
                'title' => $f['title'],
                'slug' => $event->slug ?: \Illuminate\Support\Str::slug($f['title']).'-'.strtolower(substr($legacyEvent, 0, 6)),
                'description' => $f['description'] ?? null,
                'host' => $f['host'] ?? null,
                'event_type' => $f['eventType'] ?? null,
                'start_date' => $start,
                'end_date' => ! empty($f['endDate']) ? \Illuminate\Support\Carbon::parse($f['endDate'], 'Africa/Nairobi') : null,
                'location_name' => $f['locationName'] ?? ($f['location'] ?? null),
                'city' => $f['city'] ?? null,
                'location_map_link' => filter_var($f['locationMapLink'] ?? '', FILTER_VALIDATE_URL) ?: null,
                'status' => $start->isPast() ? 'ended' : 'published',
                'is_public' => true,
                'published_at' => $event->published_at ?? $start,
            ]);

            // Keep a local copy of the image so history survives the old host.
            $image = ($f['images'] ?? [])[0] ?? null;
            if ($image && ! $event->cover_image_path) {
                try {
                    $img = \Illuminate\Support\Facades\Http::timeout(20)->get($image);
                    $ext = str_contains((string) $img->header('Content-Type'), 'png') ? 'png' : 'jpg';
                    if ($img->successful() && str_starts_with((string) $img->header('Content-Type'), 'image/')) {
                        $path = "events/legacy/{$legacyEvent}.{$ext}";
                        \Illuminate\Support\Facades\Storage::disk('public')->put($path, $img->body());
                        $event->cover_image_path = $path;
                    } else {
                        $event->cover_image_path = $image;
                    }
                } catch (\Throwable) {
                    $event->cover_image_path = $image;
                }
            }

            $event->save();

            foreach ($f['ticketTiers'] ?? [] as $i => $t) {
                \App\Models\TicketTier::updateOrCreate(
                    ['event_id' => $event->id, 'name' => $t['name'] ?? 'General'],
                    [
                        'price' => (float) ($t['price'] ?? 0),
                        'capacity' => (int) ($t['capacity'] ?? 0),
                        'sold' => (int) ($t['sold'] ?? 0),
                        'is_active' => false, // history only — never on sale again
                        'sort_order' => $i,
                    ]
                );
            }
        }
    });

    $this->info(($apply ? 'Imported ' : 'Would import ')."{$count} event(s).".($apply ? '' : ' Re-run with --apply.'));
})->purpose('Import past events from the old Firestore project');
