<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * The platform blog. Posts are Tikooh's own (tenant_id null) and are written
 * by platform admins; the public sees published posts only.
 */
class BlogController extends Controller
{
    // body is loaded for the read-time estimate; present() only returns it for full views.
    protected const CARD = ['id', 'title', 'slug', 'excerpt', 'body', 'cover_image_path', 'tags', 'published', 'published_at', 'view_count', 'author_id', 'created_at', 'updated_at'];

    public function publicIndex(Request $request): JsonResponse
    {
        $posts = BlogPost::query()
            ->with('author:id,name')
            ->where('published', true)
            ->when($request->string('category')->toString(), fn ($q, $c) => $q->whereJsonContains('tags', $c))
            ->when($request->string('search')->toString(), fn ($q, $s) => $q->where(
                fn ($w) => $w->where('title', 'like', "%{$s}%")->orWhere('excerpt', 'like', "%{$s}%")
            ))
            ->orderByDesc('published_at')
            ->paginate($request->integer('per_page', 24), self::CARD);

        $posts->getCollection()->transform(fn (BlogPost $p) => $this->present($p));

        return response()->json($posts);
    }

    public function publicShow(string $slug): JsonResponse
    {
        $post = BlogPost::query()->with('author:id,name')->where('published', true)->where('slug', $slug)->firstOrFail();
        $post->increment('view_count');

        $related = BlogPost::query()
            ->where('published', true)
            ->whereKeyNot($post->id)
            ->orderByDesc('published_at')
            ->limit(3)
            ->get(self::CARD)
            ->map(fn (BlogPost $p) => $this->present($p));

        return response()->json(['post' => $this->present($post, full: true), 'related' => $related]);
    }

    // ── Platform admin ──────────────────────────────────────────────────────

    public function index(): JsonResponse
    {
        return response()->json(BlogPost::query()->with('author:id,name')->latest('id')->get()
            ->map(fn (BlogPost $p) => $this->present($p, full: true)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['slug'] = $this->uniqueSlug($data['title']);
        $data['author_id'] = $request->user()->id;
        $data = $this->stampPublished($data, null);

        return response()->json($this->present(BlogPost::create($data), full: true), 201);
    }

    public function update(Request $request, BlogPost $post): JsonResponse
    {
        $post->update($this->stampPublished($this->validated($request, $post), $post));

        return response()->json($this->present($post->fresh('author'), full: true));
    }

    public function uploadCover(Request $request, BlogPost $post): JsonResponse
    {
        $request->validate(['image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120']]);

        $old = $post->cover_image_path;
        $post->update(['cover_image_path' => $request->file('image')->store('blog', 'public')]);

        if ($old && ! str_starts_with($old, 'http')) {
            Storage::disk('public')->delete($old);
        }

        return response()->json($this->present($post->fresh('author'), full: true));
    }

    public function destroy(BlogPost $post): JsonResponse
    {
        $post->delete();

        return response()->json(null, 204);
    }

    protected function validated(Request $request, ?BlogPost $post = null): array
    {
        $data = $request->validate([
            'title' => [$post ? 'sometimes' : 'required', 'string', 'max:255'],
            'excerpt' => ['nullable', 'string', 'max:500'],
            'body' => [$post ? 'sometimes' : 'required', 'string'],
            'category' => ['nullable', 'string', 'max:60'],
            'cover_image_url' => ['nullable', 'url', 'max:2048'],
            'published' => ['boolean'],
        ]);

        if (array_key_exists('category', $data)) {
            $data['tags'] = $data['category'] ? [$data['category']] : [];
            unset($data['category']);
        }

        if (array_key_exists('cover_image_url', $data)) {
            if ($data['cover_image_url']) {
                $data['cover_image_path'] = $data['cover_image_url'];
            }
            unset($data['cover_image_url']);
        }

        return $data;
    }

    /** First publish sets the date; unpublishing keeps it for history. */
    protected function stampPublished(array $data, ?BlogPost $post): array
    {
        if (($data['published'] ?? false) && ! $post?->published_at) {
            $data['published_at'] = now();
        }

        return $data;
    }

    protected function present(BlogPost $p, bool $full = false): array
    {
        $path = $p->cover_image_path;
        $words = str_word_count(strip_tags((string) $p->body));

        return array_filter([
            'id' => $p->id,
            'title' => $p->title,
            'slug' => $p->slug,
            'excerpt' => $p->excerpt,
            'category' => $p->tags[0] ?? null,
            'cover_url' => $path ? (str_starts_with($path, 'http') ? $path : Storage::disk('public')->url($path)) : null,
            'author' => $p->author?->name ?? 'Tikooh Team',
            'published' => $p->published,
            'published_at' => $p->published_at,
            'updated_at' => $p->updated_at,
            'view_count' => $p->view_count,
            'body' => $full ? $p->body : null,
            'read_minutes' => $words ? max(1, (int) round($words / 220)) : null,
        ], fn ($v) => $v !== null);
    }

    protected function uniqueSlug(string $title): string
    {
        $base = Str::slug($title) ?: 'post';
        $slug = $base;
        $n = 1;

        while (BlogPost::withTrashed()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.(++$n);
        }

        return $slug;
    }
}
