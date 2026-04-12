<?php
/**
 * payment/create_payment.php
 * Accepts: POST application/json
 *   amount, description, email, phone,
 *   first_name, last_name, callback_url, metadata
 * Returns: { "iframe_url": "https://…" }
 *
 * Uses Pesapal v3 API.
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
$IPN_ID                  = getenv('PESAPAL_IPN_ID')          ?: 'YOUR_IPN_ID';
// ────────────────────────────────────────────────────────────────────────────

// CORS
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $ALLOWED_ORIGINS)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204); exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed']); exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!$body) {
    http_response_code(400);
    echo json_encode(['message' => 'Invalid JSON body']); exit;
}

$amount      = floatval($body['amount'] ?? 0);
$description = htmlspecialchars($body['description'] ?? 'Ticket Purchase', ENT_QUOTES);
$email       = filter_var($body['email'] ?? '', FILTER_VALIDATE_EMAIL);
$phone       = preg_replace('/\D/', '', $body['phone'] ?? '');
$firstName   = htmlspecialchars($body['first_name'] ?? '');
$lastName    = htmlspecialchars($body['last_name'] ?? '');
$callbackUrl = filter_var($body['callback_url'] ?? '', FILTER_VALIDATE_URL);

if ($amount <= 0 || !$email || !$callbackUrl) {
    http_response_code(422);
    echo json_encode(['message' => 'amount, email and callback_url are required']); exit;
}

// ── 1. Get auth token ────────────────────────────────────────────────────────
function pesapalPost(string $url, array $payload, string $token = ''): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => array_filter([
            'Content-Type: application/json',
            'Accept: application/json',
            $token ? "Authorization: Bearer $token" : null,
        ]),
        CURLOPT_TIMEOUT        => 30,
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    
    return ['code' => $code, 'body' => json_decode($res, true)];
}

$auth = pesapalPost("$PESAPAL_BASE_URL/api/Auth/RequestToken", [
    'consumer_key'    => $PESAPAL_CONSUMER_KEY,
    'consumer_secret' => $PESAPAL_CONSUMER_SECRET,
]);
if ($auth['code'] !== 200 || empty($auth['body']['token'])) {
    http_response_code(502);
    echo json_encode(['message' => 'Pesapal auth failed', 'detail' => $auth['body']]); exit;
}
$token = $auth['body']['token'];

// ── 2. Submit order ──────────────────────────────────────────────────────────
$orderRef = 'INV-' . strtoupper(bin2hex(random_bytes(6)));

$order = pesapalPost("$PESAPAL_BASE_URL/api/Transactions/SubmitOrderRequest", [
    'id'                      => $orderRef,
    'currency'                => 'KES',
    'amount'                  => $amount,
    'description'             => $description,
    'callback_url'            => $callbackUrl,
    'notification_id'         => $IPN_ID,
    'branch'                  => 'in-vent',
    'billing_address'         => [
        'email_address' => $email,
        'phone_number'  => $phone,
        'first_name'    => $firstName,
        'last_name'     => $lastName,
    ],
], $token);

if ($order['code'] !== 200 || empty($order['body']['redirect_url'])) {
    http_response_code(502);
    echo json_encode(['message' => 'Order submission failed', 'detail' => $order['body']]); exit;
}

echo json_encode([
    'iframe_url'    => $order['body']['redirect_url'],
    'order_ref'     => $orderRef,
    'tracking_id'   => $order['body']['order_tracking_id'] ?? null,
]);
