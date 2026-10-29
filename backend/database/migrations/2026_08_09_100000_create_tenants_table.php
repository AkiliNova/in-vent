<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('legacy_id')->nullable()->unique()->comment('Firestore document id, kept for migration traceability');
            $table->string('organization_name');
            $table->string('slug')->unique();
            $table->string('email');
            $table->string('phone')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('website')->nullable();
            $table->string('country', 2)->default('KE');
            $table->string('timezone')->default('Africa/Nairobi');
            $table->string('currency', 3)->default('KES');

            $table->string('package')->default('starter');
            $table->boolean('suspended')->default(false);
            $table->timestamp('trial_ends_at')->nullable();

            // Per-tenant feature flags and branding, e.g. {"modules":{"networking":true}}
            $table->json('settings')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index('suspended');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenants');
    }
};
