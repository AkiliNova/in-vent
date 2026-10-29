<?php

namespace Tests\Feature;

use App\Models\BlogPost;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BlogTest extends TestCase
{
    use RefreshDatabase;

    protected function admin(): User
    {
        return User::create(['name' => 'Ops', 'email' => 'ops@tikooh.com', 'password' => 'password123', 'role' => User::ROLE_SUPER_ADMIN]);
    }

    public function test_the_public_sees_only_published_posts(): void
    {
        BlogPost::create(['title' => 'Live', 'slug' => 'live', 'body' => 'Hello world', 'published' => true, 'published_at' => now()]);
        BlogPost::create(['title' => 'Draft', 'slug' => 'draft', 'body' => 'Secret', 'published' => false]);

        $titles = collect($this->getJson('/api/public/blog')->assertOk()->json('data'))->pluck('title');
        $this->assertSame(['Live'], $titles->all());

        $this->getJson('/api/public/blog/draft')->assertNotFound();
        $this->getJson('/api/public/blog/live')->assertOk()->assertJsonPath('post.body', 'Hello world');
        $this->assertSame(1, BlogPost::where('slug', 'live')->value('view_count'));
    }

    public function test_admin_writes_and_publishes_a_post(): void
    {
        Sanctum::actingAs($this->admin());

        $id = $this->postJson('/api/admin/blog', [
            'title' => 'M-Pesa tips', 'body' => "First.\n\nSecond.", 'category' => 'Payments', 'published' => false,
        ])->assertCreated()->assertJsonPath('slug', 'm-pesa-tips')->json('id');

        $this->getJson('/api/public/blog/m-pesa-tips')->assertNotFound();

        $this->putJson("/api/admin/blog/{$id}", ['published' => true])->assertOk();

        $this->getJson('/api/public/blog/m-pesa-tips')->assertOk()->assertJsonPath('post.category', 'Payments');
        $this->assertNotNull(BlogPost::find($id)->published_at);
    }

    public function test_organisers_cannot_manage_the_blog(): void
    {
        $tenant = Tenant::create(['organization_name' => 'Acme', 'slug' => 'acme', 'email' => 'a@acme.com']);
        Sanctum::actingAs(User::create([
            'tenant_id' => $tenant->id, 'name' => 'O', 'email' => 'o@acme.com', 'password' => 'password123', 'role' => User::ROLE_ORGANIZER,
        ]));

        $this->postJson('/api/admin/blog', ['title' => 'X', 'body' => 'Y'])->assertForbidden();
    }
}
