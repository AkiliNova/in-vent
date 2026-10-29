<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

class ChatbotKnowledge extends Model
{
    use BelongsToTenant, HasFactory;

    protected $table = 'chatbot_knowledge';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'keywords' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    /**
     * Retrieval for the chatbot's grounding context. Uses MySQL full-text where
     * available and falls back to LIKE so the test suite (SQLite) still works.
     */
    public function scopeSearch(Builder $query, string $term): Builder
    {
        $driver = DB::connection()->getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            return $query->whereRaw(
                'MATCH(question, answer) AGAINST(? IN NATURAL LANGUAGE MODE)',
                [$term]
            );
        }

        return $query->where(fn (Builder $q) => $q
            ->where('question', 'like', "%{$term}%")
            ->orWhere('answer', 'like', "%{$term}%"));
    }
}
