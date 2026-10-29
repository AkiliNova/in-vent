<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->after('id')
                ->constrained()->nullOnDelete();

            // super_admin  -> platform staff, no tenant
            // organizer    -> tenant owner
            // staff        -> tenant member (scanner / registration desk)
            // exhibitor    -> booth staff, scoped to an exhibitor record
            // attendee     -> end user of the mobile app / networking
            $table->string('role')->default('organizer')->after('email');

            $table->string('phone')->nullable()->after('role');
            $table->string('avatar_path')->nullable()->after('phone');
            $table->string('firebase_uid')->nullable()->unique()->after('avatar_path')
                ->comment('Set during migration so existing Firebase logins map to a user');
            $table->timestamp('last_login_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->softDeletes();

            $table->index(['tenant_id', 'role']);
        });

        // Password becomes nullable: users migrated from Firebase have no local hash
        // until they set one via the reset flow.
        Schema::table('users', function (Blueprint $table) {
            $table->string('password')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['tenant_id']);
            $table->dropIndex(['tenant_id', 'role']);
            $table->dropColumn([
                'tenant_id', 'role', 'phone', 'avatar_path', 'firebase_uid',
                'last_login_at', 'is_active', 'deleted_at',
            ]);
        });
    }
};
