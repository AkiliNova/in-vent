import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { CalendarDays, Users, Wallet, ScanLine, CheckCircle2, Circle, Plus, Loader2, ArrowRight, UserPlus } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { api, kes } from "@/lib/api";

interface Overview {
  events: { total: number; published: number; upcoming: number };
  attendees: { total: number; checked_in: number };
  revenue: { gross: number; orders: number };
  upcoming_events: { id: number; uuid: string; title: string; start_date: string; location_name: string | null; attendees_count: number }[];
}
interface Merchant { checklist: { key: string; label: string; done: boolean }[] }

const CHECKLIST_LINKS: Record<string, string> = {
  business: "/settings", payout: "/settings", event: "/events?new=1", publish: "/events",
};

export default function Dashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    api.get<Overview>("dashboard").then(setOverview).catch(() => {});
    if (user?.role === "organizer") {
      api.get<Merchant>("merchant").then(setMerchant).catch(() => {});
      api.get<{ summary: { balance: number } }>("wallet").then((w) => setBalance(w.summary.balance)).catch(() => {});
    }
  }, [user]);

  const pending = merchant?.checklist.filter((c) => !c.done) ?? [];

  // Platform admins have their own overview.
  if (user?.role === "super_admin") return <Navigate to="/admin" replace />;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Hi {user?.name?.split(" ")[0]}</h1>
              <p className="text-muted-foreground">{user?.tenant?.organization_name}</p>
            </div>
            <Button asChild><Link to="/events?new=1"><Plus className="w-4 h-4 mr-2" /> New event</Link></Button>
          </div>

          {merchant && pending.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h2 className="font-semibold text-foreground mb-3">Finish setting up</h2>
              <ul className="space-y-2">
                {merchant.checklist.map((c) => (
                  <li key={c.key}>
                    {c.done ? (
                      <span className="flex items-center gap-2 text-sm text-muted-foreground line-through">
                        <CheckCircle2 className="w-4 h-4 text-success" /> {c.label}
                      </span>
                    ) : (
                      <Link to={CHECKLIST_LINKS[c.key] || "/dashboard"} className="flex items-center gap-2 text-sm text-foreground hover:text-primary">
                        <Circle className="w-4 h-4 text-muted-foreground" /> {c.label} <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!overview ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Wallet balance", value: balance === null ? "—" : kes(balance), icon: Wallet, to: "/payouts" },
                  { label: "Ticket sales (12 mo)", value: kes(overview.revenue.gross), icon: Wallet, to: "/payouts" },
                  { label: "Attendees", value: overview.attendees.total.toLocaleString(), icon: Users, to: "/guests" },
                  { label: "Checked in", value: overview.attendees.checked_in.toLocaleString(), icon: ScanLine, to: "/scanner" },
                ].map((c) => (
                  <Link key={c.label} to={c.to} className="glass rounded-2xl p-5 hover:border-primary/40 border border-transparent transition-colors">
                    <c.icon className="w-5 h-5 text-primary mb-3" />
                    <div className="text-xl font-bold text-foreground tabular-nums">{c.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
                  </Link>
                ))}
              </div>

              <div className="glass rounded-2xl p-5">
                <h2 className="font-semibold text-foreground mb-3">Upcoming events</h2>
                {overview.upcoming_events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing published yet. <Link to="/events?new=1" className="text-primary">Create an event</Link></p>
                ) : (
                  <ul className="divide-y divide-border">
                    {overview.upcoming_events.map((e) => (
                      <li key={e.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-foreground truncate">{e.title}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />{new Date(e.start_date).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}
                            {e.location_name ? ` · ${e.location_name}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground">{e.attendees_count} attending</span>
                          <Button size="sm" variant="secondary" asChild><Link to={`/register?event=${e.uuid}`}><UserPlus className="w-3.5 h-3.5 mr-1" />Register guest</Link></Button>
                          <Button size="sm" variant="secondary" asChild><Link to={`/scanner?event=${e.uuid}`}><ScanLine className="w-3.5 h-3.5 mr-1" />Scan</Link></Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
