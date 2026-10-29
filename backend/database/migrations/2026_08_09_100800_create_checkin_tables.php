<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tikooh features 6 and 15: NFC/QR attendance monitoring and onsite check-in.
     */
    public function up(): void
    {
        Schema::create('nfc_tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('attendee_id')->nullable()->constrained()->nullOnDelete();

            $table->string('uid')->unique()->comment('Hardware UID read from the NFC chip');
            $table->string('tag_type')->default('ntag215')->comment('ntag213 | ntag215 | mifare | other');
            $table->string('status')->default('unassigned')
                ->comment('unassigned | assigned | lost | revoked | recycled');
            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->unsignedInteger('reuse_count')->default(0);
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index('attendee_id');
        });

        Schema::create('check_in_points', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_session_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('name')->comment('Main Gate, Hall B Door 2, Lunch Area');
            $table->string('kind')->default('entrance')->comment('entrance | exit | session | catering | booth');
            $table->string('device_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['event_id', 'is_active']);
        });

        Schema::create('check_ins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            // Nullable: a rejected scan of an unknown code still gets logged,
            // and there is no attendee to attach it to.
            $table->foreignId('attendee_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('ticket_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('event_session_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('check_in_point_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('scanned_by')->nullable()->constrained('users')->nullOnDelete();

            $table->string('method')->default('qr')->comment('qr | nfc | manual | self_service');
            $table->string('direction')->default('in')->comment('in | out');
            $table->string('result')->default('accepted')
                ->comment('accepted | duplicate | invalid | wrong_event | revoked | flagged');
            $table->string('failure_reason')->nullable();

            $table->string('device_id')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->boolean('synced_offline')->default(false)
                ->comment('True when the scanner queued this while offline');
            $table->timestamp('scanned_at');
            $table->timestamps();

            $table->index(['event_id', 'scanned_at']);
            $table->index(['attendee_id', 'direction']);
            $table->index(['event_session_id', 'result']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('check_ins');
        Schema::dropIfExists('check_in_points');
        Schema::dropIfExists('nfc_tags');
    }
};
