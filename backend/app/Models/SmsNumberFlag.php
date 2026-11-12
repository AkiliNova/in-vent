<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A number the SMS provider permanently rejected. Platform-wide, not tenant-scoped. */
class SmsNumberFlag extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['last_failed_at' => 'datetime'];
    }
}
