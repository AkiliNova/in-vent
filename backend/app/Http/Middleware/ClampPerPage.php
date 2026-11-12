<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Every list is paginated; no client gets to ask for the whole table in one
 * go. per_page is forced into 1..MAX, page into 1.., before any controller
 * reads them. Screens that need everything (dropdowns) walk the pages.
 */
class ClampPerPage
{
    public const MAX = 100;

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->has('per_page')) {
            $request->merge(['per_page' => max(1, min(self::MAX, (int) $request->input('per_page')))]);
        }

        if ($request->has('page')) {
            $request->merge(['page' => max(1, (int) $request->input('page'))]);
        }

        return $next($request);
    }
}
