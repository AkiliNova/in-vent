import { useEffect, useState } from "react";
import { Plus, Copy, Loader2, Tag } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { api, errorMessage, kes, EventItem } from "@/lib/api";

interface Promo {
  id: number;
  code: string;
  event_id: number | null;
  discount_type: "percent" | "fixed";
  discount_value: string;
  max_uses: number;
  used_count: number;
  max_uses_per_email: number;
  min_order_amount: string;
  starts_at: string | null;
  expires_at: string | null;
  active: boolean;
  redeemed_count?: number;
}

const blank = {
  code: "", discount_type: "percent" as "percent" | "fixed", discount_value: "10", max_uses: "0",
  max_uses_per_email: "1", min_order_amount: "0", starts_at: "", expires_at: "", all_events: false,
};

export default function PromoCodes() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventId, setEventId] = useState("");
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ data: EventItem[] }>("events?per_page=100").then((r) => {
      setEvents(r.data);
      if (r.data[0]) setEventId(r.data[0].uuid);
      else setPromos([]);
    });
  }, []);

  const load = () => eventId && api.get<Promo[]>(`events/${eventId}/promo-codes`).then(setPromos).catch((e) =>
    toast({ title: "Couldn't load codes", description: errorMessage(e), variant: "destructive" }));

  useEffect(() => { setPromos(null); load(); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`events/${eventId}/promo-codes`, {
        ...form,
        discount_value: Number(form.discount_value),
        max_uses: Number(form.max_uses) || 0,
        max_uses_per_email: Number(form.max_uses_per_email) || 0,
        min_order_amount: Number(form.min_order_amount) || 0,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        active: true,
      });
      toast({ title: `Code ${form.code.toUpperCase()} created` });
      setOpen(false);
      setForm(blank);
      load();
    } catch (err) {
      toast({ title: "Couldn't create code", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: Promo) => {
    try {
      await api.put(`events/${eventId}/promo-codes/${p.id}`, { active: !p.active });
      load();
    } catch (err) {
      toast({ title: "Couldn't update", description: errorMessage(err), variant: "destructive" });
    }
  };

  const event = events.find((e) => e.uuid === eventId);
  const shareLink = (code: string) => `${window.location.origin}/e/${eventId}?promo=${encodeURIComponent(code)}`;
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-5xl space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Promo codes</h1>
              <p className="text-muted-foreground">Discounts for early fans, groups, partners and influencers.</p>
            </div>
            <div className="flex gap-2">
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[200px]">
                {events.map((e) => <option key={e.id} value={e.uuid}>{e.title}</option>)}
              </select>
              <Button disabled={!eventId} onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" /> New code</Button>
            </div>
          </div>

          {!promos ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : promos.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <Tag className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">{eventId ? "No codes for this event yet." : "Create an event first."}</p>
            </div>
          ) : (
            <div className="glass rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b border-border">
                  <tr><th className="px-4 py-3 font-medium">Code</th><th className="px-4 py-3 font-medium">Discount</th>
                    <th className="px-4 py-3 font-medium">Used</th><th className="px-4 py-3 font-medium">Valid</th>
                    <th className="px-4 py-3 font-medium">Share</th><th className="px-4 py-3 font-medium">Active</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {promos.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-foreground">{p.code}</span>
                        {p.event_id === null && <div className="text-xs text-muted-foreground">All your events</div>}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {p.discount_type === "percent" ? `${Number(p.discount_value)}% off` : `${kes(p.discount_value)} off`}
                        {Number(p.min_order_amount) > 0 && <div className="text-xs text-muted-foreground">Min order {kes(p.min_order_amount)}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{p.used_count}{p.max_uses > 0 ? ` / ${p.max_uses}` : ""}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.expires_at ? `Until ${new Date(p.expires_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}` : "No expiry"}
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(shareLink(p.code)); toast({ title: "Link copied", description: "Buyers who open it get the code applied." }); }}>
                          <Copy className="w-3.5 h-3.5 mr-1" /> Link
                        </Button>
                      </td>
                      <td className="px-4 py-3"><Switch checked={p.active} onCheckedChange={() => toggle(p)} aria-label={`Active: ${p.code}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>New promo code</DialogTitle>
              <DialogDescription>For {event?.title}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 my-5">
              <div className="space-y-1.5"><Label htmlFor="pc">Code</Label>
                <Input id="pc" required pattern="[A-Za-z0-9_-]+" maxLength={64} placeholder="EARLYBIRD" className="uppercase font-mono"
                  value={form.code} onChange={set("code")} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="pt">Type</Label>
                  <select id="pt" value={form.discount_type} onChange={set("discount_type")}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="percent">% off</option><option value="fixed">KES off</option>
                  </select></div>
                <div className="space-y-1.5"><Label htmlFor="pv">{form.discount_type === "percent" ? "Percent" : "Amount (KES)"}</Label>
                  <Input id="pv" type="number" required min={1} max={form.discount_type === "percent" ? 100 : undefined}
                    value={form.discount_value} onChange={set("discount_value")} /></div>
                <div className="space-y-1.5"><Label htmlFor="pm">Total uses (0 = no limit)</Label>
                  <Input id="pm" type="number" min={0} value={form.max_uses} onChange={set("max_uses")} /></div>
                <div className="space-y-1.5"><Label htmlFor="pe">Uses per buyer</Label>
                  <Input id="pe" type="number" min={0} value={form.max_uses_per_email} onChange={set("max_uses_per_email")} /></div>
                <div className="space-y-1.5"><Label htmlFor="ps">Starts (optional)</Label>
                  <Input id="ps" type="datetime-local" value={form.starts_at} onChange={set("starts_at")} /></div>
                <div className="space-y-1.5"><Label htmlFor="px">Expires (optional)</Label>
                  <Input id="px" type="datetime-local" value={form.expires_at} onChange={set("expires_at")} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="pmin">Minimum order (KES)</Label>
                <Input id="pmin" type="number" min={0} value={form.min_order_amount} onChange={set("min_order_amount")} /></div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.all_events} onCheckedChange={(v) => setForm((f) => ({ ...f, all_events: v }))} />
                Valid for all my events
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create code"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
