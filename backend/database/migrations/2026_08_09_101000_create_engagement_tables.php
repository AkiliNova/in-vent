<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh feature 7: live Q&A, instant polls and voting. Vote and upvote
     * counters are denormalised onto the parent row so the realtime broadcast
     * carries results without a re-aggregation query on every vote.
     */
    public function up(): void
    {
        Schema::create('polls', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_session_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->text('question');
            $table->string('type')->default('single')
                ->comment('single | multiple | rating | word_cloud | yes_no');
            $table->string('status')->default('draft')->comment('draft | open | closed');

            $table->boolean('is_anonymous')->default(true);
            $table->boolean('show_results_live')->default(true);
            $table->boolean('results_published')->default(false);
            $table->unsignedInteger('total_votes')->default(0);
            $table->unsignedInteger('duration_seconds')->nullable()
                ->comment('Auto-close after this long once opened');

            $table->timestamp('opened_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['event_id', 'status']);
            $table->index(['event_session_id', 'status']);
        });

        Schema::create('poll_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('poll_id')->constrained()->cascadeOnDelete();
            $table->string('label');
            $table->string('colour', 9)->nullable();
            $table->unsignedInteger('vote_count')->default(0);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['poll_id', 'sort_order']);
        });

        Schema::create('poll_votes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('poll_id')->constrained()->cascadeOnDelete();
            $table->foreignId('poll_option_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->nullable()->constrained()->cascadeOnDelete();

            $table->string('guest_token')->nullable()
                ->comment('Identifies an unauthenticated voter so one device votes once');
            $table->unsignedTinyInteger('rating_value')->nullable()->comment('For type=rating');
            $table->string('text_value')->nullable()->comment('For type=word_cloud');
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();

            // One vote per attendee per option; multi-select polls insert one row per option.
            $table->unique(['poll_id', 'attendee_id', 'poll_option_id'], 'poll_vote_attendee_unique');
            $table->index(['poll_id', 'guest_token']);
        });

        Schema::create('questions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_session_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('answered_by_speaker_id')->nullable()->constrained('speakers')->nullOnDelete();

            $table->text('body');
            $table->boolean('is_anonymous')->default(false);
            $table->string('author_name')->nullable()->comment('Snapshot, so display survives attendee deletion');
            $table->string('status')->default('pending')
                ->comment('pending | approved | answered | rejected | archived');
            $table->unsignedInteger('upvote_count')->default(0);
            $table->text('answer')->nullable();
            $table->timestamp('answered_at')->nullable();
            $table->foreignId('moderated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['event_session_id', 'status', 'upvote_count']);
            $table->index(['event_id', 'status']);
        });

        Schema::create('question_upvotes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('question_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('guest_token')->nullable();
            $table->timestamps();

            $table->unique(['question_id', 'attendee_id']);
            $table->index(['question_id', 'guest_token']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_upvotes');
        Schema::dropIfExists('questions');
        Schema::dropIfExists('poll_votes');
        Schema::dropIfExists('poll_options');
        Schema::dropIfExists('polls');
    }
};
