<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TicketTier extends Model
{
    use HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'sales_start_at' => 'datetime',
            'sales_end_at' => 'datetime',
            'is_active' => 'boolean',
            'is_hidden' => 'boolean',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }

    /** Capacity of 0 means uncapped. */
    public function remaining(): int
    {
        if ($this->capacity === 0) {
            return PHP_INT_MAX;
        }

        return max(0, $this->capacity - $this->sold - $this->reserved);
    }

    public function isOnSale(): bool
    {
        if (! $this->is_active || $this->remaining() <= 0) {
            return false;
        }

        $now = now();

        return ($this->sales_start_at === null || $this->sales_start_at <= $now)
            && ($this->sales_end_at === null || $this->sales_end_at >= $now);
    }
}
