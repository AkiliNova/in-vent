<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PromoCode extends Model
{
    use BelongsToTenant, HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'discount_value' => 'decimal:2',
            'min_order_amount' => 'decimal:2',
            'starts_at' => 'datetime',
            'expires_at' => 'datetime',
            'active' => 'boolean',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    /**
     * @return array{valid: bool, reason: string|null}
     */
    public function validateFor(Event $event, float $orderAmount, ?string $buyerEmail = null): array
    {
        if (! $this->active) {
            return ['valid' => false, 'reason' => 'This code is no longer active.'];
        }

        if ($this->event_id !== null && $this->event_id !== $event->id) {
            return ['valid' => false, 'reason' => 'This code is not valid for this event.'];
        }

        if ($this->starts_at !== null && $this->starts_at->isFuture()) {
            return ['valid' => false, 'reason' => 'This code is not active yet.'];
        }

        if ($this->expires_at !== null && $this->expires_at->isPast()) {
            return ['valid' => false, 'reason' => 'This code has expired.'];
        }

        if ($this->max_uses > 0 && $this->used_count >= $this->max_uses) {
            return ['valid' => false, 'reason' => 'This code has reached its usage limit.'];
        }

        if ($orderAmount < (float) $this->min_order_amount) {
            return ['valid' => false, 'reason' => 'Order total is below the minimum for this code.'];
        }

        if ($buyerEmail !== null && $this->max_uses_per_email > 0) {
            $used = $this->orders()
                ->where('buyer_email', $buyerEmail)
                ->where('status', 'paid')
                ->count();

            if ($used >= $this->max_uses_per_email) {
                return ['valid' => false, 'reason' => 'You have already used this code.'];
            }
        }

        return ['valid' => true, 'reason' => null];
    }

    public function discountFor(float $amount): float
    {
        $discount = $this->discount_type === 'percent'
            ? $amount * ((float) $this->discount_value / 100)
            : (float) $this->discount_value;

        return round(min($discount, $amount), 2);
    }
}
