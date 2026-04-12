<?php
/**
 * sms/send_sms.php  — Advanta SMS proxy
 *
 * Accepts: POST application/json
 *   recipients : string[]   — array of phone numbers e.g. ["0712345678", "254712345678"]
 *   message    : string     — SMS body (max 160 chars per segment)
 *
 * Returns: { "success": true, "sent": 5, "failed": [], "results": [...] }
 *
 * Set env vars in cPanel → PHP INI or a .env loader:
 *   ADVANTA_API_KEY
 *   ADVANTA_PARTNER_ID
 *   ADVANTA_SHORTCODE
 */

// ── CONFIG ──────────────────────────────────────────────────────────────────
$ALLOWED_ORIGINS = [
    'https://in-vent.co.ke',
    'https://www.in-vent.co.ke',
    'http://localhost:5173',
    'http://localhost:3000',
];
// Accept credentials from request body (set via SuperAdmin) or fall back to env vars
$ADVANTA_API_KEY    = null; // resolved after body parse
$ADVANTA_PARTNER_ID = null;
$ADVANTA_SHORTCODE  = null;
$ADVANTA_ENDPOINT   = 'https://quicksms.advantasms.com/api/services/sendmessage/';
// ────────────────────────────────────────────────────────────────────────────

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

// Resolve credentials: request body takes priority over env vars
$ADVANTA_API_KEY    = $body['apiKey']    ?? getenv('ADVANTA_API_KEY')    ?: 'YOUR_API_KEY';
$ADVANTA_PARTNER_ID = $body['partnerID'] ?? getenv('ADVANTA_PARTNER_ID') ?: 'YOUR_PARTNER_ID';
$ADVANTA_SHORTCODE  = $body['shortcode'] ?? getenv('ADVANTA_SHORTCODE')  ?: 'TIKOOH';

if (!$body || empty($body['recipients']) || empty($body['message'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'recipients[] and message are required']); exit;
}

$message    = mb_substr(trim($body['message']), 0, 480); // max 3 SMS segments
$recipients = array_filter(array_map('trim', (array)$body['recipients']));

if (empty($recipients)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'No valid recipients']); exit;
}

// ── Normalise to 254XXXXXXXXX ────────────────────────────────────────────────
function normaliseKenyanPhone(string $phone): string {
    $phone = preg_replace('/\D/', '', $phone);
    if (strlen($phone) === 9) return '254' . $phone;           // 712345678
    if (substr($phone, 0, 1) === '0') return '254' . substr($phone, 1); // 0712…
    if (substr($phone, 0, 3) === '254') return $phone;         // already 254…
    return $phone;
}

// ── Send each recipient ───────────────────────────────────────────────────────
$sent    = 0;
$failed  = [];
$results = [];

foreach ($recipients as $raw) {
    $mobile = normaliseKenyanPhone($raw);
    if (strlen($mobile) < 12) {
        $failed[] = $raw;
        $results[] = ['mobile' => $raw, 'status' => 'invalid_number'];
        continue;
    }

    $payload = [
        'apikey'    => $ADVANTA_API_KEY,
        'partnerID' => $ADVANTA_PARTNER_ID,
        'message'   => $message,
        'shortcode' => $ADVANTA_SHORTCODE,
        'mobile'    => $mobile,
    ];

    $ch = curl_init($ADVANTA_ENDPOINT);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_TIMEOUT        => 15,
    ]);
    $res     = curl_exec($ch);
    $code    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    

    if ($curlErr || $code !== 200) {
        $failed[]  = $raw;
        $results[] = ['mobile' => $mobile, 'status' => 'error', 'detail' => $curlErr ?: "HTTP $code"];
    } else {
        $responseData = json_decode($res, true);
        // Advanta returns { "responses": [{ "resCode": "200", ... }] }
        $resCode = $responseData['responses'][0]['resCode'] ?? null;
        if ($resCode === '200' || $resCode === 200) {
            $sent++;
            $results[] = ['mobile' => $mobile, 'status' => 'sent'];
        } else {
            $failed[]  = $raw;
            $results[] = ['mobile' => $mobile, 'status' => 'rejected', 'detail' => $responseData];
        }
    }
}

echo json_encode([
    'success' => $sent > 0,
    'sent'    => $sent,
    'failed'  => $failed,
    'results' => $results,
]);
