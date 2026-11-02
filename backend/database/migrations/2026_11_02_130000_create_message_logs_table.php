<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every email and SMS the platform sends (or fails to), with its content, so
 * "did they get it, and what did it say?" has an answer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained()->nullOnDelete();
            $table->string('channel')->comment('email | sms');
            $table->string('type')->comment('ticket_confirmation | campaign | payout | test | other');
            $table->string('to');
            $table->string('subject')->nullable();
            $table->longText('body')->nullable()->comment('HTML for email, text for SMS');
            $table->string('status')->comment('sent | failed');
            $table->text('error')->nullable();
            $table->string('provider')->nullable();
            $table->string('provider_message_id')->nullable();
            $table->string('related_type')->nullable()->comment('order | campaign | payout');
            $table->unsignedBigInteger('related_id')->nullable();
            $table->timestamp('created_at')->nullable()->index();

            $table->index(['related_type', 'related_id']);
            $table->index(['tenant_id', 'channel']);
            $table->index('to');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_logs');
    }
};
