<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RegistrationField extends Model
{
    use BelongsToTenant, HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'options' => 'array',
            'validation' => 'array',
            'required' => 'boolean',
            'enabled' => 'boolean',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    /** Translates the organizer's field definition into Laravel validation rules. */
    public function rules(): array
    {
        $rules = [$this->required ? 'required' : 'nullable'];

        $rules[] = match ($this->type) {
            'email' => 'email:rfc',
            'number' => 'numeric',
            'date' => 'date',
            'checkbox' => 'boolean',
            'multiselect' => 'array',
            'file' => 'file|max:5120',
            default => 'string|max:1000',
        };

        if (in_array($this->type, ['select', 'multiselect'], true) && $this->options) {
            $rules[] = 'in:'.implode(',', $this->options);
        }

        return array_merge($rules, $this->validation ?? []);
    }
}
