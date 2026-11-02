import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Loader2, Pencil, Ban, CheckCircle2, CalendarDays, Ticket, Users, Wallet, TrendingUp,
  Receipt, Mail, MessageSquare, Megaphone, ShieldCheck, Activity, ExternalLink, ScanLine, Percent,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage, kes } from "@/lib/api";

interface Organiser {
  id: number; uuid: string; organization_name: string; business_type: string | null; contact_person: string | null;
  email: string; phone: string | null; website: string | null; kra_pin: string | null; payout_phone: string | null;
  payout_name: string | null; platform_fee_percent: string | null; effective_fee_percent: number; suspended: boolean;
  onboarded_at: string | null; created_at: string;
}
interface Ev {
  id: number; uuid: string; title: string; status: string; is_public: boolean; start_date: string; city: string | null;
  location_name: string | null; attendees_count: number; checked_in_count: number; revenue: string; orders_count: number;
  tickets_sold: number; capacity: number;
}
interface Detail {
  organiser: Organiser;
  kpis: {
    gmv: number; orders: number; gmv_30d: number; fees_earned: number; tickets_sold: number; attendees: number;
    check_in_rate: number | null; events: number; live_events: number; wallet_balance: number; withdrawn: number;
    pending_payouts: number; contacts: number; last_sale_at: string | null;
  };
  events: Ev[];
  orders: { id: number; reference: string; buyer_name: string; buyer_email: string; buyer_phone: string | null; total: string; status: string; provider: string | null; paid_at: string | null; created_at: string; event: { title: string } | null }[];
  payouts: { id: number; net_amount: string; destination_account: string; status: string; payment_method: string | null; mpesa_receipt: string | null; result_desc: string | null; paid_at: string | null; created_at: string }[];
  campaigns: { uuid: string; name: string; channel: string; status: string; recipient_count: number; sent_count: number; failed_count: number; created_at: string }[];
  messages: { id: number; channel: string; type: string; to: string; subject: string | null; status: string; error: string | null; created_at: string }[];
  team: { id: number; name: string; email: string; phone: string | null; role: string; created_at: string; last_login_at: string | null }[];
  activity: { id: number; action: string; description: string | null; created_at: string; user: { name: string } | null }[];
}

const TABS = [
  { id: "events", label: "Events", icon: CalendarDays },
  { id: "orders", label: "Orders", icon: Receipt },
  { id: "payouts", label: "Payouts", icon: ShieldCheck },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "messages", label: "Messages", icon: Mail },
  { id: "team", label: "Team", icon: Users },
  { id: "activity", label: "Activity", icon: Activity },
] as const;

