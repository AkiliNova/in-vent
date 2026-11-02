<?php

namespace App\Support;

use App\Models\PlatformSetting;
use Illuminate\Support\Facades\Log;

/**
 * Admin-editable settings layered over config/.env.
 *
 * Every setting is a config path. At boot the saved rows are written into
 * config(), so the rest of the app keeps reading config('...') and never needs
 * to know where a value came from. A setting with no saved row falls back to
 * whatever .env / config says, so deploying this changes nothing until an
 * admin saves something.
 */
class PlatformSettings
{
    /** Config values as they were before saved settings were applied. */
    protected static array $baseline = [];

    protected static array $saved = [];

    /**
     * The settings the admin screen shows, grouped. Only keys listed here can
     * be saved — this is the allowlist.
     */
    public static function groups(): array
    {
        return [
            'platform' => [
                'title' => 'Platform',
                'description' => 'Fees and payout rules for every organiser (an organiser\'s own fee, if set, still wins).',
                'fields' => [
                    ['key' => 'tikooh.platform_fee_percent', 'label' => 'Platform fee (%)', 'type' => 'number', 'min' => 0, 'max' => 50, 'help' => 'Taken from each online ticket sale.'],
                    ['key' => 'tikooh.min_withdrawal', 'label' => 'Minimum withdrawal (KES)', 'type' => 'number', 'min' => 10],
                    ['key' => 'tikooh.max_withdrawal', 'label' => 'Maximum withdrawal (KES)', 'type' => 'number', 'min' => 10],
                    ['key' => 'tikooh.payout_hours', 'label' => 'Payout promise (hours)', 'type' => 'number', 'min' => 1, 'max' => 168, 'help' => 'Shown to organisers when they withdraw.'],
                    ['key' => 'tikooh.paybill', 'label' => 'Paybill shown at checkout', 'type' => 'text', 'help' => 'Leave empty to hide the "pay via paybill" option.'],
                ],
            ],
            'sms' => [
                'title' => 'SMS',
                'description' => 'Ticket confirmations and SMS campaigns.',
                'fields' => [
                    ['key' => 'services.sms.provider', 'label' => 'Provider', 'type' => 'select', 'options' => ['advanta' => 'Advanta', 'africastalking' => 'Africa\'s Talking'], 'default' => 'advanta'],
                    ['key' => 'services.sms.cost_per_segment', 'label' => 'Cost per SMS part (KES)', 'type' => 'number', 'min' => 0, 'help' => 'Used for campaign cost estimates.'],
                    ['key' => 'services.africastalking.username', 'label' => 'Africa\'s Talking username', 'type' => 'text', 'provider' => 'africastalking', 'help' => 'Use "sandbox" with a sandbox API key to test without sending.'],
                    ['key' => 'services.africastalking.api_key', 'label' => 'Africa\'s Talking API key', 'type' => 'secret', 'provider' => 'africastalking'],
                    ['key' => 'services.africastalking.sender_id', 'label' => 'Sender ID', 'type' => 'text', 'provider' => 'africastalking', 'help' => 'Your approved alphanumeric sender (e.g. TIKOOH). Empty = AT\'s shared shortcode.'],
                    ['key' => 'services.africastalking.sandbox', 'label' => 'Sandbox mode', 'type' => 'bool', 'provider' => 'africastalking'],
                    ['key' => 'services.advanta.partner_id', 'label' => 'Advanta partner ID', 'type' => 'text', 'provider' => 'advanta'],
                    ['key' => 'services.advanta.api_key', 'label' => 'Advanta API key', 'type' => 'secret', 'provider' => 'advanta'],
                    ['key' => 'services.advanta.shortcode', 'label' => 'Advanta sender ID', 'type' => 'text', 'provider' => 'advanta'],
                ],
            ],
            'email' => [
                'title' => 'Email',
                'description' => 'Outgoing mail (ticket confirmations, campaigns).',
                'fields' => [
                    ['key' => 'mail.default', 'label' => 'Sending', 'type' => 'select', 'options' => ['smtp' => 'On (SMTP)', 'log' => 'Off (write to log only)']],
                    ['key' => 'mail.from.address', 'label' => 'From address', 'type' => 'email'],
                    ['key' => 'mail.from.name', 'label' => 'From name', 'type' => 'text'],
                    ['key' => 'mail.mailers.smtp.host', 'label' => 'SMTP host', 'type' => 'text'],
                    ['key' => 'mail.mailers.smtp.port', 'label' => 'SMTP port', 'type' => 'number', 'min' => 1, 'max' => 65535],
                    ['key' => 'mail.mailers.smtp.username', 'label' => 'SMTP username', 'type' => 'text'],
                    ['key' => 'mail.mailers.smtp.password', 'label' => 'SMTP password / API key', 'type' => 'secret'],
                    ['key' => 'mail.mailers.smtp.scheme', 'label' => 'Security', 'type' => 'select', 'options' => ['smtp' => 'STARTTLS (port 587)', 'smtps' => 'SSL/TLS (port 465)']],
                ],
            ],
            'mpesa' => [
                'title' => 'M-Pesa',
                'description' => 'Live payments. A wrong value stops checkout or payouts immediately. Change only with values from the Safaricom Daraja portal.',
                'danger' => true,
                'fields' => [
                    ['key' => 'services.mpesa.sandbox', 'label' => 'Sandbox mode', 'type' => 'bool'],
                    ['key' => 'services.mpesa.shortcode', 'label' => 'Paybill / till (STK)', 'type' => 'text'],
                    ['key' => 'services.mpesa.passkey', 'label' => 'STK passkey', 'type' => 'secret'],
                    ['key' => 'services.mpesa.consumer_key', 'label' => 'Consumer key', 'type' => 'secret'],
                    ['key' => 'services.mpesa.consumer_secret', 'label' => 'Consumer secret', 'type' => 'secret'],
                    ['key' => 'services.mpesa.b2c.shortcode', 'label' => 'B2C shortcode (payouts)', 'type' => 'text'],
                    ['key' => 'services.mpesa.b2c.initiator', 'label' => 'B2C initiator name', 'type' => 'text'],
                    ['key' => 'services.mpesa.b2c.initiator_password', 'label' => 'B2C initiator password', 'type' => 'secret'],
                    ['key' => 'services.mpesa.b2c.consumer_key', 'label' => 'B2C consumer key', 'type' => 'secret'],
                    ['key' => 'services.mpesa.b2c.consumer_secret', 'label' => 'B2C consumer secret', 'type' => 'secret'],
                ],
            ],
            'telegram' => [
                'title' => 'Telegram alerts',
                'description' => 'Ops reports and payout reminders. Create a bot with @BotFather.',
                'fields' => [
                    ['key' => 'services.telegram.bot_token', 'label' => 'Bot token', 'type' => 'secret'],
                    ['key' => 'services.telegram.chat_id', 'label' => 'Chat ID', 'type' => 'text', 'help' => 'The ops group (usually starts with -100).'],
                ],
            ],
            'templates' => [
                'title' => 'Templates',
                'description' => 'Wording of the messages buyers receive. Placeholders: {first_name}, {event}, {count}, {link}.',
                'fields' => [
                    ['key' => 'tikooh.templates.ticket_subject', 'label' => 'Ticket email: subject', 'type' => 'text',
                        'default' => '🎟️ You\'re in — {event}'],
                    ['key' => 'tikooh.templates.ticket_intro', 'label' => 'Ticket email: opening paragraph', 'type' => 'textarea',
                        'default' => 'Hi {first_name}, you\'re booked! Keep this email handy. The QR code below is your way through the door.'],
                    ['key' => 'tikooh.templates.ticket_signoff', 'label' => 'Ticket email: sign-off', 'type' => 'text', 'default' => 'See you there,'],
                    ['key' => 'tikooh.templates.ticket_sms', 'label' => 'Ticket SMS', 'type' => 'textarea',
                        'default' => 'Tikooh: {count} ticket(s) for {event} confirmed. Show the QR at the gate: {link}'],
                ],
            ],
        ];
    }

