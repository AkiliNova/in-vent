<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Provider credentials live here, encrypted at rest, and are only ever read
     * server-side. This replaces the previous arrangement where the browser read
     * SMS keys out of Firestore and posted them to the PHP proxy.
     */
    public function up(): void
    {
        Schema::create('integration_credentials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained()->cascadeOnDelete()
                ->comment('Null = platform-wide default credentials');

            // advanta_sms | pesapal | mpesa | paystack | smtp | openai | anthropic
            $table->string('provider');
            $table->string('label')->nullable();
            $table->text('credentials')->comment('Encrypted JSON payload');
            $table->boolean('is_active')->default(true);
            $table->boolean('is_sandbox')->default(false);
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'provider']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('integration_credentials');
    }
};
