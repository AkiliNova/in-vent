<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Provider secrets. `credentials` is encrypted at rest and hidden from every
 * API response — nothing here is ever sent to a browser.
 */
class IntegrationCredential extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected $hidden = ['credentials'];

    protected function casts(): array
    {
        return [
            'credentials' => 'encrypted:array',
            'is_active' => 'boolean',
            'is_sandbox' => 'boolean',
            'verified_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /**
     * Tenant-specific credentials win; otherwise fall back to the platform-wide
     * row so a tenant that has not configured its own provider still works.
     */
    public static function resolve(string $provider, ?int $tenantId): ?self
    {
        return static::query()
            ->where('provider', $provider)
            ->where('is_active', true)
            ->where(fn ($q) => $q->where('tenant_id', $tenantId)->orWhereNull('tenant_id'))
            ->orderByRaw('CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END')
            ->first();
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return data_get($this->credentials, $key, $default);
    }
}