    /** @return array<string, array> key => field definition */
    public static function fields(): array
    {
        $out = [];

        foreach (self::groups() as $group => $def) {
            foreach ($def['fields'] as $field) {
                $out[$field['key']] = $field + ['group' => $group];
            }
        }

        return $out;
    }

    /**
     * Writes saved rows over config. Runs at boot for every request and every
     * queue worker; a missing table (before migrate) is not an error.
     */
    public static function apply(): void
    {
        $fields = self::fields();

        // Capture .env/config once; re-applying (after a save) starts from it
        // again so a reset setting really falls back.
        if (self::$baseline === []) {
            foreach ($fields as $key => $_) {
                self::$baseline[$key] = config($key);
            }
        }

        foreach ($fields as $key => $field) {
            $base = self::$baseline[$key];
            config([$key => ($base === null || $base === '') && array_key_exists('default', $field) ? $field['default'] : $base]);
        }

        try {
            self::$saved = PlatformSetting::query()->whereIn('key', array_keys($fields))->get()
                ->mapWithKeys(fn ($row) => [$row->key => $row->value])
                ->all();
        } catch (\Throwable $e) {
            // Table not migrated yet, or the database is down — run on .env.
            if (! str_contains($e->getMessage(), 'platform_settings')) {
                Log::warning('Platform settings not loaded', ['error' => $e->getMessage()]);
            }
            self::$saved = [];

            return;
        }

        foreach (self::$saved as $key => $value) {
            if ($value !== null && $value !== '') {
                config([$key => $value]);
            }
        }
    }

