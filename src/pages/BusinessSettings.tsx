import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";

interface Merchant {
  profile: {
    organization_name: string; business_type: string | null; contact_person: string | null;
    email: string; phone: string | null; kra_pin: string | null;
    payout_phone: string | null; payout_name: string | null; fee_percent: number;
  };
}

const TYPES = ["individual", "company", "ngo", "church", "school", "other"];

export default function BusinessSettings() {
  const [m, setM] = useState<Merchant | null>(null);
  const [profile, setProfile] = useState({ organization_name: "", business_type: "", contact_person: "", phone: "", kra_pin: "" });
  const [payout, setPayout] = useState({ payout_phone: "", payout_name: "", password: "" });
  const [busy, setBusy] = useState<"profile" | "payout" | null>(null);

  useEffect(() => {
    api.get<Merchant>("merchant").then((res) => {
      setM(res);
      const p = res.profile;
      setProfile({
        organization_name: p.organization_name, business_type: p.business_type || "",
        contact_person: p.contact_person || "", phone: p.phone || "", kra_pin: p.kra_pin || "",
      });
      setPayout((x) => ({ ...x, payout_name: p.payout_name || "" }));
    }).catch((e) => toast({ title: "Couldn't load", description: errorMessage(e), variant: "destructive" }));
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("profile");
    try {
      setM(await api.put<Merchant>("merchant", { ...profile, business_type: profile.business_type || undefined }));
      toast({ title: "Business details saved" });
    } catch (err) {
      toast({ title: "Couldn't save", description: errorMessage(err), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const savePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("payout");
    try {
      setM(await api.put<Merchant>("merchant/payout", payout));
      setPayout((p) => ({ ...p, payout_phone: "", password: "" }));
      toast({ title: "Payout number updated" });
    } catch (err) {
      toast({ title: "Couldn't update payout number", description: errorMessage(err), variant: "destructive" });
    } finally { setBusy(null); }
  };

  if (!m) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const setP = (k: keyof typeof profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setProfile((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-2xl space-y-6">
          <h1 className="text-3xl font-bold text-foreground">Business</h1>

          <form onSubmit={saveProfile} className="glass rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-foreground">Business details</h2>
            <div className="space-y-1.5"><Label htmlFor="on">Organisation name</Label>
              <Input id="on" required value={profile.organization_name} onChange={setP("organization_name")} /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="bt">Type</Label>
                <select id="bt" value={profile.business_type} onChange={setP("business_type")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize">
                  <option value="">Choose…</option>
                  {TYPES.map((t) => <option key={t} value={t}>{t === "ngo" ? "NGO" : t}</option>)}
                </select></div>
              <div className="space-y-1.5"><Label htmlFor="cp">Contact person</Label>
                <Input id="cp" value={profile.contact_person} onChange={setP("contact_person")} /></div>
              <div className="space-y-1.5"><Label htmlFor="ph">Phone</Label>
                <Input id="ph" type="tel" value={profile.phone} onChange={setP("phone")} /></div>
              <div className="space-y-1.5"><Label htmlFor="kra">KRA PIN (optional)</Label>
                <Input id="kra" value={profile.kra_pin} onChange={setP("kra_pin")} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Login email: {m.profile.email} · Platform fee: {m.profile.fee_percent}% per ticket sold</p>
            <Button type="submit" disabled={busy === "profile"}>{busy === "profile" ? "Saving…" : "Save"}</Button>
          </form>

          <form onSubmit={savePayout} className="glass rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-foreground">M-Pesa payout number</h2>
              <p className="text-sm text-muted-foreground">
                {m.profile.payout_phone
                  ? <>Withdrawals currently go to <strong className="text-foreground">{m.profile.payout_phone}</strong>{m.profile.payout_name ? ` (${m.profile.payout_name})` : ""}.</>
                  : "No payout number yet — add one to withdraw your earnings."}
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="pp">New M-Pesa number</Label>
                <Input id="pp" type="tel" required placeholder="0712 345 678" value={payout.payout_phone}
                  onChange={(e) => setPayout((p) => ({ ...p, payout_phone: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label htmlFor="pn">Registered name</Label>
                <Input id="pn" required value={payout.payout_name}
                  onChange={(e) => setPayout((p) => ({ ...p, payout_name: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="ppw">Your password</Label>
              <PasswordInput id="ppw" required autoComplete="current-password" value={payout.password}
                onChange={(e) => setPayout((p) => ({ ...p, password: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Required because this controls where your money goes.</p></div>
            <Button type="submit" disabled={busy === "payout"}>{busy === "payout" ? "Saving…" : "Update payout number"}</Button>
          </form>
        </div>
      </main>
    </div>
  );
}
