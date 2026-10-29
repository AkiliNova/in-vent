<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('events', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('legacy_id')->nullable()->index();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();

            $table->string('title');
            $table->string('slug');
            $table->text('description')->nullable();
            $table->string('host')->nullable();
            $table->string('event_type')->nullable()->comment('conference | expo | workshop | gala | forum');
            $table->string('format')->default('in_person')->comment('in_person | virtual | hybrid');

            $table->timestamp('start_date');
            $table->timestamp('end_date')->nullable();
            $table->string('timezone')->default('Africa/Nairobi');

            $table->foreignId('venue_id')->nullable()->constrained()->nullOnDelete();
            $table->string('location_name')->nullable();
            $table->string('city')->nullable();
            $table->string('location_map_link')->nullable();

            $table->string('cover_image_path')->nullable();
            $table->string('status')->default('draft')->comment('draft | published | live | ended | archived');
            $table->boolean('is_public')->default(true);
            $table->unsignedInteger('capacity')->nullable();
            $table->string('currency', 3)->default('KES');
            $table->decimal('base_price', 12, 2)->default(0);

            $table->string('livestream_url')->nullable();
            $table->boolean('waitlist_enabled')->default(false);
            $table->boolean('networking_enabled')->default(true);
            $table->boolean('chatbot_enabled')->default(true);

            // Module toggles + badge/branding overrides for this event.
            $table->json('settings')->nullable();

            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'slug']);
            $table->index(['status', 'start_date']);
            $table->index(['is_public', 'start_date']);
        });

        Schema::create('event_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->string('caption')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['event_id', 'sort_order']);
        });

        Schema::create('ticket_tiers', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();

            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('price', 12, 2)->default(0);
            $table->string('currency', 3)->default('KES');
            $table->unsignedInteger('capacity')->default(0);
            $table->unsignedInteger('sold')->default(0);
            $table->unsignedInteger('reserved')->default(0)->comment('Held during an in-flight checkout');
            $table->unsignedInteger('min_per_order')->default(1);
            $table->unsignedInteger('max_per_order')->default(10);

            $table->timestamp('sales_start_at')->nullable();
            $table->timestamp('sales_end_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_hidden')->default(false)->comment('Invite-only tier, not shown publicly');
            $table->string('attendee_category')->nullable()->comment('Drives the badge template: VIP, Speaker, Press...');
            $table->unsignedInteger('sort_order')->default(0);

            $table->timestamps();

            $table->index(['event_id', 'is_active']);
        });

        Schema::create('waitlist_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ticket_tier_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('email');
            $table->string('phone')->nullable();
            $table->unsignedInteger('quantity')->default(1);
            $table->string('status')->default('waiting')->comment('waiting | invited | converted | expired');
            $table->timestamp('invited_at')->nullable();
            $table->timestamps();

            $table->unique(['event_id', 'email']);
            $table->index(['event_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waitlist_entries');
        Schema::dropIfExists('ticket_tiers');
        Schema::dropIfExists('event_images');
        Schema::dropIfExists('events');
    }
};
