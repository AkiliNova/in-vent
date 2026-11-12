import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, CalendarDays, Loader2, Plus, UserRound } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { api } from "@/lib/api";
import { NavGroup } from "./nav";

interface GuestHit { id: number; first_name: string; last_name: string | null; email: string; phone: string | null }
interface OrgHit { id: number; organization_name: string; email: string | null }

/**
 * Ctrl+K: jump to any page, switch event, find a guest in the current event,
 * or (admins) open an organiser. Server searches run only once you type 2+
 * characters, and only for what the user can see.
 */
export default function CommandPalette({ open, onOpenChange, groups }: { open: boolean; onOpenChange: (o: boolean) => void; groups: NavGroup[] }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const ws = useWorkspace();
  const isAdmin = user?.role === "super_admin";
  const [q, setQ] = useState("");
  const [guests, setGuests] = useState<GuestHit[]>([]);
  const [orgs, setOrgs] = useState<OrgHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => { if (!open) { setQ(""); setGuests([]); setOrgs([]); } }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setGuests([]); setOrgs([]); return; }
    setSearching(true);
    const t = window.setTimeout(() => {
      Promise.all([
        ws?.current
          ? api.get<{ data: GuestHit[] }>(`events/${ws.current}/attendees?per_page=8&search=${encodeURIComponent(term)}`).then((r) => r.data).catch(() => [])
          : Promise.resolve([]),
        isAdmin
          ? api.get<{ data: OrgHit[] }>(`admin/organisers?per_page=5&search=${encodeURIComponent(term)}`).then((r) => r.data).catch(() => [])
          : Promise.resolve([]),
      ]).then(([g, o]) => { setGuests(g); setOrgs(o); }).finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, ws?.current, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to: string) => { onOpenChange(false); navigate(to); };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={q} onValueChange={setQ} placeholder={ws?.currentEvent ? `Search pages, events, guests in ${ws.currentEvent.title}…` : "Search pages, events…"} />
      <CommandList>
        <CommandEmpty>{searching ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Searching…</span> : "Nothing found."}</CommandEmpty>

        {guests.length > 0 && (
          <CommandGroup heading={`Guests · ${ws?.currentEvent?.title ?? "current event"}`}>
            {guests.map((g) => (
              <CommandItem key={`g${g.id}`} value={`guest ${g.id} ${g.first_name} ${g.last_name ?? ""} ${g.email} ${g.phone ?? ""} ${q}`}
                onSelect={() => go(`/guests?search=${encodeURIComponent(g.email && !g.email.endsWith(".tikooh.com") ? g.email : `${g.first_name} ${g.last_name ?? ""}`.trim())}`)}>
                <UserRound className="mr-2 h-4 w-4" />
                <span className="truncate">{g.first_name} {g.last_name}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">{g.phone || g.email}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {orgs.length > 0 && (
          <CommandGroup heading="Organisers">
            {orgs.map((o) => (
              <CommandItem key={`o${o.id}`} value={`organiser ${o.id} ${o.organization_name} ${o.email ?? ""} ${q}`} onSelect={() => go(`/admin/organisers/${o.id}`)}>
                <Building2 className="mr-2 h-4 w-4" /> <span className="truncate">{o.organization_name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {groups.map((g) => (
          <CommandGroup key={g.label} heading={g.label}>
            {g.items.map((i) => (
              <CommandItem key={i.href} value={`${i.label} ${g.label} ${i.keywords ?? ""}`} onSelect={() => go(i.href)}>
                <i.icon className="mr-2 h-4 w-4" /> {i.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="new event create" onSelect={() => go("/events?new=1")}><Plus className="mr-2 h-4 w-4" /> New event</CommandItem>
          <CommandItem value="new campaign sms email" onSelect={() => go("/campaigns")}><Plus className="mr-2 h-4 w-4" /> New campaign</CommandItem>
        </CommandGroup>

        {ws && ws.events.length > 0 && (
          <CommandGroup heading="Switch event">
            {ws.events.slice(0, 50).map((e) => (
              <CommandItem key={e.uuid} value={`event ${e.title} ${e.uuid}`} onSelect={() => { ws.setCurrent(e.uuid); onOpenChange(false); }}>
                <CalendarDays className="mr-2 h-4 w-4" /> <span className="truncate">{e.title}</span>
                {ws.current === e.uuid && <span className="ml-auto text-xs text-primary">current</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
