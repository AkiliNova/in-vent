<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\PromoCode;
use App\Models\RegistrationField;
use App\Models\TicketTier;
use App\Models\WaitlistEntry;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/** Ticket tiers, the registration form, promo codes and the waitlist. */
class EventSettingsController extends Controller
{
    // ── Ticket tiers ────────────────────────────────────────────────────────

    public function tiers(Event $event): JsonResponse
    {
        return response()->json($event->ticketTiers);
    }

    public function storeTier(Request $request, Event $event): JsonResponse
    {
        return response()->json($event->ticketTiers()->create($request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'price' => ['required', 'numeric', 'min:0'],
            'capacity' => ['required', 'integer', 'min:0'],
            'min_per_order' => ['nullable', 'integer', 'min:1'],
            'max_per_order' => ['nullable', 'integer', 'min:1'],
            'sales_start_at' => ['nullable', 'date'],
            'sales_end_at' => ['nullable', 'date', 'after:sales_start_at'],
            'is_active' => ['boolean'],
            'is_hidden' => ['boolean'],
            'attendee_category' => ['nullable', 'string', 'max:64'],
            'sort_order' => ['nullable', 'integer'],
        ])), 201);
    }

    public function updateTier(Request $request, Event $event, TicketTier $tier): JsonResponse
    {
        abort_if($tier->event_id !== $event->id, 404);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'price' => ['sometimes', 'numeric', 'min:0'],
            'capacity' => ['sometimes', 'integer', 'min:0'],
            'sales_start_at' => ['nullable', 'date'],
            'sales_end_at' => ['nullable', 'date'],
            'is_active' => ['boolean'],
            'is_hidden' => ['boolean'],
            'attendee_category' => ['nullable', 'string', 'max:64'],
        ]);

        // Capacity can be raised freely, but never below what's already sold.
        if (isset($data['capacity']) && $data['capacity'] > 0 && $data['capacity'] < $tier->sold) {
            return response()->json([
                'message' => "{$tier->sold} tickets are already sold at this tier.",
            ], 422);
        }

        $tier->update($data);

        return response()->json($tier->fresh());
    }

    public function destroyTier(Event $event, TicketTier $tier): JsonResponse
    {
        abort_if($tier->event_id !== $event->id, 404);

        if ($tier->sold > 0) {
            return response()->json([
                'message' => 'Tickets have been sold at this tier. Deactivate it instead.',
            ], 422);
        }

        $tier->delete();

        return response()->json(null, 204);
    }

    // ── Registration form ───────────────────────────────────────────────────

    public function fields(Event $event): JsonResponse
    {
        return response()->json(
            RegistrationField::where(fn ($q) => $q->where('event_id', $event->id)->orWhereNull('event_id'))
                ->orderBy('step')
                ->orderBy('sort_order')
                ->get()
        );
    }

    public function saveFields(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'fields' => ['present', 'array', 'max:100'],
            'fields.*.id' => ['nullable', 'integer'],
            'fields.*.label' => ['required', 'string', 'max:255'],
            'fields.*.key' => ['nullable', 'string', 'max:64', 'regex:/^[a-z][a-z0-9_]*$/'],
            'fields.*.type' => ['required', 'in:text,email,phone,number,date,select,multiselect,checkbox,textarea,file'],
            'fields.*.required' => ['boolean'],
            'fields.*.step' => ['nullable', 'integer', 'min:1', 'max:5'],
            'fields.*.sort_order' => ['nullable', 'integer'],
            'fields.*.placeholder' => ['nullable', 'string', 'max:255'],
            'fields.*.options' => ['nullable', 'array'],
            'fields.*.enabled' => ['boolean'],
        ]);

        $keptIds = collect($data['fields'])->pluck('id')->filter()->all();

        RegistrationField::where('event_id', $event->id)->whereNotIn('id', $keptIds)->delete();

        $saved = collect($data['fields'])->map(function ($field, $i) use ($event) {
            // The key becomes the custom_fields JSON key, so it has to be stable
            // once answers exist — derive it from the label only on creation.
            $field['key'] ??= Str::snake(Str::ascii($field['label']));
            $field['sort_order'] ??= $i;

            return RegistrationField::updateOrCreate(
                ['id' => $field['id'] ?? null],
                array_diff_key($field, ['id' => null]) + [
                    'tenant_id' => $event->tenant_id,
                    'event_id' => $event->id,
                ]
            );
        });

        return response()->json($saved);
    }

    // ── Promo codes ─────────────────────────────────────────────────────────

    public function promoCodes(Event $event): JsonResponse
    {
        return response()->json(
            PromoCode::where(fn ($q) => $q->where('event_id', $event->id)->orWhereNull('event_id'))
                ->withCount(['orders as redeemed_count' => fn ($q) => $q->where('status', 'paid')])
                ->latest()
                ->get()
        );
    }

    public function storePromoCode(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/'],
            'discount_type' => ['required', 'in:percent,fixed'],
            'discount_value' => ['required', 'numeric', 'min:0'],
            'max_uses' => ['nullable', 'integer', 'min:0'],
            'max_uses_per_email' => ['nullable', 'integer', 'min:0'],
            'min_order_amount' => ['nullable', 'numeric', 'min:0'],
            'starts_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date', 'after:starts_at'],
            'active' => ['boolean'],
            'all_events' => ['boolean'],
        ]);

        if ($data['discount_type'] === 'percent' && $data['discount_value'] > 100) {
            return response()->json(['message' => 'A percentage discount cannot exceed 100.'], 422);
        }

        $promo = PromoCode::create(array_diff_key($data, ['all_events' => null]) + [
            'tenant_id' => $event->tenant_id,
            'event_id' => ($data['all_events'] ?? false) ? null : $event->id,
            'code' => strtoupper($data['code']),
        ]);

        return response()->json($promo, 201);
    }

    public function updatePromoCode(Request $request, Event $event, PromoCode $promoCode): JsonResponse
    {
        $promoCode->update($request->validate([
            'discount_value' => ['sometimes', 'numeric', 'min:0'],
            'max_uses' => ['nullable', 'integer', 'min:0'],
            'expires_at' => ['nullable', 'date'],
            'active' => ['boolean'],
        ]));

        return response()->json($promoCode->fresh());
    }

    // ── Waitlist ────────────────────────────────────────────────────────────

    public function waitlist(Event $event): JsonResponse
    {
        return response()->json($event->waitlistEntries()->latest()->paginate(50));
    }

    /** Public: join the waitlist when an event or tier is sold out. */
    public function joinWaitlist(Request $request, string $eventUuid): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'quantity' => ['nullable', 'integer', 'min:1', 'max:20'],
            'ticket_tier_id' => ['nullable', 'integer'],
        ]);

        $event = TenantContext::withoutScoping(
            fn () => Event::publiclyVisible()->where('uuid', $eventUuid)->firstOrFail()
        );

        abort_unless($event->waitlist_enabled, 422, 'This event has no waitlist.');

        TenantContext::withoutScoping(fn () => WaitlistEntry::updateOrCreate(
            ['event_id' => $event->id, 'email' => strtolower($data['email'])],
            $data + ['email' => strtolower($data['email'])]
        ));

        return response()->json(['message' => "You're on the list. We'll email you if a place opens up."], 201);
    }
}
