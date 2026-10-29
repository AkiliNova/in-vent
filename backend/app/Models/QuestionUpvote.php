<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuestionUpvote extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    public function question(): BelongsTo
    {
        return $this->belongsTo(Question::class);
    }

    public function attendee(): BelongsTo
    {
        return $this->belongsTo(Attendee::class);
    }
}
