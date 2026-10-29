<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Withdrawals become requests: the wallet is debited (held) immediately, the
 * platform funds the B2C shortcode from the C2B paybill, then an admin sends
 * it. `due_at` is the promise shown to the merchant.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payouts', function (Blueprint $table) {
            $table->timestamp('due_at')->nullable()->after('status');
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->timestamp('reminded_at')->nullable()->after('due_at');
            $table->timestamp('overdue_notified_at')->nullable()->after('reminded_at');
            $table->string('payment_method')->nullable()->after('destination_type')
                ->comment('b2c | manual — how the money actually left');
            $table->index(['status', 'due_at']);
        });
    }

    public function down(): void
    {
        Schema::table('payouts', function (Blueprint $table) {
            $table->dropIndex(['status', 'due_at']);
            $table->dropColumn(['due_at', 'approved_at', 'reminded_at', 'overdue_notified_at', 'payment_method']);
        });
    }
};
