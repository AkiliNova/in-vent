<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh feature 13: the networking platform — connections, digital business
     * card exchange, meeting scheduling and chat.
     */
    public function up(): void
    {
        Schema::create('connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('requester_id')->constrained('attendees')->cascadeOnDelete();
            $table->foreignId('addressee_id')->constrained('attendees')->cascadeOnDelete();

            $table->string('status')->default('pending')
                ->comment('pending | accepted | declined | blocked');
            $table->string('source')->default('directory')
                ->comment('directory | badge_scan | session | recommendation | qr');
            $table->text('message')->nullable();
            $table->boolean('card_shared')->default(false)
                ->comment('True once contact details are visible to both sides');
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();

            $table->unique(['event_id', 'requester_id', 'addressee_id'], 'connection_unique');
            $table->index(['addressee_id', 'status']);
        });

        Schema::create('meetings', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('organizer_id')->constrained('attendees')->cascadeOnDelete();
            $table->foreignId('venue_space_id')->nullable()->constrained()->nullOnDelete();

            $table->string('title');
            $table->text('agenda')->nullable();
            $table->string('location_label')->nullable()->comment('Networking Lounge, Table 4');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->string('status')->default('proposed')
                ->comment('proposed | confirmed | declined | cancelled | completed');
            $table->string('meeting_link')->nullable()->comment('For virtual meetings');
            $table->timestamps();

            $table->index(['event_id', 'starts_at']);
        });

        Schema::create('meeting_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('meeting_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->constrained()->cascadeOnDelete();
            $table->string('status')->default('invited')
                ->comment('invited | accepted | declined | tentative');
            $table->timestamp('responded_at')->nullable();

            $table->unique(['meeting_id', 'attendee_id']);
        });

        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->string('type')->default('direct')->comment('direct | group | session | support');
            $table->string('title')->nullable();
            $table->foreignId('event_session_id')->nullable()->constrained()->cascadeOnDelete();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();

            $table->index(['event_id', 'last_message_at']);
        });

        Schema::create('conversation_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->constrained()->cascadeOnDelete();
            $table->timestamp('last_read_at')->nullable();
            $table->boolean('is_muted')->default(false);
            $table->timestamps();

            $table->unique(['conversation_id', 'attendee_id']);
            $table->index('attendee_id');
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->nullable()->constrained('attendees')->nullOnDelete();
            $table->text('body');
            $table->json('attachments')->nullable();
            $table->boolean('is_system')->default(false);
            $table->timestamp('edited_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['conversation_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversation_participants');
        Schema::dropIfExists('conversations');
        Schema::dropIfExists('meeting_participants');
        Schema::dropIfExists('meetings');
        Schema::dropIfExists('connections');
    }
};
