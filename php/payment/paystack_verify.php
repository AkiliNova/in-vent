<?php
/**
 * payment/paystack_verify.php — Verify a Paystack transaction server-side
 *
 * POST application/json:
 *   reference  : string  — Paystack transaction reference
 *   secretKey  : string  — Paystack secret key (optional, falls back to env PAYSTACK_SECRET_KEY)
 *
 * Returns:
 *   { "success": true,  "amount": 500000, "email": "...", "status": "success" }
 *   { "success": false, "message": "..." }
 */

// UI is deployed on Vercel — add your *.vercel.app preview URL here too if needed
$ALLOWED_ORIGINS = [
    'https://tikooh.com
    ',
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

if (empty($body['reference'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'reference is required']); exit;
}

$reference = $body['reference'];

// Secret key lives ONLY on the server — never sent from the browser.
// Set PAYSTACK_SECRET_KEY in cPanel → PHP INI Editor or .htaccess:
//   SetEnv PAYSTACK_SECRET_KEY sk_live_xxxxxxxxxxxxxxxx
$secretKey = getenv('PAYSTACK_SECRET_KEY') ?: '';

if (!$secretKey) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'PAYSTACK_SECRET_KEY env var not set on server']); exit;
}

// Call Paystack verify API
$ch = curl_init("https://api.paystack.co/transaction/verify/" . rawurlencode($reference));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        "Authorization: Bearer $secretKey",
        'Accept: application/json',
    ],
    CURLOPT_TIMEOUT        => 15,
]);

$res     = curl_exec($ch);
$code    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
unset($ch); // curl_close deprecated in PHP 8.5

if ($curlErr) {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => "cURL error: $curlErr"]); exit;
}

$data = json_decode($res, true);

if (!$data || !$data['status']) {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => $data['message'] ?? 'Verification failed']); exit;
}

$tx = $data['data'] ?? [];
$txStatus = $tx['status'] ?? '';

if ($txStatus !== 'success') {
    echo json_encode([
        'success' => false,
        'message' => "Transaction status: $txStatus",
        'status'  => $txStatus,
    ]); exit;
}

echo json_encode([
    'success'   => true,
    'reference' => $tx['reference'] ?? $reference,
    'amount'    => $tx['amount']    ?? 0,   // in kobo/cents
    'email'     => $tx['customer']['email'] ?? '',
    'status'    => $txStatus,
    'paid_at'   => $tx['paid_at']   ?? null,
]);
