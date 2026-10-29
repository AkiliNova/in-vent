<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendee;
use App\Models\Booth;
use App\Models\Event;
use App\Models\Exhibitor;
use App\Models\Lead;
use App\Models\NfcTag;
use App\Models\Ticket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Tikooh features 5 (exhibitors, booths) and 9 (badge-scan lead capture). */
class ExhibitorController extends Controller
{
    public function index(Request $request, Event $event): JsonResponse
    {
        return response()->json(
            $event->exhibitors()
                ->withCount('leads')
                ->with('booths:id,exhibitor_id,code,status')
                ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
                ->orderBy('company_name')
                ->paginate($request->integer('per_page', 50))
        );
    }

    public function store(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'company_name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'website' => ['nullable', 'url', 'max:255'],
            'industry' => ['nullable', 'string', 'max:120'],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'contact_email' => ['nullable', 'email', 'max:255'],
            'contact_phone' => ['nullable', 'string', 'max:32'],
            'package' => ['nullable', 'string', 'max:64'],
            'amount_paid' => ['nullable', 'numeric', 'min:0'],
            'staff_quota' => ['nullable', 'integer', 'min:0', 'max:100'],
            'products' => ['nullable', 'array'],
        ]);

        $exhibitor = $event->exhibitors()->create($data + [
            'tenant_id' => $event->tenant_id,
            'slug' => Str::slug($data['company_name']).'-'.Str::random(4),
        ]);

        return response()->json($exhibitor, 201);
    }

    public function update(Request $request, Event $event, Exhibitor $exhibitor): JsonResponse
    {
        abort_if($exhibitor->event_id !== $event->id, 404);

        $exhibitor->update($request->validate([
            'company_name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'website' => ['nullable', 'url', 'max:255'],
            'status' => ['sometimes', 'in:pending,confirmed,cancelled'],
            'package' => ['nullable', 'string', 'max:64'],
            'staff_quota' => ['nullable', 'integer', 'min:0', 'max:100'],
        ]));

        return response()->json($exhibitor->fresh());
    }

    // ── Booths ──────────────────────────────────────────────────────────────

    public function booths(Event $event): JsonResponse
    {
        return response()->json(
            $event->booths()
                ->with('exhibitor:id,company_name,logo_path', 'floorPlanItem:id,x,y,width,height')
                ->orderBy('code')
                ->get()
        );
    }

    public function storeBooth(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:32'],
            'size_label' => ['nullable', 'string', 'max:32'],
            'area_sqm' => ['nullable', 'numeric', 'min:0'],
            'price' => ['nullable', 'numeric', 'min:0'],
            'amenities' => ['nullable', 'array'],
            'floor_plan_item_id' => ['nullable', 'integer', 'exists:floor_plan_items,id'],
        ]);

        return response()->json($event->booths()->create($data), 201);
    }

    public function assignBooth(Request $request, Event $event, Booth $booth): JsonResponse
    {
        abort_if($booth->event_id !== $event->id, 404);

        $data = $request->validate([
            'exhibitor_id' => ['required', 'integer', 'exists:exhibitors,id'],
        ]);

        $exhibitor = $event->exhibitors()->findOrFail($data['exhibitor_id']);

        $booth->assignTo($exhibitor);

        return response()->json($booth->fresh('exhibitor'));
    }

    // ── Booth staff ─────────────────────────────────────────────────────────

    public function storeStaff(Request $request, Event $event, Exhibitor $exhibitor): JsonResponse
    {
        abort_if($exhibitor->event_id !== $event->id, 404);

        if ($exhibitor->staff()->count() >= $exhibitor->staff_quota) {
            return response()->json([
                'message' => "This package includes {$exhibitor->staff_quota} booth passes.",
            ], 422);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
        ]);

        $staff = $exhibitor->staff()->create($data + [
            // Short PIN so booth staff can sign in to the scanning app without
            // an account; regenerate to revoke.
            'scan_pin' => (string) random_int(100000, 999999),
        ]);

        return response()->json([
            'id' => $staff->id,
            'name' => $staff->name,
            'scan_pin' => $staff->scan_pin,
        ], 201);
    }

    // ── Lead capture (feature 9) ────────────────────────────────────────────

    /**
     * Booth staff scan an attendee badge. The scan is what "attendee information
     * updates automatically" means: it creates a lead and exchanges contact
     * details, subject to the attendee's own consent flag.
     */
    public function captureLead(Request $request, Event $event, Exhibitor $exhibitor): JsonResponse
    {
        abort_if($exhibitor->event_id !== $event->id, 404);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:255'],
            'method' => ['nullable', 'in:nfc,qr,manual,business_card'],
            'booth_id' => ['nullable', 'integer', 'exists:booths,id'],
            'staff_id' => ['nullable', 'integer', 'exists:exhibitor_staff,id'],
            'rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'tags' => ['nullable', 'array'],
            'answers' => ['nullable', 'array'],
        ]);

        $attendee = $this->resolveAttendee($event, $data['code'], $data['method'] ?? 'nfc');

        if (! $attendee) {
            return response()->json(['message' => 'Badge not recognised.'], 404);
        }

        // Re-scanning the same attendee updates the note rather than duplicating.
        $lead = Lead::updateOrCreate(
            ['exhibitor_id' => $exhibitor->id, 'attendee_id' => $attendee->id],
            [
                'event_id' => $event->id,
                'booth_id' => $data['booth_id'] ?? null,
                'captured_by' => $data['staff_id'] ?? null,
                'method' => $data['method'] ?? 'nfc',
                'rating' => $data['rating'] ?? null,
                'notes' => $data['notes'] ?? null,
                'tags' => $data['tags'] ?? null,
                'answers' => $data['answers'] ?? null,
                'captured_at' => now(),
            ]
        );

        return response()->json([
            'lead_id' => $lead->id,
            'contact' => $lead->contactCard(),
            'consented' => $attendee->consent_share_profile,
        ], 201);
    }

    public function leads(Request $request, Event $event, Exhibitor $exhibitor): JsonResponse
    {
        abort_if($exhibitor->event_id !== $event->id, 404);

        $leads = $exhibitor->leads()
            ->with('attendee:id,first_name,last_name,email,phone,company,job_title,consent_share_profile')
            ->latest('captured_at')
            ->paginate($request->integer('per_page', 50));

        $leads->through(fn (Lead $lead) => [
            'id' => $lead->id,
            'contact' => $lead->contactCard(),
            'rating' => $lead->rating,
            'notes' => $lead->notes,
            'tags' => $lead->tags,
            'captured_at' => $lead->captured_at,
        ]);

        return response()->json($leads);
    }

    public function exportLeads(Event $event, Exhibitor $exhibitor): StreamedResponse
    {
        abort_if($exhibitor->event_id !== $event->id, 404);

        return response()->streamDownload(function () use ($exhibitor) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Name', 'Company', 'Job title', 'Email', 'Phone', 'Rating', 'Notes', 'Captured']);

            $exhibitor->leads()->with('attendee')->chunkById(500, function ($leads) use ($out) {
                foreach ($leads as $lead) {
                    $card = $lead->contactCard();
                    fputcsv($out, [
                        $card['name'], $card['company'], $card['job_title'],
                        // Blank where the attendee did not consent to sharing.
                        $card['email'] ?? '', $card['phone'] ?? '',
                        $lead->rating, $lead->notes,
                        $lead->captured_at?->format('Y-m-d H:i'),
                    ]);
                }
            });

            fclose($out);
        }, Str::slug($exhibitor->company_name).'-leads.csv', ['Content-Type' => 'text/csv']);
    }

    protected function resolveAttendee(Event $event, string $code, string $method): ?Attendee
    {
        if ($method === 'nfc') {
            return NfcTag::where('uid', $code)->first()?->attendee;
        }

        $ticket = Ticket::withoutGlobalScope('tenant')
            ->where('code', $code)
            ->where('event_id', $event->id)
            ->first();

        return $ticket?->attendee
            ?? $event->attendees()->where('email', strtolower($code))->first();
    }
}
