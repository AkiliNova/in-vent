<?php

/*
 * Bearer-token API: no cookies cross origins, so credentials stay off. The
 * origin list is explicit rather than "*" so only Tikooh's own frontends (and
 * Vercel previews of this project) can call it from a browser.
 */
return [
    'paths' => ['api/*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS',
        'https://tikooh.com,https://www.tikooh.com,https://tikooh.78.159.110.138.nip.io,http://localhost:8080,http://localhost:5173'
    ))))),
    'allowed_origins_patterns' => ['#^https://in-vent-[a-z0-9-]+-akilinovas-projects\.vercel\.app$#'],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 3600,
    'supports_credentials' => false,
];