const FIELDS: { key: keyof Organiser; label: string; type?: string; placeholder?: string }[] = [
  { key: "organization_name", label: "Organisation name" },
  { key: "business_type", label: "Business type", placeholder: "church, promoter, company…" },
  { key: "contact_person", label: "Contact person" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website", type: "url", placeholder: "https://" },
  { key: "kra_pin", label: "KRA PIN" },
  { key: "payout_phone", label: "Payout M-Pesa number" },
  { key: "payout_name", label: "Payout name (as registered on M-Pesa)" },
];

const date = (d: string | null, time = false) => d
  ? new Date(d).toLocaleString("en-KE", time ? { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" })
  : "—";

const statusTone = (s: string) =>
  ["paid", "sent", "published", "live", "active"].includes(s) ? "border-success/50 text-success"
    : ["failed", "rejected", "cancelled", "suspended", "expired"].includes(s) ? "border-destructive/50 text-destructive"
    : ["requested", "processing", "pending", "queued", "sending", "scheduled", "draft"].includes(s) ? "border-yellow-500/50 text-yellow-500"
    : "text-muted-foreground";

export default function AdminOrganiserDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("events");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [fee, setFee] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get<Detail>(`admin/organisers/${id}`).then(setD)
    .catch((e) => toast({ title: "Couldn't load organiser", description: errorMessage(e), variant: "destructive" }));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user && user.role !== "super_admin") return <Navigate to="/dashboard" replace />;

  const update = async (body: Record<string, unknown>, ok: string) => {
    setSaving(true);
    try {
      await api.put(`admin/organisers/${id}`, body);
      toast({ title: ok });
      setEditing(false);
      setFee(null);
      load();
    } catch (e) {
      toast({ title: "Not saved", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = () => {
    if (!d) return;
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String(d.organiser[f.key] ?? "")])));
    setEditing(true);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() === "" && k !== "organization_name" && k !== "email" ? null : v.trim()]));
    update(body, "Organiser updated");
  };

  if (!d) {
    return (
      <div className="min-h-screen bg-background"><Navigation />
        <div className="flex justify-center pt-40"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </div>
    );
  }

  const o = d.organiser;
  const k = d.kpis;
  const tiles = [
    { label: "Ticket sales (all time)", value: kes(k.gmv), sub: `${k.orders.toLocaleString()} paid orders · ${kes(k.gmv_30d)} last 30 days`, icon: TrendingUp },
    { label: "Tikooh fees earned", value: kes(k.fees_earned), sub: `${o.effective_fee_percent}% ${o.platform_fee_percent !== null ? "(custom deal)" : "(platform default)"}`, icon: Percent },
    { label: "Tickets sold", value: k.tickets_sold.toLocaleString(), sub: `${k.attendees.toLocaleString()} attendees · ${k.check_in_rate !== null ? `${k.check_in_rate}% checked in` : "no check-ins"}`, icon: Ticket },
    { label: "Events", value: k.events.toLocaleString(), sub: `${k.live_events} on sale now · ${k.contacts.toLocaleString()} imported contacts`, icon: CalendarDays },
    { label: "Wallet balance", value: kes(k.wallet_balance), sub: `${kes(k.withdrawn)} withdrawn${k.pending_payouts > 0 ? ` · ${kes(k.pending_payouts)} pending` : ""}`, icon: Wallet },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-6xl space-y-6">
          <Link to="/admin/organisers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
            <ArrowLeft className="w-4 h-4" /> All organisers
          </Link>

          {/* ── Header ── */}
          <div className="glass rounded-3xl p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-bold text-foreground">{o.organization_name}</h1>
                  {o.suspended ? <Badge variant="outline" className="border-destructive/50 text-destructive">Suspended</Badge>
                    : o.onboarded_at ? <Badge variant="outline" className="border-success/50 text-success">Active</Badge>
                    : <Badge variant="outline" className="border-yellow-500/50 text-yellow-500">Setting up</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span>{o.business_type || "Type not set"}</span>
                  <span>{o.contact_person ? `${o.contact_person} · ` : ""}{o.email}{o.phone ? ` · ${o.phone}` : ""}</span>
                  <span>Joined {date(o.created_at)}{k.last_sale_at ? ` · last sale ${date(k.last_sale_at)}` : " · no sales yet"}</span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Payouts to {o.payout_phone ? <span className="text-foreground">{o.payout_phone}{o.payout_name ? ` (${o.payout_name})` : ""}</span> : <span className="text-yellow-500">not set</span>}
                  {o.kra_pin ? ` · KRA ${o.kra_pin}` : ""}{o.website ? <> · <a href={o.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{o.website.replace(/^https?:\/\//, "")}</a></> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={openEdit}><Pencil className="w-4 h-4 mr-2" /> Edit details</Button>
                <Button variant="outline" onClick={() => setFee(o.platform_fee_percent !== null ? String(Number(o.platform_fee_percent)) : "")}><Percent className="w-4 h-4 mr-2" /> Fee</Button>
                <Button variant="outline" disabled={saving} className={o.suspended ? "" : "text-destructive"}
                  onClick={() => update({ suspended: !o.suspended }, o.suspended ? "Reinstated" : "Suspended. They can't sign in or sell.")}>
                  {o.suspended ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Reinstate</> : <><Ban className="w-4 h-4 mr-2" /> Suspend</>}
                </Button>
              </div>
            </div>
          </div>

          {/* ── KPIs ── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {tiles.map((t) => (
              <div key={t.label} className="glass rounded-2xl p-4">
                <t.icon className="w-4 h-4 text-primary" />
                <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{t.value}</div>
                <div className="text-xs font-medium text-muted-foreground">{t.label}</div>
                <div className="mt-1 text-[11px] text-muted-foreground/80">{t.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map((t) => {
              const count = { events: d.events.length, orders: d.orders.length, payouts: d.payouts.length, campaigns: d.campaigns.length, messages: d.messages.length, team: d.team.length, activity: d.activity.length }[t.id];
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  <t.icon className="w-4 h-4" /> {t.label} <span className="text-xs opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="glass rounded-2xl overflow-x-auto">
            {tab === "events" && (d.events.length === 0 ? <Empty text="No events yet." /> : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b border-border"><tr>
                  <th className="px-4 py-3 font-medium">Event</th><th className="px-4 py-3 font-medium text-right">Revenue</th>
                  <th className="px-4 py-3 font-medium">Tickets</th><th className="px-4 py-3 font-medium">Attendance</th>
                  <th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" />
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {d.events.map((e) => {
                    const pct = e.capacity > 0 ? Math.min(100, Math.round((e.tickets_sold / e.capacity) * 100)) : 0;
                    const showRate = e.attendees_count > 0 ? Math.round((e.checked_in_count / e.attendees_count) * 100) : 0;
                    return (
                      <tr key={e.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{e.title}</div>
                          <div className="text-xs text-muted-foreground">{date(e.start_date, true)}{e.city ? ` · ${e.city}` : ""}{!e.is_public ? " · hidden" : ""}</div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <div className="text-foreground">{kes(e.revenue)}</div>
                          <div className="text-xs text-muted-foreground">{e.orders_count} orders</div>
                        </td>
                        <td className="px-4 py-3 min-w-[150px]">
                          <div className="text-foreground tabular-nums">{e.tickets_sold.toLocaleString()}{e.capacity ? ` / ${e.capacity.toLocaleString()}` : ""}</div>
                          {e.capacity > 0 && <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          <div className="text-foreground">{e.attendees_count.toLocaleString()} guests</div>
                          <div className="text-xs text-muted-foreground">{e.checked_in_count} checked in{e.attendees_count ? ` (${showRate}%)` : ""}</div>
                        </td>
                        <td className="px-4 py-3"><Badge variant="outline" className={statusTone(e.status)}>{e.status}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" asChild title="Guest list"><Link to={`/guests?event=${e.uuid}`}><Users className="w-3.5 h-3.5" /></Link></Button>
                            <Button size="sm" variant="ghost" asChild title="Scanner"><Link to={`/scanner?event=${e.uuid}`}><ScanLine className="w-3.5 h-3.5" /></Link></Button>
                            <Button size="sm" variant="ghost" asChild title="Public page"><a href={`/e/${e.uuid}`} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}

            {tab === "orders" && (d.orders.length === 0 ? <Empty text="No orders yet." /> : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b border-border"><tr>
                  <th className="px-4 py-3 font-medium">Buyer</th><th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">When</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {d.orders.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3"><div className="text-foreground">{r.buyer_name}</div><div className="text-xs text-muted-foreground">{r.buyer_email}{r.buyer_phone ? ` · ${r.buyer_phone}` : ""}</div></td>
                      <td className="px-4 py-3 text-muted-foreground">{r.event?.title}<div className="text-xs font-mono">{r.reference}</div></td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{kes(r.total)}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className={statusTone(r.status)}>{r.status}</Badge>{r.provider && <div className="text-xs text-muted-foreground mt-0.5">{r.provider}</div>}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{date(r.paid_at ?? r.created_at, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

            {tab === "payouts" && (d.payouts.length === 0 ? <Empty text="No withdrawals yet." /> : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b border-border"><tr>
                  <th className="px-4 py-3 font-medium">Withdrawal</th><th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Requested</th><th className="px-4 py-3 font-medium">Paid</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {d.payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3"><div className="font-mono text-foreground">WD-{String(p.id).padStart(5, "0")}</div><div className="text-xs text-muted-foreground">to {p.destination_account}</div></td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{kes(p.net_amount)}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className={statusTone(p.status)}>{p.status}</Badge>
                        {(p.mpesa_receipt || p.result_desc) && <div className="text-xs text-muted-foreground mt-0.5 max-w-[240px]">{p.mpesa_receipt ?? p.result_desc}</div>}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{date(p.created_at, true)}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{date(p.paid_at, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

            {tab === "campaigns" && (d.campaigns.length === 0 ? <Empty text="No campaigns yet." /> : (
              <ul className="divide-y divide-border text-sm">
                {d.campaigns.map((c) => (
                  <li key={c.uuid} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-foreground">{c.channel === "sms" ? <MessageSquare className="w-4 h-4 text-primary" /> : <Mail className="w-4 h-4 text-primary" />}{c.name}</span>
                    <span className="flex items-center gap-3 text-muted-foreground">
                      {c.sent_count}/{c.recipient_count} sent{c.failed_count ? <span className="text-destructive">{c.failed_count} failed</span> : null}
                      <Badge variant="outline" className={statusTone(c.status)}>{c.status}</Badge>
                      <span className="text-xs">{date(c.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ))}

            {tab === "messages" && (d.messages.length === 0 ? <Empty text="No messages sent for this organiser yet." /> : (
              <ul className="divide-y divide-border text-sm">
                {d.messages.map((m) => (
                  <li key={m.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 flex items-center gap-2 text-foreground">
                      {m.channel === "sms" ? <MessageSquare className="w-4 h-4 text-primary" /> : <Mail className="w-4 h-4 text-primary" />}
                      <span className="truncate max-w-[420px]">{m.subject ?? "SMS"} <span className="text-muted-foreground">→ {m.to}</span></span>
                    </span>
                    <span className="flex items-center gap-3 text-muted-foreground">
                      <span className="text-xs">{m.type.replace("_", " ")}</span>
                      <Badge variant="outline" className={statusTone(m.status)}>{m.status}</Badge>
                      <span className="text-xs whitespace-nowrap">{date(m.created_at, true)}</span>
                    </span>
                  </li>
                ))}
                <li className="px-4 py-3 text-xs text-muted-foreground">Open any message in full on the <Link to="/admin/messages" className="text-primary hover:underline">Messages</Link> page.</li>
              </ul>
            ))}

            {tab === "team" && (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b border-border"><tr>
                  <th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Joined</th><th className="px-4 py-3 font-medium">Last sign-in</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {d.team.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3"><div className="text-foreground">{u.name}</div><div className="text-xs text-muted-foreground">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div></td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{u.role}</td>
                      <td className="px-4 py-3 text-muted-foreground">{date(u.created_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{date(u.last_login_at, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "activity" && (d.activity.length === 0 ? <Empty text="No activity recorded yet." /> : (
              <ol className="relative m-5 space-y-4 border-l border-border pl-6">
                {d.activity.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                    <div className="text-sm text-foreground">{a.action.replace(/_/g, " ")}{a.user ? <span className="text-muted-foreground"> by {a.user.name}</span> : null}</div>
                    {a.description && <div className="text-xs text-muted-foreground break-all">{a.description}</div>}
                    <div className="text-[11px] text-muted-foreground/70">{date(a.created_at, true)}</div>
                  </li>
                ))}
              </ol>
            ))}
          </div>
        </div>
      </main>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={saveEdit}>
            <DialogHeader>
              <DialogTitle>Edit {o.organization_name}</DialogTitle>
              <DialogDescription>Changes are recorded in their activity history.</DialogDescription>
            </DialogHeader>
            <div className="my-5 grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className={`space-y-1.5 ${f.key === "organization_name" || f.key === "payout_name" ? "sm:col-span-2" : ""}`}>
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input id={f.key} type={f.type ?? "text"} placeholder={f.placeholder} required={f.key === "organization_name" || f.key === "email"}
                    value={form[f.key] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <p className="mb-4 text-xs text-muted-foreground">Changing the payout number redirects their future withdrawals. Confirm it with the organiser first.</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={fee !== null} onOpenChange={(v) => !v && setFee(null)}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); update({ platform_fee_percent: fee === "" ? null : Number(fee) }, "Fee updated"); }}>
            <DialogHeader>
              <DialogTitle>Platform fee for {o.organization_name}</DialogTitle>
              <DialogDescription>Applies to their sales from now on. Leave empty to use the platform default.</DialogDescription>
            </DialogHeader>
            <div className="my-5 space-y-1.5">
              <Label htmlFor="fee">Fee (%)</Label>
              <Input id="fee" type="number" min={0} max={50} step="0.1" placeholder="Platform default" value={fee ?? ""} onChange={(e) => setFee(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFee(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>Save fee</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="p-10 text-center text-sm text-muted-foreground">{text}</p>;
}
