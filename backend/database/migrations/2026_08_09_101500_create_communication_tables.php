<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh feature 2 (email + bulk SMS) and feature 14 (announcements/push).
     * Every send is recorded per recipient so delivery can be reconciled against
     * the provider rather than trusted from a fire-and-forget request.
     */
    public function up(): void
    {
        Schema::create('message_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('key')->nullable()
                ->comment('registration_confirmed | payment_received | event_reminder | badge_ready');
            $table->string('channel')->comment('sms | email | push');
            $table->string('subject')->nullable();
            $table->text('body');
            $table->json('variables')->nullable();
            $table->boolean('is_system')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'key', 'channel']);
        });

        Schema::create('campaigns', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('legacy_id')->nullable()->index();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->string('name');
            $table->string('channel')->comment('sms | email | push');
            $table->string('status')->default('draft')
                ->comment('draft | scheduled | sending | sent | failed | cancelled');

            $table->string('subject')->nullable();
            $table->text('body');
            $table->string('image_path')->nullable();

            // e.g. {"category":["VIP"],"status":["registered"],"ticket_tier_id":[3]}
            $table->json('audience_filter')->nullable();
            $table->string('audience_label')->nullable();

            $table->unsignedInteger('recipient_count')->default(0);
            $table->unsignedInteger('sent_count')->default(0);
            $table->unsignedInteger('delivered_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->decimal('estimated_cost', 12, 2)->default(0);

            $table->timestamp('scheduled_for')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index('scheduled_for');
        });

        Schema::create('campaign_recipients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('campaign_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->nullable()->constrained()->nullOnDelete();

            $table->string('destination')->comment('Phone number or email address');
            $table->string('status')->default('queued')
                ->comment('queued | sent | delivered | failed | bounced | opted_out');
            $table->string('provider_reference')->nullable();
            $table->text('error')->nullable();
            $table->unsignedTinyInteger('segments')->default(1)->comment('SMS parts billed');
            $table->decimal('cost', 10, 4)->default(0);
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();

            $table->index(['campaign_id', 'status']);
            $table->index('destination');
        });

        Schema::create('announcements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title');
            $table->text('body');
            $table->string('image_path')->nullable();
            $table->string('priority')->default('normal')->comment('normal | important | urgent');
            $table->boolean('is_pinned')->default(false);
            $table->boolean('send_push')->default(false);
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->index(['event_id', 'published_at']);
        });

        Schema::create('device_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('token')->unique();
            $table->string('platform')->comment('ios | android | web');
            $table->string('device_name')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->index('attendee_id');
        });

        // Honours unsubscribe requests across every campaign for a tenant.
        Schema::create('suppression_list', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('channel')->comment('sms | email');
            $table->string('destination');
            $table->string('reason')->nullable()->comment('unsubscribed | bounced | complained | invalid');
            $table->timestamps();

            $table->unique(['tenant_id', 'channel', 'destination'], 'suppression_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suppression_list');
        Schema::dropIfExists('device_tokens');
        Schema::dropIfExists('announcements');
        Schema::dropIfExists('campaign_recipients');
        Schema::dropIfExists('campaigns');
        Schema::dropIfExists('message_templates');
    }
};
