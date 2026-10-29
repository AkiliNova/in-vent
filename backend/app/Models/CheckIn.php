<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tikooh features 6 and 15: one row per scan, accepted or not. */
class CheckIn extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'scanned_at' => 'datetime',
            'synced_offline' => 'boolean',
            'latitude' => 'float',
            'longitude' => 'float',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function attendee(): BelongsTo
    {
        return $this->belongsTo(Attendee::class);
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(EventSession::class, 'event_session_id');
    }

    public function point(): BelongsTo
    {
        return $this->belongsTo(CheckInPoint::class, 'check_in_point_id');
    }

    public function scanner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'scanned_by');
    }

    public function scopeAccepted(Builder $query): Builder
    {
        return $query->where('result', 'accepted');
    }

    public function scopeInbound(Builder $query): Builder
    {
        return $query->where('direction', 'in');
    }
}
