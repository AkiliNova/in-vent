import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarDays, Check, ChevronDown, ChevronsLeft, ChevronsRight, LayoutDashboard, LogOut, Menu, QrCode, ScanLine,
  Monitor, Moon, Search, Sun, Users, Wallet,
} from "lucide-react";
import { Theme, useAppTheme } from "./theme";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace, WorkspaceProvider } from "@/context/WorkspaceContext";
import { api, kes } from "@/lib/api";
import { homeFor, navFor, NavGroup } from "./nav";
import CommandPalette from "./CommandPalette";

import { ShellContext } from "./ShellContext";

const COLLAPSE_KEY = "tikooh.sidebarCollapsed";

export default function AppShell() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

function Shell() {
  const { user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; } });
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useAppTheme();
  const groups = navFor(user);

  useEffect(() => { try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ } }, [collapsed]);
  useEffect(() => { setDrawer(false); }, [location.pathname]);

  // Ctrl+K / ⌘K anywhere opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ShellContext.Provider value={true}>
      <div className="app-shell min-h-screen bg-background">
        {/* Desktop sidebar */}
        <aside className={`hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-border bg-sidebar transition-[width] duration-200 print:hidden ${collapsed ? "w-[72px]" : "w-64"}`}>
          <SidebarBody groups={groups} collapsed={collapsed} />
          <button type="button" onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground hover:text-foreground"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : <><ChevronsLeft className="w-4 h-4" /> Collapse</>}
          </button>
        </aside>

        {/* Phone/tablet drawer */}
        <Sheet open={drawer} onOpenChange={setDrawer}>
          <SheetContent side="left" className="w-72 p-0 bg-sidebar flex flex-col">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarBody groups={groups} collapsed={false} />
          </SheetContent>
        </Sheet>

        <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
          <TopBar onMenu={() => setDrawer(true)} onSearch={() => setPalette(true)} theme={theme} onTheme={setTheme} />
          <div className="app-shell-content pb-16 lg:pb-0">
            <Outlet />
          </div>
        </div>

        <MobileTabBar />
        <CommandPalette open={palette} onOpenChange={setPalette} groups={groups} />
      </div>
    </ShellContext.Provider>
  );
}

/* ── Sidebar ─────────────────────────────────────────────────────────── */

