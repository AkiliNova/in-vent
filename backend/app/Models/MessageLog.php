<?php

namespace App\Models;

use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

/** One outgoing email or SMS. Written by App\Listeners\LogSentEmail and the SMS clients. */
class MessageLog extends Model
{
    use MassPrunable;

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    /** Bodies are kept for a year; that covers any dispute about a ticket or payout. */
    public function prunable()
    {
        return static::where('created_at', '<', now()->subYear());
    }

    /** Logging must never break the send it describes. */
    public static function record(array $attributes): void
    {
        try {
            static::create($attributes + ['created_at' => now()]);
        } catch (\Throwable $e) {
            Log::warning('Message log write failed', ['error' => $e->getMessage()]);
        }
    }
}
