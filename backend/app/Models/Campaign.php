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
            'monitor_numbers' => 'array',
            'ask_phone' => 'boolean',
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

    /** The event the email showcases ("New event: get tickets"), not the audience. */
    public function featuredEvent(): BelongsTo
    {
        return $this->belongsTo(Event::class, 'featured_event_id');
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(CampaignRecipient::class);
    }

    /** The sender's own confirmation copies. */
    public function monitors(): HasMany
    {
        return $this->hasMany(CampaignRecipient::class)->where('is_monitor', true);
    }

    public function scopeDue(Builder $query): Builder
    {
        return $query->where('status', 'scheduled')->where('scheduled_for', '<=', now());
    }

    /** Who this campaign reaches — see CampaignAudience. */
    public function audienceCount(): int
    {
        return \App\Services\CampaignAudience::count($this);
    }
}
