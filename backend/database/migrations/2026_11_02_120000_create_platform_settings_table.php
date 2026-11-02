<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Settings the platform admin edits in the app instead of the server's .env.
 * Each row overrides one config path; values are encrypted at rest because
 * many of them are provider secrets.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique()->comment('Config path, e.g. services.africastalking.api_key');
            $table->text('value')->nullable()->comment('Encrypted');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_settings');
    }
};
