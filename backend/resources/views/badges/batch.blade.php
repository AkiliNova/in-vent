<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        @page { margin: 0; }
        body { margin: 0; padding: 0; font-family: DejaVu Sans, sans-serif; }
        .badge { position: relative; overflow: hidden; page-break-after: always; }
        /* No trailing blank page after the last badge. */
        .badge:last-child { page-break-after: auto; }
    </style>
</head>
<body>
    @foreach($pages as $page)
        @include('badges._badge', $page)
    @endforeach
</body>
</html>
