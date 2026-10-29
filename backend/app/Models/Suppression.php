<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/** Destinations that must never be messaged again for a tenant. */
class Suppression extends Model
{
    use BelongsToTenant, HasFactory;

    protected $table = 'suppression_list';

    protected $guarded = ['id'];

    public static function blocks(int $tenantId, string $channel, string $destination): bool
    {
        return static::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('channel', $channel)
            ->where('destination', $destination)
            ->exists();
    }
}
