<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Services\CampaignAudience;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Past guests who never booked on Tikooh — imported from a CSV export of an
 * old platform, a spreadsheet or a sign-up sheet — so campaigns can reach them.
 */
class ContactController extends Controller
{
    /** Header spellings people actually use, mapped to our fields. */
    protected const HEADERS = [
        'email' => ['email', 'e-mail', 'email address', 'e-mail address', 'mail'],
        'phone' => ['phone', 'phone number', 'mobile', 'mobile number', 'msisdn', 'tel', 'telephone', 'cell', 'whatsapp'],
        'first_name' => ['first name', 'firstname', 'first_name', 'given name', 'fname'],
        'last_name' => ['last name', 'lastname', 'last_name', 'surname', 'family name', 'lname'],
        'name' => ['name', 'full name', 'fullname', 'full_name', 'attendee', 'guest', 'customer'],
    ];

    public function index(Request $request): JsonResponse
    {
        $search = trim($request->string('q')->toString());

        $page = Contact::query()
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('email', 'like', "%{$search}%")
                ->orWhere('phone', 'like', "%{$search}%")
                ->orWhere('first_name', 'like', "%{$search}%")
                ->orWhere('last_name', 'like', "%{$search}%")))
            ->latest('id')
            ->paginate($request->integer('per_page', 25));

        return response()->json($page);
    }

    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:10240'],
            'source' => ['nullable', 'string', 'max:255'],
        ]);

        $tenantId = TenantContext::id() ?? $request->user()->tenant_id;
        $source = $request->input('source') ?: $request->file('file')->getClientOriginalName();

        $handle = fopen($request->file('file')->getRealPath(), 'r');
        $first = fgets($handle);
        // Excel saves CSVs with a BOM, and in some locales with semicolons.
        $first = preg_replace('/^\xEF\xBB\xBF/', '', (string) $first);
        $delimiter = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';
        $header = str_getcsv($first, $delimiter);
        $map = $this->mapColumns($header);

        // No recognisable header: treat the first line as data and guess.
        $pending = [];
        if (! isset($map['email']) && ! isset($map['phone'])) {
            $map = $this->guessColumns($header);
            $pending[] = $header;
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

        if ($first === '' && $get('name') !== '') {
            [$first, $last] = array_pad(preg_split('/\s+/', $get('name'), 2), 2, '');
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
