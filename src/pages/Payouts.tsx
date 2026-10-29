import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, ArrowDownToLine, TrendingUp, Receipt, Clock, Loader2, AlertTriangle, Smartphone } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { api, errorMessage, kes } from "@/lib/api";

interface WalletData {
  summary: { balance: number; gross_sales: number; platform_fees: number; withdrawn: number; in_flight: number };
  fee_percent: number;
  payout_phone: string | null;
  payout_name: string | null;
  min_withdrawal: number;
  withdrawals_paused: boolean;
  entries: { id: number; type: string; amount: string; description: string; created_at: string; event?: { title: string } }[];
  payouts: { id: number; net_amount: string; destination_account: string; status: string; mpesa_receipt: string | null; result_desc: string | null; created_at: string }[];
  by_event: { event_id: number; gross: string; fees: string; net: string; event: { title: string; start_date: string } }[];
}

const STATUS_STYLE: Record<string, string> = {
  paid: "border-success/50 text-success",
  processing: "border-primary/50 text-primary",
  rejected: "border-destructive/50 text-destructive",
};
const STATUS_LABEL: Record<string, string> = { paid: "Sent", processing: "Processing", rejected: "Failed — refunded" };

export default function Payouts() {
  const [data, setData] = useState<WalletData | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"activity" | "withdrawals" | "events">("activity");

  const load = () => api.get<WalletData>("wallet").then(setData).catch((e) =>
    toast({ title: "Couldn't load wallet", description: errorMessage(e), variant: "destructive" }));

  useEffect(() => { load(); }, []);

  // Withdrawals settle asynchronously; refresh while any are in flight.
  useEffect(() => {
    if (!data?.payouts.some((p) => p.status === "processing")) return;
    const t = window.setInterval(load, 8000);
    return () => window.clearInterval(t);
  }, [data]);

  const withdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<{ message: string }>("wallet/withdraw", { amount: Number(amount), password });
      toast({ title: "Withdrawal sent", description: res.message });
      setOpen(false);
      setAmount("");
      setPassword("");
      load();
    } catch (err) {
      toast({ title: "Withdrawal failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const s = data.summary;
  const canWithdraw = !data.withdrawals_paused && !!data.payout_phone && s.balance >= data.min_withdrawal;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-5xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Wallet</h1>
            <p className="text-muted-foreground">Ticket sales land here after the {data.fee_percent}% platform fee.</p>
          </div>

          {/* Balance */}
          <div className="glass rounded-2xl p-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="text-sm text-muted-foreground flex items-center gap-2"><Wallet className="w-4 h-4" /> Available balance</div>
              <div className="text-4xl font-bold text-foreground mt-1 tabular-nums">{kes(s.balance)}</div>
              {data.payout_phone ? (
                <div className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" /> Withdrawals go to {data.payout_phone}{data.payout_name ? ` (${data.payout_name})` : ""}
                  <Link to="/settings" className="text-primary hover:underline ml-1">Change</Link>
                </div>
              ) : (
                <Link to="/settings" className="text-sm text-primary hover:underline mt-2 inline-block">Add your M-Pesa payout number →</Link>
              )}
            </div>
            <Button size="lg" disabled={!canWithdraw} onClick={() => { setAmount(String(Math.floor(s.balance))); setOpen(true); }}>
              <ArrowDownToLine className="w-4 h-4 mr-2" /> Withdraw to M-Pesa
            </Button>
          </div>

          {data.withdrawals_paused && (
            <div role="status" className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 flex gap-3 text-sm">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
              <span className="text-foreground">Withdrawals are paused while we resolve an issue with our M-Pesa provider. Your balance is safe and keeps growing with every sale.</span>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Ticket sales", value: s.gross_sales, icon: TrendingUp },
              { label: `Platform fees (${data.fee_percent}%)`, value: s.platform_fees, icon: Receipt },
              { label: "Withdrawn", value: s.withdrawn, icon: ArrowDownToLine },
              { label: "Processing", value: s.in_flight, icon: Clock },
            ].map((c) => (
              <div key={c.label} className="glass rounded-2xl p-5">
                <c.icon className="w-5 h-5 text-primary mb-3" />
                <div className="text-xl font-bold text-foreground tabular-nums">{kes(c.value)}</div>
                <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
              </div>
            ))}
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div role="tablist" className="flex border-b border-border">
              {([["activity", "Activity"], ["withdrawals", "Withdrawals"], ["events", "By event"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`px-5 py-3 text-sm ${tab === k ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
              ))}
            </div>

            <div className="divide-y divide-border">
              {tab === "activity" && (data.entries.length === 0
                ? <p className="p-8 text-center text-muted-foreground text-sm">No sales yet. Publish an event and share the link.</p>
                : data.entries.map((e) => (
                  <div key={e.id} className="flex justify-between items-center px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="text-foreground truncate">{e.description}</div>
                      <div className="text-xs text-muted-foreground">{e.event?.title ? `${e.event.title} · ` : ""}{new Date(e.created_at).toLocaleString("en-KE")}</div>
                    </div>
                    <span className={`tabular-nums font-medium ${Number(e.amount) >= 0 ? "text-success" : "text-foreground"}`}>
                      {Number(e.amount) >= 0 ? "+" : "−"}{kes(Math.abs(Number(e.amount)))}
                    </span>
                  </div>
                )))}

              {tab === "withdrawals" && (data.payouts.length === 0
                ? <p className="p-8 text-center text-muted-foreground text-sm">No withdrawals yet.</p>
                : data.payouts.map((p) => (
                  <div key={p.id} className="flex justify-between items-center px-5 py-3 text-sm gap-3">
                    <div className="min-w-0">
                      <div className="text-foreground">To {p.destination_account}{p.mpesa_receipt ? ` · ${p.mpesa_receipt}` : ""}</div>
                      <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("en-KE")}{p.status === "rejected" && p.result_desc ? ` · ${p.result_desc}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={STATUS_STYLE[p.status]}>{STATUS_LABEL[p.status] || p.status}</Badge>
                      <span className="tabular-nums font-medium text-foreground">{kes(p.net_amount)}</span>
                    </div>
                  </div>
                )))}

              {tab === "events" && (data.by_event.length === 0
                ? <p className="p-8 text-center text-muted-foreground text-sm">No sales yet.</p>
                : data.by_event.map((r) => (
                  <div key={r.event_id} className="grid grid-cols-4 gap-2 px-5 py-3 text-sm">
                    <span className="col-span-4 sm:col-span-1 text-foreground truncate">{r.event?.title}</span>
                    <span className="text-muted-foreground">Sales <span className="text-foreground tabular-nums">{kes(r.gross)}</span></span>
                    <span className="text-muted-foreground">Fees <span className="text-foreground tabular-nums">{kes(r.fees)}</span></span>
                    <span className="text-muted-foreground">Net <span className="text-success font-medium tabular-nums">{kes(r.net)}</span></span>
                  </div>
                )))}
            </div>
          </div>
        </div>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={withdraw}>
            <DialogHeader>
              <DialogTitle>Withdraw to M-Pesa</DialogTitle>
              <DialogDescription>Sent to {data.payout_phone}. You'll get an M-Pesa message within a minute or two.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 my-5">
              <div className="space-y-1.5">
                <Label htmlFor="amt">Amount (KES)</Label>
                <Input id="amt" type="number" required min={data.min_withdrawal} max={Math.floor(s.balance)} step={1}
                  value={amount} onChange={(e) => setAmount(e.target.value)} />
                <p className="text-xs text-muted-foreground">Available: {kes(s.balance)}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wpw">Confirm with your password</Label>
                <PasswordInput id="wpw" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Sending…" : `Withdraw ${amount ? kes(amount) : ""}`}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
