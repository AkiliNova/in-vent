<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh feature 5 (exhibitors + booth allocation) and feature 9
     * (badge scans at booths generating leads).
     */
    public function up(): void
    {
        Schema::create('exhibitors', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();

            $table->string('company_name');
            $table->string('slug');
            $table->text('description')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('website')->nullable();
            $table->string('industry')->nullable();

            $table->string('contact_name')->nullable();
            $table->string('contact_email')->nullable();
            $table->string('contact_phone')->nullable();

            $table->string('package')->nullable()->comment('platinum | gold | silver | standard');
            $table->decimal('amount_paid', 12, 2)->default(0);
            $table->unsignedInteger('staff_quota')->default(2)->comment('Badges included in the package');
            $table->string('status')->default('pending')
                ->comment('pending | confirmed | cancelled');

            $table->json('products')->nullable();
            $table->json('social_links')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['event_id', 'slug']);
            $table->index(['event_id', 'status']);
        });

        Schema::create('booths', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('exhibitor_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('floor_plan_item_id')->nullable()->constrained()->nullOnDelete();

            $table->string('code')->comment('Booth number shown on the floor plan, e.g. A12');
            $table->string('size_label')->nullable()->comment('3x3, 6x3 ...');
            $table->decimal('area_sqm', 8, 2)->nullable();
            $table->decimal('price', 12, 2)->default(0);
            $table->string('currency', 3)->default('KES');
            $table->string('status')->default('available')
                ->comment('available | reserved | assigned | blocked');
            $table->json('amenities')->nullable()->comment('power, wifi, backdrop, furniture');
            $table->timestamps();

            $table->unique(['event_id', 'code']);
            $table->index(['event_id', 'status']);
        });

        // Booth staff who are allowed to scan attendee badges for lead capture.
        Schema::create('exhibitor_staff', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exhibitor_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('scan_pin', 12)->nullable()->comment('Short PIN for the booth scanning app');
            $table->boolean('can_capture_leads')->default(true);
            $table->timestamps();

            $table->index('exhibitor_id');
        });

        Schema::create('leads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('exhibitor_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('booth_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('captured_by')->nullable()->constrained('exhibitor_staff')->nullOnDelete();

            $table->string('method')->default('nfc')->comment('nfc | qr | manual | business_card');
            $table->unsignedTinyInteger('rating')->nullable()->comment('Hot/warm/cold as 1-5');
            $table->text('notes')->nullable();
            $table->json('tags')->nullable();
            $table->json('answers')->nullable()->comment('Responses to the exhibitor\'s qualifying questions');

            $table->boolean('synced_to_crm')->default(false);
            $table->timestamp('synced_at')->nullable();
            $table->timestamp('captured_at');
            $table->timestamps();

            $table->unique(['exhibitor_id', 'attendee_id']);
            $table->index(['event_id', 'captured_at']);
        });

        Schema::create('sponsors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('logo_path')->nullable();
            $table->string('website')->nullable();
            $table->text('description')->nullable();
            $table->string('tier')->nullable()->comment('title | platinum | gold | silver | partner');
            $table->decimal('amount', 12, 2)->default(0);
            $table->string('currency', 3)->default('KES');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['event_id', 'tier']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sponsors');
        Schema::dropIfExists('leads');
        Schema::dropIfExists('exhibitor_staff');
        Schema::dropIfExists('booths');
        Schema::dropIfExists('exhibitors');
    }
};
