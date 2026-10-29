<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Ticket extends Model
{
    use BelongsToTenant, HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'price_paid' => 'decimal:2',
            'checked_in_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Ticket $ticket) {
            if (empty($ticket->code)) {
                $ticket->code = static::generateCode();
            }
        });
    }

    /**
     * Scanner-friendly code: uppercase, unambiguous alphabet, grouped. This is
     * what the QR encodes and what an NFC tag maps to.
     */
    public static function generateCode(): string
    {
        do {
            $raw = strtoupper(Str::random(12));
            $raw = str_replace(['0', 'O', '1', 'I'], ['2', '3', '4', '5'], $raw);
            $code = 'TK-'.substr($raw, 0, 4).'-'.substr($raw, 4, 4).'-'.substr($raw, 8, 4);
        } while (static::withoutGlobalScope('tenant')->where('code', $code)->exists());

        return $code;
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function ticketTier(): BelongsTo
    {
        return $this->belongsTo(TicketTier::class);
    }

    public function attendee(): BelongsTo
    {
        return $this->belongsTo(Attendee::class);
    }

    public function isValid(): bool
    {
        return $this->status === 'valid';
    }
}
