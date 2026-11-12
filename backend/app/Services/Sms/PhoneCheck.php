<?php

namespace App\Services\Sms;

use App\Models\SmsNumberFlag;
use Illuminate\Support\Facades\Log;

/**
 * Is this number worth paying to text?
 *
 *   ok          — a mobile number on a network we can reach
 *   invalid     — can't be a phone number (too short/long, junk)
 *   unsupported — a real number we can't text: a landline, or a country
 *                 outside services.sms.countries (default Kenya only)
 *   blocked     — the provider already rejected it for good (see flag())
 *
 * Kenyan numbers also get their network, so a campaign can show how its
 * audience splits across Safaricom, Airtel and Telkom.
 */
class PhoneCheck
{
    /** Africa's Talking per-recipient statuses that will fail again next time. */
    public const PERMANENT = [
        // Send-time statuses
        'InvalidPhoneNumber', 'UnsupportedNumberType', 'UserInBlacklist', 'DoNotDisturbRejection', 'CouldNotRoute',
        // Delivery-report failure reasons
        'UserInBlackList', 'UserDoesNotExist', 'NotNetworkSubcriber', 'NotNetworkSubscriber', 'UserAccountSuspended', 'DNDReject',
    ];

    /** Kenyan mobile prefixes after 254, longest match wins. */
    protected const KE_NETWORKS = [
        'Safaricom' => ['70', '71', '72', '740', '741', '742', '743', '745', '746', '748', '757', '758', '759', '768', '769', '79', '110', '111', '112', '113', '114', '115'],
        'Airtel' => ['73', '750', '751', '752', '753', '754', '755', '756', '762', '78', '100', '101', '102'],
        'Telkom' => ['77'],
        'Equitel' => ['763', '764', '765', '766'],
        'Faiba' => ['747'],
    ];

    /** @var array<string, string>|null number => provider reason, loaded once per request/job */
    protected static ?array $flags = null;

    protected static int $loadedAt = 0;

    /** @return array{number: ?string, status: 'ok'|'invalid'|'unsupported'|'blocked', network: ?string, reason: ?string} */
    public static function classify(string $raw): array
    {
        $digits = preg_replace('/\D+/', '', $raw) ?? '';

        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }

        if ($digits === '') {
            return self::result(null, 'invalid', null, 'No number');
        }

        $number = AdvantaSmsClient::normalise($digits);

        if (str_starts_with($number, '254')) {
            $local = substr($number, 3);

            if (strlen($local) !== 9) {
                return self::result($number, 'invalid', null, 'Wrong length: Kenyan mobiles are 10 digits (07… or 01…)');
            }

            if (! in_array($local[0], ['7', '1'], true)) {
                return self::result($number, 'unsupported', 'Landline', 'Landline: can\'t receive SMS');
            }

            $network = self::network($local);

            return ($reason = self::flagged($number))
                ? self::result($number, 'blocked', $network, self::describe($reason))
                : self::result($number, 'ok', $network, null);
        }

        if (strlen($number) < 8 || strlen($number) > 15) {
            return self::result($number, 'invalid', null, 'Not a valid phone number');
        }

        if (! self::countryAllowed($number)) {
            return self::result($number, 'unsupported', 'International', 'Outside the countries your SMS account sends to (+'.substr($number, 0, 3).'…)');
        }

        return ($reason = self::flagged($number))
            ? self::result($number, 'blocked', 'International', self::describe($reason))
            : self::result($number, 'ok', 'International', null);
    }

    /** Remember a permanent provider rejection so nobody pays for it again. */
    public static function flag(string $number, string $reason, string $provider = 'africastalking'): void
    {
        if (! in_array($reason, self::PERMANENT, true)) {
            return;
        }

        try {
            $flag = SmsNumberFlag::firstOrNew(['number' => $number]);
            $flag->fill([
                'reason' => $reason,
                'provider' => $provider,
                'failures' => ($flag->failures ?? 0) + 1,
                'last_failed_at' => now(),
            ])->save();

            if (self::$flags !== null) {
                self::$flags[$number] = $reason;
            }
        } catch (\Throwable $e) {
            Log::warning('Could not flag SMS number', ['error' => $e->getMessage()]);
        }
    }

    /** Forget cached flags (tests, long-running workers between campaigns). */
    public static function reset(): void
    {
        self::$flags = null;
    }

    protected static function flagged(string $number): ?string
    {
        // Flags are only permanently-dead numbers, so the table stays small:
        // one query, then in-memory lookups for the whole audience. Reloaded
        // every few minutes because queue workers live for days.
        if (self::$flags === null || time() - self::$loadedAt > 300) {
            self::$flags = SmsNumberFlag::query()->pluck('reason', 'number')->all();
            self::$loadedAt = time();
        }

        return self::$flags[$number] ?? null;
    }

    protected static function network(string $local): string
    {
        foreach ([3, 2] as $len) {
            $prefix = substr($local, 0, $len);

            foreach (self::KE_NETWORKS as $network => $prefixes) {
                if (in_array($prefix, $prefixes, true)) {
                    return $network;
                }
            }
        }

        return 'Other Kenyan';
    }

    protected static function countryAllowed(string $number): bool
    {
        $allowed = array_filter(array_map('trim', explode(',', (string) (config('services.sms.countries') ?: '254'))));

        foreach ($allowed as $code) {
            if ($code === '*' || str_starts_with($number, ltrim($code, '+'))) {
                return true;
            }
        }

        return false;
    }

    protected static function describe(string $reason): string
    {
        return match ($reason) {
            'InvalidPhoneNumber' => 'Rejected before: not a valid number',
            'UnsupportedNumberType' => 'Rejected before: number type can\'t receive SMS',
            'UserInBlacklist', 'UserInBlackList' => 'Blocked: the person has blocked promotional SMS',
            'DoNotDisturbRejection', 'DNDReject' => 'Blocked: number is on Do-Not-Disturb',
            'UserDoesNotExist' => 'Rejected before: number doesn\'t exist on the network',
            'NotNetworkSubcriber', 'NotNetworkSubscriber' => 'Rejected before: not an active subscriber',
            'UserAccountSuspended' => 'Rejected before: line is suspended',
            'CouldNotRoute' => 'Rejected before: network can\'t be reached',
            default => 'Rejected before: '.$reason,
        };
    }

    protected static function result(?string $number, string $status, ?string $network, ?string $reason): array
    {
        return compact('number', 'status', 'network', 'reason');
    }
}
