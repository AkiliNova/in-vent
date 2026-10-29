<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promo_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->cascadeOnDelete()
                ->comment('Null = valid across all of the tenant\'s events');

            $table->string('code');
            $table->string('discount_type')->default('percent')->comment('percent | fixed');
            $table->decimal('discount_value', 12, 2);
            $table->unsignedInteger('max_uses')->default(0)->comment('0 = unlimited');
            $table->unsignedInteger('used_count')->default(0);
            $table->unsignedInteger('max_uses_per_email')->default(1);
            $table->decimal('min_order_amount', 12, 2)->default(0);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->index(['event_id', 'active']);
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('reference')->unique()->comment('Merchant reference sent to the payment provider');
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('promo_code_id')->nullable()->constrained()->nullOnDelete();

            $table->string('buyer_name');
            $table->string('buyer_email');
            $table->string('buyer_phone')->nullable();

            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('discount_amount', 12, 2)->default(0);
            $table->decimal('fee_amount', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->string('currency', 3)->default('KES');

            $table->string('status')->default('pending')
                ->comment('pending | paid | failed | cancelled | refunded | expired');
            $table->string('provider')->nullable()->comment('pesapal | mpesa | paystack | free | manual');
            $table->string('provider_reference')->nullable()->index();

            $table->json('metadata')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index(['event_id', 'status']);
            $table->index('buyer_email');
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ticket_tier_id')->constrained()->restrictOnDelete();
            $table->string('tier_name')->comment('Denormalised so historic orders survive tier renames');
            $table->unsignedInteger('quantity');
            $table->decimal('unit_price', 12, 2);
            $table->decimal('subtotal', 12, 2);
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('provider');
            $table->string('provider_reference')->nullable()->index();
            $table->string('provider_account')->nullable()->comment('Phone number or card mask');
            $table->decimal('amount', 12, 2);
            $table->string('currency', 3)->default('KES');
            $table->string('status')->default('pending')
                ->comment('pending | completed | failed | reversed');
            $table->string('failure_reason')->nullable();
            $table->json('raw_response')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('tickets', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('legacy_id')->nullable()->index();
            $table->string('code')->unique()->comment('Value encoded into the QR / NFC payload');

            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('ticket_tier_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('attendee_id')->nullable()->constrained()->nullOnDelete();

            $table->string('holder_name')->nullable();
            $table->string('holder_email')->nullable();
            $table->decimal('price_paid', 12, 2)->default(0);

            $table->string('status')->default('valid')
                ->comment('valid | used | void | refunded | transferred');
            $table->timestamp('checked_in_at')->nullable();
            $table->string('seat_label')->nullable();
            $table->timestamps();

            $table->index(['event_id', 'status']);
            $table->index('holder_email');
        });

        // Tikooh: organizer payouts once an event settles.
        Schema::create('payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('gross_amount', 12, 2);
            $table->decimal('platform_fee', 12, 2)->default(0);
            $table->decimal('net_amount', 12, 2);
            $table->string('currency', 3)->default('KES');
            $table->string('destination_type')->default('mpesa')->comment('mpesa | bank');
            $table->string('destination_account')->nullable();
            $table->string('status')->default('pending')
                ->comment('pending | approved | processing | paid | rejected');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payouts');
        Schema::dropIfExists('tickets');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('promo_codes');
    }
};
