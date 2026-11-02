<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** Someone an organiser can market to who never booked on Tikooh — imported from a CSV. */
class Contact extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id'];
}
