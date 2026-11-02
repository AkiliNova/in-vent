<?php

namespace App\Services\Sms;

/** The SMS provider chosen in Settings → SMS. */
class Sms
{
    public static function client(?int $tenantId = null): AdvantaSmsClient|AfricasTalkingSmsClient
    {
        return config('services.sms.provider') === 'africastalking'
            ? new AfricasTalkingSmsClient($tenantId)
            : new AdvantaSmsClient($tenantId);
    }
}
