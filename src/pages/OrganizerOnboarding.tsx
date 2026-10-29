import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Building2, User, Users, Church, GraduationCap, HeartHandshake, Sparkles,
  Check, Smartphone, Wallet, ArrowRight, ArrowLeft, CalendarPlus,
} from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const BUSINESS_TYPES = [
  { id: "individual", label: "Individual", hint: "Solo organiser or creator", icon: User },
  { id: "company", label: "Company", hint: "Registered business", icon: Building2 },
  { id: "ngo", label: "NGO", hint: "Non-profit or foundation", icon: HeartHandshake },
  { id: "church", label: "Church", hint: "Faith community", icon: Church },
  { id: "school", label: "School", hint: "School or university", icon: GraduationCap },
  { id: "other", label: "Other", hint: "Club, group, association", icon: Users },
];

const STEPS = ["Your business", "Your account", "Get paid", "Done"];

const OrganizerOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const { register, user } = useAuth();

  // Someone already signed in lands on the payout step, not the sign-up form.
  const [step, setStep] = useState(user ? 2 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    organization_name: "",
    business_type: "",
    name: "",
    email: "",
    phone: "",
    password: "",
    password_confirmation: "",
    payout_phone: "",
    payout_name: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password_confirmation) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({
        organization_name: form.organization_name,
        business_type: form.business_type,
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        password_confirmation: form.password_confirmation,
      });
      setForm((f) => ({ ...f, payout_phone: f.phone, payout_name: f.name }));
      setStep(2);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const savePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put("merchant/payout", {
        payout_phone: form.payout_phone,
        payout_name: form.payout_name,
        password: form.password,
      });
      setStep(3);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background px-4 py-10 md:py-16">
      <div className="max-w-xl mx-auto">
        <Link to="/" className="inline-block mb-8">
          <img src="/assets/logo.png" alt="Tikooh" className="h-10 object-contain" />
        </Link>

        {/* Progress */}
        <ol className="flex items-center gap-2 mb-8" aria-label="Sign-up progress">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-secondary"}`} />
              <span className={`hidden sm:block text-xs mt-2 ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
            </li>
          ))}
        </ol>

        {error && (
          <div role="alert" className="mb-5 p-3 text-sm text-destructive bg-destructive/15 rounded-lg">{error}</div>
        )}

        {/* 1 — Business */}
        {step === 0 && (
          <form
            className="space-y-6"
            onSubmit={(e) => { e.preventDefault(); setError(null); setStep(1); }}
          >
            <div>
              <h1 className="text-3xl font-bold text-foreground">Sell tickets with M-Pesa</h1>
              <p className="text-muted-foreground mt-2">
                Set up in two minutes. Buyers pay by M-Pesa, the money lands in your Tikooh wallet,
                and you withdraw to your phone whenever you like.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org">Organisation or brand name</Label>
              <Input id="org" required value={form.organization_name} onChange={set("organization_name")}
                placeholder="e.g. Nairobi Jazz Collective" />
              <p className="text-xs text-muted-foreground">Shown to buyers on your event pages.</p>
            </div>

            <fieldset>
              <legend className="text-sm font-medium mb-2">What kind of organiser are you?</legend>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {BUSINESS_TYPES.map((t) => {
                  const selected = form.business_type === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setForm((f) => ({ ...f, business_type: t.id }))}
                      className={`text-left rounded-xl border p-3 transition-colors ${
                        selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <t.icon className={`w-5 h-5 mb-2 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="text-sm font-medium text-foreground">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.hint}</div>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex justify-between items-center">
              <Link to="/admin/login" className="text-sm text-muted-foreground hover:text-foreground">
                Already have an account?
              </Link>
              <Button type="submit" disabled={!form.organization_name || !form.business_type}>
                Continue <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </form>
        )}

        {/* 2 — Account */}
        {step === 1 && (
          <form className="space-y-5" onSubmit={createAccount}>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Create your login</h1>
              <p className="text-muted-foreground mt-2">You'll use this to manage events and withdraw earnings.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Your full name</Label>
                <Input id="name" required autoComplete="name" value={form.name} onChange={set("name")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" autoComplete="tel" placeholder="0712 345 678"
                  value={form.phone} onChange={set("phone")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pw">Password</Label>
                <PasswordInput id="pw" required minLength={8} autoComplete="new-password"
                  value={form.password} onChange={set("password")} />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw2">Confirm password</Label>
                <PasswordInput id="pw2" required minLength={8} autoComplete="new-password"
                  value={form.password_confirmation} onChange={set("password_confirmation")} />
              </div>
            </div>

            <div className="rounded-xl bg-secondary/60 p-4 text-sm text-muted-foreground">
              <strong className="text-foreground">Pricing:</strong> no monthly fee. Tikooh keeps 10% of each ticket
              sold; free events are free.
            </div>

            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(0)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Creating account…" : "Create account"}
              </Button>
            </div>
          </form>
        )}

        {/* 3 — Payout */}
        {step === 2 && (
          <form className="space-y-5" onSubmit={savePayout}>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Where should we send your money?</h1>
              <p className="text-muted-foreground mt-2">
                Withdrawals go straight to this M-Pesa number. To change it later you'll need your password.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
              {[
                { icon: Smartphone, t: "Buyer pays by M-Pesa" },
                { icon: Wallet, t: "Lands in your wallet" },
                { icon: ArrowRight, t: "Withdraw any time" },
              ].map((s) => (
                <div key={s.t} className="rounded-xl bg-secondary/60 p-3">
                  <s.icon className="w-5 h-5 mx-auto mb-1.5 text-primary" />
                  {s.t}
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pp">M-Pesa number</Label>
              <Input id="pp" type="tel" required placeholder="0712 345 678"
                value={form.payout_phone} onChange={set("payout_phone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pn">Name registered on that number</Label>
              <Input id="pn" required value={form.payout_name} onChange={set("payout_name")} />
              <p className="text-xs text-muted-foreground">Helps us confirm the money reaches the right person.</p>
            </div>
            {!form.password && (
              <div className="space-y-1.5">
                <Label htmlFor="cpw">Your Tikooh password</Label>
                <PasswordInput id="cpw" required autoComplete="current-password"
                  value={form.password} onChange={set("password")} />
              </div>
            )}

            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(3)}>Skip for now</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save payout number"}</Button>
            </div>
          </form>
        )}

        {/* 4 — Done */}
        {step === 3 && (
          <div className="text-center space-y-6 py-6">
            <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">You're ready to sell</h1>
              <p className="text-muted-foreground mt-2">
                Create your event, add ticket types, publish — and share the link.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" onClick={() => navigate("/events?new=1")}>
                <CalendarPlus className="w-4 h-4 mr-2" /> Create your first event
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/dashboard")}>
                <Sparkles className="w-4 h-4 mr-2" /> Go to dashboard
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrganizerOnboarding;
