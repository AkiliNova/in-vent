<?php

namespace App\Support;

use App\Models\Tenant;

/**
 * Holds the tenant for the lifetime of a request or queued job. Set by
 * ResolveTenant middleware from the authenticated user — never from client input.
 */
class TenantContext
{
    protected static ?Tenant $tenant = null;

    protected static bool $suppressed = false;

    public static function set(?Tenant $tenant): void
    {
        static::$tenant = $tenant;
    }

    public static function get(): ?Tenant
    {
        return static::$suppressed ? null : static::$tenant;
    }

    public static function id(): ?int
    {
        return static::get()?->id;
    }

    public static function check(): bool
    {
        return static::get() !== null;
    }

    public static function clear(): void
    {
        static::$tenant = null;
        static::$suppressed = false;
    }

    /**
     * Run a callback with tenant scoping disabled — used by the importer,
     * scheduled platform jobs and super-admin reporting.
     */
    public static function withoutScoping(callable $callback): mixed
    {
        $previous = static::$suppressed;
        static::$suppressed = true;

        try {
            return $callback();
        } finally {
            static::$suppressed = $previous;
        }
    }

    /** Run a callback as a specific tenant, restoring the previous one after. */
    public static function actingAs(?Tenant $tenant, callable $callback): mixed
    {
        $previous = static::$tenant;
        static::$tenant = $tenant;

        try {
            return $callback();
        } finally {
            static::$tenant = $previous;
        }
    }
}