    /** What the admin screen shows. Secret values never leave the server. */
    public static function describe(): array
    {
        $fields = self::fields();
        $groups = [];

        foreach (self::groups() as $id => $group) {
            $group['id'] = $id;
            $group['fields'] = array_map(function ($field) use ($fields) {
                $key = $field['key'];
                $value = config($key);
                $base = self::$baseline[$key] ?? null;

                if (array_key_exists($key, self::$saved)) {
                    $source = 'saved';
                } elseif ($base !== null && $base !== '') {
                    $source = 'server';
                } else {
                    $source = array_key_exists('default', $fields[$key]) ? 'default' : 'unset';
                }

                if ($field['type'] === 'secret') {
                    $str = (string) $value;
                    $field['is_set'] = $str !== '';
                    $field['hint'] = $str !== '' ? '••••'.substr($str, -4) : null;
                    $field['value'] = null;
                } else {
                    $field['value'] = $value;
                }

                $field['source'] = $source;

                return $field;
            }, $group['fields']);
            $groups[] = $group;
        }

        return $groups;
    }

    /**
     * @param  array<string, mixed>  $values  key => new value. Secrets left empty are kept.
     * @param  array<int, string>  $reset  keys to drop back to the server/.env value
     */
    public static function save(array $values, array $reset, ?int $userId): void
    {
        $fields = self::fields();

        foreach ($reset as $key) {
            if (isset($fields[$key])) {
                PlatformSetting::where('key', $key)->delete();
            }
        }

        foreach ($values as $key => $value) {
            $field = $fields[$key] ?? null;

            if (! $field || in_array($key, $reset, true)) {
                continue;
            }

            if ($field['type'] === 'secret' && ($value === null || $value === '')) {
                continue;
            }

            PlatformSetting::updateOrCreate(['key' => $key], [
                'value' => self::cast($field, $value),
                'updated_by' => $userId,
            ]);
        }
    }

    public static function cast(array $field, mixed $value): mixed
    {
        return match ($field['type']) {
            'number' => is_numeric($value) ? $value + 0 : null,
            'bool' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            default => $value === null ? null : trim((string) $value),
        };
    }
}
