<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{ $event->title }} | Tikooh</title>
<meta name="description" content="{{ $description }}">
<link rel="canonical" href="{{ $url }}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tikooh">
<meta property="og:url" content="{{ $url }}">
<meta property="og:title" content="{{ $event->title }}">
<meta property="og:description" content="{{ $description }}">
<meta property="og:image" content="{{ $image }}">
<meta property="og:image:secure_url" content="{{ $image }}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{{ $event->title }}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{{ $event->title }}">
<meta name="twitter:description" content="{{ $description }}">
<meta name="twitter:image" content="{{ $image }}">
</head>
<body>
<h1>{{ $event->title }}</h1>
<p>{{ $description }}</p>
<p><a href="{{ $url }}">Get tickets on Tikooh</a></p>
</body>
</html>
