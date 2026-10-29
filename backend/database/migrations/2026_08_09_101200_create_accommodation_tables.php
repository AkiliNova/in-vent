<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh feature 10: room allocation for dignitaries. Replaces the old
     * global `rooms` collection, which was neither tenant-scoped nor able to
     * record who a room was actually assigned to.
     */
    public function up(): void
    {
        Schema::create('dignitaries', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->nullable()->constrained()->nullOnDelete();

            $table->string('name');
            $table->string('honorific')->nullable()->comment('H.E., Hon., Dr., Amb.');
            $table->string('title')->nullable();
            $table->string('organization')->nullable();
            $table->string('category')->default('vip')
                ->comment('vip | government | diplomat | speaker | sponsor | media');
            $table->unsignedTinyInteger('protocol_rank')->default(5)
                ->comment('1 = highest precedence, drives seating and arrival order');

            $table->boolean('requires_security_detail')->default(false);
            $table->unsignedInteger('entourage_size')->default(0);
            $table->timestamp('arrival_at')->nullable();
            $table->timestamp('departure_at')->nullable();
            $table->string('arrival_mode')->nullable()->comment('flight | road | helicopter');
            $table->text('protocol_notes')->nullable();
            $table->json('dietary_requirements')->nullable();

            $table->foreignId('liaison_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['event_id', 'protocol_rank']);
        });

        Schema::create('accommodations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('venue_id')->nullable()->constrained()->nullOnDelete();

            $table->string('name');
            $table->string('kind')->default('hotel')
                ->comment('hotel | guest_house | meeting_room | holding_room | lounge');
            $table->string('address')->nullable();
            $table->string('contact_phone')->nullable();
            $table->decimal('distance_km', 6, 2)->nullable()->comment('From the event venue');
            $table->timestamps();

            $table->index(['tenant_id', 'event_id']);
        });

        Schema::create('accommodation_rooms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('accommodation_id')->constrained()->cascadeOnDelete();

            $table->string('room_number');
            $table->string('room_type')->default('standard')
                ->comment('standard | deluxe | suite | presidential | boardroom');
            $table->string('floor_label')->nullable();
            $table->unsignedInteger('capacity')->default(1);
            $table->decimal('rate_per_night', 12, 2)->nullable();
            $table->string('currency', 3)->default('KES');
            $table->string('status')->default('available')
                ->comment('available | assigned | blocked | maintenance');
            $table->json('amenities')->nullable();
            $table->boolean('is_accessible')->default(false);
            $table->timestamps();

            $table->unique(['accommodation_id', 'room_number']);
            $table->index('status');
        });

        Schema::create('room_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('accommodation_room_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();

            // Allocatable is a dignitary, speaker or plain attendee.
            $table->nullableMorphs('allocatable');
            $table->string('guest_name')->comment('Snapshot for the rooming list');
            $table->string('guest_title')->nullable();
            $table->string('guest_phone')->nullable();

            $table->date('check_in_date')->nullable();
            $table->date('check_out_date')->nullable();
            $table->timestamp('actual_check_in_at')->nullable();
            $table->timestamp('actual_check_out_at')->nullable();

            $table->string('status')->default('reserved')
                ->comment('reserved | confirmed | checked_in | checked_out | cancelled');
            $table->decimal('total_cost', 12, 2)->nullable();
            $table->string('paid_by')->nullable()->comment('organizer | guest | sponsor');
            $table->text('notes')->nullable();
            $table->foreignId('allocated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['event_id', 'status']);
            $table->index(['accommodation_room_id', 'check_in_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('room_allocations');
        Schema::dropIfExists('accommodation_rooms');
        Schema::dropIfExists('accommodations');
        Schema::dropIfExists('dignitaries');
    }
};
