<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Message extends Model
{
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'attachments' => 'array',
            'is_system' => 'boolean',
            'edited_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::created(function (Message $message) {
            $message->conversation()->update(['last_message_at' => $message->created_at]);
        });
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(Attendee::class, 'sender_id');
    }
}
