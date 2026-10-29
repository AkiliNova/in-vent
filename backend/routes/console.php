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
