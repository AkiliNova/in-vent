<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Organizer sign-up: creates the tenant and its owner in one step. */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'organization_name' => ['required', 'string', 'max:255'],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'phone' => ['nullable', 'string', 'max:32'],
            'business_type' => ['nullable', 'in:individual,company,ngo,church,school,other'],
            'package' => ['nullable', 'in:starter,pro,enterprise'],
        ]);

        $result = DB::transaction(function () use ($data) {
            $tenant = Tenant::create([
                'organization_name' => $data['organization_name'],
                'slug' => $this->uniqueTenantSlug($data['organization_name']),
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'contact_person' => $data['name'],
                'business_type' => $data['business_type'] ?? null,
                'package' => $data['package'] ?? 'starter',
            ]);

            $user = User::create([
                'tenant_id' => $tenant->id,
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'phone' => $data['phone'] ?? null,
                'role' => User::ROLE_ORGANIZER,
            ]);

            return [$tenant, $user];
        });

        [$tenant, $user] = $result;

        return response()->json([
            'token' => $user->createToken('web', $user->tokenAbilities())->plainTextToken,
            'user' => $this->userPayload($user),
            'tenant' => $tenant->only(['uuid', 'organization_name', 'slug', 'package']),
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        $user = User::where('email', $data['email'])->first();

        // A user migrated from Firebase has no local hash until they set one.
        if ($user && $user->password === null) {
            throw ValidationException::withMessages([
                'email' => ['Please reset your password to finish moving your account across.'],
            ]);
        }

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['This account has been deactivated.'],
            ]);
        }

        if ($user->tenant?->suspended) {
            throw ValidationException::withMessages([
                'email' => ['This organisation account is suspended.'],
            ]);
        }

        $user->forceFill(['last_login_at' => now()])->save();
        ActivityLog::record('logged_in', $user);

        return response()->json([
            'token' => $user->createToken(
                $data['device_name'] ?? 'web',
                $user->tokenAbilities()
            )->plainTextToken,
            'user' => $this->userPayload($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    /** Invalidates every device — used after a password change. */
    public function logoutAll(Request $request): JsonResponse
    {
        $request->user()->tokens()->delete();

        return response()->json(['message' => 'Signed out of all devices.']);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['nullable', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();

        // Users with an existing hash must prove they know it; migrated users
        // setting a password for the first time do not have one to prove.
        if ($user->password !== null) {
            if (! $data['current_password'] || ! Hash::check($data['current_password'], $user->password)) {
                throw ValidationException::withMessages([
                    'current_password' => ['Your current password is incorrect.'],
                ]);
            }
        }

        $user->forceFill(['password' => Hash::make($data['password'])])->save();
        $user->tokens()->delete();

        return response()->json([
            'token' => $user->createToken('web', $user->tokenAbilities())->plainTextToken,
            'message' => 'Password updated.',
        ]);
    }

    protected function userPayload(User $user): array
    {
        $user->loadMissing('tenant');

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'phone' => $user->phone,
            'avatar_path' => $user->avatar_path,
            'abilities' => $user->tokenAbilities(),
            'tenant' => $user->tenant ? [
                'uuid' => $user->tenant->uuid,
                'organization_name' => $user->tenant->organization_name,
                'slug' => $user->tenant->slug,
                'package' => $user->tenant->package,
                'settings' => $user->tenant->settings,
            ] : null,
        ];
    }

    protected function uniqueTenantSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'org';
        $slug = $base;
        $suffix = 1;

        while (Tenant::withTrashed()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.(++$suffix);
        }

        return $slug;
    }
}
