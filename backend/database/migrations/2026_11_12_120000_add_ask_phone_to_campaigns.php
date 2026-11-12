<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Email campaigns that carry a personal "Add my phone number" link,
        // so guests who registered without one can fill it in themselves.
        Schema::table('campaigns', function (Blueprint $table) {
            $table->boolean('ask_phone')->default(false)->after('cta_url');
        });

        Schema::table('campaign_recipients', function (Blueprint $table) {
            $table->timestamp('phone_added_at')->nullable()->after('delivered_at');
        });
    }

    public function down(): void
    {
        Schema::table('campaign_recipients', fn (Blueprint $table) => $table->dropColumn('phone_added_at'));
        Schema::table('campaigns', fn (Blueprint $table) => $table->dropColumn('ask_phone'));
    }
};
