<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MessageTemplate extends Model
{
    use BelongsToTenant, HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'variables' => 'array',
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    /** Substitutes {{ placeholders }} with the supplied values. */
    public function render(array $data): string
    {
        return preg_replace_callback(
            '/\{\{\s*([\w.]+)\s*\}\}/',
            fn ($matches) => (string) data_get($data, $matches[1], ''),
            $this->body
        );
    }

    public function renderSubject(array $data): ?string
    {
        if ($this->subject === null) {
            return null;
        }

        return preg_replace_callback(
            '/\{\{\s*([\w.]+)\s*\}\}/',
            fn ($matches) => (string) data_get($data, $matches[1], ''),
            $this->subject
        );
    }
}
