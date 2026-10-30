<?php

namespace App\Support;

use App\Models\Order;
use App\Models\Payout;
use App\Models\Tenant;
use App\Services\Notify\Telegram;
use App\Services\Payments\MpesaGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;

/**
 * The ops digest posted to Telegram twice a day and on /status: how the box
 * is doing, whether the services Tikooh depends on are up, and the money
 * side of the last 24 hours. Every probe is best-effort — a missing number
 * says "?" rather than breaking the report.
 */
class ServerReport
{
    /** Services this app needs; checked with `systemctl is-active`. */
    protected const SERVICES = ['nginx', 'php8.3-fpm', 'mysql', 'tikooh-queue'];

    public static function build(): string
    {
        $e = [Telegram::class, 'e'];
        $since = now()->subDay();

        return TenantContext::withoutScoping(function () use ($e, $since) {
            $paid = Order::where('status', 'paid')->where('paid_at', '>=', $since);
            $requested = Payout::where('status', 'requested');
            $lock = MpesaGateway::initiatorLock();
            $errors = static::errorsToday();
            $cert = static::certDaysLeft();

            $lines = [
                '🖥 <b>Tikooh server report</b> — '.now('Africa/Nairobi')->format('D j M, H:i'),
                '',
                '<b>Server</b> '.$e(gethostname() ?: '?').' · up '.static::uptime(),
                'Load '.static::load(),
                'Memory '.static::memory(),
                'Disk '.static::disk(),
                'Services '.static::services(),
                'HTTPS cert '.($cert === null ? '?' : ($cert < 14 ? "⚠️ {$cert} days left" : "{$cert} days left")),
                '',
                '<b>App (last 24h)</b>',
                'Paid orders '.number_format((clone $paid)->count()).' · KES '.number_format((float) (clone $paid)->sum('total')),
                'New organisers '.Tenant::where('created_at', '>=', $since)->whereNull('legacy_id')->count(),
                'Queue '.DB::table('jobs')->count().' waiting · '.DB::table('failed_jobs')->count().' failed',
                'Errors logged today '.($errors === null ? '?' : ($errors > 0 ? "⚠️ {$errors}" : '0')),
                '',
                '<b>Payouts</b>',
                'Waiting '.(clone $requested)->count().' · KES '.number_format((float) (clone $requested)->sum('net_amount'))
                    .((clone $requested)->where('due_at', '<=', now())->exists() ? ' · 🚨 some overdue' : ''),
                'B2C '.($lock ? '⏸ paused ('.$e($lock['result_code'] ?? '?').')' : '✅ live'),
            ];

            return implode("\n", $lines);
        });
    }

    /** Waiting payouts, oldest due first — for /payouts. */
    public static function payouts(): string
    {
        return TenantContext::withoutScoping(function () {
            $rows = Payout::with('tenant:id,organization_name')
                ->whereIn('status', ['requested', 'processing'])
                ->orderBy('due_at')->limit(20)->get();

            if ($rows->isEmpty()) {
                return '💸 No payouts waiting.';
            }

            return "💸 <b>Payout queue</b> — KES ".number_format((float) $rows->sum('net_amount'))."\n"
                .$rows->map(fn (Payout $p) => '• #'.$p->id.' '.Telegram::e($p->tenant?->organization_name)
                    .' — KES '.number_format((float) $p->net_amount).' · '.$p->status
                    .($p->due_at ? ' · due '.$p->due_at->timezone('Africa/Nairobi')->format('D H:i').($p->due_at->isPast() ? ' 🚨' : '') : ''))
                    ->implode("\n");
        });
    }

    protected static function uptime(): string
    {
        $s = (int) (float) (@file_get_contents('/proc/uptime') ?: 0);

        return $s ? intdiv($s, 86400).'d '.intdiv($s % 86400, 3600).'h' : '?';
    }

    protected static function load(): string
    {
        $l = function_exists('sys_getloadavg') ? sys_getloadavg() : false;
        $cpus = (int) (@shell_exec('nproc') ?: 0);

        if (! $l) {
            return '?';
        }

        $warn = $cpus && $l[0] > $cpus ? ' ⚠️' : '';

        return sprintf('%.2f / %.2f / %.2f', ...$l).($cpus ? " on {$cpus} CPUs" : '').$warn;
    }

    protected static function memory(): string
    {
        $info = @file_get_contents('/proc/meminfo');
        if (! $info || ! preg_match('/MemTotal:\s+(\d+)/', $info, $t) || ! preg_match('/MemAvailable:\s+(\d+)/', $info, $a)) {
            return '?';
        }

        $used = 1 - $a[1] / $t[1];

        return sprintf('%.1f / %.1f GB (%d%%)', ($t[1] - $a[1]) / 1048576, $t[1] / 1048576, $used * 100).($used > 0.9 ? ' ⚠️' : '');
    }

    protected static function disk(): string
    {
        $free = @disk_free_space('/');
        $total = @disk_total_space('/');

        if (! $free || ! $total) {
            return '?';
        }

        $used = 1 - $free / $total;

        return sprintf('%d%% used · %.0f GB free', $used * 100, $free / 1073741824).($used > 0.9 ? ' ⚠️' : '');
    }

    protected static function services(): string
    {
        return collect(self::SERVICES)->map(function (string $s) {
            $state = trim((string) Process::timeout(5)->run(['systemctl', 'is-active', $s])->output());

            return ($state === 'active' ? '✅' : '❌').' '.$s;
        })->implode('  ');
    }

    /** Days until our own HTTPS certificate expires, read off a TLS handshake. */
    protected static function certDaysLeft(): ?int
    {
        $host = parse_url((string) config('app.url'), PHP_URL_HOST);
        if (! $host) {
            return null;
        }

        $ctx = stream_context_create(['ssl' => ['capture_peer_cert' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
        $conn = @stream_socket_client("ssl://{$host}:443", $errno, $err, 5, STREAM_CLIENT_CONNECT, $ctx);
        $cert = $conn ? stream_context_get_params($conn)['options']['ssl']['peer_certificate'] ?? null : null;
        $info = $cert ? openssl_x509_parse($cert) : null;

        return isset($info['validTo_time_t']) ? (int) floor(($info['validTo_time_t'] - time()) / 86400) : null;
    }

    protected static function errorsToday(): ?int
    {
        $file = storage_path('logs/laravel-'.now()->format('Y-m-d').'.log');

        if (! is_file($file)) {
            return is_dir(storage_path('logs')) ? 0 : null;
        }

        return substr_count((string) file_get_contents($file), '.ERROR:');
    }
}
