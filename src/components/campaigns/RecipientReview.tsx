import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Search, UserCheck, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { AudienceFilter, AudiencePerson, PersonState, STATE_LABEL, STATE_STYLE } from "@/lib/sms";

type Tab = PersonState | "skipped" | "all";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "ok", label: "Will receive" },
  { id: "skipped", label: "Bad numbers" },
  { id: "duplicate", label: "Duplicates" },
  { id: "suppressed", label: "Opted out" },
  { id: "missing", label: "No contact" },
];

const PER_PAGE = 50;

/**
 * Browse everyone the filters match and fine-tune by hand.
 *   "Everyone except…" — untick people to leave them out (audience_filter.exclude)
 *   "Only people I pick" — tick people to send to just them (audience_filter.include)
 * The list always shows the filtered audience, so hand-picking means
 * searching/filtering first and ticking from the results.
 */
export default function RecipientReview({ channel, body, filter, initial, onChange, onClose }: {
  channel: "email" | "sms";
  body: string;
  filter: AudienceFilter;
  initial: Tab;
  onChange: (f: AudienceFilter) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initial === "invalid" || initial === "unsupported" || initial === "blocked" ? "skipped" : initial);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<{ data: AudiencePerson[]; total: number } | null>(null);
  const [mode, setMode] = useState<"exclude" | "include">((filter.include?.length ?? 0) > 0 ? "include" : "exclude");
  const [include, setInclude] = useState<Set<string>>(() => new Set(filter.include ?? []));
  const [exclude, setExclude] = useState<Set<string>>(() => new Set(filter.exclude ?? []));

  // Browse with the filters but without the hand-picks, so you can see who to pick.
  const browse = useMemo(() => ({ ...filter, include: [], exclude: [] }), [filter]);

  useEffect(() => { setPage(1); }, [tab, search]);

  useEffect(() => {
    setRows(null);
    const t = window.setTimeout(() => {
      api.post<{ data: AudiencePerson[]; total: number }>("campaigns/audience/people", {
        channel, body: body || " ", audience_filter: browse,
        state: tab === "all" ? null : tab, search: search || null, page, per_page: PER_PAGE,
      }).then(setRows).catch(() => setRows({ data: [], total: 0 }));
    }, search ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [tab, search, page, browse, channel, body]);

  const ticked = (p: AudiencePerson) => p.state === "ok" && (mode === "include" ? include.has(p.key) : !exclude.has(p.key));

  const toggle = (p: AudiencePerson) => {
    if (p.state !== "ok") return;
    const flip = (s: Set<string>) => {
      const n = new Set(s);
      if (n.has(p.key)) n.delete(p.key);
      else n.add(p.key);
      return n;
    };
    if (mode === "include") setInclude(flip);
    else setExclude(flip);
  };

  const sendable = rows?.data.filter((p) => p.state === "ok") ?? [];
  const allTicked = sendable.length > 0 && sendable.every(ticked);
  const tickPage = () => {
    const keys = sendable.map((p) => p.key);
    if (mode === "include") setInclude((s) => { const n = new Set(s); keys.forEach((k) => (allTicked ? n.delete(k) : n.add(k))); return n; });
    else setExclude((s) => { const n = new Set(s); keys.forEach((k) => (allTicked ? n.add(k) : n.delete(k))); return n; });
  };

  const apply = () => {
    onChange(mode === "include"
      ? { ...filter, include: [...include], exclude: [] }
      : { ...filter, include: [], exclude: [...exclude] });
    onClose();
  };

  const pages = rows ? Math.max(1, Math.ceil(rows.total / PER_PAGE)) : 1;
  const name = (p: AudiencePerson) => [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Review recipients</DialogTitle>
          <DialogDescription>
            Everyone your filters match, and why anyone won't get it. {channel === "sms" ? "Numbers are checked for network and support before anything is sent." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {([
            { id: "exclude", icon: Users, title: "Everyone matching, except…", hint: "Untick people to leave them out" },
            { id: "include", icon: UserCheck, title: "Only people I pick", hint: "Tick the exact people to send to" },
          ] as const).map((m) => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)}
              className={`text-left rounded-xl border p-2.5 transition ${mode === m.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground"><m.icon className="w-4 h-4" /> {m.title}</div>
              <div className="text-xs text-muted-foreground">{m.hint}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`text-xs rounded-full px-2.5 py-1 border transition ${tab === t.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name or number" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="flex-1 min-h-[240px] overflow-y-auto rounded-xl border border-border">
          {!rows ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : rows.data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nobody here.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background/95 backdrop-blur text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-10 p-2">
                    <button type="button" aria-label="Tick all on this page" onClick={tickPage} disabled={!sendable.length}
                      className={`flex h-4 w-4 items-center justify-center rounded border ${allTicked ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
                      {allTicked && <Check className="w-3 h-3" />}
                    </button>
                  </th>
                  <th className="text-left font-medium p-2">Name</th>
                  <th className="text-left font-medium p-2">{channel === "sms" ? "Number" : "Email"}</th>
                  <th className="text-left font-medium p-2 hidden md:table-cell">Event</th>
                  <th className="text-left font-medium p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.data.map((p) => (
                  <tr key={`${p.key}-${p.state}`} className={p.state === "ok" ? "cursor-pointer hover:bg-muted/40" : "opacity-80"} onClick={() => toggle(p)}>
                    <td className="p-2">
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${p.state !== "ok" ? "border-border bg-muted" : ticked(p) ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
                        {ticked(p) && <Check className="w-3 h-3" />}
                      </span>
                    </td>
                    <td className="p-2">
                      <div className="text-foreground truncate max-w-[180px]">{name(p)}</div>
                      {p.company && <div className="text-xs text-muted-foreground truncate max-w-[180px]">{p.company}</div>}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      <div className="text-foreground">{p.raw ?? "—"}</div>
                      {channel === "sms" && p.destination && p.destination !== p.raw?.replace(/\D/g, "") && <div className="text-muted-foreground">→ +{p.destination}</div>}
                    </td>
                    <td className="p-2 hidden md:table-cell text-xs text-muted-foreground truncate max-w-[160px]">{p.event ?? (p.contact_id ? "Imported contact" : "")}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATE_STYLE[p.state]}`}>{STATE_LABEL[p.state]}</span>
                        {p.network && p.state === "ok" && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{p.network}</span>}
                        {channel === "sms" && p.state === "ok" && p.segments > 1 && <span className="text-[11px] text-muted-foreground">{p.segments} parts</span>}
                      </div>
                      {p.reason && p.state !== "ok" && <div className="text-[11px] text-muted-foreground mt-0.5">{p.reason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{rows ? `${rows.total.toLocaleString()} ${rows.total === 1 ? "person" : "people"}` : ""}</span>
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="tabular-nums">{page} / {pages}</span>
            <Button type="button" size="icon" variant="ghost" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="text-sm text-muted-foreground self-center">
            {mode === "include" ? `${include.size.toLocaleString()} picked` : exclude.size ? `${exclude.size.toLocaleString()} left out` : "Everyone matching is included"}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={apply} disabled={mode === "include" && include.size === 0}>
              {mode === "include" ? `Send to ${include.size.toLocaleString()} picked` : "Apply"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
