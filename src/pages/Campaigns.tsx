import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Send, Loader2, Mail, MessageSquare, Users, Upload, Trash2, Clock, FlaskConical,
  Megaphone, Globe2, CalendarDays, CheckCircle2, ImagePlus, X, Search, Pencil,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage, kes, EventItem } from "@/lib/api";

type Source = "all" | "event" | "platform";

interface Campaign {
  id: number;
  uuid: string;
  name: string;
  channel: "email" | "sms";
  status: "draft" | "scheduled" | "queued" | "sending" | "sent" | "failed" | "cancelled";
  subject: string | null;
  body: string;
  event_id: number | null;
  featured_event_id: number | null;
  image_path: string | null;
  cta_label: string | null;
  cta_url: string | null;
  audience_filter: { source?: Source; checked_in?: boolean; include_contacts?: boolean } | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  estimated_cost: string;
  scheduled_for: string | null;
  completed_at: string | null;
  created_at: string;
  event?: { id: number; title: string } | null;
  featured_event?: { id: number; uuid: string; title: string } | null;
}

interface Audience {
  recipient_count: number;
  segments_per_message: number;
  estimated_cost: number;
  sample: { name: string; destination: string }[];
}

interface Contact { id: number; email: string | null; phone: string | null; first_name: string | null; last_name: string | null; source: string | null }

const blank = {
  name: "", channel: "email" as "email" | "sms", source: "all" as Source, event_id: "", checked_in: false,
  include_contacts: true, featured_event_id: "", subject: "", body: "", image_path: "", image_url: "",
  cta_label: "", cta_url: "",
};
type Form = typeof blank;

const TAGS = ["{{first_name}}", "{{name}}"];

