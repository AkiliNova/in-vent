<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    public const ROLE_SUPER_ADMIN = 'super_admin';

    public const ROLE_ORGANIZER = 'organizer';

    public const ROLE_STAFF = 'staff';

    public const ROLE_EXHIBITOR = 'exhibitor';

    public const ROLE_ATTENDEE = 'attendee';

    protected $fillable = [
        'tenant_id', 'name', 'email', 'password', 'role',
        'phone', 'avatar_path', 'firebase_uid', 'is_active',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === self::ROLE_SUPER_ADMIN;
    }

    public function isOrganizer(): bool
    {
        return $this->role === self::ROLE_ORGANIZER;
    }

    /** Organizers and platform staff may administer a tenant's data. */
    public function canManageTenant(): bool
    {
        return in_array($this->role, [self::ROLE_SUPER_ADMIN, self::ROLE_ORGANIZER], true);
    }

    /** Abilities baked into the Sanctum token at login. */
    public function tokenAbilities(): array
    {
        return match ($this->role) {
            self::ROLE_SUPER_ADMIN => ['*'],
            self::ROLE_ORGANIZER => ['tenant:manage', 'event:manage', 'attendee:manage', 'scan:check-in', 'report:read'],
            self::ROLE_STAFF => ['event:read', 'attendee:read', 'scan:check-in', 'badge:print'],
            self::ROLE_EXHIBITOR => ['event:read', 'lead:capture'],
            default => ['event:read', 'self:manage'],
        };
    }
}
