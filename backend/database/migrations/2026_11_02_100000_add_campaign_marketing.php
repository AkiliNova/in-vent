<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marketing campaigns: imported contact lists (guests from before Tikooh),
 * a featured event / call-to-action per campaign, and recipient names so
 * personalisation works for contacts that are not attendees.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('email')->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('source')->nullable()->comment('File name or list the contact was imported from');
            $table->timestamps();

            $table->unique(['tenant_id', 'email']);
            $table->index(['tenant_id', 'phone']);
        });

        Schema::table('campaigns', function (Blueprint $table) {
            $table->foreignId('featured_event_id')->nullable()->after('event_id')->constrained('events')->nullOnDelete();
            $table->string('cta_label')->nullable()->after('image_path');
            $table->string('cta_url', 2048)->nullable()->after('cta_label');
        });

        Schema::table('campaign_recipients', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('destination');
            $table->string('last_name')->nullable()->after('first_name');
        });
    }

    public function down(): void
    {
        Schema::table('campaign_recipients', function (Blueprint $table) {
            $table->dropColumn(['first_name', 'last_name']);
        });

        Schema::table('campaigns', function (Blueprint $table) {
            $table->dropConstrainedForeignId('featured_event_id');
            $table->dropColumn(['cta_label', 'cta_url']);
        });

        Schema::dropIfExists('contacts');
    }
};
