<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Tenant extends Model
{
    use HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'settings' => 'array',
            'suspended' => 'boolean',
            'trial_ends_at' => 'datetime',
            'onboarded_at' => 'datetime',
            'platform_fee_percent' => 'decimal:2',
        ];
    }

    public function walletEntries(): HasMany
    {
        return $this->hasMany(WalletEntry::class);
    }

    public function feePercent(): float
    {
        return (float) ($this->platform_fee_percent ?? config('tikooh.platform_fee_percent'));
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(Event::class);
    }

    public function attendees(): HasMany
    {
        return $this->hasMany(Attendee::class);
    }

    public function campaigns(): HasMany
    {
        return $this->hasMany(Campaign::class);
    }

    public function promoCodes(): HasMany
    {
        return $this->hasMany(PromoCode::class);
    }

    public function payouts(): HasMany
    {
        return $this->hasMany(Payout::class);
    }

    public function integrationCredentials(): HasMany
    {
        return $this->hasMany(IntegrationCredential::class);
    }

    /** Feature flags, e.g. moduleEnabled('networking'). */
    public function moduleEnabled(string $module): bool
    {
        return (bool) data_get($this->settings, "modules.{$module}", true);
    }
}
