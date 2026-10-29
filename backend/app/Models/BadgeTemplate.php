<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class BadgeTemplate extends Model
{
    use BelongsToTenant, HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'elements' => 'array',
            'width_mm' => 'decimal:2',
            'height_mm' => 'decimal:2',
            'include_qr' => 'boolean',
            'include_nfc' => 'boolean',
            'is_default' => 'boolean',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function badges(): HasMany
    {
        return $this->hasMany(Badge::class);
    }

    /**
     * Picks the template for an attendee: an exact category match on the event
     * beats the event default, which beats the tenant-wide default.
     */
    public static function resolveFor(Attendee $attendee): ?self
    {
        return static::query()
            ->where(fn ($q) => $q->where('event_id', $attendee->event_id)->orWhereNull('event_id'))
            ->where(fn ($q) => $q->where('attendee_category', $attendee->category)->orWhereNull('attendee_category'))
            ->orderByRaw('CASE WHEN event_id IS NULL THEN 1 ELSE 0 END')
            ->orderByRaw('CASE WHEN attendee_category IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('is_default')
            ->first();
    }

    /** A minimal, valid element list used when a tenant has designed nothing yet. */
    public static function defaultElements(): array
    {
        return [
            ['type' => 'field', 'source' => 'event.title', 'x' => 5, 'y' => 8, 'width' => 90,
                'fontSize' => 10, 'align' => 'center', 'colour' => '#6B7280'],
            ['type' => 'field', 'source' => 'attendee.first_name', 'x' => 5, 'y' => 30, 'width' => 90,
                'fontSize' => 22, 'fontWeight' => 'bold', 'align' => 'center'],
            ['type' => 'field', 'source' => 'attendee.last_name', 'x' => 5, 'y' => 45, 'width' => 90,
                'fontSize' => 18, 'align' => 'center'],
            ['type' => 'field', 'source' => 'attendee.company', 'x' => 5, 'y' => 60, 'width' => 90,
                'fontSize' => 12, 'align' => 'center', 'colour' => '#4B5563'],
            ['type' => 'field', 'source' => 'attendee.category', 'x' => 25, 'y' => 72, 'width' => 50,
                'fontSize' => 11, 'align' => 'center', 'colour' => '#FFFFFF', 'background' => '#111827'],
            ['type' => 'qr', 'source' => 'ticket.code', 'x' => 32, 'y' => 90, 'size' => 36],
        ];
    }
}
