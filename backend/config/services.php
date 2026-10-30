<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Platform-wide fallbacks. Per-tenant values live in integration_credentials
    // and take precedence; nothing here is ever exposed to the browser.
    'anthropic' => [
        'key' => env('ANTHROPIC_API_KEY'),
    ],

    'pesapal' => [
        'consumer_key' => env('PESAPAL_CONSUMER_KEY'),
        'consumer_secret' => env('PESAPAL_CONSUMER_SECRET'),
        'ipn_id' => env('PESAPAL_IPN_ID'),
        'sandbox' => (bool) env('PESAPAL_SANDBOX', false),
    ],

    'mpesa' => [
        'consumer_key' => env('MPESA_CONSUMER_KEY'),
        'consumer_secret' => env('MPESA_CONSUMER_SECRET'),
        'shortcode' => env('MPESA_SHORTCODE'),
        'passkey' => env('MPESA_PASSKEY'),
        'transaction_type' => env('MPESA_TRANSACTION_TYPE', 'CustomerPayBillOnline'),
        'sandbox' => (bool) env('MPESA_SANDBOX', false),

        // Unguessable path segment on the C2B URLs. Safaricom does not sign
        // C2B callbacks, so this (plus the IP allowlist) is what stops anyone
        // else posting a "payment" for an order.
        'c2b_token' => env('MPESA_C2B_TOKEN'),
        'callback_ips' => array_filter(explode(',', (string) env('MPESA_CALLBACK_IPS',
            '196.201.214.200,196.201.214.206,196.201.213.114,196.201.214.207,196.201.214.208,'
            .'196.201.213.44,196.201.212.127,196.201.212.138,196.201.212.129,196.201.212.136,'
            .'196.201.212.74,196.201.212.69'
        ))),
        'enforce_callback_ips' => (bool) env('MPESA_ENFORCE_CALLBACK_IPS', true),

        // B2C runs on its own Daraja app and shortcode.
        'b2c' => [
            'consumer_key' => env('MPESA_B2C_CONSUMER_KEY'),
            'consumer_secret' => env('MPESA_B2C_CONSUMER_SECRET'),
            'shortcode' => env('MPESA_B2C_SHORTCODE'),
            'initiator' => env('MPESA_B2C_INITIATOR'),
            'initiator_password' => env('MPESA_B2C_INITIATOR_PASSWORD'),
            'command_id' => env('MPESA_B2C_COMMAND_ID', 'BusinessPayment'),
            'certificate' => env('MPESA_CERTIFICATE', resource_path('mpesa/ProductionCertificate.cer')),
        ],
    ],

    // Ops alerts via a Telegram bot (create one with @BotFather). This is the
    // Bot API — not the MTProto api_id/api_hash, which log in as a user.
    'telegram' => [
        'bot_token' => env('TELEGRAM_BOT_TOKEN'),
        'chat_id' => env('TELEGRAM_CHAT_ID'),
        // Telegram echoes this in a header on every webhook call.
        'webhook_secret' => env('TELEGRAM_WEBHOOK_SECRET'),
    ],

    'advanta' => [
        'api_key' => env('ADVANTA_API_KEY'),
        'partner_id' => env('ADVANTA_PARTNER_ID'),
        'shortcode' => env('ADVANTA_SHORTCODE', 'TIKOOH'),
        'endpoint' => env('ADVANTA_ENDPOINT', 'https://quicksms.advantasms.com/api/services/sendmessage/'),
    ],

];