const statusStyle: Record<Campaign["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/15 text-blue-400",
  queued: "bg-yellow-500/15 text-yellow-500",
  sending: "bg-yellow-500/15 text-yellow-500",
  sent: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const fmt = (d: string) => new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function Campaigns() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin";

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [contactTotal, setContactTotal] = useState<number | null>(null);

  const [editing, setEditing] = useState<Campaign | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [confirm, setConfirm] = useState<Campaign | null>(null);
  const [scheduling, setScheduling] = useState<Campaign | null>(null);

  const load = () => api.get<{ data: Campaign[] }>("campaigns?per_page=50").then((r) => setCampaigns(r.data))
    .catch((e) => toast({ title: "Couldn't load campaigns", description: errorMessage(e), variant: "destructive" }));
  const loadContacts = () => api.get<{ total: number }>("contacts?per_page=1").then((r) => setContactTotal(r.total)).catch(() => {});

  useEffect(() => {
    load();
    loadContacts();
    api.get<{ data: EventItem[] }>("events?per_page=100").then((r) => setEvents(r.data)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch progress while anything is going out.
  const busy = campaigns?.some((c) => c.status === "queued" || c.status === "sending");
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (c: Campaign | null) => { setEditing(c); setComposerOpen(true); };

  const testSend = async (c: Campaign) => {
    try {
      const r = await api.post<{ message: string }>(`campaigns/${c.uuid}/test`);
      toast({ title: "Test sent", description: r.message });
    } catch (e) {
      toast({ title: "Test failed", description: errorMessage(e), variant: "destructive" });
    }
  };

  const remove = async (c: Campaign) => {
    try {
      await api.delete(`campaigns/${c.uuid}`);
      load();
    } catch (e) {
      toast({ title: "Couldn't delete", description: errorMessage(e), variant: "destructive" });
    }
  };

  const unschedule = async (c: Campaign) => {
    try {
      await api.post(`campaigns/${c.uuid}/cancel`);
      load();
    } catch (e) {
      toast({ title: "Couldn't cancel", description: errorMessage(e), variant: "destructive" });
    }
  };

  const audienceLabel = (c: Campaign) => {
    const s = c.audience_filter?.source ?? (c.event_id ? "event" : "all");
    if (s === "platform") return "Everyone on Tikooh";
    if (s === "event") return `Guests of ${c.event?.title ?? "an event"}`;
    return "All past guests";
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-5xl space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Campaigns</h1>
              <p className="text-muted-foreground">Tell your past guests about new events, offers and news.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setContactsOpen(true)}>
                <Users className="w-4 h-4 mr-2" /> Contacts{contactTotal ? ` (${contactTotal.toLocaleString()})` : ""}
              </Button>
              <Button onClick={() => open(null)}><Plus className="w-4 h-4 mr-2" /> New campaign</Button>
            </div>
          </div>

          {!campaigns ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : campaigns.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center space-y-3">
              <Megaphone className="w-10 h-10 text-primary mx-auto" />
              <h2 className="text-lg font-semibold text-foreground">Your first campaign</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Announce your next event to everyone who has been to one before. Have guest lists from before Tikooh?
                Import them under <button className="text-primary underline" onClick={() => setContactsOpen(true)}>Contacts</button>.
              </p>
              <Button onClick={() => open(null)}><Plus className="w-4 h-4 mr-2" /> New campaign</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => {
                const progress = c.recipient_count ? Math.round(((c.sent_count + c.failed_count) / c.recipient_count) * 100) : 0;
                const editable = c.status === "draft" || c.status === "scheduled";
                return (
                  <div key={c.uuid} className="glass rounded-2xl p-4 md:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {c.channel === "email" ? <Mail className="w-4 h-4 text-primary" /> : <MessageSquare className="w-4 h-4 text-primary" />}
                          <span className="font-semibold text-foreground truncate">{c.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusStyle[c.status]}`}>
                            {c.status === "scheduled" && c.scheduled_for ? `Scheduled · ${fmt(c.scheduled_for)}` : c.status}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {audienceLabel(c)} · {c.recipient_count.toLocaleString()} {c.recipient_count === 1 ? "person" : "people"}
                          {c.channel === "sms" && Number(c.estimated_cost) > 0 && ` · ~${kes(c.estimated_cost)}`}
                          {c.featured_event && ` · promotes ${c.featured_event.title}`}
                        </div>
                        {c.subject && <div className="text-sm text-foreground/80 mt-1 truncate">“{c.subject}”</div>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {editable && <Button size="sm" variant="ghost" onClick={() => open(c)}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>}
                        {editable && c.channel === "email" && <Button size="sm" variant="ghost" onClick={() => testSend(c)}><FlaskConical className="w-3.5 h-3.5 mr-1" /> Test</Button>}
                        {c.status === "draft" && <Button size="sm" variant="outline" onClick={() => setScheduling(c)}><Clock className="w-3.5 h-3.5 mr-1" /> Schedule</Button>}
                        {c.status === "scheduled" && <Button size="sm" variant="outline" onClick={() => unschedule(c)}>Unschedule</Button>}
                        {editable && <Button size="sm" onClick={() => setConfirm(c)}><Send className="w-3.5 h-3.5 mr-1" /> Send now</Button>}
                        {(editable || c.status === "cancelled") && <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(c)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                      </div>
                    </div>

                    {(c.status === "sending" || c.status === "queued" || c.status === "sent" || c.status === "failed") && (
                      <div className="mt-4">
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-primary to-sky-500 transition-all duration-700" style={{ width: `${c.status === "sent" ? 100 : progress}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1.5 tabular-nums">
                          <span>{c.sent_count.toLocaleString()} sent{c.failed_count > 0 && <span className="text-destructive"> · {c.failed_count} failed</span>}</span>
                          <span>{c.completed_at ? `Finished ${fmt(c.completed_at)}` : c.status === "queued" ? "Starting…" : `${progress}%`}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {composerOpen && (
        <Composer
          campaign={editing}
          events={events}
          isAdmin={isAdmin}
          contactTotal={contactTotal ?? 0}
          onClose={() => setComposerOpen(false)}
          onSaved={(c, then) => {
            setComposerOpen(false);
            load();
            if (then === "send") setConfirm(c);
            if (then === "test") testSend(c);
          }}
        />
      )}

      <ConfirmSend campaign={confirm} onClose={() => setConfirm(null)} onSent={() => { setConfirm(null); load(); }} />
      <ScheduleDialog campaign={scheduling} onClose={() => setScheduling(null)} onDone={() => { setScheduling(null); load(); }} />
      <ContactsDialog open={contactsOpen} onClose={() => setContactsOpen(false)} onChanged={loadContacts} />
    </div>
  );
}

/* ── Composer ─────────────────────────────────────────────────────────── */

function Composer({ campaign, events, isAdmin, contactTotal, onClose, onSaved }: {
  campaign: Campaign | null;
  events: EventItem[];
  isAdmin: boolean;
  contactTotal: number;
  onClose: () => void;
  onSaved: (c: Campaign, then?: "send" | "test") => void;
}) {
  const [form, setForm] = useState<Form>(() => campaign ? {
    name: campaign.name,
    channel: campaign.channel,
    source: campaign.audience_filter?.source ?? (campaign.event_id ? "event" : "all"),
    event_id: campaign.event_id ? String(campaign.event_id) : "",
    checked_in: !!campaign.audience_filter?.checked_in,
    include_contacts: campaign.audience_filter?.include_contacts ?? true,
    featured_event_id: campaign.featured_event_id ? String(campaign.featured_event_id) : "",
    subject: campaign.subject ?? "",
    body: campaign.body,
    image_path: campaign.image_path ?? "",
    image_url: "",
    cta_label: campaign.cta_label ?? "",
    cta_url: campaign.cta_url ?? "",
  } : blank);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [counting, setCounting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const payload = () => ({
    name: form.name.trim() || form.subject.trim() || "Untitled campaign",
    channel: form.channel,
    event_id: form.source === "event" && form.event_id ? Number(form.event_id) : null,
    featured_event_id: form.featured_event_id ? Number(form.featured_event_id) : null,
    subject: form.channel === "email" ? form.subject || null : null,
    body: form.body,
    image_path: form.channel === "email" ? form.image_path || null : null,
    cta_label: form.channel === "email" && form.cta_url ? form.cta_label || "Learn more" : null,
    cta_url: form.channel === "email" ? form.cta_url || null : null,
    audience_filter: { source: form.source, checked_in: form.checked_in, include_contacts: form.include_contacts },
  });

  // Live recipient count as the audience changes.
  const audienceKey = `${form.channel}|${form.source}|${form.event_id}|${form.checked_in}|${form.include_contacts}|${form.channel === "sms" ? form.body.length : ""}`;
  useEffect(() => {
    if (form.source === "event" && !form.event_id) { setAudience(null); return; }
    setCounting(true);
    const t = window.setTimeout(() => {
      const p = payload();
      api.post<Audience>("campaigns/audience", { channel: p.channel, event_id: p.event_id, audience_filter: p.audience_filter, body: p.body || " " })
        .then(setAudience).catch(() => setAudience(null)).finally(() => setCounting(false));
    }, 350);
    return () => window.clearTimeout(t);
  }, [audienceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const insertTag = (tag: string) => {
    const el = bodyRef.current;
    const at = el?.selectionStart ?? form.body.length;
    set("body", form.body.slice(0, at) + tag + form.body.slice(el?.selectionEnd ?? at));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + tag.length, at + tag.length); });
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const r = await api.post<{ path: string; url: string }>("campaigns/image", fd);
      setForm((f) => ({ ...f, image_path: r.path, image_url: r.url }));
    } catch (e) {
      toast({ title: "Upload failed", description: errorMessage(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const save = async (then?: "send" | "test") => {
    if (!form.body.trim()) { toast({ title: "Write a message first", variant: "destructive" }); return; }
    if (form.channel === "email" && !form.subject.trim()) { toast({ title: "Add a subject line", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const c = campaign
        ? await api.put<Campaign>(`campaigns/${campaign.uuid}`, payload())
        : await api.post<Campaign>("campaigns", payload());
      toast({ title: campaign ? "Campaign saved" : "Draft saved" });
      onSaved(c, then);
    } catch (e) {
      toast({ title: "Couldn't save", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const featured = events.find((e) => String(e.id) === form.featured_event_id);
  const upcoming = events.filter((e) => +new Date(e.end_date || e.start_date) > Date.now());
  const imageUrl = form.image_url || (form.image_path?.startsWith("http") ? form.image_path : "");
  const smsLen = form.body.length;

  const sources: { id: Source; title: string; hint: string; icon: typeof Users }[] = [
    { id: "all", title: "All my past guests", hint: `Everyone who booked any of your events${contactTotal ? ` + ${contactTotal.toLocaleString()} imported contacts` : ""}`, icon: Users },
    { id: "event", title: "Guests of one event", hint: "Updates, thank-yous, photos", icon: CalendarDays },
    ...(isAdmin ? [{ id: "platform" as Source, title: "Everyone on Tikooh", hint: "Every attendee across all organisers", icon: Globe2 }] : []),
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
        <div className="grid lg:grid-cols-[1fr_380px]">
          {/* ── Form ── */}
          <div className="p-6 space-y-5">
            <DialogHeader>
              <DialogTitle>{campaign ? "Edit campaign" : "New campaign"}</DialogTitle>
              <DialogDescription>Who it goes to, what it says, and what you want them to do.</DialogDescription>
            </DialogHeader>

            <div className="flex gap-2">
              {(["email", "sms"] as const).map((ch) => (
                <button key={ch} type="button" onClick={() => set("channel", ch)}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${form.channel === ch ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                  {ch === "email" ? <Mail className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />} {ch === "email" ? "Email" : "SMS"}
                </button>
              ))}
            </div>

            {/* Audience */}
            <div className="space-y-2">
              <Label>Send to</Label>
              <div className={`grid gap-2 ${sources.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                {sources.map((s) => (
                  <button key={s.id} type="button" onClick={() => set("source", s.id)}
                    className={`text-left rounded-xl border p-3 transition ${form.source === s.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                    <s.icon className={`w-4 h-4 mb-1.5 ${form.source === s.id ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="text-sm font-medium text-foreground">{s.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.hint}</div>
                  </button>
                ))}
              </div>
              {form.source === "event" && (
                <select value={form.event_id} onChange={(e) => set("event_id", e.target.value)} aria-label="Event"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Choose the event…</option>
                  {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={form.checked_in} onCheckedChange={(v) => set("checked_in", v)} /> Only people who showed up
                </label>
                {form.source !== "event" && !form.checked_in && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Switch checked={form.include_contacts} onCheckedChange={(v) => set("include_contacts", v)} /> Include imported contacts
                  </label>
                )}
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2.5 text-sm">
                {counting ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <CheckCircle2 className="w-4 h-4 text-primary" />}
                <span className="text-foreground font-semibold tabular-nums">{audience ? audience.recipient_count.toLocaleString() : "—"}</span>
                <span className="text-muted-foreground">
                  {audience?.recipient_count === 1 ? "person" : "people"} will get this
                  {form.channel === "sms" && audience && audience.estimated_cost > 0 && ` · ~${kes(audience.estimated_cost)} (${audience.segments_per_message} SMS each)`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Duplicates are removed and people who unsubscribed are skipped automatically.</p>
            </div>

            {/* Content */}
            {form.channel === "email" && (
              <div className="space-y-1.5">
                <Label htmlFor="cs">Subject line</Label>
                <Input id="cs" maxLength={255} placeholder="{{first_name}}, our biggest night yet is coming 🔥" value={form.subject} onChange={(e) => set("subject", e.target.value)} />
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="cb">Message</Label>
                <div className="flex gap-1">
                  {TAGS.map((t) => (
                    <button key={t} type="button" onClick={() => insertTag(t)} className="text-xs font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground hover:text-primary">
                      + {t.replace(/[{}]/g, "")}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea id="cb" ref={bodyRef} rows={form.channel === "sms" ? 4 : 8} maxLength={10000}
                placeholder={form.channel === "sms"
                  ? "Hi {{first_name}}, tickets for Nairobi Sound Fest are live! Early bird KES 1,500: tikooh.com/e/…"
                  : "Hi {{first_name}},\n\nThanks for partying with us last time. We're back — bigger lineup, new venue…"}
                value={form.body} onChange={(e) => set("body", e.target.value)} />
              {form.channel === "sms" && (
                <p className="text-xs text-muted-foreground tabular-nums">{smsLen} characters · {Math.max(1, Math.ceil(smsLen / (smsLen > 160 ? 153 : 160)))} SMS per person</p>
              )}
            </div>

            {form.channel === "email" && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cf">Promote an event (optional)</Label>
                    <select id="cf" value={form.featured_event_id} onChange={(e) => set("featured_event_id", e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">No event card</option>
                      {(upcoming.length ? upcoming : events).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                    </select>
                    <p className="text-xs text-muted-foreground">Adds the cover, date, venue and a “Get tickets” button.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Header image (optional)</Label>
                    {form.image_path ? (
                      <div className="flex items-center gap-2 h-10 rounded-md border border-input px-3 text-sm">
                        <ImagePlus className="w-4 h-4 text-primary" /> <span className="truncate flex-1">Image added</span>
                        <button type="button" aria-label="Remove image" onClick={() => setForm((f) => ({ ...f, image_path: "", image_url: "" }))}><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 h-10 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground cursor-pointer hover:border-primary/60">
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} Upload JPG/PNG
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                      </label>
                    )}
                  </div>
                </div>
                <div className="grid sm:grid-cols-[180px_1fr] gap-4">
                  <div className="space-y-1.5"><Label htmlFor="cl">Button text</Label>
                    <Input id="cl" maxLength={60} placeholder="Learn more" value={form.cta_label} onChange={(e) => set("cta_label", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label htmlFor="cu">Button link (optional)</Label>
                    <Input id="cu" type="url" placeholder="https://…" value={form.cta_url} onChange={(e) => set("cta_url", e.target.value)} /></div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cn">Campaign name <span className="text-muted-foreground font-normal">(only you see this)</span></Label>
              <Input id="cn" maxLength={255} placeholder="December launch" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>

            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={saving} onClick={() => save()}>Save draft</Button>
                {form.channel === "email" && <Button type="button" variant="outline" disabled={saving} onClick={() => save("test")}><FlaskConical className="w-4 h-4 mr-1.5" /> Save &amp; test</Button>}
                <Button type="button" disabled={saving || !audience?.recipient_count} onClick={() => save("send")}>
                  {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />} Review &amp; send
                </Button>
              </div>
            </DialogFooter>
          </div>

          {/* ── Live preview ── */}
          <div className="hidden lg:block bg-[#05070F] border-l border-border p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Preview</div>
            {form.channel === "sms" ? (
              <div className="rounded-3xl bg-zinc-900 p-4 min-h-[220px]">
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-zinc-700 text-white text-sm px-3.5 py-2.5 whitespace-pre-wrap break-words">
                  {fill(form.body) || "Your message…"}
                </div>
              </div>
            ) : (
              <EmailPreview form={form} imageUrl={imageUrl} featured={featured} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const fill = (s: string) => s.replace(/\{\{first_name\}\}/g, "Wanjiru").replace(/\{\{name\}\}/g, "Wanjiru Kamau");

function EmailPreview({ form, imageUrl, featured }: { form: Form; imageUrl: string; featured?: EventItem }) {
  const paras = useMemo(() => fill(form.body).split(/\n{2,}/).filter((p) => p.trim()), [form.body]);
  return (
    <div className="text-[13px]">
      <div className="text-center font-extrabold text-white text-lg mb-3">tikooh<span className="text-primary">.</span></div>
      <div className="rounded-2xl overflow-hidden border border-[#1C2740] bg-[#0B1220]">
        <div className="h-1 bg-gradient-to-r from-[#19E6CE] via-[#19A1E6] to-[#8B5CF6]" />
        {imageUrl && <img src={imageUrl} alt="" className="w-full max-h-40 object-cover" />}
        <div className="p-5 space-y-3">
          <div className="text-white font-extrabold text-lg leading-snug">{fill(form.subject) || "Your subject line"}</div>
          {paras.length ? paras.map((p, i) => <p key={i} className="text-[#C9D3E3] whitespace-pre-wrap leading-relaxed">{p}</p>)
            : <p className="text-[#5C6A85]">Your message appears here.</p>}
          {featured && (
            <div className="rounded-xl overflow-hidden border border-[#23406A] bg-[#0E1729]">
              {featured.cover_url && <img src={featured.cover_url} alt="" className="w-full max-h-28 object-cover" />}
              <div className="p-3">
                <div className="text-[10px] font-bold tracking-widest uppercase text-[#7FF5E8]">✦ Don't miss it</div>
                <div className="text-white font-bold mt-0.5">{featured.title}</div>
                <div className="text-[#AEB9CE] text-xs mt-1">📅 {new Date(featured.start_date).toLocaleString("en-KE", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}</div>
                <div className="inline-block mt-2.5 rounded-lg px-3 py-1.5 text-xs font-extrabold text-[#05070F] bg-gradient-to-r from-[#19E6CE] to-[#19A1E6]">Get tickets →</div>
              </div>
            </div>
          )}
          {form.cta_url && (
            <div className="text-center pt-1">
              <span className="inline-block rounded-lg px-4 py-2 text-xs font-extrabold text-[#05070F] bg-gradient-to-r from-[#19E6CE] to-[#19A1E6]">{form.cta_label || "Learn more"} →</span>
            </div>
          )}
        </div>
      </div>
      <div className="text-center text-[11px] text-[#5C6A85] mt-3">Unsubscribe link added automatically</div>
    </div>
  );
}

/* ── Send confirmation ────────────────────────────────────────────────── */

function ConfirmSend({ campaign, onClose, onSent }: { campaign: Campaign | null; onClose: () => void; onSent: () => void }) {
  const [sending, setSending] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    setCount(null);
    if (campaign) api.get<Audience>(`campaigns/${campaign.uuid}/preview`).then((a) => setCount(a.recipient_count)).catch(() => setCount(campaign.recipient_count));
  }, [campaign]);

  const send = async () => {
    if (!campaign) return;
    setSending(true);
    try {
      await api.post(`campaigns/${campaign.uuid}/send`);
      toast({ title: "Sending 🚀", description: "You can watch the progress here." });
      onSent();
    } catch (e) {
      toast({ title: "Couldn't send", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!campaign} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send “{campaign?.name}”?</DialogTitle>
          <DialogDescription>
            {count === null ? "Counting recipients…" : `This goes to ${count.toLocaleString()} ${count === 1 ? "person" : "people"} right now. It can't be undone.`}
            {campaign?.channel === "sms" && Number(campaign.estimated_cost) > 0 && ` Estimated cost ${kes(campaign.estimated_cost)}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Not yet</Button>
          <Button disabled={sending || !count} onClick={send}>
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Send to {count?.toLocaleString() ?? "…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ campaign, onClose, onDone }: { campaign: Campaign | null; onClose: () => void; onDone: () => void }) {
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign) return;
    setSaving(true);
    try {
      await api.post(`campaigns/${campaign.uuid}/schedule`, { scheduled_for: new Date(when).toISOString() });
      toast({ title: "Scheduled", description: `Goes out ${fmt(new Date(when).toISOString())}.` });
      onDone();
    } catch (err) {
      toast({ title: "Couldn't schedule", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!campaign} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Schedule “{campaign?.name}”</DialogTitle>
            <DialogDescription>Tip: Tuesday–Thursday around 10am or 6pm tends to get the most opens.</DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-1.5">
            <Label htmlFor="sw">Send at</Label>
            <Input id="sw" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}><Clock className="w-4 h-4 mr-2" /> Schedule</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Contacts ─────────────────────────────────────────────────────────── */

function ContactsDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [list, setList] = useState<{ data: Contact[]; total: number } | null>(null);
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(false);

  const load = () => api.get<{ data: Contact[]; total: number }>(`contacts?per_page=25&q=${encodeURIComponent(q)}`).then(setList).catch(() => {});

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [open, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post<{ added: number; updated: number; skipped: number; total: number }>("contacts/import", fd);
      toast({
        title: `Imported ${r.added.toLocaleString()} new contact${r.added === 1 ? "" : "s"}`,
        description: `${r.updated} updated · ${r.skipped} rows skipped (no email or phone) · ${r.total.toLocaleString()} total`,
      });
      load();
      onChanged();
    } catch (e) {
      toast({ title: "Import failed", description: errorMessage(e), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const remove = async (c: Contact) => {
    await api.delete(`contacts/${c.id}`).catch(() => {});
    load();
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Contacts</DialogTitle>
          <DialogDescription>
            Past guests from before Tikooh. Everyone who books on Tikooh is included in campaigns automatically. You don't need to import them.
          </DialogDescription>
        </DialogHeader>

        <label className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition ${importing ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"}`}>
          {importing ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <Upload className="w-6 h-6 text-primary" />}
          <span className="text-sm font-medium text-foreground">{importing ? "Importing…" : "Upload a CSV"}</span>
          <span className="text-xs text-muted-foreground">Columns like <span className="font-mono">name, email, phone</span>. From Excel or Google Sheets use File → Save as / Download → CSV.</span>
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={importing}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importFile(f); }} />
        </label>
        <p className="text-xs text-muted-foreground">Only import people who gave you their details for your events. Every email includes an unsubscribe link.</p>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <Input className="pl-9" placeholder={`Search ${list?.total.toLocaleString() ?? ""} contacts`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-xl border border-border">
          {!list ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : list.data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{q ? "No matches." : "No contacts imported yet."}</p>
          ) : list.data.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="text-foreground truncate">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone}</div>
                <div className="text-xs text-muted-foreground truncate">{[c.email, c.phone].filter(Boolean).join(" · ")}{c.source && ` · from ${c.source}`}</div>
              </div>
              <button aria-label="Remove contact" className="text-muted-foreground hover:text-destructive" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
