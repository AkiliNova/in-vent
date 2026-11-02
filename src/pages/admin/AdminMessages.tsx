import { useEffect, useState } from "react";
import { Loader2, Mail, MessageSquare, Search, CheckCircle2, XCircle, FileText } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";

interface Row {
  id: number;
  channel: "email" | "sms";
  type: string;
  to: string;
  subject: string | null;
  status: "sent" | "failed" | "logged";
  error: string | null;
  provider: string | null;
  related_type: string | null;
  related_id: number | null;
  organiser: string | null;
  created_at: string;
}

interface Page {
  data: Row[];
  total: number;
  current_page: number;
  last_page: number;
  stats: { today: number; failed_7d: number; email_7d: number; sms_7d: number };
}

const TYPES: Record<string, string> = {
  ticket_confirmation: "Ticket", campaign: "Campaign", payout: "Payout", test: "Test", other: "Other",
};

const when = (d: string) => new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function AdminMessages() {
  const [page, setPage] = useState<Page | null>(null);
  const [n, setN] = useState(1);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [open, setOpen] = useState<(Row & { body: string | null }) | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const qs = new URLSearchParams({ page: String(n), q, channel, status, type }).toString();
      api.get<Page>(`admin/messages?${qs}`).then(setPage)
        .catch((e) => toast({ title: "Couldn't load messages", description: errorMessage(e), variant: "destructive" }));
    }, 250);
    return () => window.clearTimeout(t);
  }, [n, q, channel, status, type]);

  const show = async (r: Row) => {
    try {
      setOpen(await api.get(`admin/messages/${r.id}`));
    } catch (e) {
      toast({ title: "Couldn't open message", description: errorMessage(e), variant: "destructive" });
    }
  };

  const select = "h-10 rounded-md border border-input bg-background px-3 text-sm";
  const filter = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => { set(e.target.value); setN(1); };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-6xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Messages</h1>
            <p className="text-muted-foreground">Every email and SMS the platform has sent: tickets, campaigns and payouts. Open one to see exactly what went out.</p>
          </div>

          {page && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Sent today", value: page.stats.today },
                { label: "Emails · 7 days", value: page.stats.email_7d },
                { label: "SMS · 7 days", value: page.stats.sms_7d },
                { label: "Failed · 7 days", value: page.stats.failed_7d, bad: page.stats.failed_7d > 0 },
              ].map((s) => (
                <button key={s.label} onClick={() => { if (s.bad) { setStatus("failed"); setN(1); } }}
                  className={`glass rounded-2xl p-4 text-left ${s.bad ? "border-destructive/40 hover:border-destructive" : "cursor-default"}`}>
                  <div className={`text-2xl font-bold tabular-nums ${s.bad ? "text-destructive" : "text-foreground"}`}>{s.value.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search recipient or subject" value={q} onChange={(e) => { setQ(e.target.value); setN(1); }} />
            </div>
            <select className={select} value={channel} onChange={filter(setChannel)} aria-label="Channel">
              <option value="">Email &amp; SMS</option><option value="email">Email</option><option value="sms">SMS</option>
            </select>
            <select className={select} value={type} onChange={filter(setType)} aria-label="Type">
              <option value="">All types</option>
              {Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className={select} value={status} onChange={filter(setStatus)} aria-label="Status">
              <option value="">Any status</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="logged">Logged only</option>
            </select>
          </div>

          {!page ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : page.data.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center text-muted-foreground">No messages match.</div>
          ) : (
            <div className="glass rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">When</th><th className="px-4 py-3 font-medium">To</th>
                    <th className="px-4 py-3 font-medium">Message</th><th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {page.data.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => show(r)}>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{when(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-foreground">
                          {r.channel === "email" ? <Mail className="w-3.5 h-3.5 text-primary" /> : <MessageSquare className="w-3.5 h-3.5 text-primary" />}
                          <span className="truncate max-w-[220px]">{r.to}</span>
                        </div>
                        {r.organiser && <div className="text-xs text-muted-foreground">{r.organiser}</div>}
                      </td>
                      <td className="px-4 py-3 text-foreground/90 max-w-[340px]">
                        <div className="truncate">{r.subject ?? (r.channel === "sms" ? "SMS" : "")}</div>
                        {r.error && <div className="text-xs text-destructive truncate">{r.error}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{TYPES[r.type] ?? r.type}{r.related_type === "payout" && r.related_id ? ` · WD-${String(r.related_id).padStart(5, "0")}` : ""}</td>
                      <td className="px-4 py-3">
                        {r.status === "sent" ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="w-3.5 h-3.5" /> Sent</span>
                          : r.status === "failed" ? <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="w-3.5 h-3.5" /> Failed</span>
                          : <span className="inline-flex items-center gap-1 text-muted-foreground"><FileText className="w-3.5 h-3.5" /> Logged</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {page && page.last_page > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{page.total.toLocaleString()} messages</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={n <= 1} onClick={() => setN(n - 1)}>Previous</Button>
                <span className="px-2 py-1.5">Page {page.current_page} of {page.last_page}</span>
                <Button size="sm" variant="outline" disabled={n >= page.last_page} onClick={() => setN(n + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6">{open?.subject ?? (open?.channel === "sms" ? "SMS" : "Message")}</DialogTitle>
            <DialogDescription>
              To {open?.to} · {open && when(open.created_at)} · {open?.status}{open?.provider ? ` via ${open.provider}` : ""}
            </DialogDescription>
          </DialogHeader>
          {open?.error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{open.error}</div>}
          {open?.channel === "email" && open.body ? (
            <iframe title="Email" srcDoc={open.body} sandbox="" className="h-[65vh] w-full rounded-xl border border-border bg-[#05070F]" />
          ) : open?.body ? (
            <div className="rounded-2xl bg-zinc-900 p-4">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-zinc-700 px-3.5 py-2.5 text-sm text-white whitespace-pre-wrap break-words">{open.body}</div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No content was recorded (the send failed before the message was built).</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
