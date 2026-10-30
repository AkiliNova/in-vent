import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Loader2, TrendingUp, TrendingDown, Minus, Wallet, Banknote, Receipt, Users, CalendarDays,
  Ticket, ScanLine, AlertTriangle, CheckCircle2, XCircle, ArrowRight, Table2, BarChart3,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage, kes } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface Overview {
  range: { days: number };
  money: {
    gmv: number; gmv_prev: number; fees: number; fees_prev: number; orders: number; orders_prev: number;
    avg_order: number; owed_to_organisers: number; payouts_waiting: number; payouts_overdue: number;
    paid_out: number; fee_all_time: number;
  };
  growth: {
    organisers: number; organisers_new: number; organisers_selling: number; organisers_onboarded: number;
    events_upcoming: number; events_this_week: number; events_drafts: number; tickets_sold: number; checkins: number;
  };
  daily: { date: string; gmv: number; orders: number }[];
  top_organisers: { tenant_id: number; name: string; gmv: number; orders: number }[];
  top_events: { uuid: string; title: string; organiser: string; start_date: string; gmv: number; orders: number }[];
  recent_orders: { reference: string; buyer: string; total: number; provider: string; event: string; organiser: string; paid_at: string }[];
  recent_signups: { id: number; name: string; type: string | null; events: number; payout_set: boolean; onboarded: boolean; suspended: boolean; created_at: string }[];
  health: { b2c_lock: { result_code: string; result_desc: string } | null; c2b_unmatched: number; failed_jobs: number; queue_waiting: number; pending_orders: number };
}

const RANGES = [7, 30, 90, 365];
// Validated against the dark surface (#0b1020): lightness band + 3:1 contrast.
const BAR = "#0fa797";

const compact = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(Math.round(n));
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/** Change vs the previous period of the same length. */
function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev && !now) return <span className="text-xs text-muted-foreground">no activity</span>;
  if (!prev) return <span className="text-xs text-muted-foreground">new this period</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  return (
    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
      <Icon className="w-3 h-3" aria-hidden /> {pct > 0 ? "+" : ""}{pct}% vs previous
    </span>
  );
}

function Tile({ label, value, sub, icon: Icon, to }: { label: string; value: string; sub?: React.ReactNode; icon: typeof Wallet; to?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>{label}</span><Icon className="w-4 h-4" aria-hidden />
      </div>
      <div className="text-2xl font-bold text-foreground tabular-nums mt-2">{value}</div>
      <div className="mt-1 min-h-[16px]">{sub}</div>
    </>
  );
  return to
    ? <Link to={to} className="glass rounded-2xl p-4 border border-transparent hover:border-primary/40 transition-colors block">{body}</Link>
    : <div className="glass rounded-2xl p-4">{body}</div>;
}

