import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Send, Loader2, Mail, MessageSquare, Users, Upload, Trash2, Clock, FlaskConical,
  Megaphone, ImagePlus, X, Search, Pencil, Smartphone, Wallet, AlertTriangle, Wand2,
} from "lucide-react";
import AudienceBuilder from "@/components/campaigns/AudienceBuilder";
import SmsAccountDialog from "@/components/campaigns/SmsAccountDialog";
import { analyseSms, AudienceFilter, AudienceSummary, SmsStatus, toGsm } from "@/lib/sms";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage, kes, EventItem } from "@/lib/api";
import { fetchAll, Page } from "@/lib/paging";
import Pager from "@/components/Pager";


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
  audience_filter: Partial<AudienceFilter> | null;
  monitor_numbers: string[] | null;
  ask_phone?: boolean;
  phones_added?: number;
  monitors?: { destination: string; status: string; error: string | null; delivered_at: string | null }[];
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

interface Contact {
  id: number;
  kind: "attendee" | "contact";
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  source: string | null;
  events_count: number;
}

const blank = {
  name: "", channel: "email" as "email" | "sms", featured_event_id: "", subject: "", body: "", image_path: "", image_url: "",
  cta_label: "", cta_url: "",
  filter: { source: "all", include_contacts: true } as AudienceFilter,
  /** Up to three of your own numbers that get every SMS first. */
  monitors: [] as string[],
  /** Email only: add a personal "Add my phone number" button. */
  ask_phone: false,
};
type Form = typeof blank;

/** Older campaigns saved checked_in/event_id; map them onto the current filter. */
function filterFrom(c: Campaign): AudienceFilter {
  const f = { ...(c.audience_filter ?? {}) } as AudienceFilter;
  f.source = f.source ?? (c.event_id ? "event" : "all");
  if (f.checked_in && !f.attendance) f.attendance = "checked_in";
  delete f.checked_in;
  if (f.source === "event" && !f.event_ids?.length && c.event_id) f.event_ids = [c.event_id];
  return f;
}

