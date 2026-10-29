<?php

namespace App\Models\Concerns;

use App\Models\Tenant;
use App\Support\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Constrains every query on the model to the tenant resolved for the current
 * request. This is the structural replacement for the old arrangement where the
 * tenant id came from localStorage and was trusted by the client.
 *
 * Platform staff (super_admin) run without a tenant in context, so the scope is
 * a no-op for them.
 */
trait BelongsToTenant
{
    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope('tenant', function (Builder $query) {
            $tenantId = TenantContext::id();

            if ($tenantId !== null) {
                $query->where($query->getModel()->qualifyColumn('tenant_id'), $tenantId);
            }
        });

        static::creating(function ($model) {
            if ($model->tenant_id === null) {
                $model->tenant_id = TenantContext::id();
            }
        });
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /** Escape hatch for platform-level reporting and the Firestore importer. */
    public function scopeAcrossTenants(Builder $query): Builder
    {
        return $query->withoutGlobalScope('tenant');
    }
}
