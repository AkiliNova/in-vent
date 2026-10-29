<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Campaign extends Model
{
    use BelongsToTenant, HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'audience_filter' => 'array',
            'estimated_cost' => 'decimal:2',
            'scheduled_for' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(CampaignRecipient::class);
    }

    public function scopeDue(Builder $query): Builder
    {
        return $query->where('status', 'scheduled')->where('scheduled_for', '<=', now());
    }

    /**
     * Resolves audience_filter into the attendees this campaign will reach.
     * Only whitelisted keys are honoured so a stored filter cannot be used to
     * pivot into another tenant's data.
     */
    public function audienceQuery(): Builder
    {
        $query = Attendee::query()->where('tenant_id', $this->tenant_id);

        if ($this->event_id) {
            $query->where('event_id', $this->event_id);
        }

        $filter = $this->audience_filter ?? [];

        foreach (['category', 'status'] as $key) {
            if (! empty($filter[$key])) {
                $query->whereIn($key, (array) $filter[$key]);
            }
        }

        if (! empty($filter['ticket_tier_id'])) {
            $query->whereHas('tickets', fn ($q) => $q
                ->whereIn('ticket_tier_id', (array) $filter['ticket_tier_id']));
        }

        if (! empty($filter['checked_in'])) {
            $query->whereNotNull('checked_in_at');
        }

        if ($this->channel === 'email') {
            $query->whereNotNull('email');
        } else {
            $query->whereNotNull('phone');
        }

        return $query;
    }
}
