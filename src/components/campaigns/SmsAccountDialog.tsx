import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, ShieldOff, Trash2, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { api, errorMessage, kes } from "@/lib/api";
import { SmsStatus } from "@/lib/sms";
import { Page } from "@/lib/paging";
import Pager from "@/components/Pager";

interface CheckRow { input: string; number: string | null; status: "ok" | "invalid" | "unsupported" | "blocked"; network: string | null; reason: string | null }
interface Flag { id: number; number: string; reason: string; failures: number; last_failed_at: string | null }

const STATUS_STYLE: Record<CheckRow["status"], string> = {
  ok: "bg-success/15 text-success",
  invalid: "bg-destructive/15 text-destructive",
  unsupported: "bg-orange-500/15 text-orange-500",
  blocked: "bg-destructive/15 text-destructive",
};

/** Super admin: is the SMS account healthy, which numbers work, which are dead. */
export default function SmsAccountDialog({ open, onClose, onStatus }: { open: boolean; onClose: () => void; onStatus?: (s: SmsStatus) => void }) {
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [numbers, setNumbers] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ counts: Record<string, number>; networks: Record<string, number>; rows: CheckRow[] } | null>(null);
  const [only, setOnly] = useState<CheckRow["status"] | "all">("all");

  const [flags, setFlags] = useState<Page<Flag> | null>(null);
  const [flagQ, setFlagQ] = useState("");
  const [flagPage, setFlagPage] = useState(1);

  const loadStatus = (fresh = false) => {
    setRefreshing(true);
    api.get<SmsStatus>(`campaigns/sms-status${fresh ? "?fresh=1" : ""}`)
      .then((s) => { setStatus(s); onStatus?.(s); })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  };

  const loadFlags = () => api.get<Page<Flag>>(`admin/sms/flags?per_page=25&page=${flagPage}&q=${encodeURIComponent(flagQ)}`).then(setFlags).catch(() => {});
  useEffect(() => { setFlagPage(1); }, [flagQ]);

  useEffect(() => { if (open) loadStatus(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(loadFlags, 250);
    return () => window.clearTimeout(t);
  }, [open, flagQ, flagPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async () => {
    setChecking(true);
    try {
      setResult(await api.post("admin/sms/check-numbers", { numbers }));
      setOnly("all");
    } catch (e) {
      toast({ title: "Check failed", description: errorMessage(e), variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const unflag = async (f: Flag) => {
    await api.delete(`admin/sms/flags/${f.id}`).catch(() => {});
    toast({ title: "Number unblocked", description: `+${f.number} will be tried again next time.` });
    loadFlags();
    loadStatus();
  };

  const copyGood = () => {
    const good = result?.rows.filter((r) => r.status === "ok").map((r) => r.number).join("\n") ?? "";
    navigator.clipboard?.writeText(good).then(() => toast({ title: "Copied", description: `${result?.counts.ok ?? 0} working numbers copied.` })).catch(() => {});
  };

  const b = status?.balance;
  const shown = result?.rows.filter((r) => only === "all" || r.status === only) ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>SMS account</DialogTitle>
          <DialogDescription>Provider health, balance, and which numbers can actually receive your texts.</DialogDescription>
        </DialogHeader>

        {/* Account */}
        <div className="grid sm:grid-cols-[1.2fr_1fr] gap-3">
          <div className={`rounded-xl border p-4 ${b && !b.ok ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="w-4 h-4" /> {status?.provider_label ?? "…"} balance</div>
              <Button type="button" size="sm" variant="ghost" onClick={() => loadStatus(true)} disabled={refreshing}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
            {!status ? <Loader2 className="w-5 h-5 animate-spin text-primary mt-2" />
              : status.provider !== "africastalking" ? <p className="text-sm text-muted-foreground mt-2">Balance checks are available for Africa's Talking. Switch provider in Settings → SMS.</p>
              : b?.ok ? (
                <>
                  <div className="text-3xl font-bold text-foreground tabular-nums mt-1">{b.currency} {b.amount?.toLocaleString("en-KE", { maximumFractionDigits: 2 })}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    ≈ {Math.floor((b.amount ?? 0) / (status.cost_per_segment || 1)).toLocaleString()} SMS parts at {kes(status.cost_per_segment)} each
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2 text-sm text-destructive mt-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {b?.error ?? "Not configured."}</div>
              )}
          </div>
          <div className="rounded-xl border border-border p-4 text-sm space-y-1.5">
            <Row k="Provider" v={<>{status?.provider_label ?? "…"} {status?.configured ? <CheckCircle2 className="inline w-3.5 h-3.5 text-success" /> : <span className="text-destructive">not configured</span>}</>} />
            <Row k="Mode" v={status?.sandbox ? <span className="rounded bg-yellow-500/15 text-yellow-600 px-1.5 text-xs">Sandbox: nothing is delivered</span> : "Live"} />
            <Row k="Sender ID" v={status?.sender_id || <span className="text-muted-foreground">Shared shortcode</span>} />
            <Row k="Cost per part" v={kes(status?.cost_per_segment)} />
            <Row k="Countries" v={status?.countries === "*" ? "Any" : status?.countries?.split(",").map((c) => `+${c.trim()}`).join(", ")} />
            <Row k="Blocked numbers" v={(status?.flagged_numbers ?? 0).toLocaleString()} />
          </div>
        </div>

        <Tabs defaultValue="check" className="mt-2">
          <TabsList>
            <TabsTrigger value="check">Check numbers</TabsTrigger>
            <TabsTrigger value="flags">Blocked by provider{flags?.total ? ` (${flags.total})` : ""}</TabsTrigger>
          </TabsList>

          <TabsContent value="check" className="space-y-3">
            <Textarea rows={5} value={numbers} onChange={(e) => setNumbers(e.target.value)}
              placeholder={"Paste numbers, one per line (or comma separated)\n0712 345 678\n+254733111222\n0110…"} />
            <div className="flex items-center gap-2">
              <Button type="button" onClick={check} disabled={checking || !numbers.trim()}>
                {checking && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Check {numbers.trim() ? numbers.trim().split(/[\r\n,;\t]+/).filter(Boolean).length.toLocaleString() : ""} numbers
              </Button>
              <span className="text-xs text-muted-foreground">Nothing is sent. Up to 5,000 at a time.</span>
            </div>

            {result && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(["all", "ok", "invalid", "unsupported", "blocked"] as const).map((s) => {
                    const c = s === "all" ? result.counts.total : result.counts[s] ?? 0;
                    if (s !== "all" && !c) return null;
                    return (
                      <button key={s} type="button" onClick={() => setOnly(s)}
                        className={`text-xs rounded-full px-2.5 py-1 border ${only === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                        {s === "all" ? "All" : s === "ok" ? "Supported" : s[0].toUpperCase() + s.slice(1)} {c.toLocaleString()}
                      </button>
                    );
                  })}
                  {Object.entries(result.networks).map(([n, c]) => <span key={n} className="text-xs rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{n} {c}</span>)}
                  {(result.counts.ok ?? 0) > 0 && <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={copyGood}>Copy supported</Button>}
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                  {shown.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                      <span className="font-mono text-xs w-36 truncate">{r.input}</span>
                      <span className="font-mono text-xs text-muted-foreground w-32 truncate">{r.number ? `+${r.number}` : ""}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[r.status]}`}>{r.status === "ok" ? r.network ?? "OK" : r.status}</span>
                      <span className="text-xs text-muted-foreground truncate flex-1">{r.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="flags" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Numbers Africa's Talking rejected for good (invalid, unsupported, blacklisted, Do-Not-Disturb). They're skipped in every campaign and ticket SMS, for every organiser, so no credit is spent on them. Unblock one if the person fixed it (e.g. opted back in).
            </p>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search number" value={flagQ} onChange={(e) => setFlagQ(e.target.value)} />
            </div>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-border divide-y divide-border">
              {!flags ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                : flags.data.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8"><ShieldOff className="w-5 h-5 mx-auto mb-1" /> No blocked numbers.</p>
                : flags.data.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-mono text-xs w-32">+{f.number}</span>
                    <span className="rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-[11px]">{f.reason}</span>
                    <span className="text-xs text-muted-foreground flex-1">{f.failures}× · {f.last_failed_at ? new Date(f.last_failed_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" }) : ""}</span>
                    <button type="button" aria-label={`Unblock ${f.number}`} className="text-muted-foreground hover:text-destructive" onClick={() => unflag(f)}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
            </div>
            <Pager page={flags} onChange={setFlagPage} noun="blocked numbers" />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="text-foreground text-right">{v}</span></div>;
}