function HealthRow({ ok, label, detail, to }: { ok: boolean; label: string; detail: string; to?: string }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  const row = (
    <div className="flex items-start gap-2 py-2">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${ok ? "text-success" : "text-yellow-500"}`} aria-hidden />
      <div className="min-w-0">
        <div className="text-sm text-foreground">{label} <span className="sr-only">{ok ? "OK" : "needs attention"}</span></div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block hover:bg-secondary/40 rounded-lg px-2 -mx-2">{row}</Link> : row;
}

function SalesTooltip({ active, payload }: { active?: boolean; payload?: { payload: { date: string; gmv: number; orders: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="text-muted-foreground">{new Date(d.date).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}</div>
      <div className="text-foreground font-semibold tabular-nums">{kes(d.gmv)}</div>
      <div className="text-muted-foreground">{d.orders} order{d.orders === 1 ? "" : "s"}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    setData(null);
    api.get<Overview>(`admin/dashboard?days=${days}`).then(setData).catch((e) =>
      toast({ title: "Couldn't load dashboard", description: errorMessage(e), variant: "destructive" }));
  }, [days]);

  const chartDays = useMemo(() => {
    if (!data) return [];
    // A year of daily bars is unreadable: roll up to weeks past 90 days.
    if (data.daily.length <= 90) return data.daily;
    const weeks: { date: string; gmv: number; orders: number }[] = [];
    data.daily.forEach((d, i) => {
      if (i % 7 === 0) weeks.push({ ...d });
      else { weeks[weeks.length - 1].gmv += d.gmv; weeks[weeks.length - 1].orders += d.orders; }
    });
    return weeks;
  }, [data]);

  if (user?.role !== "super_admin") return <Navigate to="/dashboard" replace />;

  const m = data?.money;
  const g = data?.growth;
  const h = data?.health;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-7xl space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Platform overview</h1>
              <p className="text-muted-foreground">Every organiser, every shilling. Amounts in KES.</p>
            </div>
            <div role="group" aria-label="Time range" className="inline-flex rounded-lg border border-border p-0.5">
              {RANGES.map((r) => (
                <button key={r} onClick={() => setDays(r)} aria-pressed={days === r}
                  className={`px-3 py-1.5 text-sm rounded-md ${days === r ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {r === 365 ? "1y" : `${r}d`}
                </button>
              ))}
            </div>
          </div>

          {!data || !m || !g || !h ? (
            <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              {/* Money */}
              <section aria-label="Money" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Tile label="Ticket sales" value={kes(m.gmv)} icon={Banknote} sub={<Delta now={m.gmv} prev={m.gmv_prev} />} />
                <Tile label="Tikooh revenue (fees)" value={kes(m.fees)} icon={Receipt} sub={<Delta now={m.fees} prev={m.fees_prev} />} />
                <Tile label="Paid orders" value={m.orders.toLocaleString()} icon={Ticket}
                  sub={<span className="text-xs text-muted-foreground">avg {kes(m.avg_order)}</span>} />
                <Tile label="Owed to organisers" value={kes(m.owed_to_organisers)} icon={Wallet} to="/admin/payouts"
                  sub={<span className={`text-xs ${m.payouts_overdue ? "text-destructive" : "text-muted-foreground"}`}>
                    {kes(m.payouts_waiting)} requested{m.payouts_overdue ? ` · ${m.payouts_overdue} overdue` : ""}</span>} />
              </section>

              <div className="grid lg:grid-cols-3 gap-4">
                {/* Sales over time */}
                <section className="glass rounded-2xl p-5 lg:col-span-2" aria-labelledby="sales-h">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 id="sales-h" className="font-semibold text-foreground">Ticket sales {chartDays.length < data.daily.length ? "per week" : "per day"}</h2>
                      <p className="text-xs text-muted-foreground">Paid orders, Nairobi time</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
                      {asTable ? <><BarChart3 className="w-4 h-4 mr-1" /> Chart</> : <><Table2 className="w-4 h-4 mr-1" /> Table</>}
                    </Button>
                  </div>
                  {asTable ? (
                    <div className="max-h-64 overflow-y-auto text-sm">
                      <table className="w-full">
                        <thead className="text-muted-foreground text-left sticky top-0 bg-card"><tr><th className="py-1.5 font-medium">Date</th><th className="py-1.5 font-medium text-right">Orders</th><th className="py-1.5 font-medium text-right">Sales</th></tr></thead>
                        <tbody>{[...chartDays].reverse().map((d) => (
                          <tr key={d.date} className="border-t border-border"><td className="py-1.5 text-foreground">{d.date}</td>
                            <td className="py-1.5 text-right tabular-nums">{d.orders}</td><td className="py-1.5 text-right tabular-nums">{kes(d.gmv)}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="h-64" role="img" aria-label={`Ticket sales chart, ${kes(m.gmv)} over ${data.range.days} days. Use the Table button for values.`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartDays} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
                          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} fontSize={11}
                            stroke="hsl(var(--muted-foreground))"
                            tickFormatter={(d) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short" })} />
                          <YAxis tickLine={false} axisLine={false} width={44} fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={compact} />
                          <Tooltip content={<SalesTooltip />} cursor={{ fill: "hsl(var(--secondary))", opacity: 0.5 }} />
                          <Bar dataKey="gmv" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </section>

                {/* Health */}
                <section className="glass rounded-2xl p-5" aria-labelledby="health-h">
                  <h2 id="health-h" className="font-semibold text-foreground mb-2">Health</h2>
                  <HealthRow ok={!h.b2c_lock} label={h.b2c_lock ? "B2C paused" : "B2C payouts live"}
                    detail={h.b2c_lock ? `${h.b2c_lock.result_code}: ${h.b2c_lock.result_desc}` : "Withdrawals can be sent"} to="/admin/payouts" />
                  <HealthRow ok={m.payouts_overdue === 0} label={m.payouts_overdue ? `${m.payouts_overdue} overdue payout(s)` : "No overdue payouts"}
                    detail={`${kes(m.payouts_waiting)} waiting · ${kes(m.paid_out)} paid out this period`} to="/admin/payouts" />
                  <HealthRow ok={h.c2b_unmatched === 0} label="Paybill payments" detail={h.c2b_unmatched ? `${h.c2b_unmatched} not matched to an order` : "All matched"} />
                  <HealthRow ok={h.failed_jobs === 0 && h.queue_waiting < 50} label="Background jobs"
                    detail={`${h.queue_waiting} waiting · ${h.failed_jobs} failed`} />
                  <HealthRow ok label="Checkouts in progress" detail={`${h.pending_orders} unpaid order(s) in the last 24h`} />
                  <p className="text-xs text-muted-foreground mt-3">Server load, disk and services: /status in the Telegram group.</p>
                </section>
              </div>

              {/* Growth */}
              <section aria-label="Growth" className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <Tile label="Organisers" value={g.organisers.toLocaleString()} icon={Users} to="/admin/organisers"
                  sub={<span className="text-xs text-muted-foreground">+{g.organisers_new} this period · {g.organisers_onboarded} fully set up</span>} />
                <Tile label="Organisers selling" value={g.organisers_selling.toLocaleString()} icon={TrendingUp}
                  sub={<span className="text-xs text-muted-foreground">made a sale this period</span>} />
                <Tile label="Upcoming events" value={g.events_upcoming.toLocaleString()} icon={CalendarDays}
                  sub={<span className="text-xs text-muted-foreground">{g.events_this_week} this week · {g.events_drafts} drafts</span>} />
                <Tile label="Tickets issued" value={g.tickets_sold.toLocaleString()} icon={Ticket} />
                <Tile label="Check-ins" value={g.checkins.toLocaleString()} icon={ScanLine}
                  sub={<span className="text-xs text-muted-foreground">all-time fees {kes(m.fee_all_time)}</span>} />
              </section>

              <div className="grid lg:grid-cols-2 gap-4">
                <section className="glass rounded-2xl p-5" aria-labelledby="top-org-h">
                  <div className="flex items-center justify-between mb-3">
                    <h2 id="top-org-h" className="font-semibold text-foreground">Top organisers</h2>
                    <Link to="/admin/organisers" className="text-xs text-primary hover:underline inline-flex items-center gap-1">All <ArrowRight className="w-3 h-3" /></Link>
                  </div>
                  {data.top_organisers.length === 0 ? <p className="text-sm text-muted-foreground">No sales this period.</p> : (
                    <ol className="space-y-2.5">
                      {data.top_organisers.map((o) => {
                        const share = m.gmv ? (o.gmv / m.gmv) * 100 : 0;
                        return (
                          <li key={o.tenant_id} className="text-sm">
                            <div className="flex justify-between gap-2"><span className="text-foreground truncate">{o.name}</span>
                              <span className="tabular-nums text-foreground">{kes(o.gmv)}</span></div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: BAR }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-24 text-right">{Math.round(share)}% · {o.orders} orders</span>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>

                <section className="glass rounded-2xl p-5" aria-labelledby="top-ev-h">
                  <h2 id="top-ev-h" className="font-semibold text-foreground mb-3">Top events</h2>
                  {data.top_events.length === 0 ? <p className="text-sm text-muted-foreground">No sales this period.</p> : (
                    <ul className="divide-y divide-border text-sm">
                      {data.top_events.map((e) => (
                        <li key={e.uuid} className="py-2 flex justify-between gap-3">
                          <div className="min-w-0">
                            <Link to={`/e/${e.uuid}`} target="_blank" className="text-foreground hover:underline truncate block">{e.title}</Link>
                            <div className="text-xs text-muted-foreground">{e.organiser} · {new Date(e.start_date).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</div>
                          </div>
                          <div className="text-right"><div className="tabular-nums text-foreground">{kes(e.gmv)}</div><div className="text-xs text-muted-foreground">{e.orders} orders</div></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <section className="glass rounded-2xl p-5" aria-labelledby="orders-h">
                  <h2 id="orders-h" className="font-semibold text-foreground mb-3">Latest sales</h2>
                  {data.recent_orders.length === 0 ? <p className="text-sm text-muted-foreground">No sales yet.</p> : (
                    <ul className="divide-y divide-border text-sm">
                      {data.recent_orders.map((o) => (
                        <li key={o.reference} className="py-2 flex justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-foreground truncate">{o.event}</div>
                            <div className="text-xs text-muted-foreground truncate">{o.buyer} · {o.organiser} · {o.provider}</div>
                          </div>
                          <div className="text-right"><div className="tabular-nums text-foreground">{kes(o.total)}</div><div className="text-xs text-muted-foreground">{ago(o.paid_at)}</div></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="glass rounded-2xl p-5" aria-labelledby="signups-h">
                  <h2 id="signups-h" className="font-semibold text-foreground mb-3">New organisers</h2>
                  {data.recent_signups.length === 0 ? <p className="text-sm text-muted-foreground">No sign-ups yet.</p> : (
                    <ul className="divide-y divide-border text-sm">
                      {data.recent_signups.map((t) => (
                        <li key={t.id} className="py-2 flex justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-foreground truncate">{t.name}{t.suspended && <span className="ml-2 text-xs text-destructive">suspended</span>}</div>
                            <div className="text-xs text-muted-foreground">{t.type || "type not set"} · {t.events} event(s) · {ago(t.created_at)}</div>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                            {t.payout_set ? <CheckCircle2 className="w-3.5 h-3.5 text-success" aria-hidden /> : <XCircle className="w-3.5 h-3.5 text-yellow-500" aria-hidden />}
                            {t.payout_set ? "Payout set" : "No payout no."}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
