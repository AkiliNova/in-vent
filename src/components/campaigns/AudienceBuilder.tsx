import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays, Check, CheckCircle2, ChevronDown, Globe2, Loader2, Search, SlidersHorizontal, Users, X,
  AlertTriangle, Building2, Wallet, ListChecks, UserMinus, UserCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, errorMessage, kes } from "@/lib/api";
import { fetchAll } from "@/lib/paging";
import {
  activeFilters, AudienceFilter, AudienceSummary, PersonState, SmsStatus, Source, STATE_LABEL, STATE_STYLE,
} from "@/lib/sms";
import RecipientReview from "./RecipientReview";

interface Option { id: number; label: string; hint?: string }
interface Facets { tiers: { id: number; name: string; price: number; event: string | null }[]; categories: string[]; statuses: string[]; countries: string[] }

/* ── Searchable multi-select ─────────────────────────────────────────── */

function MultiPicker({ label, placeholder, icon: Icon, selected, onChange, load }: {
  label: string;
  placeholder: string;
  icon: typeof Users;
  selected: Option[];
  onChange: (next: Option[]) => void;
  load: (q: string) => Promise<Option[]>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<Option[] | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!open) return;
    setOptions(null);
    const t = window.setTimeout(() => loadRef.current(q).then(setOptions).catch(() => setOptions([])), 250);
    return () => window.clearTimeout(t);
  }, [open, q]);

  const picked = new Set(selected.map((s) => s.id));
  const toggle = (o: Option) => onChange(picked.has(o.id) ? selected.filter((s) => s.id !== o.id) : [...selected, o]);

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 h-10 text-sm text-left">
            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className={`flex-1 truncate ${selected.length ? "text-foreground" : "text-muted-foreground"}`}>
              {selected.length ? `${selected.length} ${label}${selected.length === 1 ? "" : "s"} selected` : placeholder}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,420px)] p-0" align="start">
          <div className="relative border-b border-border">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label}s…`}
              className="w-full bg-transparent pl-9 pr-3 h-10 text-sm outline-none" />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {!options ? (
              <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
            ) : options.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nothing found.</p>
            ) : options.map((o) => (
              <button key={o.id} type="button" onClick={() => toggle(o)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-muted/60">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${picked.has(o.id) ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
                  {picked.has(o.id) && <Check className="w-3 h-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>}
                </span>
              </button>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="flex justify-between border-t border-border px-3 py-2">
              <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => onChange([])}>Clear all</button>
              <button type="button" className="text-xs font-medium text-primary" onClick={() => setOpen(false)}>Done</button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span key={s.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 text-primary text-xs pl-2.5 pr-1 py-0.5">
              <span className="truncate">{s.label}</span>
              <button type="button" aria-label={`Remove ${s.label}`} onClick={() => toggle(s)} className="rounded-full p-0.5 hover:bg-primary/20"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Small controls ──────────────────────────────────────────────────── */

function Segmented<T extends string>({ value, options, onChange }: { value: T | undefined; options: { id: T | undefined; label: string }[]; onChange: (v: T | undefined) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
      {options.map((o) => (
        <button key={o.label} type="button" onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 text-xs rounded-md transition ${value === o.id ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chips<T extends string | number>({ values, selected, label, onChange }: { values: { id: T; label: string }[]; selected: T[] | undefined; label?: (v: T) => string; onChange: (next: T[]) => void }) {
  const set = new Set(selected ?? []);
  if (!values.length) return <p className="text-xs text-muted-foreground">None in this audience.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button key={String(v.id)} type="button"
          onClick={() => onChange(set.has(v.id) ? [...set].filter((x) => x !== v.id) : [...set, v.id])}
          className={`text-xs rounded-full border px-2.5 py-1 transition ${set.has(v.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
          {label ? label(v.id) : v.label}
        </button>
      ))}
    </div>
  );
}

/* ── The builder ─────────────────────────────────────────────────────── */

