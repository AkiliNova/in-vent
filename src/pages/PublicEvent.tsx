import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  CalendarDays, MapPin, Minus, Plus, Loader2, Smartphone, CheckCircle2, Hash, AlertCircle,
  Share2, Link2, CalendarPlus, Tag, Timer, MessageCircle,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { api, errorMessage, kes, EventItem, TicketTier } from "@/lib/api";
import { downloadIcs, eventUrl, googleCalendarUrl, shareText, startsIn, whatsappUrl, xUrl } from "@/lib/share";

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

/** Early-bird style windows: not yet on sale / sales ending soon. */
const salesNote = (t: TicketTier): { open: boolean; note: string | null } => {
  const now = Date.now();
  if (t.sales_start_at && new Date(t.sales_start_at).getTime() > now) {
    return { open: false, note: `On sale ${new Date(t.sales_start_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` };
  }
  if (t.sales_end_at) {
    const end = new Date(t.sales_end_at).getTime();
    if (end <= now) return { open: false, note: "Sales ended" };
    const left = startsIn(t.sales_end_at);
    if (end - now < 7 * 86400_000) return { open: true, note: `Ends ${left}` };
  }
  return { open: true, note: null };
};

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
  const [params] = useSearchParams();
  // ?promo=CODE links from organisers pre-fill and apply the code.
  const [promoInput, setPromoInput] = useState(params.get("promo") || "");
  const [promo, setPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
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

  // The discount depends on the basket, so re-check whenever it changes.
  useEffect(() => {
    if (promo && total > 0) applyPromo(promo.code);
    if (total === 0) setPromo(null);
  }, [total]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPromo = async (code = promoInput) => {
    if (!code.trim() || total <= 0) return;
    setPromoError(null);
    try {
      const r = await api.post<{ discount: number }>(`public/events/${id}/promo-check`, {
        code: code.trim(), amount: total, email: buyer.email || undefined,
      });
      setPromo({ code: code.trim().toUpperCase(), discount: Number(r.discount) });
    } catch (err) {
      setPromo(null);
      setPromoError(errorMessage(err));
    }
  };

  const payable = Math.max(0, total - (promo?.discount || 0));

  const share = async () => {
    if (!event) return;
    if (navigator.share) {
      try { await navigator.share({ title: event.title, text: shareText(event), url: eventUrl(event) }); return; } catch { /* dismissed */ }
    }
    navigator.clipboard.writeText(eventUrl(event));
    toast({ title: "Link copied" });
  };

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
        promo_code: promo?.code,
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
      setError(o.paybill ? `${errorMessage(err)} You can still pay with the paybill below.` : `${errorMessage(err)} Check the number and press Send again.`);
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
              {startsIn(event.start_date) && (
                <span className="flex items-center gap-2 text-sm text-primary"><Timer className="w-4 h-4" /> Starts {startsIn(event.start_date)}</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild className="bg-[#25D366] hover:bg-[#1ebe5a] text-black">
                <a href={whatsappUrl(event)} target="_blank" rel="noreferrer"><MessageCircle className="w-4 h-4 mr-1.5" /> Share on WhatsApp</a>
              </Button>
              <Button size="sm" variant="secondary" onClick={share}><Share2 className="w-4 h-4 mr-1.5" /> Share</Button>
              <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(eventUrl(event)); toast({ title: "Link copied" }); }}>
                <Link2 className="w-4 h-4 mr-1.5" /> Copy link
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={xUrl(event)} target="_blank" rel="noreferrer" aria-label="Share on X">𝕏</a>
              </Button>
              {startsIn(event.start_date) && (
                <>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer"><CalendarPlus className="w-4 h-4 mr-1.5" /> Google Calendar</a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadIcs(event)}><CalendarPlus className="w-4 h-4 mr-1.5" /> Add to calendar (.ics)</Button>
                </>
              )}
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
                    const sale = salesNote(t);
                    const buyable = sale.open && left > 0;
                    return (
                      <div key={t.id} className={`flex items-center justify-between gap-3 ${buyable ? "" : "opacity-60"}`}>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{t.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {Number(t.price) > 0 ? kes(t.price) : "Free"}{left === 0 ? " · Sold out" : left < 20 ? ` · ${left} left` : ""}
                          </div>
                          {sale.note && (
                            <div className={`text-xs mt-0.5 flex items-center gap-1 ${sale.open ? "text-yellow-500" : "text-muted-foreground"}`}>
                              <Timer className="w-3 h-3" /> {sale.note}
                            </div>
                          )}
                          {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="button" size="icon" variant="secondary" className="h-8 w-8" onClick={() => bump(t, -1)} aria-label={`Fewer ${t.name}`}><Minus className="w-3.5 h-3.5" /></Button>
                          <span className="w-6 text-center tabular-nums">{qty[t.id] || 0}</span>
                          <Button type="button" size="icon" variant="secondary" className="h-8 w-8" disabled={!buyable} onClick={() => bump(t, 1)} aria-label={`More ${t.name}`}><Plus className="w-3.5 h-3.5" /></Button>
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
                      {total > 0 && (
                        <div className="space-y-1.5">
                          <Label htmlFor="promo">Promo code</Label>
                          <div className="flex gap-2">
                            <Input id="promo" className="uppercase font-mono" value={promoInput}
                              onChange={(e) => { setPromoInput(e.target.value); setPromoError(null); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } }} />
                            <Button type="button" variant="secondary" disabled={!promoInput.trim()} onClick={() => applyPromo()}>
                              <Tag className="w-3.5 h-3.5 mr-1" /> Apply
                            </Button>
                          </div>
                          {promo && <p className="text-xs text-success">{promo.code}: −{kes(promo.discount)}</p>}
                          {promoError && <p className="text-xs text-destructive">{promoError}</p>}
                        </div>
                      )}
                    </div>
                  )}

                  {promo && total > 0 && (
                    <div className="text-sm flex justify-between text-muted-foreground">
                      <span>Subtotal {kes(total)} · Discount −{kes(promo.discount)}</span>
                      <span className="text-foreground font-semibold">{kes(payable)}</span>
                    </div>
                  )}

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" className="w-full" disabled={busy || count === 0}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : total > 0 ? (payable > 0 ? `Pay ${kes(payable)} with M-Pesa` : "Get tickets") : count > 0 ? "Get free tickets" : "Choose tickets"}
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