const STATUS_COPY: Record<string, string> = { delivered: "delivered ✓", sent: "sent, awaiting delivery report", failed: "failed", queued: "queued", skipped: "skipped" };

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
  const [sms, setSms] = useState<SmsStatus | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [paging, setPaging] = useState<Page<Campaign> | null>(null);
  const load = () => api.get<Page<Campaign>>(`campaigns?per_page=20&page=${page}`).then((r) => { setCampaigns(r.data); setPaging(r); })
    .catch((e) => toast({ title: "Couldn't load campaigns", description: errorMessage(e), variant: "destructive" }));
  useEffect(() => { if (paging) load(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadContacts = () => api.get<{ imported_total: number }>("contacts?per_page=1").then((r) => setContactTotal(r.imported_total)).catch(() => {});
  const loadSms = () => api.get<SmsStatus>("campaigns/sms-status").then(setSms).catch(() => {});

  useEffect(() => {
    load();
    loadContacts();
    loadSms();
    fetchAll<EventItem>("events").then(setEvents).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch progress while anything is going out.
  const busy = campaigns?.some((c) => c.status === "queued" || c.status === "sending");
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const [preset, setPreset] = useState<Partial<Form> | null>(null);
  const open = (c: Campaign | null, start: Partial<Form> | null = null) => { setEditing(c); setPreset(start); setComposerOpen(true); };

  /** One click: an email to everyone without a phone number, with the personal link. */
  const collectPhones = () => open(null, {
    name: "Collect phone numbers",
    channel: "email",
    ask_phone: true,
    filter: { source: isAdmin ? "platform" : "all", phone: "missing", include_contacts: true },
    subject: "{{first_name}}, add your phone number for ticket updates",
    body: "Hi {{first_name}},\n\nThanks for being part of our events! We'd like to text you your tickets, gate times and important updates, but we don't have your phone number yet.\n\nTap the button below to add it. It takes 10 seconds.",
  });

  const testSend = async (c: Campaign) => {
    try {
      const r = await api.post<{ message: string; results?: { number: string; ok: boolean; error: string | null }[] }>(`campaigns/${c.uuid}/test`);
      const failed = r.results?.filter((x) => !x.ok) ?? [];
      toast({
        title: c.channel === "sms" ? "Test SMS sent 📱" : "Test sent",
        description: failed.length ? `${r.message} Failed: ${failed.map((f) => `+${f.number} (${f.error})`).join(", ")}` : r.message,
      });
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
    const f = c.audience_filter ?? {};
    if (f.include?.length) return `${f.include.length} hand-picked`;
    const s = f.source ?? (c.event_id ? "event" : "all");
    const events = f.event_ids?.length ?? 0;
    if (s === "platform") return f.tenant_ids?.length ? `${f.tenant_ids.length} organiser${f.tenant_ids.length === 1 ? "" : "s"}` : "Everyone on Tikooh";
    if (s === "event") return events > 1 ? `Guests of ${events} events` : `Guests of ${c.event?.title ?? "an event"}`;
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
            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <Button variant="outline" onClick={() => setSmsOpen(true)}>
                  <Wallet className="w-4 h-4 mr-2" /> SMS account
                  {sms?.balance?.ok && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{kes(sms.balance.amount)}</span>}
                  {sms?.balance && !sms.balance.ok && <AlertTriangle className="ml-1.5 w-3.5 h-3.5 text-destructive" />}
                </Button>
              )}
              <Button variant="outline" onClick={() => setContactsOpen(true)}>
                <Users className="w-4 h-4 mr-2" /> Contacts
              </Button>
              <Button variant="outline" onClick={collectPhones}>
                <Smartphone className="w-4 h-4 mr-2" /> Collect phone numbers
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
                          {c.ask_phone && <span className="text-primary"> · {(c.phones_added ?? 0).toLocaleString()} added their phone</span>}
                        </div>
                        {c.subject && <div className="text-sm text-foreground/80 mt-1 truncate">“{c.subject}”</div>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {editable && <Button size="sm" variant="ghost" onClick={() => open(c)}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>}
                        {editable && <Button size="sm" variant="ghost" onClick={() => testSend(c)}><FlaskConical className="w-3.5 h-3.5 mr-1" /> {c.channel === "sms" ? "Test SMS" : "Test"}</Button>}
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
                        {c.monitors && c.monitors.length > 0 && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                            {c.monitors.map((m) => (
                              <span key={m.destination} className={`inline-flex items-center gap-1 ${m.status === "delivered" ? "text-success" : m.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                                <Smartphone className="w-3.5 h-3.5" /> Your copy to +{m.destination}: {STATUS_COPY[m.status] ?? m.status}{m.error ? ` (${m.error})` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <Pager page={paging} onChange={setPage} noun="campaigns" />
        </div>
      </main>

      {composerOpen && (
        <Composer
          campaign={editing}
          preset={preset}
          events={events}
          isAdmin={isAdmin}
          contactTotal={contactTotal ?? 0}
          sms={sms}
          onClose={() => setComposerOpen(false)}
          onSaved={(c, then) => {
            setComposerOpen(false);
            load();
            if (then === "send") setConfirm(c);
            if (then === "test") testSend(c);
          }}
        />
      )}

      <ConfirmSend campaign={confirm} sms={sms} isAdmin={isAdmin} onClose={() => setConfirm(null)} onSent={() => { setConfirm(null); load(); loadSms(); }} />
      {isAdmin && <SmsAccountDialog open={smsOpen} onClose={() => setSmsOpen(false)} onStatus={setSms} />}
      <ScheduleDialog campaign={scheduling} onClose={() => setScheduling(null)} onDone={() => { setScheduling(null); load(); }} />
      <ContactsDialog open={contactsOpen} onClose={() => setContactsOpen(false)} onChanged={loadContacts} />
    </div>
  );
}

/* ── Composer ─────────────────────────────────────────────────────────── */

function Composer({ campaign, preset, events, isAdmin, contactTotal, sms, onClose, onSaved }: {
  campaign: Campaign | null;
  preset?: Partial<Form> | null;
  events: EventItem[];
  isAdmin: boolean;
  contactTotal: number;
  sms: SmsStatus | null;
  onClose: () => void;
  onSaved: (c: Campaign, then?: "send" | "test") => void;
}) {
  const [form, setForm] = useState<Form>(() => campaign ? {
    name: campaign.name,
    channel: campaign.channel,
    filter: filterFrom(campaign),
    monitors: campaign.monitor_numbers ?? [],
    ask_phone: !!campaign.ask_phone,
    featured_event_id: campaign.featured_event_id ? String(campaign.featured_event_id) : "",
    subject: campaign.subject ?? "",
    body: campaign.body,
    image_path: campaign.image_path ?? "",
    image_url: "",
    cta_label: campaign.cta_label ?? "",
    cta_url: campaign.cta_url ?? "",
  } : { ...blank, monitors: sms?.monitor_numbers ?? [], ...(preset ?? {}) });
  const [audience, setAudience] = useState<AudienceSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const monitors = form.monitors.map((m) => m.trim()).filter(Boolean).slice(0, 3);

  const payload = () => ({
    name: form.name.trim() || form.subject.trim() || "Untitled campaign",
    channel: form.channel,
    // Kept for the list label; the filter's event_ids is what decides the audience.
    event_id: form.filter.source === "event" && form.filter.event_ids?.length === 1 ? form.filter.event_ids[0] : null,
    featured_event_id: form.featured_event_id ? Number(form.featured_event_id) : null,
    subject: form.channel === "email" ? form.subject || null : null,
    body: form.body,
    image_path: form.channel === "email" ? form.image_path || null : null,
    cta_label: form.channel === "email" && form.cta_url ? form.cta_label || "Learn more" : null,
    cta_url: form.channel === "email" ? form.cta_url || null : null,
    audience_filter: form.filter,
    monitor_numbers: form.channel === "sms" ? monitors : null,
    ask_phone: form.channel === "email" && form.ask_phone,
  });

  // Credits depend on the body only for SMS (personalised per person server-side).
  const countedBody = form.channel === "sms" ? form.body : "";
  const smsInfo = analyseSms(form.body);

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
            <AudienceBuilder
              channel={form.channel}
              body={countedBody}
              filter={form.filter}
              onChange={(f) => set("filter", f)}
              isAdmin={isAdmin}
              contactTotal={contactTotal}
              sms={sms}
              onSummary={setAudience}
            />

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
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {smsInfo.characters} / {smsInfo.segments === 1 ? smsInfo.perSegment : smsInfo.segments * smsInfo.perSegment} characters
                    · <span className={smsInfo.segments > 1 ? "text-foreground font-medium" : ""}>{smsInfo.segments} SMS part{smsInfo.segments === 1 ? "" : "s"}</span> per person
                    · {smsInfo.remaining} left before the next part
                    {/\{\{/.test(form.body) && " · names change the length, so credits are counted per person"}
                  </p>
                  {smsInfo.encoding === "UCS-2" && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-600 dark:text-orange-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        <span className="font-medium">Unicode message:</span> only {smsInfo.segments > 1 ? 67 : 70} characters per part (instead of 160) because of
                        {" "}{smsInfo.unicodeChars.map((c) => <code key={c} className="mx-0.5 rounded bg-background/60 px-1">{c === " " ? "nbsp" : c}</code>)}
                      </span>
                      {smsInfo.fixable && (
                        <Button type="button" size="sm" variant="outline" className="h-7 ml-auto" onClick={() => set("body", toGsm(form.body))}>
                          <Wand2 className="w-3.5 h-3.5 mr-1" /> Fix: use plain quotes &amp; dashes
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {form.channel === "sms" && (
              <div className="space-y-1.5 rounded-xl border border-border p-3">
                <Label className="flex items-center gap-1.5"><Smartphone className="w-4 h-4 text-primary" /> Send a copy to my number{monitors.length === 1 ? "" : "s"}</Label>
                <p className="text-xs text-muted-foreground">
                  Up to 3 numbers get this SMS first, before anyone else, so you see exactly what landed. "Test SMS" texts only these. Remembered for next time.
                </p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (i === 0 || form.monitors[i - 1]?.trim() || form.monitors[i]) ? (
                    <div key={i} className="relative">
                      <Input inputMode="tel" placeholder={i === 0 ? "07XX XXX XXX" : "Another number"} value={form.monitors[i] ?? ""}
                        onChange={(e) => { const next = [...form.monitors]; next[i] = e.target.value; set("monitors", next); }} />
                      {form.monitors[i] && (
                        <button type="button" aria-label="Remove number" className="absolute right-2 top-2.5 text-muted-foreground hover:text-destructive"
                          onClick={() => set("monitors", form.monitors.filter((_, j) => j !== i))}><X className="w-4 h-4" /></button>
                      )}
                    </div>
                  ) : null)}
                </div>
                {audience && audience.monitor_count > 0 && (
                  <p className="text-xs text-muted-foreground">+{audience.monitor_count} cop{audience.monitor_count === 1 ? "y" : "ies"} to you, included in the credits above.</p>
                )}
              </div>
            )}

            {form.channel === "email" && (
              <label className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={form.ask_phone}
                  onChange={(e) => {
                    const on = e.target.checked;
                    // Asking makes most sense of people we don't have a number for.
                    setForm((f) => ({ ...f, ask_phone: on, filter: on && !f.filter.phone ? { ...f.filter, phone: "missing" } : f.filter }));
                  }} />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground"><Smartphone className="w-4 h-4 text-primary" /> Ask for their phone number</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Adds a personal "Add my phone number" button. They tap it, type their number, and their guest record updates itself, checked as a real mobile. No replies to read.
                  </span>
                </span>
              </label>
            )}

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
                <Button type="button" variant="outline" disabled={saving || (form.channel === "sms" && monitors.length === 0)} onClick={() => save("test")}
                  title={form.channel === "sms" && monitors.length === 0 ? "Add your number under “Send a copy to” first" : undefined}>
                  <FlaskConical className="w-4 h-4 mr-1.5" /> {form.channel === "sms" ? "Save & text me" : "Save & test"}
                </Button>
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
          {form.ask_phone && (
            <div className="rounded-xl border border-[#23406A] bg-[#0E1729] p-4 text-center">
              <div className="text-xl">📱</div>
              <div className="text-white font-bold mt-1">Add your phone number</div>
              <div className="text-[#AEB9CE] text-xs mt-1">So we can text you your tickets and important event updates.</div>
              <div className="inline-block mt-3 rounded-lg px-4 py-2 text-xs font-extrabold text-[#05070F] bg-gradient-to-r from-[#19E6CE] to-[#19A1E6]">Add my phone number →</div>
              <div className="text-[10px] text-[#5C6A85] mt-2">Personal link for each guest</div>
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

function ConfirmSend({ campaign, sms, isAdmin, onClose, onSent }: { campaign: Campaign | null; sms: SmsStatus | null; isAdmin: boolean; onClose: () => void; onSent: () => void }) {
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<AudienceSummary | null>(null);
  const count = preview?.recipient_count ?? null;

  useEffect(() => {
    setPreview(null);
    if (campaign) api.get<AudienceSummary>(`campaigns/${campaign.uuid}/preview`).then(setPreview)
      .catch(() => setPreview({ recipient_count: campaign.recipient_count, estimated_cost: Number(campaign.estimated_cost) } as AudienceSummary));
  }, [campaign]);

  const isSms = campaign?.channel === "sms";
  const balance = sms?.balance;
  const short = isSms && balance?.ok && balance.amount != null && (preview?.estimated_cost ?? 0) > balance.amount;

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
          </DialogDescription>
        </DialogHeader>
        {isSms && preview?.credits != null && (
          <div className="rounded-xl border border-border divide-y divide-border text-sm">
            <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">SMS credits</span><span className="font-semibold tabular-nums">{preview.credits.toLocaleString()}</span></div>
            <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Estimated cost</span><span className="font-semibold tabular-nums">{kes(preview.estimated_cost)}</span></div>
            {preview.skipped > 0 && (
              <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Bad numbers skipped (free)</span><span className="tabular-nums">{preview.skipped.toLocaleString()}</span></div>
            )}
            {isAdmin && balance?.ok && (
              <div className={`flex justify-between px-3 py-2 ${short ? "text-destructive" : ""}`}>
                <span className={short ? "" : "text-muted-foreground"}>{sms?.provider_label} balance</span>
                <span className="tabular-nums font-medium">{kes(balance.amount)}{short ? " · not enough" : ""}</span>
              </div>
            )}
            <div className="flex items-start gap-2 px-3 py-2 text-xs">
              <Smartphone className="w-4 h-4 text-primary shrink-0" />
              {preview.monitor_count > 0
                ? <span>Your cop{preview.monitor_count === 1 ? "y goes" : "ies go"} first to {preview.monitor_numbers.map((n) => `+${n}`).join(", ")}. Watch your phone.</span>
                : <span className="text-orange-500">No confirmation number. You won't get a copy. Edit the campaign to add yours.</span>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Not yet</Button>
          <Button disabled={sending || !count || short} onClick={send}>
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

/** Excel, ODS and friends become a CSV in the browser; the server only parses text. */
const SPREADSHEET = /\.(xlsx|xlsm|xlsb|xls|ods|numbers)$/i;

async function asCsv(file: File): Promise<File> {
  if (!SPREADSHEET.test(file.name)) return file;
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  // First sheet that actually has rows in it.
  const sheet = book.SheetNames.map((n) => book.Sheets[n]).find((s) => s && s["!ref"]);
  if (!sheet) throw new Error("That spreadsheet is empty.");
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false, rawNumbers: false });
  return new File([csv], file.name.replace(SPREADSHEET, ".csv"), { type: "text/csv" });
}

function ContactsDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [list, setList] = useState<{ data: Contact[]; total: number; imported_total: number; attendee_total: number; current_page: number; last_page: number } | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "attendees" | "imported">("all");
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [organisers, setOrganisers] = useState<{ id: number; organization_name: string }[]>([]);
  const [tenantId, setTenantId] = useState("");

  const owner = isSuperAdmin && tenantId ? `&tenant_id=${tenantId}` : "";
  const load = () => api.get<NonNullable<typeof list>>(`contacts?per_page=50&page=${page}&type=${type}&q=${encodeURIComponent(q)}${owner}`).then(setList).catch(() => {});
  useEffect(() => { setPage(1); }, [q, type, tenantId]);

  useEffect(() => {
    if (!open || !isSuperAdmin || organisers.length) return;
    fetchAll<{ id: number; organization_name: string }>("admin/organisers")
      .then((all) => setOrganisers([...all].sort((a, b) => a.organization_name.localeCompare(b.organization_name))))
      .catch(() => {});
  }, [open, isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [open, q, tenantId, type, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const importFile = async (picked: File) => {
    if (isSuperAdmin && !tenantId) {
      toast({ title: "Choose an organiser first", description: "Pick who these contacts belong to.", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const file = await asCsv(picked);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", picked.name);
      if (isSuperAdmin) fd.append("tenant_id", tenantId);
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
            Everyone you can reach: guests who registered for your events, plus past guests you imported from before Tikooh. New registrations appear here automatically.
          </DialogDescription>
        </DialogHeader>

        {isSuperAdmin && (
          <div className="space-y-1.5">
            <Label htmlFor="contacts-owner">Contacts belong to</Label>
            <select id="contacts-owner" value={tenantId} onChange={(e) => setTenantId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Choose an organiser…</option>
              {organisers.map((o) => <option key={o.id} value={o.id}>{o.organization_name}</option>)}
            </select>
          </div>
        )}

        <label className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition ${importing ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"}`}>
          {importing ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <Upload className="w-6 h-6 text-primary" />}
          <span className="text-sm font-medium text-foreground">{importing ? "Importing…" : "Upload a spreadsheet"}</span>
          <span className="text-xs text-muted-foreground">Excel, Google Sheets export, CSV or TSV. Any columns with names and phone numbers or emails. Headers optional.</span>
          <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xlsb,.xls,.ods,.numbers,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet" className="hidden" disabled={importing}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importFile(f); }} />
        </label>
        <p className="text-xs text-muted-foreground">Only import people who gave you their details for your events. Every email includes an unsubscribe link.</p>

        <div className="flex flex-wrap items-center gap-2">
          {([
            ["all", "Everyone", list ? list.attendee_total + list.imported_total : null],
            ["attendees", "Registered", list?.attendee_total],
            ["imported", "Imported", list?.imported_total],
          ] as const).map(([id, label, n]) => (
            <button key={id} type="button" onClick={() => setType(id)}
              className={`text-xs rounded-full px-2.5 py-1 border transition ${type === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {label}{n != null ? ` ${n.toLocaleString()}` : ""}
            </button>
          ))}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-border rounded-xl border border-border">
          {!list ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : list.data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{q ? "No matches." : type === "imported" ? "No contacts imported yet." : "Nobody has registered yet."}</p>
          ) : list.data.map((c) => (
            <div key={`${c.kind}-${c.id}`} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-foreground truncate">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${c.kind === "attendee" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {c.kind === "attendee" ? (c.events_count > 1 ? `${c.events_count} events` : "Registered") : "Imported"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate">{[c.email, c.phone].filter(Boolean).join(" · ") || "No email or phone"}{c.source && ` · from ${c.source}`}</div>
              </div>
              {c.kind === "contact" && (
                <button aria-label="Remove contact" className="text-muted-foreground hover:text-destructive" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
          ))}
        </div>
        {list && list.last_page > 1 && (
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <Button type="button" size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="tabular-nums">{list.current_page} / {list.last_page}</span>
            <Button type="button" size="sm" variant="ghost" disabled={page >= list.last_page} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
