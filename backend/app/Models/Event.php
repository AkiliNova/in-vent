<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\SoftDeletes;

class Event extends Model
{
    use BelongsToTenant, HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected $appends = ['cover_url'];

    /**
     * Mirrors the column defaults so a freshly-created model carries them
     * without a refresh — order totals read `$event->currency` directly.
     */
    protected $attributes = [
        'currency' => 'KES',
        'timezone' => 'Africa/Nairobi',
        'status' => 'draft',
        'format' => 'in_person',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'datetime',
            'end_date' => 'datetime',
            'published_at' => 'datetime',
            'is_public' => 'boolean',
            'waitlist_enabled' => 'boolean',
            'networking_enabled' => 'boolean',
            'chatbot_enabled' => 'boolean',
            'settings' => 'array',
            'base_price' => 'decimal:2',
        ];
    }

    public function getCoverUrlAttribute(): ?string
    {
        $path = $this->cover_image_path;

        if (! $path) {
            return null;
        }

        // Imported events still point at their old absolute URLs.
        return str_starts_with($path, 'http') ? $path : \Illuminate\Support\Facades\Storage::disk('public')->url($path);
    }

    // ── Relationships ───────────────────────────────────────────────────────

    public function venue(): BelongsTo
    {
        return $this->belongsTo(Venue::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(EventImage::class)->orderBy('sort_order');
    }

    public function ticketTiers(): HasMany
    {
        return $this->hasMany(TicketTier::class)->orderBy('sort_order');
    }

    public function waitlistEntries(): HasMany
    {
        return $this->hasMany(WaitlistEntry::class);
    }

    public function registrationFields(): HasMany
    {
        return $this->hasMany(RegistrationField::class)->orderBy('step')->orderBy('sort_order');
    }

    public function attendees(): HasMany
    {
        return $this->hasMany(Attendee::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }

    public function speakers(): HasMany
    {
        return $this->hasMany(Speaker::class)->orderBy('sort_order');
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(EventSession::class)->orderBy('starts_at');
    }

    public function exhibitors(): HasMany
    {
        return $this->hasMany(Exhibitor::class);
    }

    public function booths(): HasMany
    {
        return $this->hasMany(Booth::class);
    }

    public function sponsors(): HasMany
    {
        return $this->hasMany(Sponsor::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }

    public function floorPlans(): HasMany
    {
        return $this->hasMany(FloorPlan::class);
    }

    public function checkIns(): HasMany
    {
        return $this->hasMany(CheckIn::class);
    }

    public function checkInPoints(): HasMany
    {
        return $this->hasMany(CheckInPoint::class);
    }

    public function badges(): HasMany
    {
        return $this->hasMany(Badge::class);
    }

    public function badgeTemplates(): HasMany
    {
        return $this->hasMany(BadgeTemplate::class);
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

    public function dignitaries(): HasMany
    {
        return $this->hasMany(Dignitary::class);
    }

    public function roomAllocations(): HasMany
    {
        return $this->hasMany(RoomAllocation::class);
    }

    public function connections(): HasMany
    {
        return $this->hasMany(Connection::class);
    }

    public function meetings(): HasMany
    {
        return $this->hasMany(Meeting::class);
    }

    public function announcements(): HasMany
    {
        return $this->hasMany(Announcement::class);
    }

    public function sessionSpeakers(): HasManyThrough
    {
        return $this->hasManyThrough(Speaker::class, EventSession::class);
    }

    // ── Scopes ──────────────────────────────────────────────────────────────

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', 'published');
    }

    public function scopeUpcoming(Builder $query): Builder
    {
        return $query->where('start_date', '>=', now());
    }

    public function scopePubliclyVisible(Builder $query): Builder
    {
        return $query->where('is_public', true)->whereIn('status', ['published', 'live']);
    }

    // ── Derived state ───────────────────────────────────────────────────────

    public function getTicketsSoldAttribute(): int
    {
        return (int) $this->ticketTiers()->sum('sold');
    }

    public function getIsSoldOutAttribute(): bool
    {
        $tiers = $this->ticketTiers()->where('is_active', true)->get();

        return $tiers->isNotEmpty() && $tiers->every(fn ($t) => $t->remaining() <= 0);
    }

    public function isLive(): bool
    {
        return $this->start_date <= now()
            && ($this->end_date === null || $this->end_date >= now());
    }
}
