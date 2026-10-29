import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { CalendarDays, MapPin, Minus, Plus, Loader2, Smartphone, CheckCircle2, Hash, AlertCircle } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage, kes, EventItem, TicketTier } from "@/lib/api";

interface Order {
  reference: string;
  pay_code: string;
  paybill: string | null;
  total: string;
  status: string;
}

interface OrderStatus {
  status: "pending" | "paid" | "failed" | "expired" | "cancelled" | "refunded";
  tickets: { code: string; holder_name: string | null; status: string }[];
}

const remaining = (t: TicketTier) => Math.max(0, t.capacity - t.sold - (t.reserved || 0));

export default function PublicEvent() {
  const { uuid, eventId } = useParams();
  const id = uuid || eventId;

  const [event, setEvent] = useState<EventItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [buyer, setBuyer] = useState({ name: "", email: "", phone: "" });
  const [order, setOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stkSent, setStkSent] = useState(false);
  const poller = useRef<number>();

  useEffect(() => {
    api.get<EventItem>(`public/events/${id}`)
      .then(setEvent)
      .catch((e) => setLoadError(e.status === 404 ? "This event isn't available." : errorMessage(e)));
  }, [id]);

  useEffect(() => () => window.clearInterval(poller.current), []);

  const tiers = event?.ticket_tiers || [];
  const total = useMemo(
    () => tiers.reduce((s, t) => s + (qty[t.id] || 0) * Number(t.price), 0),
    [tiers, qty]
  );
  const count = Object.values(qty).reduce((a, b) => a + b, 0);

  const bump = (t: TicketTier, d: number) =>
    setQty((q) => ({ ...q, [t.id]: Math.max(0, Math.min((q[t.id] || 0) + d, remaining(t), t.max_per_order || 10)) }));

  const startPolling = (reference: string) => {
    window.clearInterval(poller.current);
    const started = Date.now();
    const tick = async () => {
      try {
        const s = await api.get<OrderStatus>(`public/orders/${reference}`);
        setStatus(s);
        if (s.status !== "pending" || Date.now() - started > 15 * 60_000) window.clearInterval(poller.current);
      } catch { /* keep trying */ }
    };
    tick();
    poller.current = window.setInterval(tick, 4000);
  };

  const checkout = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const o = await api.post<Order>(`public/events/${id}/orders`, {
        items: Object.entries(qty).filter(([, n]) => n > 0).map(([tid, n]) => ({ ticket_tier_id: Number(tid), quantity: n })),
        buyer,
      });
      setOrder(o);
      if (o.status === "paid") {
        startPolling(o.reference);
      } else {
        await sendStk(o, buyer.phone);
        startPolling(o.reference);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendStk = async (o: Order, phone: string) => {
    if (!phone) return;
    setStkSent(false);
    try {
      await api.post(`public/orders/${o.reference}/pay/mpesa`, { phone });
      setStkSent(true);
    } catch (err) {
      setError(`${errorMessage(err)} You can still pay with the paybill below.`);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-background"><Navigation />
        <div className="pt-32 text-center text-muted-foreground">{loadError} <Link to="/search-events" className="text-primary">Browse events</Link></div>
      </div>
    );
  }
  if (!event) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const paid = status?.status === "paid";

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-20 pb-16">
        {event.cover_url && (
          // Generated covers carry the title as text, so show them whole
          // rather than cropping like a photo.
          <div className={`w-full overflow-hidden ${event.cover_url.endsWith(".svg") ? "bg-[#0b1020] h-56 md:h-[420px]" : "h-56 md:h-80"}`}>
            <img src={event.cover_url} alt="" className={`w-full h-full ${event.cover_url.endsWith(".svg") ? "object-contain" : "object-cover"}`} />
          </div>
        )}
        <div className="container mx-auto px-4 max-w-5xl grid md:grid-cols-5 gap-8 mt-8">
          <section className="md:col-span-3 space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">{event.title}</h1>
            <div className="flex flex-col gap-2 text-muted-foreground">
              <span className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" />
                {new Date(event.start_date).toLocaleString("en-KE", { dateStyle: "full", timeStyle: "short" })}</span>
              {(event.location_name || event.city) && (
                <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" />
                  {event.location_map_link
                    ? <a href={event.location_map_link} target="_blank" rel="noreferrer" className="hover:underline">{[event.location_name, event.city].filter(Boolean).join(", ")}</a>
                    : [event.location_name, event.city].filter(Boolean).join(", ")}
                </span>
              )}
              {event.host && <span className="text-sm">Hosted by {event.host}</span>}
            </div>
            {event.description && <p className="text-foreground/90 whitespace-pre-line leading-relaxed">{event.description}</p>}
          </section>

          <aside className="md:col-span-2">
            <div className="glass rounded-2xl p-5 md:sticky md:top-24 space-y-4">
              {paid ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-success font-semibold"><CheckCircle2 className="w-5 h-5" /> You're in!</div>
                  <p className="text-sm text-muted-foreground">Screenshot these QR codes and show them at the door. You can find them again under My Tickets with {buyer.email}.</p>
                  {status!.tickets.map((t) => (
                    <div key={t.code} className="bg-white rounded-xl p-4 flex flex-col items-center">
                      <QRCodeSVG value={t.code} size={160} />
                      <span className="mt-2 font-mono text-xs text-black">{t.code}</span>
                    </div>
                  ))}
                  <Link to="/my-tickets" className="text-sm text-primary hover:underline">Find your tickets later</Link>
                </div>
              ) : order ? (
                <div className="space-y-4">
                  <h2 className="font-semibold text-foreground">Pay {kes(order.total)}</h2>

                  {status && status.status !== "pending" ? (
                    <div className="flex gap-2 text-sm text-destructive"><AlertCircle className="w-4 h-4 mt-0.5" />
                      Payment {status.status}. <button className="underline" onClick={() => { setOrder(null); setStatus(null); }}>Start again</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Waiting for payment…
                    </div>
                  )}

                  <div className="rounded-xl bg-secondary/60 p-4 space-y-2">
                    <div className="flex items-center gap-2 font-medium text-foreground"><Smartphone className="w-4 h-4 text-primary" /> M-Pesa prompt</div>
                    <p className="text-sm text-muted-foreground">
                      {stkSent ? `Check ${buyer.phone} and enter your M-Pesa PIN.` : "Enter your number to get a PIN prompt."}
                    </p>
                    <div className="flex gap-2">
                      <Input type="tel" value={buyer.phone} onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))} aria-label="M-Pesa number" />
                      <Button variant="secondary" onClick={() => sendStk(order, buyer.phone)}>{stkSent ? "Resend" : "Send"}</Button>
                    </div>
                  </div>

                  {order.paybill && (
                    <div className="rounded-xl bg-secondary/60 p-4 space-y-2 text-sm">
                      <div className="flex items-center gap-2 font-medium text-foreground"><Hash className="w-4 h-4 text-primary" /> Or pay via Paybill</div>
                      <dl className="grid grid-cols-2 gap-y-1">
                        <dt className="text-muted-foreground">Business no.</dt><dd className="font-mono text-foreground">{order.paybill}</dd>
                        <dt className="text-muted-foreground">Account no.</dt><dd className="font-mono text-foreground text-base font-bold">{order.pay_code}</dd>
                        <dt className="text-muted-foreground">Amount</dt><dd className="font-mono text-foreground">{Math.ceil(Number(order.total))}</dd>
                      </dl>
                    </div>
                  )}
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
              ) : new Date(event.end_date || event.start_date) < new Date() ? (
                <div className="space-y-3">
                  <p className="font-semibold text-foreground">This event has ended</p>
                  <p className="text-sm text-muted-foreground">Ticketed on Tikooh. Find what's coming up next.</p>
                  <Button asChild variant="secondary" className="w-full"><Link to="/search-events">Browse upcoming events</Link></Button>
                </div>
              ) : tiers.length === 0 ? (
                <p className="text-muted-foreground text-sm">Tickets aren't on sale yet.</p>
              ) : (
                <form onSubmit={checkout} className="space-y-4">
                  <h2 className="font-semibold text-foreground">Tickets</h2>
                  {tiers.map((t) => {
                    const left = remaining(t);
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{t.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {Number(t.price) > 0 ? kes(t.price) : "Free"}{left === 0 ? " · Sold out" : left < 20 ? ` · ${left} left` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="button" size="icon" variant="secondary" className="h-8 w-8" onClick={() => bump(t, -1)} aria-label={`Fewer ${t.name}`}><Minus className="w-3.5 h-3.5" /></Button>
                          <span className="w-6 text-center tabular-nums">{qty[t.id] || 0}</span>
                          <Button type="button" size="icon" variant="secondary" className="h-8 w-8" disabled={left === 0} onClick={() => bump(t, 1)} aria-label={`More ${t.name}`}><Plus className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    );
                  })}

                  {count > 0 && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <div className="space-y-1.5"><Label htmlFor="bn">Full name</Label>
                        <Input id="bn" required autoComplete="name" value={buyer.name} onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))} /></div>
                      <div className="space-y-1.5"><Label htmlFor="be">Email (tickets are sent here)</Label>
                        <Input id="be" type="email" required autoComplete="email" value={buyer.email} onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))} /></div>
                      {total > 0 && (
                        <div className="space-y-1.5"><Label htmlFor="bp">M-Pesa number</Label>
                          <Input id="bp" type="tel" required autoComplete="tel" placeholder="0712 345 678" value={buyer.phone} onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))} /></div>
                      )}
                    </div>
                  )}

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" className="w-full" disabled={busy || count === 0}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : total > 0 ? `Pay ${kes(total)} with M-Pesa` : count > 0 ? "Get free tickets" : "Choose tickets"}
                  </Button>
                </form>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
