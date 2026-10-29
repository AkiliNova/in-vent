<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Poll extends Model
{
    use HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_anonymous' => 'boolean',
            'show_results_live' => 'boolean',
            'results_published' => 'boolean',
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
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

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function options(): HasMany
    {
        return $this->hasMany(PollOption::class)->orderBy('sort_order');
    }

    public function votes(): HasMany
    {
        return $this->hasMany(PollVote::class);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', 'open');
    }

    public function isOpen(): bool
    {
        if ($this->status !== 'open') {
            return false;
        }

        // A poll with a duration closes itself once the window has passed, so a
        // vote arriving late is rejected even before the scheduler runs.
        if ($this->duration_seconds && $this->opened_at) {
            return $this->opened_at->addSeconds($this->duration_seconds)->isFuture();
        }

        return true;
    }

    /** Shape sent over the websocket after every vote. */
    public function resultsPayload(): array
    {
        return [
            'poll_uuid' => $this->uuid,
            'total_votes' => $this->total_votes,
            'status' => $this->status,
            'options' => $this->options->map(fn (PollOption $option) => [
                'id' => $option->id,
                'label' => $option->label,
                'colour' => $option->colour,
                'votes' => $option->vote_count,
                'percentage' => $this->total_votes > 0
                    ? round($option->vote_count / $this->total_votes * 100, 1)
                    : 0.0,
            ])->all(),
        ];
    }
}
