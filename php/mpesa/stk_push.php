<?php
/**
 * mpesa/stk_push.php — Daraja STK Push proxy
 *
 * POST application/json:
 *   amount         : int        — KES amount
 *   phone          : string     — customer phone (07xx / 254xx)
 *   accountRef     : string     — reference shown on Mpesa receipt
 *   description    : string     — transaction description
 *   consumerKey    : string     — Daraja consumer key
 *   consumerSecret : string     — Daraja consumer secret
 *   shortcode      : string     — Paybill/Till number
 *   passkey        : string     — Daraja passkey
 *   callbackUrl    : string     — publicly accessible callback endpoint
 *   environment    : "sandbox"|"production"
 *
 * Returns: Daraja STK push response (includes CheckoutRequestID on success)
 */

$ALLOWED_ORIGINS = [
    'https://in-vent.co.ke',
    'https://www.in-vent.co.ke',
    'http://localhost:5173',
    'http://localhost:3000',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $ALLOWED_ORIGINS)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed']); exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$required = ['amount', 'phone', 'accountRef', 'description', 'consumerKey', 'consumerSecret', 'shortcode', 'passkey', 'callbackUrl'];
foreach ($required as $f) {
    if (empty($body[$f])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Missing required field: $f"]); exit;
    }
}

$env           = ($body['environment'] ?? 'production') === 'sandbox' ? 'sandbox' : 'api';
$consumerKey   = $body['consumerKey'];
$consumerSecret = $body['consumerSecret'];
$shortcode     = $body['shortcode'];
$passkey       = $body['passkey'];
$callbackUrl   = $body['callbackUrl'];
$amount        = (int)$body['amount'];
$accountRef    = substr(preg_replace('/[^A-Za-z0-9\-]/', '', $body['accountRef']), 0, 12);
$description   = substr($body['description'], 0, 13);

// Normalise phone to 254XXXXXXXXX
$phone = preg_replace('/\D/', '', $body['phone']);
if (substr($phone, 0, 1) === '0') $phone = '254' . substr($phone, 1);
if (strlen($phone) === 9)          $phone = '254' . $phone;

// ── Step 1: Get OAuth token ────────────────────────────────────────────────────
$authUrl = "https://{$env}.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
$ch = curl_init($authUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_USERPWD        => "$consumerKey:$consumerSecret",
    CURLOPT_TIMEOUT        => 15,
]);
$authRes  = curl_exec($ch);
$authCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$authErr  = curl_error($ch);


if ($authErr || $authCode !== 200) {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => 'Failed to get Mpesa token', 'detail' => $authErr ?: "HTTP $authCode"]); exit;
}
$token = json_decode($authRes, true)['access_token'] ?? null;
if (!$token) {
    http_response_code(502); echo json_encode(['success' => false, 'message' => 'Empty token from Mpesa']); exit;
}

// ── Step 2: STK Push ──────────────────────────────────────────────────────────
$timestamp = date('YmdHis');
$password  = base64_encode($shortcode . $passkey . $timestamp);

$stkPayload = [
    'BusinessShortCode' => $shortcode,
    'Password'          => $password,
    'Timestamp'         => $timestamp,
    'TransactionType'   => 'CustomerPayBillOnline',
    'Amount'            => $amount,
    'PartyA'            => $phone,
    'PartyB'            => $shortcode,
    'PhoneNumber'       => $phone,
    'CallBackURL'       => $callbackUrl,
    'AccountReference'  => $accountRef,
    'TransactionDesc'   => $description,
];

$stkUrl = "https://{$env}.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
$ch = curl_init($stkUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($stkPayload),
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        "Authorization: Bearer $token",
    ],
    CURLOPT_TIMEOUT        => 30,
]);
$stkRes  = curl_exec($ch);
$stkCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$stkErr  = curl_error($ch);


if ($stkErr) {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => 'STK push request failed', 'detail' => $stkErr]); exit;
}

$result = json_decode($stkRes, true) ?: [];
http_response_code($stkCode);
echo json_encode($result);
