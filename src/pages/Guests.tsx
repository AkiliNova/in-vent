import { useEffect, useState } from "react";
import { Search, Loader2, CheckCircle2, Users } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Input } from "@/components/ui/input";
import { api, kes, EventItem } from "@/lib/api";

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  category: string | null;
  status: string;
  amount_paid: string;
  checked_in_at: string | null;
}

export default function Guests() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventId, setEventId] = useState("");
  const [rows, setRows] = useState<Attendee[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<{ data: EventItem[] }>("events?per_page=100").then((r) => {
      setEvents(r.data);
      if (r.data[0]) setEventId(r.data[0].uuid);
    });
  }, []);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    const t = window.setTimeout(() => {
      api.get<{ data: Attendee[]; total: number }>(`events/${eventId}/attendees?per_page=200&search=${encodeURIComponent(search)}`)
        .then((r) => { setRows(r.data); setTotal(r.total); })
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [eventId, search]);

  const checkedIn = rows.filter((r) => r.checked_in_at).length;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-5xl space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Guests</h1>
              <p className="text-muted-foreground">{total} registered · {checkedIn} checked in{search ? " (filtered)" : ""}</p>
            </div>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[220px]">
              {events.map((e) => <option key={e.id} value={e.uuid}>{e.title}</option>)}
            </select>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="glass rounded-2xl overflow-x-auto">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground"><Users className="w-8 h-8 mx-auto mb-2" />No guests yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b border-border">
                  <tr><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Contact</th>
                    <th className="px-4 py-3 font-medium">Ticket</th><th className="px-4 py-3 font-medium text-right">Paid</th>
                    <th className="px-4 py-3 font-medium">Checked in</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 text-foreground">{a.first_name} {a.last_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.email}{a.phone ? <div>{a.phone}</div> : null}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.category}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{kes(a.amount_paid)}</td>
                      <td className="px-4 py-3">{a.checked_in_at
                        ? <span className="flex items-center gap-1 text-success"><CheckCircle2 className="w-4 h-4" />{new Date(a.checked_in_at).toLocaleTimeString("en-KE", { timeStyle: "short" })}</span>
                        : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