export default function AudienceBuilder({ channel, body, filter, onChange, isAdmin, contactTotal, sms, onSummary }: {
  channel: "email" | "sms";
  body: string;
  filter: AudienceFilter;
  onChange: (f: AudienceFilter) => void;
  isAdmin: boolean;
  contactTotal: number;
  sms: SmsStatus | null;
  onSummary: (s: AudienceSummary | null) => void;
}) {
  const [summary, setSummary] = useState<AudienceSummary | null>(null);
  const [counting, setCounting] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);
  const [refineOpen, setRefineOpen] = useState(activeFilters(filter) > 0);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [review, setReview] = useState<PersonState | "skipped" | "all" | null>(null);
  // Titles for chips; ids are what's saved.
  const [eventLabels, setEventLabels] = useState<Option[]>([]);
  const [orgLabels, setOrgLabels] = useState<Option[]>([]);

  const set = (patch: Partial<AudienceFilter>) => onChange({ ...filter, ...patch });
  const handPicked = (filter.include?.length ?? 0) > 0;

  // Resolve titles for event/organiser ids loaded from a saved campaign.
  useEffect(() => {
    const ids = filter.event_ids ?? [];
    if (ids.length && !eventLabels.length) {
      fetchAll<{ id: number; title: string }>("events")
        .then((all) => setEventLabels(all.filter((e) => ids.includes(e.id)).map((e) => ({ id: e.id, label: e.title })))).catch(() => {});
    }
    const orgs = filter.tenant_ids ?? [];
    if (isAdmin && orgs.length && !orgLabels.length) {
      fetchAll<{ id: number; organization_name: string }>("admin/organisers")
        .then((all) => setOrgLabels(all.filter((o) => orgs.includes(o.id)).map((o) => ({ id: o.id, label: o.organization_name })))).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = useMemo(() => ({ channel, body: body || " ", audience_filter: filter }), [channel, body, filter]);
  const key = JSON.stringify(payload);

  useEffect(() => {
    if (filter.source === "event" && !filter.event_ids?.length && !handPicked) { setSummary(null); onSummary(null); return; }
    setCounting(true);
    const t = window.setTimeout(() => {
      api.post<AudienceSummary>("campaigns/audience", payload)
        .then((s) => { setSummary(s); onSummary(s); })
        .then(() => setCountError(null))
        .catch((e) => { setSummary(null); onSummary(null); setCountError(errorMessage(e)); })
        .finally(() => setCounting(false));
    }, 400);
    return () => window.clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Facets depend only on which events/organisers are in scope.
  const facetKey = `${filter.source}|${(filter.event_ids ?? []).join(",")}|${(filter.tenant_ids ?? []).join(",")}`;
  useEffect(() => {
    if (!refineOpen) return;
    api.post<Facets>("campaigns/audience/facets", { channel, audience_filter: { source: filter.source, event_ids: filter.event_ids, tenant_ids: filter.tenant_ids } })
      .then(setFacets).catch(() => setFacets(null));
  }, [facetKey, refineOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadEvents = (q: string) => {
    const orgs = isAdmin && filter.tenant_ids?.length === 1 ? `&tenant_id=${filter.tenant_ids[0]}` : "";
    return api.get<{ data: { id: number; title: string; start_date: string; attendees_count?: number; tenant?: { organization_name: string } }[] }>(
      `events?per_page=40&search=${encodeURIComponent(q)}${orgs}`,
    ).then((r) => r.data.map((e) => ({
      id: e.id,
      label: e.title,
      hint: [
        new Date(e.start_date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }),
        e.attendees_count != null ? `${e.attendees_count.toLocaleString()} guests` : null,
        isAdmin ? e.tenant?.organization_name : null,
      ].filter(Boolean).join(" · "),
    })));
  };

  const loadOrganisers = (q: string) =>
    api.get<{ data: { id: number; organization_name: string; events_count: number }[] }>(`admin/organisers?per_page=50&search=${encodeURIComponent(q)}`)
      .then((r) => r.data.map((o) => ({ id: o.id, label: o.organization_name, hint: `${o.events_count} events` })));

  const sources: { id: Source; title: string; hint: string; icon: typeof Users }[] = [
    { id: "all", title: isAdmin ? "My account's guests" : "All my past guests", hint: `Everyone who booked${contactTotal ? ` + ${contactTotal.toLocaleString()} imported contacts` : ""}`, icon: Users },
    { id: "event", title: "Guests of specific events", hint: isAdmin ? "Any event on Tikooh" : "One or several of your events", icon: CalendarDays },
    ...(isAdmin ? [{ id: "platform" as Source, title: "Everyone on Tikooh", hint: "Narrow by organiser below", icon: Globe2 }] : []),
  ];

  const n = activeFilters(filter);
  const balance = sms?.balance;
  const cost = summary?.estimated_cost ?? 0;
  const short = channel === "sms" && balance?.ok && balance.amount != null && cost > balance.amount;
  const states = summary?.states;

  return (
    <div className="space-y-3">
      <Label>Send to</Label>

      {handPicked ? (
        <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <UserCheck className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-medium text-foreground">{filter.include!.length.toLocaleString()} hand-picked {filter.include!.length === 1 ? "person" : "people"}</div>
            <div className="text-xs text-muted-foreground">Filters are ignored while you're hand-picking.</div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setReview("all")}>Edit picks</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => set({ include: [] })}>Clear</Button>
        </div>
      ) : (
        <>
          <div className={`grid gap-2 ${sources.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {sources.map((s) => (
              <button key={s.id} type="button" onClick={() => set({ source: s.id })}
                className={`text-left rounded-xl border p-3 transition ${filter.source === s.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                <s.icon className={`w-4 h-4 mb-1.5 ${filter.source === s.id ? "text-primary" : "text-muted-foreground"}`} />
                <div className="text-sm font-medium text-foreground">{s.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.hint}</div>
              </button>
            ))}
          </div>

          <div className={`grid gap-3 ${isAdmin && filter.source !== "all" ? "sm:grid-cols-2" : ""}`}>
            {isAdmin && filter.source !== "all" && (
              <MultiPicker label="organiser" placeholder="All organisers" icon={Building2}
                selected={orgLabels} load={loadOrganisers}
                onChange={(next) => { setOrgLabels(next); set({ tenant_ids: next.map((o) => o.id) }); }} />
            )}
            <MultiPicker label="event" placeholder={filter.source === "event" ? "Choose events…" : "All events"} icon={CalendarDays}
              selected={eventLabels} load={loadEvents}
              onChange={(next) => {
                setEventLabels(next);
                set({
                  event_ids: next.map((e) => e.id),
                  ticket_tier_id: [],
                  // Picking events means "guests of these events"; say so on the cards.
                  ...(next.length && filter.source === "all" ? { source: "event" as Source } : {}),
                });
              }} />
          </div>

          {/* Refine */}
          <div className="rounded-xl border border-border">
            <button type="button" onClick={() => setRefineOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-foreground">Refine</span>
              {n > 0 && <span className="rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5">{n}</span>}
              <span className="text-xs text-muted-foreground truncate">attendance, payment, ticket type, dates, search…</span>
              <ChevronDown className={`ml-auto w-4 h-4 text-muted-foreground transition ${refineOpen ? "rotate-180" : ""}`} />
            </button>
            {refineOpen && (
              <div className="space-y-4 border-t border-border p-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Name, email, phone or company" value={filter.q ?? ""} onChange={(e) => set({ q: e.target.value })} />
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Attendance</div>
                    <Segmented value={filter.attendance} onChange={(v) => set({ attendance: v, checked_in: undefined })}
                      options={[{ id: undefined, label: "Anyone" }, { id: "checked_in", label: "Showed up" }, { id: "no_show", label: "No-shows" }]} />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Payment</div>
                    <Segmented value={filter.paid} onChange={(v) => set({ paid: v })}
                      options={[{ id: undefined, label: "Any" }, { id: "paid", label: "Paid" }, { id: "free", label: "Free" }]} />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Phone number</div>
                    <Segmented value={filter.phone} onChange={(v) => set({ phone: v })}
                      options={[{ id: undefined, label: "Any" }, { id: "missing", label: "Missing" }, { id: "present", label: "Has one" }]} />
                  </div>
                </div>

                {(filter.event_ids?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Ticket type</div>
                    <Chips values={(facets?.tiers ?? []).map((t) => ({ id: t.id, label: `${t.name}${t.price ? ` · ${kes(t.price)}` : " · Free"}${(filter.event_ids?.length ?? 0) > 1 && t.event ? ` (${t.event})` : ""}` }))}
                      selected={filter.ticket_tier_id} onChange={(v) => set({ ticket_tier_id: v })} />
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Category</div>
                    <Chips values={(facets?.categories ?? []).map((c) => ({ id: c, label: c }))} selected={filter.category} onChange={(v) => set({ category: v })} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Registration status</div>
                    <Chips values={(facets?.statuses ?? []).map((c) => ({ id: c, label: c.replace(/_/g, " ") }))} selected={filter.status} onChange={(v) => set({ status: v })} />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Registered between</div>
                    <div className="flex items-center gap-2">
                      <Input type="date" value={filter.registered_from ?? ""} onChange={(e) => set({ registered_from: e.target.value || undefined })} aria-label="Registered from" />
                      <span className="text-muted-foreground text-xs">to</span>
                      <Input type="date" value={filter.registered_to ?? ""} onChange={(e) => set({ registered_to: e.target.value || undefined })} aria-label="Registered to" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Event took place between</div>
                    <div className="flex items-center gap-2">
                      <Input type="date" value={filter.event_from ?? ""} onChange={(e) => set({ event_from: e.target.value || undefined })} aria-label="Event from" />
                      <span className="text-muted-foreground text-xs">to</span>
                      <Input type="date" value={filter.event_to ?? ""} onChange={(e) => set({ event_to: e.target.value || undefined })} aria-label="Event to" />
                    </div>
                  </div>
                </div>

                {(facets?.countries.length ?? 0) > 1 && (
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Country</div>
                    <Chips values={facets!.countries.map((c) => ({ id: c, label: c }))} selected={filter.country} onChange={(v) => set({ country: v })} />
                  </div>
                )}

                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Switch checked={!!filter.consent} onCheckedChange={(v) => set({ consent: v || undefined })} /> Only people who opted in to marketing
                  </label>
                  {filter.source !== "event" && n === 0 && !filter.event_ids?.length && (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Switch checked={filter.include_contacts ?? true} onCheckedChange={(v) => set({ include_contacts: v })} /> Include imported contacts
                    </label>
                  )}
                </div>

                {n > 0 && (
                  <button type="button" className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => set({ q: "", attendance: undefined, checked_in: undefined, paid: undefined, phone: undefined, ticket_tier_id: [], category: [], status: [], country: [], consent: undefined, registered_from: undefined, registered_to: undefined, event_from: undefined, event_to: undefined })}>
                    Clear refinements
                  </button>
                )}
              </div>
            )}
          </div>

          {(filter.exclude?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserMinus className="w-3.5 h-3.5" /> {filter.exclude!.length} {filter.exclude!.length === 1 ? "person" : "people"} removed by hand
              <button type="button" className="text-primary underline" onClick={() => set({ exclude: [] })}>Put back</button>
            </div>
          )}
        </>
      )}

      {/* Summary */}
      <div className={`rounded-xl border p-3 space-y-3 ${short ? "border-destructive/50 bg-destructive/5" : "border-primary/20 bg-primary/5"}`}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            {counting ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <CheckCircle2 className="w-4 h-4 text-primary" />}
            <span className="text-lg font-bold text-foreground tabular-nums">{summary ? summary.recipient_count.toLocaleString() : "—"}</span>
            <span className="text-sm text-muted-foreground">{summary?.recipient_count === 1 ? "person" : "people"} will get this</span>
            {countError && !counting && <span className="text-xs text-destructive">Couldn't count: {countError}</span>}
          </div>
          {channel === "sms" && summary && (
            <>
              <div className="text-sm">
                <span className="font-semibold text-foreground tabular-nums">{summary.credits.toLocaleString()}</span>
                <span className="text-muted-foreground"> SMS credits</span>
                {summary.max_segments > 1 && <span className="text-xs text-muted-foreground"> (up to {summary.max_segments} per person)</span>}
              </div>
              <div className="text-sm">
                <span className="font-semibold text-foreground tabular-nums">{kes(summary.estimated_cost)}</span>
                <span className="text-muted-foreground text-xs"> @ {kes(summary.cost_per_segment)}/part</span>
              </div>
            </>
          )}
          <Button type="button" size="sm" variant="outline" className="ml-auto" disabled={!summary} onClick={() => setReview("all")}>
            <ListChecks className="w-3.5 h-3.5 mr-1.5" /> Review recipients
          </Button>
        </div>

        {channel === "sms" && isAdmin && balance && (
          <div className={`flex items-center gap-2 text-xs ${short ? "text-destructive" : "text-muted-foreground"}`}>
            <Wallet className="w-3.5 h-3.5" />
            {balance.ok
              ? <>{sms?.provider_label} balance <span className="font-semibold tabular-nums">{balance.currency} {balance.amount?.toLocaleString("en-KE", { maximumFractionDigits: 2 })}</span>
                {short ? <> · <span className="font-semibold">not enough for this send. Top up {kes(cost - (balance.amount ?? 0))} more</span></>
                  : summary && cost > 0 ? <> · {kes((balance.amount ?? 0) - cost)} left after this send</> : null}</>
              : <>Couldn't check balance: {balance.error}</>}
            {sms?.sandbox && <span className="rounded bg-yellow-500/15 text-yellow-600 px-1.5">SANDBOX</span>}
          </div>
        )}

        {summary && states && (
          <div className="flex flex-wrap gap-1.5">
            {(["invalid", "unsupported", "blocked", "duplicate", "suppressed", "missing"] as PersonState[])
              .filter((s) => states[s] > 0)
              .map((s) => (
                <button key={s} type="button" onClick={() => setReview(s)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs hover:opacity-80 ${STATE_STYLE[s]}`}>
                  {(s === "invalid" || s === "unsupported" || s === "blocked") && <AlertTriangle className="w-3 h-3" />}
                  {states[s].toLocaleString()} {STATE_LABEL[s].toLowerCase()}
                </button>
              ))}
            {channel === "sms" && Object.entries(summary.networks).map(([net, c]) => (
              <span key={net} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{net} {c.toLocaleString()}</span>
            ))}
          </div>
        )}
        {channel === "sms" && summary && summary.skipped > 0 && (
          <p className="text-xs text-muted-foreground">Invalid, unsupported and provider-blocked numbers are skipped automatically. You aren't charged for them.</p>
        )}
      </div>

      {review && (
        <RecipientReview channel={channel} body={body} filter={filter} initial={review}
          onChange={onChange} onClose={() => setReview(null)} />
      )}
    </div>
  );
}
