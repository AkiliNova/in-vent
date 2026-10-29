<?php

namespace App\Http\Middleware;

use App\Models\Event;
use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Defence in depth for nested routes. The tenant global scope already hides
 * other tenants' events, but this makes the failure an explicit 404 rather than
 * relying on the scope alone.
 */
class EnsureTenantOwnsEvent
{
    public function handle(Request $request, Closure $next): Response
    {
        $event = $request->route('event');

        if ($event instanceof Event
            && TenantContext::check()
            && $event->tenant_id !== TenantContext::id()) {
            return response()->json(['message' => 'Event not found.'], 404);
        }

        return $next($request);
    }
}
