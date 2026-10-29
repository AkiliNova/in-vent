<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ChatbotConversation extends Model
{
    use BelongsToTenant, HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'escalated_to_human' => 'boolean',
            'last_message_at' => 'datetime',
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

    public function messages(): HasMany
    {
        return $this->hasMany(ChatbotMessage::class)->orderBy('created_at');
    }

    /** Recent turns, formatted for the model's messages array. */
    public function history(int $limit = 10): array
    {
        return $this->messages()
            ->latest()
            ->limit($limit)
            ->get()
            ->reverse()
            ->map(fn (ChatbotMessage $m) => ['role' => $m->role, 'content' => $m->content])
            ->values()
            ->all();
    }
}
