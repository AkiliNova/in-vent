<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Establishes the tenant for the request from the authenticated user only.
 *
 * A super admin may act on a specific tenant by sending X-Tenant-Id; nobody else
 * can influence which tenant they see. This is what stops the previous pattern
 * where the client supplied its own tenant id.
 */
class ResolveTenant
{
    public function handle(Request $request, Closure $next): Response
    {
        // This runs in the group, before the route's auth:sanctum, so the
        // default guard has not yet read the bearer token. Ask Sanctum
        // directly — otherwise token requests run with no tenant scope at all.
        $user = $request->user() ?? $request->user('sanctum');

        if ($user === null) {
            TenantContext::clear();

            return $next($request);
        }

        if ($user->isSuperAdmin()) {
            $impersonated = $request->header('X-Tenant-Id');

            TenantContext::set(
                $impersonated ? Tenant::find($impersonated) : null
            );

            return $next($request);
        }

        if ($user->tenant_id === null) {
            TenantContext::clear();

            return $next($request);
        }

        $tenant = $user->tenant;

        if ($tenant === null || $tenant->suspended) {
            return response()->json([
                'message' => 'This organisation account is suspended. Contact support.',
            ], 403);
        }

        TenantContext::set($tenant);

        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        TenantContext::clear();
    }
}
