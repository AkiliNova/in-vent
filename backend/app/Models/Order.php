<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Order extends Model
{
    use BelongsToTenant, HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'subtotal' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'fee_amount' => 'decimal:2',
            'total' => 'decimal:2',
            'metadata' => 'array',
            'paid_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Order $order) {
            if (empty($order->reference)) {
                $order->reference = 'TKH-'.now()->format('ymd').'-'.strtoupper(Str::random(8));
            }

            if (empty($order->pay_code)) {
                $order->pay_code = static::newPayCode();
            }
        });
    }

    /**
     * Seven characters a buyer can read off a screen and type into the M-Pesa
     * menu as the paybill account number — no 0/O or 1/I to confuse.
     */
    public static function newPayCode(): string
    {
        $alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

        do {
            $code = 'T';
            for ($i = 0; $i < 6; $i++) {
                $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
        } while (static::withoutGlobalScope('tenant')->where('pay_code', $code)->exists());

        return $code;
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function promoCode(): BelongsTo
    {
        return $this->belongsTo(PromoCode::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }

    public function isPaid(): bool
    {
        return $this->status === 'paid';
    }

    public function totalQuantity(): int
    {
        return (int) $this->items()->sum('quantity');
    }
}
