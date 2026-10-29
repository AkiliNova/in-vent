<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Event;
use App\Services\Sms\AdvantaSmsClient;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/** The organiser's business profile and onboarding checklist. */
class MerchantController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;

        $hasEvent = Event::query()->exists();
        $hasPublished = Event::query()->where('status', 'published')->exists();

        return response()->json([
            'profile' => [
                'organization_name' => $tenant->organization_name,
                'business_type' => $tenant->business_type,
                'contact_person' => $tenant->contact_person,
                'email' => $tenant->email,
                'phone' => $tenant->phone,
                'kra_pin' => $tenant->kra_pin,
                'payout_phone' => $tenant->payout_phone ? WalletService::maskPhone($tenant->payout_phone) : null,
                'payout_name' => $tenant->payout_name,
                'package' => $tenant->package,
                'fee_percent' => $tenant->feePercent(),
                'onboarded_at' => $tenant->onboarded_at,
            ],
            'checklist' => [
                ['key' => 'account', 'label' => 'Create your account', 'done' => true],
                ['key' => 'business', 'label' => 'Tell us about your business', 'done' => (bool) $tenant->business_type],
                ['key' => 'payout', 'label' => 'Add your M-Pesa payout number', 'done' => (bool) $tenant->payout_phone],
                ['key' => 'event', 'label' => 'Create your first event', 'done' => $hasEvent],
                ['key' => 'publish', 'label' => 'Publish and start selling', 'done' => $hasPublished],
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'organization_name' => ['sometimes', 'string', 'max:255'],
            'business_type' => ['sometimes', 'in:individual,company,ngo,church,school,other'],
            'contact_person' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'kra_pin' => ['sometimes', 'nullable', 'string', 'max:20'],
        ]);

        $tenant = $request->user()->tenant;
        $tenant->update($data);
        $this->markOnboarded($tenant);

        return $this->show($request);
    }

    /**
     * Changing where money goes is the most sensitive action an organiser
     * can take, so it needs the password even with a valid session.
     */
    public function updatePayout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'payout_phone' => ['required', 'string', 'max:32'],
            'payout_name' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (! $user->password || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['password' => ['Your password is incorrect.']]);
        }

        $msisdn = AdvantaSmsClient::normalise($data['payout_phone']);

        if (! $msisdn || ! preg_match('/^254[17]\d{8}$/', $msisdn)) {
            throw ValidationException::withMessages(['payout_phone' => ['Enter a Safaricom number, e.g. 0712 345 678.']]);
        }

        $tenant = $user->tenant;
        $tenant->update(['payout_phone' => $msisdn, 'payout_name' => $data['payout_name']]);
        $this->markOnboarded($tenant);

        ActivityLog::record('payout_details_changed', $tenant, 'Payout number set to '.WalletService::maskPhone($msisdn));

        return $this->show($request);
    }

    protected function markOnboarded($tenant): void
    {
        if (! $tenant->onboarded_at && $tenant->business_type && $tenant->payout_phone) {
            $tenant->update(['onboarded_at' => now()]);
        }
    }
}
