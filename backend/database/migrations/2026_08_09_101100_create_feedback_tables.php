<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh feature 8: post-event and post-session feedback. `trigger` drives
     * the automatic rating pop-up the brief describes.
     */
    public function up(): void
    {
        Schema::create('feedback_forms', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_session_id')->nullable()->constrained()->cascadeOnDelete();

            $table->string('title');
            $table->text('intro')->nullable();
            $table->string('trigger')->default('session_end')
                ->comment('session_end | event_end | check_out | manual');
            $table->unsignedInteger('delay_minutes')->default(0);
            $table->string('target')->default('session')
                ->comment('session | speaker | venue | event | catering');

            /**
             * [{ "key":"content_quality","label":"How useful was this session?",
             *    "type":"rating","scale":5,"required":true },
             *  { "key":"comments","label":"Anything else?","type":"textarea" }]
             */
            $table->json('questions');

            $table->boolean('is_anonymous')->default(true);
            $table->boolean('is_active')->default(true);
            $table->boolean('send_reminder')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['event_id', 'trigger', 'is_active']);
        });

        Schema::create('feedback_responses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('feedback_form_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_session_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('attendee_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('speaker_id')->nullable()->constrained()->nullOnDelete();

            $table->unsignedTinyInteger('overall_rating')->nullable()
                ->comment('Extracted from answers for cheap aggregate queries');
            $table->json('answers');
            $table->text('comment')->nullable();
            $table->tinyInteger('nps_score')->nullable();
            $table->string('sentiment')->nullable()->comment('positive | neutral | negative');
            $table->timestamp('submitted_at');
            $table->timestamps();

            $table->unique(['feedback_form_id', 'attendee_id'], 'feedback_once_per_attendee');
            $table->index(['event_id', 'overall_rating']);
            $table->index(['speaker_id', 'overall_rating']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feedback_responses');
        Schema::dropIfExists('feedback_forms');
    }
};
