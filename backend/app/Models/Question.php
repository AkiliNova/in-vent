<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Tikooh feature 7: live audience Q&A with moderation and upvoting. */
class Question extends Model
{
    use HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_anonymous' => 'boolean',
            'answered_at' => 'datetime',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(EventSession::class, 'event_session_id');
    }

    public function attendee(): BelongsTo
    {
        return $this->belongsTo(Attendee::class);
    }

    public function answeredBy(): BelongsTo
    {
        return $this->belongsTo(Speaker::class, 'answered_by_speaker_id');
    }

    public function upvotes(): HasMany
    {
        return $this->hasMany(QuestionUpvote::class);
    }

    public function scopeVisible(Builder $query): Builder
    {
        return $query->whereIn('status', ['approved', 'answered']);
    }

    public function scopeRanked(Builder $query): Builder
    {
        return $query->orderByDesc('upvote_count')->orderBy('created_at');
    }

    /** Hides the asker's identity when they chose to stay anonymous. */
    public function displayName(): string
    {
        return $this->is_anonymous ? 'Anonymous' : ($this->author_name ?: 'Attendee');
    }
}
