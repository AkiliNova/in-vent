<?php
/**
 * email/send_email.php — SMTP email proxy
 *
 * POST application/json:
 *   to          : string[]  — recipient emails
 *   subject     : string
 *   html        : string    — HTML body
 *   text        : string    — plain text fallback (optional)
 *   host        : string    — SMTP host
 *   port        : int       — SMTP port (587 / 465 / 25)
 *   username    : string    — SMTP username
 *   password    : string    — SMTP password
 *   fromName    : string
 *   fromEmail   : string
 *
 * Requires PHPMailer via Composer (vendor/autoload.php) for SMTP.
 * Falls back to PHP mail() on cPanel hosts without Composer.
 *
 * Install PHPMailer on cPanel:
 *   cd ~/public_html && composer require phpmailer/phpmailer
 *
 * Returns: { "success": true, "sent": 3, "failed": [] }
 */

// ── CORS ──────────────────────────────────────────────────────────────────────
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
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']); exit;
}

// ── Parse body ────────────────────────────────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true);
if (!$body || empty($body['to']) || empty($body['subject']) || empty($body['html'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'to[], subject, and html are required']); exit;
}

$recipients = array_values(array_filter(array_map('trim', (array)$body['to'])));
$subject    = $body['subject'];
$html       = $body['html'];
$text       = $body['text'] ?? strip_tags($html);

// Credentials: request body takes priority, fall back to server env vars
$fromName  = $body['fromName']  ?? getenv('MAIL_FROM_NAME')  ?: 'IN-VENT';
$fromEmail = $body['fromEmail'] ?? getenv('MAIL_FROM_EMAIL') ?: 'noreply@in-vent.co.ke';
$smtpHost  = $body['host']      ?? getenv('SMTP_HOST')       ?: '';
$smtpPort  = (int)($body['port'] ?? getenv('SMTP_PORT')      ?: 587);
$smtpUser  = $body['username']  ?? getenv('SMTP_USER')       ?: '';
$smtpPass  = $body['password']  ?? getenv('SMTP_PASS')       ?: '';

if (empty($recipients)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'No valid recipients']); exit;
}

$sent   = 0;
$failed = [];

// ── PHPMailer (SMTP) ──────────────────────────────────────────────────────────
$autoload = __DIR__ . '/../../vendor/autoload.php';

if ($smtpHost && $smtpUser && file_exists($autoload)) {
    require_once $autoload;

    // Use fully qualified class names — 'use' declarations are not allowed
    // inside conditional blocks in PHP (parse-time construct).
    foreach ($recipients as $to) {
        try {
            $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
            $mail->isSMTP();
            $mail->Host       = $smtpHost;
            $mail->SMTPAuth   = true;
            $mail->Username   = $smtpUser;
            $mail->Password   = $smtpPass;
            $mail->SMTPSecure = ($smtpPort === 465)
                ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
                : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port       = $smtpPort;
            $mail->CharSet    = 'UTF-8';
            $mail->setFrom($fromEmail, $fromName);
            $mail->addAddress($to);
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body    = $html;
            $mail->AltBody = $text;
            $mail->send();
            $sent++;
        } catch (\Exception $e) {
            $failed[] = $to;
            error_log("PHPMailer error for $to: " . $e->getMessage());
        }
    }
} else {
    // ── Fallback: PHP mail() ──────────────────────────────────────────────────
    // Works on most cPanel hosts out of the box without Composer/PHPMailer.
    $boundary = md5(uniqid(rand(), true));
    $headers  = implode("\r\n", [
        'MIME-Version: 1.0',
        "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <$fromEmail>",
        "Reply-To: $fromEmail",
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        'X-Mailer: PHP/' . phpversion(),
    ]);

    $message  = "--$boundary\r\n";
    $message .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n$text\r\n";
    $message .= "--$boundary\r\n";
    $message .= "Content-Type: text/html; charset=UTF-8\r\n\r\n$html\r\n";
    $message .= "--$boundary--";

    foreach ($recipients as $to) {
        if (mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $message, $headers)) {
            $sent++;
        } else {
            $failed[] = $to;
        }
    }
}

// ── Response ──────────────────────────────────────────────────────────────────
echo json_encode([
    'success' => $sent > 0,
    'sent'    => $sent,
    'failed'  => $failed,
]);
