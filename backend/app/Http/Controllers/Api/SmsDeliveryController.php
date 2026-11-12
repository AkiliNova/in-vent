<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Models\MessageLog;
use App\Services\Sms\PhoneCheck;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Africa's Talking delivery reports: the handset actually got it, or why not.
 * Set the callback in the AT dashboard (SMS → SMS Callback URLs → Delivery
 * Reports) to https://<api host>/api/webhooks/africastalking/delivery.
 *
 * AT doesn't sign callbacks; a report only touches the message whose opaque
 * provider id it names, so a forged one can't do more than mislabel that one.
 */
class SmsDeliveryController extends Controller
{
    protected const FAILED = ['Failed', 'Rejected', 'Expired', 'AbsentSubscriber'];

    public function __invoke(Request $request): Response
    {
        $id = (string) $request->input('id', '');
        $status = (string) $request->input('status', '');
        $reason = (string) $request->input('failureReason', '');

        if ($id === '' || $status === '') {
            return response('ignored', 200);
        }

        $delivered = $status === 'Success';
        $failed = in_array($status, self::FAILED, true);

        if (! $delivered && ! $failed) {
            return response('ok', 200); // Sent / Submitted / Buffered: still on its way.
        }

        $error = $failed ? ($reason ?: $status) : null;

        $recipient = CampaignRecipient::where('provider_reference', $id)->first();

        if ($recipient) {
            $recipient->update($delivered
                ? ['status' => 'delivered', 'delivered_at' => now(), 'error' => null]
                : ['status' => 'failed', 'error' => $error]);

            $this->recount($recipient->campaign_id);
        }

        MessageLog::where('provider_message_id', $id)->update(array_filter([
            'status' => $delivered ? 'delivered' : 'failed',
            'error' => $error,
        ]));

        // A handset that blocks promos or doesn't exist will fail again: stop paying for it.
        if ($failed && $reason !== '' && ($number = preg_replace('/\D+/', '', (string) $request->input('phoneNumber', '')))) {
            PhoneCheck::flag($number, $reason);
        }

        return response('ok', 200);
    }

    protected function recount(int $campaignId): void
    {
        $audience = CampaignRecipient::where('campaign_id', $campaignId)->where('is_monitor', false);

        Campaign::withoutGlobalScope('tenant')->whereKey($campaignId)->update([
            'delivered_count' => (clone $audience)->where('status', 'delivered')->count(),
            'sent_count' => (clone $audience)->whereIn('status', ['sent', 'delivered'])->count(),
            'failed_count' => (clone $audience)->whereIn('status', ['failed', 'bounced'])->count(),
        ]);
    }
}
