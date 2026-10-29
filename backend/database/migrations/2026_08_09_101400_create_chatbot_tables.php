<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh feature 12: the Tikooh chatbot. Knowledge entries are the grounding
     * corpus; live event data (agenda, venue, sessions) is injected at answer
     * time rather than duplicated here.
     */
    public function up(): void
    {
        Schema::create('chatbot_knowledge', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->cascadeOnDelete();

            $table->string('topic')->nullable()
                ->comment('registration | schedule | directions | speakers | support');
            $table->text('question');
            $table->text('answer');
            $table->json('keywords')->nullable();
            $table->unsignedInteger('hit_count')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['event_id', 'is_active']);
        });

        // Full-text retrieval backs the chatbot's knowledge lookup; SQLite (used
        // by the test suite) has no equivalent, so it falls back to LIKE search.
        if (in_array(Schema::getConnection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            Schema::table('chatbot_knowledge', function (Blueprint $table) {
                $table->fullText(['question', 'answer']);
            });
        }

        Schema::create('chatbot_conversations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->nullable()->constrained()->nullOnDelete();

            $table->string('session_token')->index()->comment('Anonymous visitors before login');
            $table->string('channel')->default('web')->comment('web | mobile | whatsapp | kiosk');
            $table->string('status')->default('open')->comment('open | resolved | escalated');
            $table->boolean('escalated_to_human')->default(false);
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();

            $table->index(['event_id', 'status']);
        });

        Schema::create('chatbot_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('chatbot_conversation_id')->constrained()->cascadeOnDelete();
            $table->string('role')->comment('user | assistant | system');
            $table->text('content');
            $table->json('sources')->nullable()->comment('Knowledge rows / event records used to answer');
            $table->unsignedInteger('input_tokens')->nullable();
            $table->unsignedInteger('output_tokens')->nullable();
            $table->unsignedInteger('latency_ms')->nullable();
            $table->tinyInteger('helpful')->nullable()->comment('1 = thumbs up, -1 = thumbs down');
            $table->timestamps();

            $table->index(['chatbot_conversation_id', 'created_at'], 'chatbot_msg_convo_created_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chatbot_messages');
        Schema::dropIfExists('chatbot_conversations');
        Schema::dropIfExists('chatbot_knowledge');
    }
};
