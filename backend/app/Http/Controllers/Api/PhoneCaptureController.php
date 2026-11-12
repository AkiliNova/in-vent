<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Attendee;
use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Models\Contact;
use App\Rules\ValidPhone;
use App\Services\Sms\PhoneCheck;
use App\Support\TenantContext;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * "Add my phone number" from a campaign email. The link is signed per
 * recipient row, so it carries no email address and can't be edited to
 * change someone else's record. Saving updates every registration and
 * imported contact with that email: the person proved they own the inbox.
 */
class PhoneCaptureController extends Controller
{
    public function show(CampaignRecipient $recipient)
    {
        return $this->page($recipient);
    }

    public function save(Request $request, CampaignRecipient $recipient)
    {
        $validator = Validator::make($request->all(), [
            'phone' => ['required', 'string', 'max:32', new ValidPhone],
        ], ['phone.required' => 'Enter your phone number.']);

        if ($validator->fails()) {
            return $this->page($recipient, error: $validator->errors()->first('phone'), value: (string) $request->input('phone'));
        }

        $email = strtolower(trim($recipient->destination));
        abort_unless(filter_var($email, FILTER_VALIDATE_EMAIL), 404);

        $phone = '+'.PhoneCheck::classify((string) $request->input('phone'))['number'];

        $updated = TenantContext::withoutScoping(function () use ($email, $phone) {
            $n = Attendee::withoutGlobalScope('tenant')->whereRaw('LOWER(email) = ?', [$email])->update(['phone' => $phone]);
            $n += Contact::withoutGlobalScope('tenant')->whereRaw('LOWER(email) = ?', [$email])->update(['phone' => $phone]);

            return $n;
        });

        $recipient->forceFill(['phone_added_at' => now()])->save();

        $campaign = Campaign::withoutGlobalScope('tenant')->find($recipient->campaign_id);
        ActivityLog::query()->create([
            'tenant_id' => $campaign?->tenant_id,
            'action' => 'phone_added',
            'description' => "Guest added their phone number from campaign email ({$updated} record(s) updated)",
            'subject_type' => CampaignRecipient::class,
            'subject_id' => $recipient->id,
            'ip_address' => $request->ip(),
            'created_at' => now(),
        ]);

        return $this->page($recipient, done: true, value: $phone);
    }

    protected function page(CampaignRecipient $recipient, bool $done = false, ?string $error = null, ?string $value = null)
    {
        $campaign = Campaign::withoutGlobalScope('tenant')->with('tenant')->find($recipient->campaign_id);

        return response()->view('mail.phone', [
            'done' => $done,
            'error' => $error,
            'value' => $value ?? '',
            'name' => $recipient->first_name,
            'sender' => $campaign ? \App\Mail\CampaignMail::senderName($campaign) : 'Tikooh',
            'already' => ! $done && $recipient->phone_added_at !== null,
        ], $error ? 422 : 200);
    }
}
