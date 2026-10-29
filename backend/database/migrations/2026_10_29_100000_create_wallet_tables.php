<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Merchant wallets. Ticket money lands on the platform paybill (STK or C2B),
 * is credited to the organiser's ledger net of the platform fee, and leaves
 * through B2C when the organiser withdraws.
 *
 * The balance is never stored: it is the sum of `wallet_entries`, so a credit
 * and its matching debit can never drift apart.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('business_type')->nullable()->after('organization_name')
                ->comment('individual | company | ngo | church | school | other');
            $table->string('contact_person')->nullable()->after('business_type');
            $table->string('kra_pin', 20)->nullable()->after('phone');
            $table->string('payout_phone', 20)->nullable()->after('kra_pin')
                ->comment('M-Pesa number B2C withdrawals are sent to');
            $table->string('payout_name')->nullable()->after('payout_phone');
            $table->decimal('platform_fee_percent', 5, 2)->nullable()->after('payout_name')
                ->comment('Null = config default');
            $table->timestamp('onboarded_at')->nullable()->after('trial_ends_at');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('pay_code', 12)->nullable()->unique()->after('reference')
                ->comment('Short account number buyers type when paying the paybill directly (C2B)');
        });

        Schema::table('payouts', function (Blueprint $table) {
            $table->foreignId('requested_by')->nullable()->after('approved_by')->constrained('users')->nullOnDelete();
            $table->uuid('originator_conversation_id')->nullable()->unique()->after('destination_account');
            $table->string('conversation_id')->nullable()->index()->after('originator_conversation_id');
            $table->string('mpesa_receipt')->nullable()->after('conversation_id');
            $table->string('result_code', 16)->nullable()->after('mpesa_receipt');
            $table->string('result_desc')->nullable()->after('result_code');
            $table->json('raw_result')->nullable()->after('notes');
        });

        Schema::create('wallet_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('payout_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type')->comment('sale | platform_fee | withdrawal | withdrawal_reversal | adjustment');
            $table->decimal('amount', 12, 2)->comment('Signed: credits positive, debits negative');
            $table->string('currency', 3)->default('KES');
            $table->string('description')->nullable();
            $table->timestamps();

            // A provider retrying a callback must not credit the same sale twice.
            $table->unique(['order_id', 'type']);
            $table->unique(['payout_id', 'type']);
            $table->index(['tenant_id', 'created_at']);
        });

        Schema::create('mpesa_c2b_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('trans_id')->unique()->comment('M-Pesa receipt');
            $table->string('trans_type')->nullable();
            $table->decimal('amount', 12, 2);
            $table->string('bill_ref_number')->nullable()->index();
            $table->string('msisdn')->nullable();
            $table->string('first_name')->nullable();
            $table->string('business_short_code')->nullable();
            $table->string('trans_time')->nullable();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status')->default('unmatched')
                ->comment('matched | unmatched | underpaid | duplicate');
            $table->json('raw')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mpesa_c2b_transactions');
        Schema::dropIfExists('wallet_entries');

        Schema::table('payouts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('requested_by');
            $table->dropColumn([
                'originator_conversation_id', 'conversation_id', 'mpesa_receipt',
                'result_code', 'result_desc', 'raw_result',
            ]);
        });

        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn('pay_code'));

        Schema::table('tenants', fn (Blueprint $table) => $table->dropColumn([
            'business_type', 'contact_person', 'kra_pin', 'payout_phone',
            'payout_name', 'platform_fee_percent', 'onboarded_at',
        ]));
    }
};
