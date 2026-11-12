<?php

namespace App\Rules;

use App\Services\Sms\PhoneCheck;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * A real phone number: right length, not junk. Foreign numbers pass (people
 * visit from abroad); Kenyan numbers must be mobiles of the right length.
 * Landlines are refused since tickets and updates go out by SMS.
 */
class ValidPhone implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $check = PhoneCheck::classify((string) $value);

        if ($check['status'] === 'invalid') {
            $fail(str_starts_with((string) $check['number'], '254')
                ? 'That phone number looks wrong. Kenyan mobiles have 10 digits, e.g. 0712 345 678.'
                : 'That doesn\'t look like a phone number.');

            return;
        }

        if ($check['network'] === 'Landline') {
            $fail('Please use a mobile number. We send your ticket by SMS.');
        }
    }
}
