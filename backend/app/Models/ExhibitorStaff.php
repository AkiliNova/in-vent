<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ExhibitorStaff extends Model
{
    use HasFactory;

    protected $table = 'exhibitor_staff';

    protected $guarded = ['id'];

    protected $hidden = ['scan_pin'];

    protected function casts(): array
    {
        return ['can_capture_leads' => 'boolean'];
    }

    public function exhibitor(): BelongsTo
    {
        return $this->belongsTo(Exhibitor::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function capturedLeads(): HasMany
    {
        return $this->hasMany(Lead::class, 'captured_by');
    }
}
