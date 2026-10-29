<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Tikooh feature 2: the organizer-defined registration form.
        Schema::create('registration_fields', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->cascadeOnDelete()
                ->comment('Null = tenant-wide default form');

            $table->string('key')->comment('Stable machine name used as the custom_fields JSON key');
            $table->string('label');
            $table->string('type')->default('text')
                ->comment('text | email | phone | number | date | select | multiselect | checkbox | textarea | file');
            $table->boolean('required')->default(false);
            $table->unsignedTinyInteger('step')->default(1);
            $table->unsignedInteger('sort_order')->default(0);
            $table->string('placeholder')->nullable();
            $table->json('options')->nullable();
            $table->json('validation')->nullable();
            $table->boolean('enabled')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'event_id', 'key']);
            $table->index(['event_id', 'enabled', 'step']);
        });

        Schema::create('attendees', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('legacy_id')->nullable()->index();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete()
                ->comment('Set when the attendee has an app login');

            $table->string('first_name');
            $table->string('last_name')->nullable();
            $table->string('email');
            $table->string('phone')->nullable();
            $table->string('company')->nullable();
            $table->string('job_title')->nullable();
            $table->string('country', 2)->nullable();

            $table->string('category')->default('General')
                ->comment('General | VIP | Speaker | Press | Exhibitor | Organizer');
            $table->string('status')->default('registered')
                ->comment('registered | checked_in | no_show | cancelled');

            $table->decimal('amount_paid', 12, 2)->default(0);
            $table->timestamp('registered_at')->nullable();
            $table->timestamp('checked_in_at')->nullable();

            $table->json('custom_fields')->nullable();
            $table->json('dietary_requirements')->nullable();
            $table->text('accessibility_notes')->nullable();

            $table->boolean('consent_marketing')->default(false);
            $table->boolean('consent_share_profile')->default(false)
                ->comment('Gates visibility in the networking directory and lead capture');

            $table->timestamps();
            $table->softDeletes();

            $table->unique(['event_id', 'email']);
            $table->index(['tenant_id', 'status']);
            $table->index(['event_id', 'category']);
        });

        // Tikooh feature 13: the public-facing half of an attendee record.
        Schema::create('attendee_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendee_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('headline')->nullable();
            $table->text('bio')->nullable();
            $table->string('avatar_path')->nullable();
            $table->json('interests')->nullable();
            $table->json('looking_for')->nullable()->comment('partners | investors | clients | jobs | knowledge');
            $table->json('social_links')->nullable();
            $table->string('visibility')->default('event')->comment('public | event | connections | hidden');
            $table->boolean('open_to_meetings')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendee_profiles');
        Schema::dropIfExists('attendees');
        Schema::dropIfExists('registration_fields');
    }
};
