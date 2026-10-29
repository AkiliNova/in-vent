<?php

use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\EnsureTenantOwnsEvent;
use App\Http\Middleware\ResolveTenant;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /**
         * Order is load-bearing, so the group is declared explicitly rather
         * than assembled with prepend/append.
         *
         * ResolveTenant MUST run before SubstituteBindings. Route-model
         * binding resolves models through the ordinary query builder, so if
         * the tenant is not in context by then, the global scope is absent and
         * `/events/{event}` will happily resolve another tenant's event.
         *
         * There is deliberately no EnsureFrontendRequestsAreStateful: the SPA
         * (tikooh.com on Vercel) and the mobile app both authenticate with
         * bearer tokens. With it, any browser request whose Origin matched
         * SANCTUM_STATEFUL_DOMAINS was treated as a cookie session and failed
         * CSRF with a 419 — login included.
         */
        $middleware->group('api', [
            ResolveTenant::class,
            ThrottleRequests::class.':api',
            SubstituteBindings::class,
        ]);

        $middleware->alias([
            'role' => EnsureRole::class,
            'owns.event' => EnsureTenantOwnsEvent::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Every API failure comes back as JSON with a predictable shape, so the
        // React client never has to parse an HTML error page.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson()
        );

        $exceptions->render(function (ValidationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        });

        $exceptions->render(function (ModelNotFoundException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json(['message' => 'Resource not found.'], 404);
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json(['message' => 'Unauthenticated.'], 401);
        });

        $exceptions->render(function (AuthorizationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json(['message' => $e->getMessage()], 403);
        });

        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*') || $e instanceof HttpExceptionInterface) {
                return null;
            }

            if (config('app.debug')) {
                return null;
            }

            report($e);

            return response()->json(['message' => 'Something went wrong.'], 500);
        });
    })->create();
