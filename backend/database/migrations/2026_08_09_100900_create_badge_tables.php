<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh feature 11: badge design and printing. `elements` holds the visual
     * layout the designer produces — an ordered list of positioned blocks, each
     * either static (logo, shape) or bound to an attendee field.
     */
    public function up(): void
    {
        Schema::create('badge_templates', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->cascadeOnDelete();

            $table->string('name');
            $table->string('attendee_category')->nullable()
                ->comment('Applies to this category; null = fallback for all');

            $table->decimal('width_mm', 8, 2)->default(100);
            $table->decimal('height_mm', 8, 2)->default(150);
            $table->string('orientation')->default('portrait');
            $table->unsignedInteger('dpi')->default(300);
            $table->string('background_image_path')->nullable();
            $table->string('background_colour', 9)->default('#FFFFFF');

            /**
             * [{ "type":"field","source":"first_name","x":10,"y":40,
             *    "width":80,"fontSize":18,"fontWeight":"bold","align":"center" },
             *  { "type":"qr","source":"ticket.code","x":30,"y":95,"size":40 },
             *  { "type":"image","path":"logos/x.png","x":10,"y":8 }]
             */
            $table->json('elements');

            $table->boolean('include_qr')->default(true);
            $table->boolean('include_nfc')->default(false);
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['event_id', 'attendee_category']);
        });

        Schema::create('badges', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('badge_template_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('nfc_tag_id')->nullable()->constrained()->nullOnDelete();

            $table->string('serial')->unique();
            $table->string('qr_payload');
            $table->string('pdf_path')->nullable();

            $table->string('status')->default('pending')
                ->comment('pending | generated | printed | reprinted | void');
            $table->unsignedInteger('print_count')->default(0);
            $table->timestamp('generated_at')->nullable();
            $table->timestamp('printed_at')->nullable();
            $table->foreignId('printed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['event_id', 'status']);
            $table->index('attendee_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('badges');
        Schema::dropIfExists('badge_templates');
    }
};
