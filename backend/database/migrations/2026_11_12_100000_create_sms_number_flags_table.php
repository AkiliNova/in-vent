<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Numbers the SMS provider rejected for good (invalid, unsupported
        // network, blacklisted, DND). Platform-wide: a dead number is dead for
        // every organiser, and resending to it only burns credit.
        Schema::create('sms_number_flags', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique()->comment('Digits only, e.g. 254712345678');
            $table->string('reason', 60)->comment('Provider status, e.g. InvalidPhoneNumber, UserInBlacklist');
            $table->string('provider', 30)->nullable();
            $table->unsignedInteger('failures')->default(1);
            $table->timestamp('last_failed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_number_flags');
    }
};
