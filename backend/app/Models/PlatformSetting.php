<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One admin-edited override of a config value. See App\Support\PlatformSettings. */
class PlatformSetting extends Model
{
    protected $guarded = ['id'];

    protected $hidden = ['value'];

    protected function casts(): array
    {
        return ['value' => 'encrypted:json'];
    }
}
