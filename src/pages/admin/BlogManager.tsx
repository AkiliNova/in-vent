import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Eye, EyeOff, Loader2, ExternalLink } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage } from "@/lib/api";

interface Post {
  id: number;
  title: string;
  slug: string;
  excerpt?: string;
  body: string;
  category?: string;
  cover_url?: string;
  published: boolean;
  published_at?: string;
  view_count?: number;
  read_minutes?: number;
}

const CATEGORIES = ["Tips & Guides", "Payments", "How-To", "Strategy", "Marketing", "Engagement", "News", "General"];
const empty = { title: "", excerpt: "", body: "", category: "Tips & Guides", cover_image_url: "", published: false };

export default function BlogManager() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const [form, setForm] = useState(empty);
  const [cover, setCover] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get<Post[]>("admin/blog").then(setPosts).catch((e) =>
    toast({ title: "Couldn't load posts", description: errorMessage(e), variant: "destructive" }));

  useEffect(() => { load(); }, []);

  if (user?.role !== "super_admin") return <Navigate to="/dashboard" replace />;

  const openEditor = (p: Post | null) => {
    setEditing(p);
    setForm(p ? {
      title: p.title, excerpt: p.excerpt || "", body: p.body, category: p.category || "General",
      cover_image_url: p.cover_url?.startsWith("http") && !p.cover_url.includes("/storage/") ? p.cover_url : "",
      published: p.published,
    } : empty);
    setCover(null);
    setOpen(true);
  };

  const save = async (publish?: boolean) => {
    if (!form.title.trim() || !form.body.trim()) {
      toast({ title: "Add a title and some text", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = { ...form, published: publish ?? form.published, cover_image_url: form.cover_image_url || null };
      const post = editing
        ? await api.put<Post>(`admin/blog/${editing.id}`, body)
        : await api.post<Post>("admin/blog", body);
      if (cover) {
        const fd = new FormData();
        fd.append("image", cover);
        await api.post(`admin/blog/${post.id}/cover`, fd);
      }
      toast({ title: body.published ? "Published" : "Saved as draft" });
      setOpen(false);
      load();
    } catch (e) {
      toast({ title: "Couldn't save", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (p: Post) => {
    try {
      await api.put(`admin/blog/${p.id}`, { published: !p.published });
      load();
    } catch (e) {
      toast({ title: "Couldn't update", description: errorMessage(e), variant: "destructive" });
    }
  };

  const remove = async (p: Post) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    try {
      await api.delete(`admin/blog/${p.id}`);
      load();
    } catch (e) {
      toast({ title: "Couldn't delete", description: errorMessage(e), variant: "destructive" });
    }
  };

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-5xl space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Blog</h1>
              <p className="text-muted-foreground">Guides and news for organisers. Published posts appear on /blog.</p>
            </div>
            <Button onClick={() => openEditor(null)}><Plus className="w-4 h-4 mr-2" /> New post</Button>
          </div>

          {!posts ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : posts.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center text-muted-foreground">No posts yet.</div>
          ) : (
            <ul className="space-y-3">
              {posts.map((p) => (
                <li key={p.id} className="glass rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-36 h-28 sm:h-24 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
                    {p.cover_url && <img src={p.cover_url} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold text-foreground">{p.title}</h2>
                      <Badge variant="outline" className={p.published ? "border-success/50 text-success" : "border-yellow-500/50 text-yellow-500"}>
                        {p.published ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.excerpt}</p>
                    <div className="text-xs text-muted-foreground mt-1">
                      {p.category} · {p.read_minutes ?? 1} min read · {p.view_count ?? 0} views
                      {p.published_at ? ` · ${new Date(p.published_at).toLocaleDateString("en-KE")}` : ""}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button size="sm" variant="ghost" onClick={() => openEditor(p)}><Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => togglePublish(p)}>
                        {p.published ? <><EyeOff className="w-3.5 h-3.5 mr-1.5" /> Unpublish</> : <><Eye className="w-3.5 h-3.5 mr-1.5" /> Publish</>}
                      </Button>
                      {p.published && (
                        <Button size="sm" variant="ghost" asChild><Link to={`/blog/${p.slug}`} target="_blank"><ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View</Link></Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(p)}><Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete</Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit post" : "New post"}</DialogTitle>
            <DialogDescription>Separate paragraphs with a blank line. A short line on its own becomes a heading.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="bt">Title</Label>
              <Input id="bt" value={form.title} onChange={set("title")} /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="bc">Category</Label>
                <select id="bc" value={form.category} onChange={set("category")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select></div>
              <div className="space-y-1.5"><Label htmlFor="bi">Cover image</Label>
                <Input id="bi" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCover(e.target.files?.[0] || null)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="bu">…or cover image URL</Label>
              <Input id="bu" type="url" placeholder="https://images.unsplash.com/…" value={form.cover_image_url} onChange={set("cover_image_url")} /></div>
            <div className="space-y-1.5"><Label htmlFor="be">Summary</Label>
              <Textarea id="be" rows={2} maxLength={500} value={form.excerpt} onChange={set("excerpt")} placeholder="One or two sentences shown on the blog list." /></div>
            <div className="space-y-1.5"><Label htmlFor="bb">Article</Label>
              <Textarea id="bb" rows={16} value={form.body} onChange={set("body")} className="font-mono text-sm" /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={saving} onClick={() => save(false)}>Save draft</Button>
            <Button disabled={saving} onClick={() => save(true)}>{saving ? "Saving…" : editing?.published ? "Update" : "Publish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
