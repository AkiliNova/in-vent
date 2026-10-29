<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One line of an organiser's ledger. Rows are append-only — never edit one. */
class WalletEntry extends Model
{
    use BelongsToTenant;

    public const SALE = 'sale';

    public const PLATFORM_FEE = 'platform_fee';

    public const WITHDRAWAL = 'withdrawal';

    public const WITHDRAWAL_REVERSAL = 'withdrawal_reversal';

    public const ADJUSTMENT = 'adjustment';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2'];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function payout(): BelongsTo
    {
        return $this->belongsTo(Payout::class);
    }
}
