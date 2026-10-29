<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Tikooh feature 10: VIPs, government officials and other protocol guests. */
class Dignitary extends Model
{
    use HasFactory, HasUuid, SoftDeletes;

    protected $table = 'dignitaries';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'arrival_at' => 'datetime',
            'departure_at' => 'datetime',
            'dietary_requirements' => 'array',
            'requires_security_detail' => 'boolean',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function attendee(): BelongsTo
    {
        return $this->belongsTo(Attendee::class);
    }

    public function liaison(): BelongsTo
    {
        return $this->belongsTo(User::class, 'liaison_user_id');
    }

    public function roomAllocations(): MorphMany
    {
        return $this->morphMany(RoomAllocation::class, 'allocatable');
    }

    /** Protocol order: rank 1 first, then earliest arrival. */
    public function scopeByPrecedence(Builder $query): Builder
    {
        return $query->orderBy('protocol_rank')->orderBy('arrival_at');
    }

    public function displayName(): string
    {
        return trim("{$this->honorific} {$this->name}");
    }
}
