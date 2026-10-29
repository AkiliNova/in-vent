<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh feature 5 (speakers) and the agenda behind features 7, 8 and 14.
     * Note the table is `event_sessions`, not `sessions` — Laravel already owns
     * `sessions` for the session driver.
     */
    public function up(): void
    {
        Schema::create('speakers', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('legacy_id')->nullable()->index();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->cascadeOnDelete();

            $table->string('name');
            $table->string('title')->nullable();
            $table->string('company')->nullable();
            $table->text('bio')->nullable();
            $table->string('photo_path')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('twitter')->nullable();
            $table->string('linkedin')->nullable();
            $table->string('website')->nullable();

            $table->string('status')->default('confirmed')
                ->comment('invited | confirmed | declined | cancelled');
            $table->boolean('is_keynote')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->decimal('average_rating', 3, 2)->nullable()
                ->comment('Rolled up from feedback_responses');

            $table->timestamps();
            $table->softDeletes();

            $table->index(['event_id', 'sort_order']);
        });

        Schema::create('event_sessions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('legacy_id')->nullable()->index();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('venue_space_id')->nullable()->constrained()->nullOnDelete();

            $table->string('title');
            $table->text('description')->nullable();
            $table->string('track')->nullable();
            $table->string('type')->default('talk')
                ->comment('talk | panel | workshop | break | networking | keynote');
            $table->string('room_label')->nullable();

            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->unsignedInteger('capacity')->nullable();
            $table->unsignedInteger('sort_order')->default(0);

            $table->boolean('requires_registration')->default(false);
            $table->boolean('allows_questions')->default(true);
            $table->boolean('allows_polls')->default(true);
            $table->boolean('collect_feedback')->default(true);
            $table->string('livestream_url')->nullable();
            $table->json('materials')->nullable()->comment('Slide decks, handouts, takeaways');

            $table->timestamps();
            $table->softDeletes();

            $table->index(['event_id', 'starts_at']);
        });

        Schema::create('event_session_speaker', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('speaker_id')->constrained()->cascadeOnDelete();
            $table->string('role')->default('speaker')->comment('speaker | moderator | panelist | host');
            $table->unsignedInteger('sort_order')->default(0);

            $table->unique(['event_session_id', 'speaker_id'], 'session_speaker_unique');
        });

        // Personalised schedules (feature 14) and per-session attendance (feature 6).
        Schema::create('event_session_attendee', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_favourite')->default(false);
            $table->timestamp('registered_at')->nullable();
            $table->timestamp('attended_at')->nullable();
            $table->timestamp('left_at')->nullable();

            $table->unique(['event_session_id', 'attendee_id'], 'session_attendee_unique');
            $table->index('attendee_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_session_attendee');
        Schema::dropIfExists('event_session_speaker');
        Schema::dropIfExists('event_sessions');
        Schema::dropIfExists('speakers');
    }
};
