<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendee;
use App\Models\Contact;
use App\Models\Tenant;
use App\Services\CampaignAudience;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Past guests who never booked on Tikooh — imported from a CSV export of an
 * old platform, a spreadsheet or a sign-up sheet — so campaigns can reach them.
 */
class ContactController extends Controller
{
    /** Header spellings people actually use, mapped to our fields. */
    protected const HEADERS = [
        'email' => ['email', 'e-mail', 'email address', 'e-mail address', 'mail'],
        'phone' => ['phone', 'phones', 'phone number', 'phone numbers', 'phone no', 'phone no.', 'mobile', 'mobile number', 'mobile no', 'msisdn', 'tel', 'tel no', 'telephone', 'cell', 'whatsapp', 'contact', 'contacts', 'number', 'numbers'],
        'first_name' => ['first name', 'firstname', 'first_name', 'given name', 'fname'],
        'last_name' => ['last name', 'lastname', 'last_name', 'surname', 'family name', 'lname'],
        'name' => ['name', 'names', 'full name', 'full names', 'fullname', 'full_name', 'attendee', 'guest', 'guests', 'customer'],
    ];

    /**
     * Everyone an organiser can reach: registered attendees (one row per
     * person, however many events they came to) plus imported contacts.
     * Attendees are read live, not copied, so the list never goes stale and
     * campaigns don't count anyone twice.
     *
     * type: all (default) | attendees | imported
     */
    public function index(Request $request): JsonResponse
    {
        $search = trim($request->string('q')->toString());
        $type = $request->string('type')->toString() ?: 'all';
        $tenantId = $this->tenantFor($request, required: false);
        $like = '%'.addcslashes($search, '%_\\').'%';

        $matches = fn ($q) => $q->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
            ->where('email', 'like', $like)
            ->orWhere('phone', 'like', $like)
            ->orWhere('first_name', 'like', $like)
            ->orWhere('last_name', 'like', $like)));

        $imported = Contact::withoutGlobalScope('tenant')
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->tap($matches)
            ->selectRaw("id, 'contact' as kind, first_name, last_name, email, phone, source, 0 as events_count, created_at");

        // One row per person: attendees are unique per event + email.
        $attendees = Attendee::withoutGlobalScope('tenant')
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->tap($matches)
            ->selectRaw("MIN(id) as id, 'attendee' as kind, MAX(first_name) as first_name, MAX(last_name) as last_name, LOWER(email) as email, MAX(phone) as phone, NULL as source, COUNT(*) as events_count, MAX(created_at) as created_at")
            ->groupByRaw('LOWER(email)');

        $union = match ($type) {
            'imported' => $imported->toBase(),
            'attendees' => $attendees->toBase(),
            default => $attendees->toBase()->unionAll($imported->toBase()),
        };

        $page = DB::query()->fromSub($union, 'people')
            ->orderByDesc('created_at')->orderByDesc('id')
            ->paginate($request->integer('per_page', 25));

        // Walk-ins and phone-only imports carry a made-up email; don't show it.
        $page->getCollection()->transform(function ($row) {
            $row->email = $row->email && ! Attendee::isPlaceholderEmail($row->email) ? $row->email : null;
            $row->events_count = (int) $row->events_count;

            return $row;
        });

        return response()->json($page->toArray() + [
            'imported_total' => Contact::withoutGlobalScope('tenant')->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))->count(),
            'attendee_total' => (int) Attendee::withoutGlobalScope('tenant')->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
                ->selectRaw('COUNT(DISTINCT LOWER(email)) as n')->value('n'),
        ]);
    }

    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt,tsv', 'max:10240'],
            'source' => ['nullable', 'string', 'max:255'],
            'tenant_id' => ['nullable', 'integer'],
        ]);

        $tenantId = $this->tenantFor($request);
        $source = $request->input('source') ?: $request->file('file')->getClientOriginalName();

        $handle = fopen($request->file('file')->getRealPath(), 'r');
        $first = fgets($handle);
        // Excel saves CSVs with a BOM, and in some locales with semicolons.
        $first = preg_replace('/^\xEF\xBB\xBF/', '', (string) $first);
        $counts = [',' => substr_count($first, ','), ';' => substr_count($first, ';'), "\t" => substr_count($first, "\t")];
        arsort($counts);
        $delimiter = array_key_first($counts);
        $header = str_getcsv($first, $delimiter);
        $map = $this->mapColumns($header);

        // No email/phone header. Either the first line is already data, or it's
        // a header with labels we don't know — guess from the rows that follow.
        $pending = [];
        if (! isset($map['email']) && ! isset($map['phone'])) {
            $guess = $this->guessColumns($header);

            if (isset($guess['email']) || isset($guess['phone'])) {
                $map = $guess;
                $pending[] = $header;
            } else {
                for ($i = 0; $i < 5 && ($line = fgetcsv($handle, 0, $delimiter)) !== false; $i++) {
                    $pending[] = $line;
                }

                foreach ($pending as $line) {
                    $guess = $this->guessColumns($line);
                    if (isset($guess['email']) || isset($guess['phone'])) {
                        $map = $guess + $map;
                        break;
                    }
                }
            }
        }

        if (! isset($map['email']) && ! isset($map['phone'])) {
            fclose($handle);

            return response()->json(['message' => 'Couldn\'t find an email or phone column. Add a header row like: name, email, phone.'], 422);
        }

        $stats = ['added' => 0, 'updated' => 0, 'skipped' => 0];
        $rows = 0;

        while (($line = array_shift($pending) ?? fgetcsv($handle, 0, $delimiter)) !== false) {
            if (++$rows > 50_000) {
                break;
            }

            $this->importRow($tenantId, $source, $line, $map, $stats);
        }

        fclose($handle);

        return response()->json($stats + [
            'total' => Contact::withoutGlobalScope('tenant')->where('tenant_id', $tenantId)->count(),
        ]);
    }

    public function destroy(Contact $contact): JsonResponse
    {
        $contact->delete();

        return response()->json(null, 204);
    }

    /**
     * Whose contacts these are. Organisers always get their own account; a
     * super admin picks the organiser (tenant_id, or the impersonation header).
     */
    protected function tenantFor(Request $request, bool $required = true): ?int
    {
        $user = $request->user();

        if ($user->isSuperAdmin() && $request->filled('tenant_id')) {
            $tenant = TenantContext::withoutScoping(fn () => Tenant::find($request->integer('tenant_id')));
            abort_if($tenant === null, 422, 'That organiser no longer exists.');

            return $tenant->id;
        }

        $id = TenantContext::id() ?? $user->tenant_id;
        abort_if($required && $id === null, 422, 'Choose which organiser these contacts belong to.');

        return $id;
    }

    protected function importRow(int $tenantId, string $source, array $line, array $map, array &$stats): void
    {
        $get = fn (string $key) => isset($map[$key]) ? trim((string) ($line[$map[$key]] ?? '')) : '';

        $email = CampaignAudience::normalise('email', $get('email'));
        $phone = CampaignAudience::normalise('sms', $get('phone'));

        if (! $email && ! $phone) {
            $stats['skipped']++;

            return;
        }

        $first = $get('first_name');
        $last = $get('last_name');

        // Sign-up sheets often number their rows: "1. Annet", "2.Femina".
        $name = trim((string) preg_replace('/^\d+\s*[.)\-]\s*/', '', $get('name')));

        if ($first === '' && $name !== '') {
            [$first, $last] = array_pad(preg_split('/\s+/', $name, 2), 2, '');
        }

        $contact = Contact::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where($email ? 'email' : 'phone', $email ?: $phone)
            ->first() ?? new Contact(['tenant_id' => $tenantId]);

        $existed = $contact->exists;

        // Never blank out what an earlier import already knew.
        $contact->fill(array_filter([
            'email' => $email,
            'phone' => $phone,
            'first_name' => $first !== '' ? mb_substr($first, 0, 255) : null,
            'last_name' => $last !== '' ? mb_substr($last, 0, 255) : null,
            'source' => $existed ? null : $source,
        ]));
        $contact->tenant_id = $tenantId;
        $contact->save();

        $stats[$existed ? 'updated' : 'added']++;
    }

    /** @return array<string, int> */
    protected function mapColumns(array $header): array
    {
        $map = [];

        foreach ($header as $i => $label) {
            $label = strtolower(trim((string) $label));

            foreach (self::HEADERS as $field => $aliases) {
                if (! isset($map[$field]) && in_array($label, $aliases, true)) {
                    $map[$field] = $i;
                }
            }
        }

        return $map;
    }

    /** @return array<string, int> */
    protected function guessColumns(array $row): array
    {
        $map = [];

        foreach ($row as $i => $cell) {
            $cell = trim((string) $cell);

            if (! isset($map['email']) && filter_var($cell, FILTER_VALIDATE_EMAIL)) {
                $map['email'] = $i;
            } elseif (! isset($map['phone']) && preg_match('/^\+?[\d\s-]{9,15}$/', $cell)) {
                $map['phone'] = $i;
            } elseif (! isset($map['name']) && $cell !== '' && ! is_numeric($cell)) {
                $map['name'] = $i;
            }
        }

        return $map;
    }
}
