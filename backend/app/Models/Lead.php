<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tikooh feature 9: a badge scanned at an exhibitor booth becomes a lead, which
 * is what "attendee information updates automatically" means in practice.
 */
class Lead extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'tags' => 'array',
            'answers' => 'array',
            'captured_at' => 'datetime',
            'synced_at' => 'datetime',
            'synced_to_crm' => 'boolean',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function exhibitor(): BelongsTo
    {
        return $this->belongsTo(Exhibitor::class);
    }

    public function attendee(): BelongsTo
    {
        return $this->belongsTo(Attendee::class);
    }

    public function booth(): BelongsTo
    {
        return $this->belongsTo(Booth::class);
    }

    public function capturedBy(): BelongsTo
    {
        return $this->belongsTo(ExhibitorStaff::class, 'captured_by');
    }

    /**
     * Contact details are only released to the exhibitor if the attendee opted
     * in to sharing their profile.
     */
    public function contactCard(): array
    {
        $attendee = $this->attendee;

        $card = [
            'name' => $attendee->full_name,
            'company' => $attendee->company,
            'job_title' => $attendee->job_title,
        ];

        if ($attendee->consent_share_profile) {
            $card['email'] = $attendee->email;
            $card['phone'] = $attendee->phone;
        }

        return $card;
    }
}
