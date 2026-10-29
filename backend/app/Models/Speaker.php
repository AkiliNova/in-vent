<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Speaker extends Model
{
    use BelongsToTenant, HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_keynote' => 'boolean',
            'average_rating' => 'decimal:2',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function sessions(): BelongsToMany
    {
        return $this->belongsToMany(EventSession::class, 'event_session_speaker')
            ->withPivot(['role', 'sort_order'])
            ->orderBy('starts_at');
    }

    public function feedbackResponses(): HasMany
    {
        return $this->hasMany(FeedbackResponse::class);
    }

    /** Tikooh feature 8: speaker performance, rolled up from session feedback. */
    public function recalculateRating(): void
    {
        $this->forceFill([
            'average_rating' => $this->feedbackResponses()->avg('overall_rating'),
        ])->save();
    }
}
