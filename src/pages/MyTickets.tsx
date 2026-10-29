import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Search, CalendarDays, MapPin, Loader2, Ticket } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";

interface OrderRow {
  reference: string;
  total: string;
  event: { uuid: string; title: string; start_date: string; location_name: string | null; city: string | null };
  tickets: { code: string; status: string; holder_name: string | null }[];
}

export default function MyTickets() {
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ orders: OrderRow[] }>("public/my-tickets", { email: email.trim() });
      setOrders(res.orders);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-28 pb-16 px-4">
        <div className="container mx-auto max-w-2xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My tickets</h1>
            <p className="text-muted-foreground">Enter the email you used at checkout.</p>
          </div>

          <form onSubmit={search} className="flex gap-2">
            <Input type="email" required autoComplete="email" placeholder="you@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)} aria-label="Email address" />
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1.5" />Find</>}</Button>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {orders && orders.length === 0 && (
            <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
              <Ticket className="w-8 h-8 mx-auto mb-2" /> No paid tickets for that email.
            </div>
          )}

          {orders?.map((o) => (
            <section key={o.reference} className="glass rounded-2xl p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-foreground text-lg">{o.event.title}</h2>
                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4">
                  <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />
                    {new Date(o.event.start_date).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</span>
                  {(o.event.location_name || o.event.city) && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />
                    {[o.event.location_name, o.event.city].filter(Boolean).join(", ")}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Order {o.reference}</div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {o.tickets.map((t) => (
                  <div key={t.code} className="bg-white rounded-xl p-3 flex flex-col items-center">
                    <QRCodeSVG value={t.code} size={120} />
                    <span className="mt-1.5 font-mono text-[10px] text-black break-all text-center">{t.code}</span>
                    {t.status !== "valid" && <span className="text-[10px] text-gray-600 uppercase">{t.status}</span>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
