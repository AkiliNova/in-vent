<?php

return [
    // Taken from each ticket sale before it reaches the organiser's wallet.
    // A tenant's own `platform_fee_percent` overrides this.
    'platform_fee_percent' => (float) env('TIKOOH_PLATFORM_FEE_PERCENT', 10),

    // B2C will not send less than KES 10.
    'min_withdrawal' => (float) env('TIKOOH_MIN_WITHDRAWAL', 10),
    'max_withdrawal' => (float) env('TIKOOH_MAX_WITHDRAWAL', 150000),

    // Shown to buyers who pay the paybill directly rather than via STK push.
    'paybill' => env('TIKOOH_PAYBILL', env('MPESA_SHORTCODE')),
];
