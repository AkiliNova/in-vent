import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Save, Send, RotateCcw, Building2, MessageSquare, Mail, Smartphone, Bell, FileText,
  AlertTriangle, Lock, Eye,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { api, errorMessage, API_URL, tokenStore } from "@/lib/api";

interface Field {
  key: string;
  label: string;
  type: "text" | "number" | "secret" | "select" | "bool" | "email" | "textarea";
  help?: string;
  options?: Record<string, string>;
  provider?: string;
  min?: number;
  max?: number;
  value: string | number | boolean | null;
  is_set?: boolean;
  hint?: string | null;
  source: "saved" | "server" | "default" | "unset";
}

interface Group {
  id: string;
  title: string;
  description: string;
  danger?: boolean;
  fields: Field[];
}

const ICONS: Record<string, typeof Mail> = {
  platform: Building2, sms: MessageSquare, email: Mail, mpesa: Smartphone, telegram: Bell, templates: FileText,
};

const SOURCE: Record<Field["source"], { label: string; cls: string }> = {
  saved: { label: "Set here", cls: "bg-primary/15 text-primary" },
  server: { label: "From server", cls: "bg-muted text-muted-foreground" },
  default: { label: "Default", cls: "bg-muted text-muted-foreground" },
  unset: { label: "Not set", cls: "bg-yellow-500/15 text-yellow-500" },
};

/** Fetches the rendered email (needs the auth header, so not a plain iframe src). */
async function fetchPreview(template: string) {
  const res = await fetch(`${API_URL}/api/admin/templates/${template}/preview`, {
    headers: { Authorization: `Bearer ${tokenStore.get()}`, Accept: "text/html" },
  });
  return res.ok ? res.text() : `<p style="font-family:sans-serif;padding:24px">Preview failed (${res.status}).</p>`;
}

