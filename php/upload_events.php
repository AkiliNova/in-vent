<?php
/**
 * upload_events.php
 * Accepts: POST multipart/form-data
 *   images[]  – one or more image files
 *   folder    – subfolder, e.g. "events/tenant123"
 * Returns: { "success": true, "uploaded": ["https://…/uploads/events/tenant123/abc.jpg", …] }
 */

// ── CONFIG ──────────────────────────────────────────────────────────────────
$ALLOWED_ORIGINS = [
    'https://in-vent.co.ke',
    'https://www.in-vent.co.ke',
    'http://localhost:5173',   // vite dev
    'http://localhost:3000',
];
$BASE_UPLOAD_DIR = __DIR__ . '/uploads/';   // absolute path on server
$BASE_URL        = 'https://YOUR_DOMAIN.COM/uploads/'; // ← change this
$MAX_FILE_SIZE   = 5 * 1024 * 1024;        // 5 MB per image
$ALLOWED_TYPES   = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
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
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Sanitize the folder param (only allow alphanumeric, dash, underscore, slash)
$folder = trim($_POST['folder'] ?? 'events');
$folder = preg_replace('/[^a-zA-Z0-9_\-\/]/', '', $folder);
$folder = trim($folder, '/');

$uploadDir = $BASE_UPLOAD_DIR . $folder . '/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

if (empty($_FILES['images'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'No images received']);
    exit;
}

// Normalise $_FILES['images'] into an array of single-file entries
$files = [];
if (is_array($_FILES['images']['name'])) {
    foreach ($_FILES['images']['name'] as $i => $name) {
        $files[] = [
            'name'     => $name,
            'type'     => $_FILES['images']['type'][$i],
            'tmp_name' => $_FILES['images']['tmp_name'][$i],
            'error'    => $_FILES['images']['error'][$i],
            'size'     => $_FILES['images']['size'][$i],
        ];
    }
} else {
    $files[] = $_FILES['images'];
}

$uploaded = [];
$errors   = [];

foreach ($files as $file) {
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $errors[] = "Upload error code {$file['error']} for {$file['name']}";
        continue;
    }
    if ($file['size'] > $MAX_FILE_SIZE) {
        $errors[] = "{$file['name']} exceeds 5 MB limit";
        continue;
    }
    // Verify MIME from file contents, not the browser-supplied type
    $finfo    = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mimeType, $ALLOWED_TYPES)) {
        $errors[] = "{$file['name']} is not an allowed image type ($mimeType)";
        continue;
    }

    $ext      = pathinfo($file['name'], PATHINFO_EXTENSION);
    $safeName = bin2hex(random_bytes(10)) . '-' . time() . '.' . strtolower($ext);
    $destPath = $uploadDir . $safeName;

    if (!move_uploaded_file($file['tmp_name'], $destPath)) {
        $errors[] = "Could not save {$file['name']}";
        continue;
    }

    $uploaded[] = $BASE_URL . $folder . '/' . $safeName;
}

if (empty($uploaded) && !empty($errors)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => implode('; ', $errors)]);
    exit;
}

echo json_encode([
    'success'  => true,
    'uploaded' => $uploaded,
    'errors'   => $errors,   // partial failures reported but not fatal
]);
