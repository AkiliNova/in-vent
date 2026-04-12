<?php
/**
 * mpesa/query.php — Query STK Push transaction status
 *
 * POST application/json:
 *   checkoutRequestId : string
 *   consumerKey       : string
 *   consumerSecret    : string
 *   shortcode         : string
 *   passkey           : string
 *   environment       : "sandbox"|"production"
 *
 * Returns: Daraja query response (ResultCode "0" = success, "1032" = cancelled)
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

$body = json_decode(file_get_contents('php://input'), true);
$required = ['checkoutRequestId', 'consumerKey', 'consumerSecret', 'shortcode', 'passkey'];
foreach ($required as $f) {
    if (empty($body[$f])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Missing: $f"]); exit;
    }
}

$env           = ($body['environment'] ?? 'production') === 'sandbox' ? 'sandbox' : 'api';
$consumerKey   = $body['consumerKey'];
$consumerSecret = $body['consumerSecret'];
$shortcode     = $body['shortcode'];
$passkey       = $body['passkey'];
$checkoutId    = $body['checkoutRequestId'];

// OAuth token
$ch = curl_init("https://{$env}.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials");
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_USERPWD => "$consumerKey:$consumerSecret", CURLOPT_TIMEOUT => 15]);
$authRes = curl_exec($ch); unset($ch);
$token = json_decode($authRes, true)['access_token'] ?? null;
if (!$token) {
    http_response_code(502); echo json_encode(['success' => false, 'message' => 'Auth failed']); exit;
}

// Query
$timestamp = date('YmdHis');
$password  = base64_encode($shortcode . $passkey . $timestamp);

$ch = curl_init("https://{$env}.safaricom.co.ke/mpesa/stkpushquery/v1/query");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode([
        'BusinessShortCode' => $shortcode,
        'Password'          => $password,
        'Timestamp'         => $timestamp,
        'CheckoutRequestID' => $checkoutId,
    ]),
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json', "Authorization: Bearer $token"],
    CURLOPT_TIMEOUT        => 15,
]);
$res  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
unset($ch);

http_response_code($code);
echo $res ?: json_encode(['ResultCode' => '-1', 'ResultDesc' => 'No response']);