export default function AdminSettings() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [tab, setTab] = useState("platform");
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [smsTo, setSmsTo] = useState("");
  const [preview, setPreview] = useState<{ template: "ticket" | "campaign"; html: string | null }>({ template: "ticket", html: null });

  useEffect(() => {
    api.get<{ groups: Group[] }>("admin/settings").then((r) => setGroups(r.groups))
      .catch((e) => toast({ title: "Couldn't load settings", description: errorMessage(e), variant: "destructive" }));
  }, []);

  const loadPreview = (template = preview.template) => {
    setPreview({ template, html: null });
    fetchPreview(template).then((html) => setPreview({ template, html }));
  };
  useEffect(() => { if (tab === "templates") loadPreview(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const group = groups?.find((g) => g.id === tab);
  const changed = useMemo(() => Object.keys(draft).filter((k) => group?.fields.some((f) => f.key === k)), [draft, group]);

  const current = (f: Field) => (f.key in draft ? draft[f.key] : f.type === "secret" ? "" : f.value ?? "");
  const set = (key: string, v: string | boolean) => setDraft((d) => ({ ...d, [key]: v }));

  const save = async (reset: string[] = []) => {
    if (!group) return;
    setSaving(true);
    try {
      const values = Object.fromEntries(changed.map((k) => [k, draft[k]]));
      const r = await api.put<{ groups: Group[]; message: string }>("admin/settings", { values, reset });
      setGroups(r.groups);
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !group.fields.some((f) => f.key === k))));
      toast({ title: reset.length ? "Reset to the server value" : "Saved", description: "Live now. Background jobs pick it up within a minute." });
      if (tab === "templates") loadPreview();
    } catch (e) {
      toast({ title: "Not saved", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const test = async (channel: "email" | "sms" | "telegram") => {
    if (changed.length) {
      toast({ title: "Save first", description: "Tests use the saved settings.", variant: "destructive" });
      return;
    }
    setTesting(channel);
    try {
      const r = await api.post<{ message: string }>(`admin/settings/test/${channel}`, channel === "sms" ? { to: smsTo } : undefined);
      toast({ title: "Test sent", description: r.message });
    } catch (e) {
      toast({ title: "Test failed", description: errorMessage(e), variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  // SMS: only show the chosen provider's credentials.
  const provider = String(group?.id === "sms" ? current(group.fields.find((f) => f.key === "services.sms.provider")!) : "");
  const visible = (f: Field) => !f.provider || f.provider === provider;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-6xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground">Platform rules, providers and message wording. Changes apply immediately. Nothing here needs a server login.</p>
          </div>

          {!groups ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid gap-6 md:grid-cols-[220px_1fr]">
              <nav className="flex md:flex-col gap-1 overflow-x-auto">
                {groups.map((g) => {
                  const Icon = ICONS[g.id] ?? FileText;
                  const missing = g.fields.some((f) => f.source === "unset" && visible(f) && g.id !== "sms");
                  return (
                    <button key={g.id} onClick={() => { setTab(g.id); setDraft({}); }}
                      className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm text-left transition ${tab === g.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"}`}>
                      <Icon className="w-4 h-4" /> {g.title}
                      {missing && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-yellow-500" />}
                    </button>
                  );
                })}
              </nav>

              {group && (
                <div className={`grid gap-6 ${group.id === "templates" ? "xl:grid-cols-[1fr_420px]" : ""}`}>
                  <div className="glass rounded-2xl p-6 space-y-6">
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">{group.title}</h2>
                      <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
                      {group.danger && (
                        <div className="mt-3 flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> Live money. Leave a field empty to keep what is there now.
                        </div>
                      )}
                    </div>

                    <div className="space-y-5">
                      {group.fields.filter(visible).map((f) => (
                        <div key={f.key} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={f.key} className="flex items-center gap-1.5">
                              {f.type === "secret" && <Lock className="w-3 h-3 text-muted-foreground" />}{f.label}
                            </Label>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE[f.source].cls}`}>{SOURCE[f.source].label}</span>
                            {f.source === "saved" && (
                              <button type="button" title="Go back to the server (.env) value" className="ml-auto text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                                onClick={() => save([f.key])} disabled={saving}>
                                <RotateCcw className="w-3 h-3" /> Reset
                              </button>
                            )}
                          </div>

                          {f.type === "bool" ? (
                            <Switch id={f.key} checked={Boolean(current(f))} onCheckedChange={(v) => set(f.key, v)} />
                          ) : f.type === "select" ? (
                            <select id={f.key} value={String(current(f))} onChange={(e) => set(f.key, e.target.value)}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                              {Object.entries(f.options ?? {}).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          ) : f.type === "textarea" ? (
                            <Textarea id={f.key} rows={3} value={String(current(f))} onChange={(e) => set(f.key, e.target.value)} />
                          ) : (
                            <Input id={f.key} autoComplete="off"
                              type={f.type === "number" ? "number" : f.type === "secret" ? "password" : f.type === "email" ? "email" : "text"}
                              min={f.min} max={f.max} step="any"
                              placeholder={f.type === "secret" ? (f.is_set ? `${f.hint}  (saved, type to replace)` : "Not set") : undefined}
                              value={String(current(f))} onChange={(e) => set(f.key, e.target.value)} />
                          )}
                          {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
                      <Button onClick={() => save()} disabled={saving || changed.length === 0}>
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Save {changed.length ? `(${changed.length})` : ""}
                      </Button>
                      {changed.length > 0 && <Button variant="ghost" onClick={() => setDraft({})}>Discard</Button>}

                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        {group.id === "email" && (
                          <Button variant="outline" disabled={testing !== null} onClick={() => test("email")}>
                            {testing === "email" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Send me a test email
                          </Button>
                        )}
                        {group.id === "sms" && (
                          <>
                            <Input className="w-40" placeholder="07XX XXX XXX" value={smsTo} onChange={(e) => setSmsTo(e.target.value)} aria-label="Test SMS number" />
                            <Button variant="outline" disabled={testing !== null || !smsTo} onClick={() => test("sms")}>
                              {testing === "sms" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Test SMS
                            </Button>
                          </>
                        )}
                        {group.id === "telegram" && (
                          <Button variant="outline" disabled={testing !== null} onClick={() => test("telegram")}>
                            {testing === "telegram" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Send a test alert
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {group.id === "templates" && (
                    <div className="glass rounded-2xl p-4 space-y-3 xl:sticky xl:top-24 self-start">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">Live preview</span>
                        <div className="ml-auto flex rounded-lg border border-border p-0.5 text-xs">
                          {(["ticket", "campaign"] as const).map((t) => (
                            <button key={t} onClick={() => loadPreview(t)}
                              className={`px-2.5 py-1 rounded-md capitalize ${preview.template === t ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>{t}</button>
                          ))}
                        </div>
                      </div>
                      <div className="h-[640px] overflow-hidden rounded-xl border border-border bg-[#05070F]">
                        {preview.html === null
                          ? <div className="flex h-full items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                          : <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-full w-full" />}
                      </div>
                      <p className="text-xs text-muted-foreground">Shows saved wording with sample data. Save to refresh.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
