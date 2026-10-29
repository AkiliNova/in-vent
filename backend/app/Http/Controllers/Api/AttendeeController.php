<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Attendee;
use App\Models\Event;
use App\Models\RegistrationField;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttendeeController extends Controller
{
    public function index(Request $request, Event $event): JsonResponse
    {
        $attendees = $event->attendees()
            ->with('badge:id,attendee_id,status,serial')
            ->when($request->string('search')->toString(), fn ($q, $s) => $q->where(
                fn ($w) => $w->where('first_name', 'like', "%{$s}%")
                    ->orWhere('last_name', 'like', "%{$s}%")
                    ->orWhere('email', 'like', "%{$s}%")
                    ->orWhere('company', 'like', "%{$s}%")
            ))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->string('category')->toString(), fn ($q, $c) => $q->where('category', $c))
            ->orderBy('last_name')
            ->paginate($request->integer('per_page', 50));

        return response()->json($attendees);
    }

    /** Public registration — validated against the organizer's own field set. */
    public function register(Request $request, string $eventUuid): JsonResponse
    {
        $event = TenantContext::withoutScoping(fn () => Event::publiclyVisible()
            ->where('uuid', $eventUuid)
            ->firstOrFail());

        $fields = TenantContext::withoutScoping(fn () => RegistrationField::query()
            ->where('tenant_id', $event->tenant_id)
            ->where(fn ($q) => $q->where('event_id', $event->id)->orWhereNull('event_id'))
            ->where('enabled', true)
            ->get());

        $rules = [
            'first_name' => ['required', 'string', 'max:120'],
            'last_name' => ['nullable', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'company' => ['nullable', 'string', 'max:255'],
            'job_title' => ['nullable', 'string', 'max:255'],
            'consent_marketing' => ['boolean'],
            'consent_share_profile' => ['boolean'],
        ];

        foreach ($fields as $field) {
            $rules["custom_fields.{$field->key}"] = $field->rules();
        }

        $data = $request->validate($rules);

        if ($event->capacity && $event->attendees()->count() >= $event->capacity) {
            return response()->json(['message' => 'This event is full.'], 422);
        }

        $attendee = TenantContext::withoutScoping(fn () => Attendee::updateOrCreate(
            ['event_id' => $event->id, 'email' => strtolower($data['email'])],
            array_merge($data, [
                'tenant_id' => $event->tenant_id,
                'email' => strtolower($data['email']),
                'registered_at' => now(),
                'status' => 'registered',
            ])
        ));

        return response()->json([
            'uuid' => $attendee->uuid,
            'message' => 'You are registered.',
        ], 201);
    }

    public function store(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:120'],
            'last_name' => ['nullable', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'company' => ['nullable', 'string', 'max:255'],
            'job_title' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:64'],
            'custom_fields' => ['nullable', 'array'],
        ]);

        $attendee = $event->attendees()->create($data + [
            'tenant_id' => $event->tenant_id,
            'registered_at' => now(),
            'status' => 'registered',
        ]);

        ActivityLog::record('created', $attendee, "Added attendee {$attendee->full_name}");

        return response()->json($attendee, 201);
    }

    public function update(Request $request, Event $event, Attendee $attendee): JsonResponse
    {
        abort_if($attendee->event_id !== $event->id, 404);

        $attendee->update($request->validate([
            'first_name' => ['sometimes', 'string', 'max:120'],
            'last_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:32'],
            'company' => ['nullable', 'string', 'max:255'],
            'job_title' => ['nullable', 'string', 'max:255'],
            'category' => ['sometimes', 'string', 'max:64'],
            'status' => ['sometimes', 'in:registered,checked_in,no_show,cancelled'],
            'custom_fields' => ['nullable', 'array'],
            'accessibility_notes' => ['nullable', 'string'],
            'dietary_requirements' => ['nullable', 'array'],
        ]));

        return response()->json($attendee->fresh());
    }

    public function destroy(Event $event, Attendee $attendee): JsonResponse
    {
        abort_if($attendee->event_id !== $event->id, 404);

        $attendee->delete();

        ActivityLog::record('deleted', $attendee);

        return response()->json(null, 204);
    }

    /** Streamed so a 50k-attendee export doesn't exhaust memory. */
    public function export(Event $event): StreamedResponse
    {
        $filename = str($event->title)->slug().'-attendees-'.now()->format('Ymd').'.csv';

        return response()->streamDownload(function () use ($event) {
            $out = fopen('php://output', 'w');

            fputcsv($out, [
                'First name', 'Last name', 'Email', 'Phone', 'Company', 'Job title',
                'Category', 'Status', 'Registered', 'Checked in', 'Amount paid',
            ]);

            $event->attendees()->chunkById(500, function ($rows) use ($out) {
                foreach ($rows as $a) {
                    fputcsv($out, [
                        $a->first_name, $a->last_name, $a->email, $a->phone,
                        $a->company, $a->job_title, $a->category, $a->status,
                        $a->registered_at?->format('Y-m-d H:i'),
                        $a->checked_in_at?->format('Y-m-d H:i'),
                        $a->amount_paid,
                    ]);
                }
            });

            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv']);
    }
}
