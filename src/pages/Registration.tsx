import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, UserPlus, Printer, Gift, Banknote, CheckCircle2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { api, errorMessage, kes, EventItem, TicketTier } from "@/lib/api";

interface Result {
  reference: string;
  total: string;
  payment: "complimentary" | "cash";
  tickets: { code: string; holder_name: string | null }[];
}

interface Recent {
  id: number;
  reference: string;
  buyer_name: string;
  buyer_phone: string | null;
  total: string;
  provider: string;
  paid_at: string;
  tickets_count: number;
}

const blank = { name: "", phone: "", email: "", quantity: "1" };

/** Door / guest-list registration: issues real tickets without online payment. */
export default function Registration() {
  const [params] = useSearchParams();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventId, setEventId] = useState("");
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [tierId, setTierId] = useState("");
  const [payment, setPayment] = useState<"cash" | "complimentary">("cash");
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);

  useEffect(() => {
    api.get<{ data: EventItem[] }>("events?per_page=100").then((r) => {
      const live = r.data.filter((e) => e.status === "published" || e.status === "live");
      setEvents(live);
      // ?event=<uuid> from the dashboard's "Register guest" shortcut wins;
      // otherwise pick the next event that hasn't finished.
      const wanted = live.find((e) => e.uuid === params.get("event"));
      const next = [...live].sort((a, b) => +new Date(a.start_date) - +new Date(b.start_date))
        .find((e) => +new Date(e.end_date || e.start_date) > Date.now() - 12 * 3600_000);
      const pick = wanted || next || live[0];
      if (pick) setEventId(pick.uuid);
    });
  }, []);

  const loadRecent = (uuid: string) =>
    api.get<Recent[]>(`events/${uuid}/registrations`).then(setRecent).catch(() => setRecent([]));

  useEffect(() => {
    if (!eventId) return;
    setResult(null);
    api.get<EventItem>(`events/${eventId}`).then((e) => {
      const active = (e.ticket_tiers || []).filter((t) => t.is_active);
      setTiers(active);
      setTierId(active[0] ? String(active[0].id) : "");
    });
    loadRecent(eventId);
  }, [eventId]);

  const tier = tiers.find((t) => String(t.id) === tierId);
  const qty = Math.max(1, Number(form.quantity) || 1);
  const due = tier ? Number(tier.price) * qty : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post<Result>(`events/${eventId}/registrations`, {
        ticket_tier_id: Number(tierId),
        quantity: qty,
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        payment,
      });
      setResult(r);
      setForm(blank);
      loadRecent(eventId);
      toast({ title: `${form.name} registered`, description: form.phone ? "Ticket also sent by SMS." : undefined });
    } catch (err) {
      toast({ title: "Couldn't register", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6 print:pt-0">
        <div className="container mx-auto max-w-4xl grid md:grid-cols-5 gap-6">
          <section className="md:col-span-3 space-y-5 print:hidden">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Register a guest</h1>
              <p className="text-muted-foreground">Walk-ins, VIPs and guest lists. Each guest gets a ticket the scanner accepts.</p>
            </div>

            <form onSubmit={submit} className="glass rounded-2xl p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label htmlFor="ev">Event</Label>
                  <select id="ev" value={eventId} onChange={(e) => setEventId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {events.length === 0 && <option value="">No published events</option>}
                    {events.map((e) => <option key={e.uuid} value={e.uuid}>{e.title}</option>)}
                  </select></div>
                <div className="space-y-1.5"><Label htmlFor="tt">Ticket type</Label>
                  <select id="tt" value={tierId} onChange={(e) => setTierId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {tiers.map((t) => <option key={t.id} value={t.id}>{t.name} — {Number(t.price) > 0 ? kes(t.price) : "Free"} ({Math.max(0, t.capacity - t.sold - (t.reserved || 0))} left)</option>)}
                  </select></div>
              </div>

              <div className="space-y-1.5"><Label htmlFor="gn">Guest name</Label>
                <Input id="gn" required autoComplete="off" value={form.name} onChange={set("name")} /></div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="gp">Phone (ticket sent by SMS)</Label>
                  <Input id="gp" type="tel" placeholder="0712 345 678" value={form.phone} onChange={set("phone")} /></div>
                <div className="space-y-1.5"><Label htmlFor="gq">Tickets</Label>
                  <Input id="gq" type="number" min={1} max={20} value={form.quantity} onChange={set("quantity")} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="ge">Email (optional)</Label>
                <Input id="ge" type="email" value={form.email} onChange={set("email")} /></div>

              <fieldset>
                <legend className="text-sm font-medium mb-2">Payment</legend>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { id: "cash", label: "Paid cash", hint: due > 0 ? `Collect ${kes(due)}` : "Free tier", icon: Banknote },
                    { id: "complimentary", label: "Complimentary", hint: "No charge", icon: Gift },
                  ] as const).map((p) => (
                    <button key={p.id} type="button" aria-pressed={payment === p.id} onClick={() => setPayment(p.id)}
                      className={`text-left rounded-xl border p-3 ${payment === p.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                      <p.icon className={`w-5 h-5 mb-1 ${payment === p.id ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="text-sm font-medium text-foreground">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.hint}</div>
                    </button>
                  ))}
                </div>
                {payment === "cash" && due > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">Cash stays with you — it's recorded in your sales but not added to your Tikooh wallet.</p>
                )}
              </fieldset>

              <Button type="submit" className="w-full" disabled={busy || !eventId || !tierId}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4 mr-2" /> Register & issue ticket</>}
              </Button>
            </form>
          </section>

          <aside className="md:col-span-2 space-y-4">
            {result ? (
              <div className="glass rounded-2xl p-5 space-y-3 print:shadow-none print:border-0">
                <div className="flex items-center gap-2 text-success font-semibold print:hidden"><CheckCircle2 className="w-5 h-5" /> Ticket issued</div>
                {result.tickets.map((t) => (
                  <div key={t.code} className="bg-white rounded-xl p-4 flex flex-col items-center">
                    <QRCodeSVG value={t.code} size={180} />
                    <div className="mt-2 text-black font-semibold">{t.holder_name || "Guest"}</div>
                    <div className="font-mono text-xs text-black">{t.code}</div>
                    <div className="text-xs text-gray-600">{events.find((e) => e.uuid === eventId)?.title}</div>
                  </div>
                ))}
                <Button variant="secondary" className="w-full print:hidden" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 mr-2" /> Print
                </Button>
              </div>
            ) : (
              <div className="glass rounded-2xl p-5 text-sm text-muted-foreground print:hidden">
                The guest's QR code appears here. They can show it on your screen, or you can print it.
              </div>
            )}

            {recent.length > 0 && (
              <div className="glass rounded-2xl p-5 print:hidden">
                <h2 className="font-semibold text-foreground mb-2">Registered at the door</h2>
                <ul className="divide-y divide-border text-sm">
                  {recent.slice(0, 15).map((r) => (
                    <li key={r.id} className="py-2 flex justify-between gap-2">
                      <span className="text-foreground truncate">{r.buyer_name} <span className="text-muted-foreground">×{r.tickets_count}</span></span>
                      <span className="text-muted-foreground whitespace-nowrap">{r.provider === "complimentary" ? "Comp" : kes(r.total)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Cash collected: {kes(recent.filter((r) => r.provider === "cash").reduce((s, r) => s + Number(r.total), 0))}
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
