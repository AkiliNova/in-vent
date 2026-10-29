<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Attendee extends Model
{
    use BelongsToTenant, HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'custom_fields' => 'array',
            'dietary_requirements' => 'array',
            'registered_at' => 'datetime',
            'checked_in_at' => 'datetime',
            'amount_paid' => 'decimal:2',
            'consent_marketing' => 'boolean',
            'consent_share_profile' => 'boolean',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function profile(): HasOne
    {
        return $this->hasOne(AttendeeProfile::class);
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }

    public function badge(): HasOne
    {
        return $this->hasOne(Badge::class)->latestOfMany();
    }

    public function nfcTag(): HasOne
    {
        return $this->hasOne(NfcTag::class);
    }

    public function checkIns(): HasMany
    {
        return $this->hasMany(CheckIn::class);
    }

    public function sessions(): BelongsToMany
    {
        return $this->belongsToMany(EventSession::class, 'event_session_attendee')
            ->withPivot(['is_favourite', 'registered_at', 'attended_at', 'left_at'])
            ->withTimestamps();
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }

    public function feedbackResponses(): HasMany
    {
        return $this->hasMany(FeedbackResponse::class);
    }

    public function sentConnectionRequests(): HasMany
    {
        return $this->hasMany(Connection::class, 'requester_id');
    }

    public function receivedConnectionRequests(): HasMany
    {
        return $this->hasMany(Connection::class, 'addressee_id');
    }

    public function certificate(): HasOne
    {
        return $this->hasOne(Certificate::class);
    }

    // ── Scopes ──────────────────────────────────────────────────────────────

    public function scopeCheckedIn(Builder $query): Builder
    {
        return $query->where('status', 'checked_in');
    }

    public function scopeForEvent(Builder $query, int $eventId): Builder
    {
        return $query->where('event_id', $eventId);
    }

    /** Only attendees who agreed to appear in the networking directory. */
    public function scopeDiscoverable(Builder $query): Builder
    {
        return $query->where('consent_share_profile', true)
            ->whereHas('profile', fn ($q) => $q->whereIn('visibility', ['public', 'event']));
    }

    // ── Derived ─────────────────────────────────────────────────────────────

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    public function isCheckedIn(): bool
    {
        return $this->checked_in_at !== null;
    }
}
