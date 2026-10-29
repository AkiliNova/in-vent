<?php

namespace App\Models\Concerns;

use Illuminate\Support\Str;

/**
 * Public-facing identifier. Internal keys stay auto-increment for join
 * performance; the uuid is what appears in URLs, QR payloads and API responses.
 */
trait HasUuid
{
    public static function bootHasUuid(): void
    {
        static::creating(function ($model) {
            if (empty($model->uuid)) {
                $model->uuid = (string) Str::uuid();
            }
        });
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }
}