function SidebarBody({ groups, collapsed }: { groups: NavGroup[]; collapsed: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <Link to={homeFor(user)} className={`flex items-center h-16 border-b border-border ${collapsed ? "justify-center" : "px-5"}`}>
        {collapsed
          ? <span className="text-xl font-extrabold text-foreground">t<span className="text-primary">.</span></span>
          : <img src="/assets/logo.png" alt="Tikooh" className="h-9 w-auto object-contain" />}
      </Link>

      <nav className="flex-1 overflow-y-auto py-3" aria-label="Main">
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            {!collapsed && <div className="px-5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">{g.label}</div>}
            {collapsed && <div className="mx-4 my-2 border-t border-border/60" />}
            <ul className="space-y-0.5 px-2">
              {g.items.map((item) => (
                <li key={item.href}>
                  <NavLink to={item.href} end={item.href === "/admin"} title={collapsed ? item.label : undefined}
                    className={({ isActive }) => `flex items-center gap-3 rounded-lg text-sm transition-colors ${collapsed ? "justify-center h-10" : "px-3 py-2"} ${
                      isActive ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={`border-t border-border p-3 ${collapsed ? "flex justify-center" : ""}`}>
        {collapsed ? (
          <button type="button" title="Log out" aria-label="Log out" onClick={async () => { await logout(); navigate("/admin/login"); }}
            className="h-10 w-10 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <div className="h-9 w-9 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">
              {(user?.name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-foreground">{user?.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {user?.role === "super_admin" ? "Tikooh admin" : user?.tenant?.organization_name || user?.email}
              </div>
            </div>
            <button type="button" title="Log out" aria-label="Log out" onClick={async () => { await logout(); navigate("/admin/login"); }}
              className="text-muted-foreground hover:text-foreground"><LogOut className="w-4 h-4" /></button>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Top bar ─────────────────────────────────────────────────────────── */

/** Dark → light → follow the device, one click each. */
function ThemeToggle({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  const next: Record<Theme, Theme> = { dark: "light", light: "system", system: "dark" };
  const Icon = theme === "light" ? Sun : theme === "system" ? Monitor : Moon;
  const label = theme === "light" ? "Light mode" : theme === "system" ? "Matches your device" : "Dark mode";

  return (
    <button type="button" onClick={() => onTheme(next[theme])} title={`${label}: click to change`} aria-label={`${label}. Change theme`}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/40 text-muted-foreground hover:text-foreground">
      <Icon className="w-4 h-4" />
    </button>
  );
}

function TopBar({ onMenu, onSearch, theme, onTheme }: { onMenu: () => void; onSearch: () => void; theme: Theme; onTheme: (t: Theme) => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const groups = navFor(user);
  const page = groups.flatMap((g) => g.items).find((i) => location.pathname === i.href || (i.href !== "/admin" && location.pathname.startsWith(i.href + "/")));
  const group = groups.find((g) => g.items.includes(page!));

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:hidden">
      <div className="flex h-full items-center gap-3 px-4 md:px-6">
        <button type="button" onClick={onMenu} className="lg:hidden -ml-1 p-2 text-muted-foreground hover:text-foreground" aria-label="Open menu">
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0 hidden sm:block">
          {group && <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{group.label}</div>}
          <div className="truncate text-sm font-semibold text-foreground">{page?.label ?? ""}</div>
        </div>

        <div className="flex-1" />

        <EventSwitcher />

        <button type="button" onClick={onSearch}
          className="hidden md:flex items-center gap-2 h-9 w-56 rounded-lg border border-border bg-secondary/40 px-3 text-sm text-muted-foreground hover:text-foreground">
          <Search className="w-4 h-4" /> <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-border px-1.5 text-[10px]">Ctrl K</kbd>
        </button>
        <button type="button" onClick={onSearch} className="md:hidden p-2 text-muted-foreground hover:text-foreground" aria-label="Search">
          <Search className="w-5 h-5" />
        </button>

        <ThemeToggle theme={theme} onTheme={onTheme} />
        <BalanceChip isAdmin={user?.role === "super_admin"} />
      </div>
    </header>
  );
}

/** Which event you're working on; Guests, Scanner, Door and Promos follow it. */
function EventSwitcher() {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [params, setParams] = useSearchParams();
  if (!ws) return null;

  const list = ws.events.filter((e) => e.title.toLowerCase().includes(q.toLowerCase()));
  const pick = (uuid: string) => {
    ws.setCurrent(uuid);
    // A stale ?event= in the URL would otherwise win on refresh.
    if (params.get("event")) { params.delete("event"); setParams(params, { replace: true }); }
    setOpen(false);
    setQ("");
  };
  const now = Date.now();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 h-9 max-w-[46vw] sm:max-w-[260px] rounded-lg border border-border bg-secondary/40 px-3 text-sm hover:border-primary/50">
          <CalendarDays className="w-4 h-4 shrink-0 text-primary" />
          <span className="truncate text-foreground">{ws.currentEvent?.title ?? (ws.loading ? "Loading events…" : "Choose event")}</span>
          <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,340px)] p-0">
        <div className="relative border-b border-border">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an event…"
            className="w-full bg-transparent pl-9 pr-3 h-10 text-sm outline-none" />
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {list.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No events.</p>}
          {list.map((e) => {
            const past = +new Date(e.end_date || e.start_date) < now;
            return (
              <button key={e.uuid} type="button" onClick={() => pick(e.uuid)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted/60">
                <span className="w-4">{ws.current === e.uuid && <Check className="w-4 h-4 text-primary" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">{e.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {new Date(e.start_date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                    {past ? " · past" : e.status === "draft" ? " · draft" : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Organisers see their wallet; admins see the SMS account balance. */
function BalanceChip({ isAdmin }: { isAdmin: boolean }) {
  const [label, setLabel] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    const req = isAdmin
      ? api.get<{ balance?: { ok: boolean; amount: number | null } | null }>("campaigns/sms-status").then((s) => (s.balance?.ok ? `SMS ${kes(s.balance.amount)}` : null))
      : api.get<{ summary: { balance: number } }>("wallet").then((w) => kes(w.summary.balance));
    req.then(setLabel).catch(() => setLabel(null));
  }, [isAdmin, location.pathname]);

  if (!label) return null;

  return (
    <Link to={isAdmin ? "/campaigns" : "/payouts"}
      className="hidden sm:flex items-center gap-1.5 h-9 rounded-lg bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15 tabular-nums">
      <Wallet className="w-4 h-4" /> {label}
    </Link>
  );
}

/* ── Phone bottom bar: what the door team needs ─────────────────────── */

function MobileTabBar() {
  const { user } = useAuth();
  const tabs = [
    { href: homeFor(user), label: "Home", icon: LayoutDashboard },
    { href: "/scanner", label: "Scan", icon: ScanLine },
    { href: "/register", label: "Door", icon: QrCode },
    { href: "/guests", label: "Guests", icon: Users },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-border bg-sidebar/95 backdrop-blur print:hidden" aria-label="Quick">
      {tabs.map((t) => (
        <NavLink key={t.href} to={t.href} end
          className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? "text-primary" : "text-muted-foreground"}`}>
          <t.icon className="w-5 h-5" /> {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
