<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Up to three of the sender's own numbers that get a copy of every SMS
        // campaign (first, before the audience) so they see exactly what landed.
        Schema::table('campaigns', function (Blueprint $table) {
            $table->json('monitor_numbers')->nullable()->after('audience_filter');
        });

        Schema::table('campaign_recipients', function (Blueprint $table) {
            $table->boolean('is_monitor')->default(false)->after('attendee_id');
            $table->index('provider_reference');
        });

        // Remembered per user so the composer pre-fills them every time.
        Schema::table('users', function (Blueprint $table) {
            $table->json('sms_monitor_numbers')->nullable()->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('sms_monitor_numbers'));
        Schema::table('campaign_recipients', function (Blueprint $table) {
            $table->dropIndex(['provider_reference']);
            $table->dropColumn('is_monitor');
        });
        Schema::table('campaigns', fn (Blueprint $table) => $table->dropColumn('monitor_numbers'));
    }
};
