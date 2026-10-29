<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh feature 3: venue sourcing. Venues with tenant_id = null form the
     * shared public directory organizers search; a tenant may also keep private
     * venues of its own.
     */
    public function up(): void
    {
        Schema::create('venues', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('tenant_id')->nullable()->constrained()->cascadeOnDelete();

            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();

            $table->string('address')->nullable();
            $table->string('city')->nullable();
            $table->string('county')->nullable();
            $table->string('country', 2)->default('KE');
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->string('map_link')->nullable();

            $table->unsignedInteger('capacity')->default(0);
            $table->unsignedInteger('min_capacity')->default(0);
            $table->decimal('price_per_day', 12, 2)->nullable();
            $table->decimal('price_per_hour', 12, 2)->nullable();
            $table->string('currency', 3)->default('KES');

            // Free-form list of event types the venue suits: conference, expo, gala...
            $table->json('suitable_for')->nullable();
            $table->json('images')->nullable();

            $table->string('contact_name')->nullable();
            $table->string('contact_email')->nullable();
            $table->string('contact_phone')->nullable();

            $table->boolean('is_public')->default(false)->comment('Listed in the shared directory');
            $table->boolean('is_verified')->default(false);
            $table->decimal('rating', 3, 2)->default(0);
            $table->unsignedInteger('review_count')->default(0);

            $table->timestamps();
            $table->softDeletes();

            $table->index(['city', 'is_public']);
            $table->index(['capacity', 'is_public']);
        });

        Schema::create('amenities', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('icon')->nullable();
            $table->string('category')->nullable()->comment('av | catering | accessibility | parking | connectivity');
            $table->timestamps();
        });

        Schema::create('amenity_venue', function (Blueprint $table) {
            $table->id();
            $table->foreignId('venue_id')->constrained()->cascadeOnDelete();
            $table->foreignId('amenity_id')->constrained()->cascadeOnDelete();
            $table->string('notes')->nullable();

            $table->unique(['venue_id', 'amenity_id']);
        });

        // Halls, breakout rooms, exhibition floors inside a venue.
        Schema::create('venue_spaces', function (Blueprint $table) {
            $table->id();
            $table->foreignId('venue_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->unsignedInteger('capacity')->default(0);
            $table->decimal('floor_area_sqm', 10, 2)->nullable();
            $table->string('floor_label')->nullable();
            // theatre | classroom | banquet | boardroom | u_shape | cocktail
            $table->json('layout_types')->nullable();
            $table->decimal('price_per_day', 12, 2)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['venue_id', 'is_active']);
        });

        Schema::create('venue_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('venue_id')->constrained()->cascadeOnDelete();
            $table->foreignId('tenant_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->text('comment')->nullable();
            $table->timestamps();

            $table->unique(['venue_id', 'tenant_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('venue_reviews');
        Schema::dropIfExists('venue_spaces');
        Schema::dropIfExists('amenity_venue');
        Schema::dropIfExists('amenities');
        Schema::dropIfExists('venues');
    }
};
