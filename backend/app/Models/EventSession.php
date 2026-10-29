<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class EventSession extends Model
{
    use HasFactory, HasUuid, SoftDeletes;

    protected $table = 'event_sessions';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'materials' => 'array',
            'requires_registration' => 'boolean',
            'allows_questions' => 'boolean',
            'allows_polls' => 'boolean',
            'collect_feedback' => 'boolean',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function venueSpace(): BelongsTo
    {
        return $this->belongsTo(VenueSpace::class);
    }

    public function speakers(): BelongsToMany
    {
        return $this->belongsToMany(Speaker::class, 'event_session_speaker')
            ->withPivot(['role', 'sort_order'])
            ->orderBy('event_session_speaker.sort_order');
    }

    public function attendees(): BelongsToMany
    {
        return $this->belongsToMany(Attendee::class, 'event_session_attendee')
            ->withPivot(['is_favourite', 'registered_at', 'attended_at', 'left_at'])
            ->withTimestamps();
    }

    public function polls(): HasMany
    {
        return $this->hasMany(Poll::class);
    }

    public function questions(): HasMany
    {
        return $this->hasMany(Question::class);
    }

    public function feedbackForms(): HasMany
    {
        return $this->hasMany(FeedbackForm::class);
    }

    public function feedbackResponses(): HasMany
    {
        return $this->hasMany(FeedbackResponse::class);
    }

    public function checkIns(): HasMany
    {
        return $this->hasMany(CheckIn::class);
    }

    public function scopeLive(Builder $query): Builder
    {
        return $query->where('starts_at', '<=', now())->where('ends_at', '>=', now());
    }

    public function isLive(): bool
    {
        return $this->starts_at <= now() && $this->ends_at >= now();
    }

    public function hasEnded(): bool
    {
        return $this->ends_at < now();
    }

    public function attendanceCount(): int
    {
        return $this->attendees()->wherePivotNotNull('attended_at')->count();
    }

    public function averageRating(): ?float
    {
        $average = $this->feedbackResponses()->avg('overall_rating');

        return $average === null ? null : round((float) $average, 2);
    }
}
