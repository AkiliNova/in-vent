import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Globe, CalendarDays, MapPin, Copy, ExternalLink, ImageIcon, Ticket, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import Navigation from "@/components/Navigation";
import { toast } from "@/hooks/use-toast";
import { api, errorMessage, kes, EventItem, TicketTier } from "@/lib/api";

interface TierDraft {
  id?: number;
  uuid?: string;
  name: string;
  price: string;
  capacity: string;
  description: string;
  sold?: number;
}

const emptyForm = {
  title: "", description: "", host: "", event_type: "",
  start_date: "", end_date: "", location_name: "", city: "", location_map_link: "",
};

const newTier = (): TierDraft => ({ name: "General Admission", price: "0", capacity: "100", description: "" });

/** "2026-10-29T18:00:00.000000Z" → value for <input type="datetime-local"> in local time. */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const publicEventUrl = (uuid: string) => `${window.location.origin}/e/${uuid}`;

const EventsDashboard = () => {
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [tiers, setTiers] = useState<TierDraft[]>([newTier()]);
  const [removedTierIds, setRemovedTierIds] = useState<string[]>([]);
  const [cover, setCover] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await api.get<{ data: EventItem[] }>("events?per_page=100");
      setEvents(res.data);
    } catch (e) {
      toast({ title: "Couldn't load events", description: errorMessage(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // /events?new=1 from onboarding opens the form straight away.
  useEffect(() => {
    if (params.get("new")) {
      openCreate();
      setParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setTiers([newTier()]);
    setRemovedTierIds([]);
    setCover(null);
    setOpen(true);
  };

  const openEdit = async (ev: EventItem) => {
    try {
      const full = await api.get<EventItem>(`events/${ev.uuid}`);
      setEditing(full);
      setForm({
        title: full.title, description: full.description || "", host: full.host || "",
        event_type: full.event_type || "", start_date: toLocalInput(full.start_date),
        end_date: toLocalInput(full.end_date), location_name: full.location_name || "",
        city: full.city || "", location_map_link: full.location_map_link || "",
      });
      setTiers((full.ticket_tiers || []).map((t: TicketTier) => ({
        id: t.id, uuid: t.uuid, name: t.name, price: String(Number(t.price)), capacity: String(t.capacity),
        description: t.description || "", sold: t.sold,
      })));
      setRemovedTierIds([]);
      setCover(null);
      setOpen(true);
    } catch (e) {
      toast({ title: "Couldn't open event", description: errorMessage(e), variant: "destructive" });
    }
  };

  const save = async (publish: boolean) => {
    if (!form.title || !form.start_date) {
      toast({ title: "Add a title and start date", variant: "destructive" });
      return;
    }
    if (publish && tiers.filter((t) => t.name).length === 0) {
      toast({ title: "Add at least one ticket type before publishing", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const body = {
        ...form,
        start_date: new Date(form.start_date).toISOString(),
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
        location_map_link: form.location_map_link || null,
        is_public: true,
      };
      const event = editing
        ? await api.put<EventItem>(`events/${editing.uuid}`, body)
        : await api.post<EventItem>("events", body);

      for (const id of removedTierIds) {
        await api.delete(`events/${event.uuid}/tiers/${id}`);
      }
      for (const t of tiers.filter((t) => t.name.trim())) {
        const tierBody = {
          name: t.name, description: t.description || null,
          price: Number(t.price) || 0, capacity: Number(t.capacity) || 0, is_active: true,
        };
        if (t.uuid) await api.put(`events/${event.uuid}/tiers/${t.uuid}`, tierBody);
        else await api.post(`events/${event.uuid}/tiers`, tierBody);
      }

      if (cover) {
        const fd = new FormData();
        fd.append("image", cover);
        await api.post(`events/${event.uuid}/cover`, fd);
      }

      if (publish) await api.post(`events/${event.uuid}/publish`);

      toast({
        title: publish ? "Event published" : "Event saved",
        description: publish ? "Your ticket page is live — copy the link to share it." : undefined,
      });
      setOpen(false);
      load();
    } catch (e) {
      toast({ title: "Couldn't save", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ev: EventItem) => {
    if (!window.confirm(`Delete "${ev.title}"? This can't be undone.`)) return;
    try {
      await api.delete(`events/${ev.uuid}`);
      setEvents((list) => list.filter((e) => e.id !== ev.id));
    } catch (e) {
      toast({ title: "Couldn't delete", description: errorMessage(e), variant: "destructive" });
    }
  };

  const copyLink = (ev: EventItem) => {
    navigator.clipboard.writeText(publicEventUrl(ev.uuid));
    toast({ title: "Link copied", description: publicEventUrl(ev.uuid) });
  };

  const setF = (k: keyof typeof emptyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const setTier = (i: number, k: keyof TierDraft, v: string) =>
    setTiers((list) => list.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Events</h1>
              <p className="text-muted-foreground">Create an event, add ticket types, publish and share.</p>
            </div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New event</Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : events.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-foreground font-medium mb-1">No events yet</p>
              <p className="text-muted-foreground text-sm mb-5">Your first event takes about two minutes.</p>
              <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Create event</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => (
                <div key={ev.id} className="glass rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-32 h-32 sm:h-24 rounded-xl bg-secondary overflow-hidden flex-shrink-0">
                    {ev.cover_url
                      ? <img src={ev.cover_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-muted-foreground" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h2 className="font-semibold text-foreground truncate">{ev.title}</h2>
                      <Badge variant="outline" className={ev.status === "published" ? "border-success/50 text-success" : "border-yellow-500/50 text-yellow-500"}>
                        {ev.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                      <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />
                        {new Date(ev.start_date).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</span>
                      {(ev.location_name || ev.city) && (
                        <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />
                          {[ev.location_name, ev.city].filter(Boolean).join(", ")}</span>
                      )}
                      <span className="flex items-center gap-1"><Ticket className="w-3.5 h-3.5" />{ev.attendees_count ?? 0} attendees</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {ev.status === "published" && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => copyLink(ev)}><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy link</Button>
                          <Button size="sm" variant="ghost" asChild>
                            <Link to={`/e/${ev.uuid}`} target="_blank"><ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View page</Link>
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEdit(ev)}><Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(ev)}>
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit event" : "New event"}</DialogTitle>
            <DialogDescription>Save as a draft, or publish to open ticket sales.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <section className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="t">Event title</Label>
                <Input id="t" value={form.title} onChange={setF("title")} placeholder="e.g. Sunset Jazz Night" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d">Description</Label>
                <Textarea id="d" rows={4} value={form.description} onChange={setF("description")}
                  placeholder="What should buyers know? Line-up, dress code, what's included…" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="h">Hosted by</Label>
                  <Input id="h" value={form.host} onChange={setF("host")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ty">Category</Label>
                  <Input id="ty" value={form.event_type} onChange={setF("event_type")} placeholder="Concert, conference…" />
                </div>
              </div>
            </section>

            <section className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="s">Starts</Label>
                <Input id="s" type="datetime-local" value={form.start_date} onChange={setF("start_date")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e">Ends (optional)</Label>
                <Input id="e" type="datetime-local" value={form.end_date} onChange={setF("end_date")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v">Venue</Label>
                <Input id="v" value={form.location_name} onChange={setF("location_name")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c">Town / city</Label>
                <Input id="c" value={form.city} onChange={setF("city")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="m">Google Maps link (optional)</Label>
                <Input id="m" type="url" value={form.location_map_link} onChange={setF("location_map_link")} />
              </div>
            </section>

            <section className="space-y-1.5">
              <Label htmlFor="img">Cover image</Label>
              <Input id="img" type="file" accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setCover(e.target.files?.[0] || null)} />
              <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB. Landscape works best.</p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-foreground">Ticket types</h3>
                <Button type="button" size="sm" variant="secondary" onClick={() => setTiers((l) => [...l, { ...newTier(), name: "" }])}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add type
                </Button>
              </div>
              {tiers.map((t, i) => (
                <div key={t.id ?? `new-${i}`} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="grid grid-cols-6 gap-2">
                    <Input className="col-span-6 sm:col-span-3" placeholder="Name, e.g. VIP" value={t.name}
                      onChange={(e) => setTier(i, "name", e.target.value)} aria-label="Ticket name" />
                    <Input className="col-span-3 sm:col-span-2" type="number" min={0} placeholder="Price (KES)"
                      value={t.price} onChange={(e) => setTier(i, "price", e.target.value)} aria-label="Price in KES" />
                    <Input className="col-span-3 sm:col-span-1" type="number" min={0} placeholder="Qty"
                      value={t.capacity} onChange={(e) => setTier(i, "capacity", e.target.value)} aria-label="Quantity available" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {Number(t.price) > 0 ? `${kes(t.price)} · you receive ${kes(Number(t.price) * 0.9)} after the 10% fee` : "Free ticket"}
                      {t.sold ? ` · ${t.sold} sold` : ""}
                    </span>
                    {!t.sold && (
                      <button type="button" className="text-destructive hover:underline"
                        onClick={() => {
                          if (t.uuid) setRemovedTierIds((ids) => [...ids, t.uuid!]);
                          setTiers((l) => l.filter((_, idx) => idx !== i));
                        }}>Remove</button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={saving} onClick={() => save(false)}>Save draft</Button>
            <Button disabled={saving} onClick={() => save(true)}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Globe className="w-4 h-4 mr-2" />}
              {editing?.status === "published" ? "Save & keep live" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventsDashboard;
