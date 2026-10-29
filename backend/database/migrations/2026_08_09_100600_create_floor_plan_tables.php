<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh feature 4: venue diagramming. A floor plan is a canvas of positioned
     * items; anything placeable (a seat, a booth, a table) is a floor_plan_item,
     * and items are assigned to people or exhibitors polymorphically.
     */
    public function up(): void
    {
        Schema::create('floor_plans', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('venue_space_id')->nullable()->constrained()->nullOnDelete();

            $table->string('name');
            $table->text('description')->nullable();
            $table->unsignedInteger('canvas_width')->default(1200);
            $table->unsignedInteger('canvas_height')->default(800);
            $table->decimal('scale_metres_per_unit', 8, 4)->default(0.05);
            $table->string('background_image_path')->nullable();
            $table->string('status')->default('draft')->comment('draft | published');
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['event_id', 'status']);
        });

        Schema::create('floor_plan_items', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('floor_plan_id')->constrained()->cascadeOnDelete();

            $table->string('type')
                ->comment('seat | table | booth | stage | screen | door | wall | text | shape | entrance');
            $table->string('label')->nullable();
            $table->decimal('x', 10, 2)->default(0);
            $table->decimal('y', 10, 2)->default(0);
            $table->decimal('width', 10, 2)->default(40);
            $table->decimal('height', 10, 2)->default(40);
            $table->decimal('rotation', 6, 2)->default(0);
            $table->unsignedInteger('z_index')->default(0);
            $table->unsignedInteger('capacity')->default(1)->comment('Seats at a table, staff at a booth');
            $table->json('style')->nullable()->comment('fill, stroke, font');
            $table->json('properties')->nullable();
            $table->boolean('is_assignable')->default(true);
            $table->timestamps();

            $table->index(['floor_plan_id', 'type']);
        });

        Schema::create('seat_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('floor_plan_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('event_session_id')->nullable()->constrained()->cascadeOnDelete()
                ->comment('Null = seating for the whole event');
            $table->string('seat_label')->nullable();
            $table->string('status')->default('assigned')->comment('assigned | held | released');
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['floor_plan_item_id', 'event_session_id', 'attendee_id'], 'seat_assignment_unique');
            $table->index(['event_id', 'attendee_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('seat_assignments');
        Schema::dropIfExists('floor_plan_items');
        Schema::dropIfExists('floor_plans');
    }
};
