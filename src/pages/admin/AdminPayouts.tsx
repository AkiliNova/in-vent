import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Send, CheckCheck, XCircle, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage, kes } from "@/lib/api";

interface Row {
  id: number;
  net_amount: string;
  destination_account: string;
  status: string;
  due_at: string | null;
  payment_method: string | null;
  mpesa_receipt: string | null;
  result_code: string | null;
  result_desc: string | null;
  paid_at: string | null;
  created_at: string;
  tenant: { organization_name: string; payout_name: string | null } | null;
}

interface Data {
  b2c_lock: { locked_at: string; result_code: string; result_desc: string } | null;
  queue: Row[];
  recent: Row[];
  totals: { requested: number; processing: number };
}

/** "in 3h 20m" / "2h late" relative to now. */
const dueLabel = (iso: string | null) => {
  if (!iso) return "";
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  const abs = Math.abs(mins);
  const text = abs >= 60 ? `${Math.floor(abs / 60)}h ${abs % 60}m` : `${abs}m`;
  return mins >= 0 ? `in ${text}` : `${text} late`;
};

type Action = { kind: "paid" | "reject"; row: Row } | null;

export default function AdminPayouts() {
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [input, setInput] = useState("");

  const load = () => api.get<Data>("admin/payouts").then(setData).catch((e) =>
    toast({ title: "Couldn't load payouts", description: errorMessage(e), variant: "destructive" }));

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, []);

  if (user?.role !== "super_admin") return <Navigate to="/dashboard" replace />;

  const run = async (id: number, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      toast({ title: ok });
      setAction(null);
      setInput("");
      load();
    } catch (e) {
      toast({ title: "Failed", description: errorMessage(e), variant: "destructive" });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const approve = (r: Row) => {
    if (!window.confirm(`Send ${kes(r.net_amount)} by B2C to ${r.destination_account}? Make sure the B2C account is funded.`)) return;
    run(r.id, () => api.post(`admin/payouts/${r.id}/approve`), "Sent to M-Pesa — waiting for confirmation");
  };

  const confirmAction = () => {
    if (!action || !input.trim()) return;
    const { kind, row } = action;
    run(row.id,
      () => api.post(`admin/payouts/${row.id}/${kind === "paid" ? "mark-paid" : "reject"}`, kind === "paid" ? { receipt: input } : { reason: input }),
      kind === "paid" ? "Marked as paid" : "Declined — merchant refunded");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-6xl space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Payout queue</h1>
              <p className="text-muted-foreground">Move money from the paybill to B2C, then send. Oldest due first.</p>
            </div>
            <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
          </div>

          {!data ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="glass rounded-2xl p-5">
                  <div className="text-sm text-muted-foreground">To fund into B2C</div>
                  <div className="text-3xl font-bold text-foreground tabular-nums">{kes(data.totals.requested)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{data.queue.filter((r) => r.status === "requested").length} request(s) waiting</div>
                </div>
                <div className="glass rounded-2xl p-5">
                  <div className="text-sm text-muted-foreground">Sent, awaiting Safaricom</div>
                  <div className="text-3xl font-bold text-foreground tabular-nums">{kes(data.totals.processing)}</div>
                </div>
              </div>

              {data.b2c_lock && (
                <div role="alert" className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 flex gap-3 text-sm">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                  <span className="text-foreground">
                    B2C is paused ({data.b2c_lock.result_code}: {data.b2c_lock.result_desc}). "Send by B2C" will fail —
                    pay from the M-Pesa app and use "Mark paid", or fix the initiator and run <code>php artisan tikooh:b2c-unlock --confirm</code>.
                  </span>
                </div>
              )}

              <section className="glass rounded-2xl overflow-x-auto">
                {data.queue.length === 0 ? (
                  <p className="p-10 text-center text-muted-foreground">Nothing waiting. 🎉</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground border-b border-border">
                      <tr><th className="px-4 py-3 font-medium">Merchant</th><th className="px-4 py-3 font-medium">To</th>
                        <th className="px-4 py-3 font-medium text-right">Amount</th><th className="px-4 py-3 font-medium">Due</th>
                        <th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.queue.map((r) => {
                        const late = r.due_at && new Date(r.due_at) < new Date();
                        return (
                          <tr key={r.id} className={late ? "bg-destructive/5" : ""}>
                            <td className="px-4 py-3 text-foreground">#{r.id} {r.tenant?.organization_name}</td>
                            <td className="px-4 py-3 text-muted-foreground">{r.destination_account}{r.tenant?.payout_name ? <div>{r.tenant.payout_name}</div> : null}</td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">{kes(r.net_amount)}</td>
                            <td className={`px-4 py-3 ${late ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{dueLabel(r.due_at)}</span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline">{r.status}</Badge>
                              {r.result_desc && <div className="text-xs text-muted-foreground mt-1 max-w-[220px]">{r.result_code ? `[${r.result_code}] ` : ""}{r.result_desc}</div>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5 justify-end">
                                {r.status === "requested" && (
                                  <Button size="sm" disabled={busyId === r.id} onClick={() => approve(r)}>
                                    {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}Send by B2C
                                  </Button>
                                )}
                                <Button size="sm" variant="secondary" disabled={busyId === r.id} onClick={() => { setInput(""); setAction({ kind: "paid", row: r }); }}>
                                  <CheckCheck className="w-3.5 h-3.5 mr-1" />Mark paid
                                </Button>
                                {r.status === "requested" && (
                                  <Button size="sm" variant="ghost" className="text-destructive" disabled={busyId === r.id} onClick={() => { setInput(""); setAction({ kind: "reject", row: r }); }}>
                                    <XCircle className="w-3.5 h-3.5 mr-1" />Decline
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>

              {data.recent.length > 0 && (
                <section className="glass rounded-2xl">
                  <h2 className="px-5 pt-4 font-semibold text-foreground">Recent</h2>
                  <ul className="divide-y divide-border text-sm">
                    {data.recent.map((r) => (
                      <li key={r.id} className="px-5 py-2.5 flex flex-wrap justify-between gap-2">
                        <span className="text-foreground">#{r.id} {r.tenant?.organization_name} · {kes(r.net_amount)}</span>
                        <span className="text-muted-foreground">{r.status}{r.mpesa_receipt ? ` · ${r.mpesa_receipt}` : ""}{r.payment_method ? ` · ${r.payment_method}` : ""}{r.paid_at ? ` · ${new Date(r.paid_at).toLocaleString("en-KE")}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); confirmAction(); }}>
            <DialogHeader>
              <DialogTitle>{action?.kind === "paid" ? "Record a manual payment" : "Decline request"}</DialogTitle>
              <DialogDescription>
                {action?.kind === "paid"
                  ? `You sent ${kes(action?.row.net_amount)} to ${action?.row.destination_account} outside B2C. Enter the M-Pesa receipt.`
                  : `The ${kes(action?.row.net_amount)} goes back to the merchant's balance. They'll see your reason.`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 my-5">
              <Label htmlFor="ai">{action?.kind === "paid" ? "M-Pesa receipt" : "Reason"}</Label>
              <Input id="ai" required autoFocus value={input} onChange={(e) => setInput(e.target.value)}
                placeholder={action?.kind === "paid" ? "e.g. SKA1B2C3D4" : "e.g. Payout name doesn't match the account"} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAction(null)}>Back</Button>
              <Button type="submit" variant={action?.kind === "reject" ? "destructive" : "default"} disabled={busyId !== null}>
                {action?.kind === "paid" ? "Mark paid" : "Decline & refund"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
