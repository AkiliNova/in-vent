<?php

return [
    // Taken from each ticket sale before it reaches the organiser's wallet.
    // A tenant's own `platform_fee_percent` overrides this.
    'platform_fee_percent' => (float) env('TIKOOH_PLATFORM_FEE_PERCENT', 10),

    // B2C will not send less than KES 10.
    'min_withdrawal' => (float) env('TIKOOH_MIN_WITHDRAWAL', 10),
    'max_withdrawal' => (float) env('TIKOOH_MAX_WITHDRAWAL', 150000),

    // Withdrawals are requests: the platform moves money from the C2B paybill
    // to the B2C shortcode, then sends. This is the promise shown to merchants.
    'payout_hours' => (int) env('TIKOOH_PAYOUT_HOURS', 24),
    // Remind the ops chat this long before a request falls due.
    'payout_reminder_hours' => (int) env('TIKOOH_PAYOUT_REMINDER_HOURS', 4),

    // Shown to buyers who pay the paybill directly rather than via STK push.
    'paybill' => env('TIKOOH_PAYBILL', env('MPESA_SHORTCODE')),
];
