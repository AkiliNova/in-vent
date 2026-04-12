<?php
/**
 * payment/verify_payment.php
 * Accepts: GET ?orderTrackingId=XXXX
 * Returns: Pesapal transaction status object
 *   { status_code, payment_status_description, status, … }
 */

// ── CONFIG ──────────────────────────────────────────────────────────────────
$ALLOWED_ORIGINS = [
    'https://in-vent.co.ke',
    'https://www.in-vent.co.ke',
    'http://localhost:5173',
    'http://localhost:3000',
];
$PESAPAL_CONSUMER_KEY    = getenv('PESAPAL_CONSUMER_KEY')    ?: 'YOUR_CONSUMER_KEY';
$PESAPAL_CONSUMER_SECRET = getenv('PESAPAL_CONSUMER_SECRET') ?: 'YOUR_CONSUMER_SECRET';
$PESAPAL_BASE_URL        = 'https://pay.pesapal.com/v3';     // live
// $PESAPAL_BASE_URL     = 'https://cybqa.pesapal.com/pesapalv3'; // sandbox
// ────────────────────────────────────────────────────────────────────────────

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $ALLOWED_ORIGINS)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204); exit;
}

$trackingId = trim($_GET['orderTrackingId'] ?? '');
if (!$trackingId) {
    http_response_code(400);
    echo json_encode(['message' => 'orderTrackingId is required']); exit;
}

// ── 1. Auth ──────────────────────────────────────────────────────────────────
$ch = curl_init("$PESAPAL_BASE_URL/api/Auth/RequestToken");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode([
        'consumer_key'    => $PESAPAL_CONSUMER_KEY,
        'consumer_secret' => $PESAPAL_CONSUMER_SECRET,
    ]),
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
    CURLOPT_TIMEOUT        => 30,
]);
$authRes  = curl_exec($ch);
$authCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);


$authData = json_decode($authRes, true);
if ($authCode !== 200 || empty($authData['token'])) {
    http_response_code(502);
    echo json_encode(['message' => 'Pesapal auth failed', 'detail' => $authData]); exit;
}
$token = $authData['token'];

// ── 2. Get transaction status ─────────────────────────────────────────────────
$trackingId = urlencode($trackingId);
$ch = curl_init("$PESAPAL_BASE_URL/api/Transactions/GetTransactionStatus?orderTrackingId=$trackingId");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Accept: application/json',
        "Authorization: Bearer $token",
    ],
    CURLOPT_TIMEOUT        => 30,
]);
$statusRes  = curl_exec($ch);
$statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);


$statusData = json_decode($statusRes, true);
if ($statusCode !== 200) {
    http_response_code(502);
    echo json_encode(['message' => 'Status check failed', 'detail' => $statusData]); exit;
}

echo json_encode($statusData);
