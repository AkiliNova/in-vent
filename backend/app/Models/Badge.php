<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/** Tikooh feature 11: a rendered, printable badge for one attendee. */
class Badge extends Model
{
    use HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'generated_at' => 'datetime',
            'printed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Badge $badge) {
            if (empty($badge->serial)) {
                $badge->serial = 'BDG-'.strtoupper(Str::random(10));
            }
        });
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function attendee(): BelongsTo
    {
        return $this->belongsTo(Attendee::class);
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(BadgeTemplate::class, 'badge_template_id');
    }

    public function nfcTag(): BelongsTo
    {
        return $this->belongsTo(NfcTag::class);
    }

    public function printedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'printed_by');
    }

    public function markPrinted(?User $user = null): void
    {
        $this->forceFill([
            'status' => $this->print_count > 0 ? 'reprinted' : 'printed',
            'print_count' => $this->print_count + 1,
            'printed_at' => now(),
            'printed_by' => $user?->id,
        ])->save();
    }
}
