<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        @page { margin: 0; }
        body { margin: 0; padding: 0; font-family: DejaVu Sans, sans-serif; }
        .badge { position: relative; overflow: hidden; page-break-after: always; }
    </style>
</head>
<body>
    @include('badges._badge', [
        'attendee' => $attendee,
        'event' => $event,
        'badge' => $badge,
        'elements' => $elements,
        'background' => $background,
        'backgroundImage' => $backgroundImage,
        'qrDataUri' => $qrDataUri,
        'widthMm' => $widthMm,
        'heightMm' => $heightMm,
    ])
</body>
</html>
