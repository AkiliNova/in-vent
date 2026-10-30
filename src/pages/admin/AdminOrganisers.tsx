import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Search, Loader2, Ban, CheckCircle2, Percent, XCircle } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage, kes } from "@/lib/api";

interface Organiser {
  id: number;
  organization_name: string;
  business_type: string | null;
  email: string;
  phone: string | null;
  owner_email: string | null;
  payout_phone: string | null;
  payout_name: string | null;
  platform_fee_percent: string | null;
  suspended: boolean;
  onboarded_at: string | null;
  created_at: string;
  events_count: number;
  gmv: string;
  balance: string;
  last_sale_at: string | null;
}

const FILTERS = [
  { id: "", label: "All" },
  { id: "selling", label: "Has upcoming events" },
  { id: "no_payout", label: "No payout number" },
  { id: "suspended", label: "Suspended" },
];

const maskPhone = (p: string) => p.length > 6 ? `${p.slice(0, 4)}***${p.slice(-3)}` : p;

export default function AdminOrganisers() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Organiser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [feeFor, setFeeFor] = useState<Organiser | null>(null);
  const [fee, setFee] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const load = () => api.get<{ data: Organiser[]; total: number }>(
    `admin/organisers?per_page=100&search=${encodeURIComponent(search)}&filter=${filter}`
  ).then((r) => { setRows(r.data); setTotal(r.total); }).catch((e) =>
    toast({ title: "Couldn't load organisers", description: errorMessage(e), variant: "destructive" }));

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [search, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user?.role !== "super_admin") return <Navigate to="/dashboard" replace />;

  const update = async (o: Organiser, body: Record<string, unknown>, done: string) => {
    setBusy(o.id);
    try {
      await api.put(`admin/organisers/${o.id}`, body);
      toast({ title: done });
      setFeeFor(null);
      load();
    } catch (e) {
      toast({ title: "Couldn't update", description: errorMessage(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const toggleSuspend = (o: Organiser) => {
    const verb = o.suspended ? "Reinstate" : "Suspend";
    if (!window.confirm(`${verb} ${o.organization_name}?${o.suspended ? "" : " They won't be able to sign in until reinstated. Their published events stay up."}`)) return;
    update(o, { suspended: !o.suspended }, o.suspended ? "Reinstated" : "Suspended");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-7xl space-y-5">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Organisers</h1>
            <p className="text-muted-foreground">{total} organiser account(s), biggest sellers first.</p>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" aria-hidden />
              <Input className="pl-9" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search organisers" />
            </div>
            <div role="group" aria-label="Filter" className="inline-flex flex-wrap rounded-lg border border-border p-0.5">
              {FILTERS.map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
                  className={`px-3 py-1.5 text-sm rounded-md ${filter === f.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl overflow-x-auto">
            {!rows ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : rows.length === 0 ? (
              <p className="p-12 text-center text-muted-foreground">No organisers match.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">Organiser</th>
                    <th className="px-4 py-3 font-medium text-right">Sales (all time)</th>
                    <th className="px-4 py-3 font-medium text-right">Wallet</th>
                    <th className="px-4 py-3 font-medium">Payout to</th>
                    <th className="px-4 py-3 font-medium text-right">Fee</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((o) => (
                    <tr key={o.id} className={o.suspended ? "opacity-60" : ""}>
                      <td className="px-4 py-3">
                        <div className="text-foreground font-medium">{o.organization_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.owner_email || o.email} · {o.events_count} event(s) · {o.business_type || "type not set"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Joined {new Date(o.created_at).toLocaleDateString("en-KE")}
                          {o.last_sale_at ? ` · last sale ${new Date(o.last_sale_at).toLocaleDateString("en-KE")}` : " · no sales yet"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{kes(o.gmv)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{kes(o.balance)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {o.payout_phone
                          ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-success" aria-hidden />{maskPhone(o.payout_phone)}{o.payout_name ? ` · ${o.payout_name}` : ""}</span>
                          : <span className="inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-yellow-500" aria-hidden />Not set</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {o.platform_fee_percent !== null ? <span className="text-foreground">{Number(o.platform_fee_percent)}%</span> : <span className="text-muted-foreground">default</span>}
                      </td>
                      <td className="px-4 py-3">
                        {o.suspended
                          ? <Badge variant="outline" className="border-destructive/50 text-destructive">Suspended</Badge>
                          : o.onboarded_at
                            ? <Badge variant="outline" className="border-success/50 text-success">Active</Badge>
                            : <Badge variant="outline" className="border-yellow-500/50 text-yellow-500">Setting up</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" disabled={busy === o.id}
                            onClick={() => { setFee(o.platform_fee_percent !== null ? String(Number(o.platform_fee_percent)) : ""); setFeeFor(o); }}>
                            <Percent className="w-3.5 h-3.5 mr-1" /> Fee
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy === o.id} className={o.suspended ? "" : "text-destructive"} onClick={() => toggleSuspend(o)}>
                            {o.suspended ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Reinstate</> : <><Ban className="w-3.5 h-3.5 mr-1" /> Suspend</>}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      <Dialog open={!!feeFor} onOpenChange={(o) => !o && setFeeFor(null)}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); if (feeFor) update(feeFor, { platform_fee_percent: fee === "" ? null : Number(fee) }, "Fee updated"); }}>
            <DialogHeader>
              <DialogTitle>Platform fee for {feeFor?.organization_name}</DialogTitle>
              <DialogDescription>Applies to their sales from now on; past sales keep the fee they were charged. Leave empty to use the platform default.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 my-5">
              <Label htmlFor="fee">Fee (%)</Label>
              <Input id="fee" type="number" min={0} max={50} step={0.5} placeholder="Default" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFeeFor(null)}>Cancel</Button>
              <Button type="submit" disabled={busy !== null}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
