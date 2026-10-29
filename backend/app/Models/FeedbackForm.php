<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Tikooh feature 8: the rating pop-up definition. */
class FeedbackForm extends Model
{
    use HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'questions' => 'array',
            'is_anonymous' => 'boolean',
            'is_active' => 'boolean',
            'send_reminder' => 'boolean',
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

    public function responses(): HasMany
    {
        return $this->hasMany(FeedbackResponse::class);
    }

    /** Validation rules derived from the form's question list. */
    public function validationRules(): array
    {
        $rules = [];

        foreach ($this->questions as $question) {
            $key = "answers.{$question['key']}";
            $required = ($question['required'] ?? false) ? 'required' : 'nullable';

            $rules[$key] = match ($question['type'] ?? 'text') {
                'rating' => [$required, 'integer', 'min:1', 'max:'.($question['scale'] ?? 5)],
                'nps' => [$required, 'integer', 'min:0', 'max:10'],
                'choice' => [$required, 'string', 'in:'.implode(',', $question['options'] ?? [])],
                'multichoice' => [$required, 'array'],
                default => [$required, 'string', 'max:2000'],
            };
        }

        return $rules;
    }

    public function averageRating(): ?float
    {
        $average = $this->responses()->avg('overall_rating');

        return $average === null ? null : round((float) $average, 2);
    }
}
