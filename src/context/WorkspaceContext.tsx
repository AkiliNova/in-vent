import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EventItem } from "@/lib/api";
import { fetchAll } from "@/lib/paging";
import { useAuth } from "@/context/AuthContext";

/**
 * The organiser's workspace: which event they're working on. The top-bar
 * switcher sets it; Guests, Scanner, Door registration and Promo codes follow
 * it, so picking DWELL once applies everywhere. Remembered per browser.
 */
interface Workspace {
  events: EventItem[];
  loading: boolean;
  current: string;
  currentEvent: EventItem | undefined;
  setCurrent: (uuid: string) => void;
  reload: () => void;
}

const WorkspaceContext = createContext<Workspace | null>(null);
const KEY = "tikooh.currentEvent";

const read = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
const write = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrentState] = useState(read);

  const reload = useCallback(() => {
    if (!user) return;
    setLoading(true);
    fetchAll<EventItem>("events")
      .then((all) => {
        // Soonest upcoming first, then most recent past.
        const now = Date.now();
        const upcoming = all.filter((e) => +new Date(e.end_date || e.start_date) >= now).sort((a, b) => +new Date(a.start_date) - +new Date(b.start_date));
        const past = all.filter((e) => +new Date(e.end_date || e.start_date) < now).sort((a, b) => +new Date(b.start_date) - +new Date(a.start_date));
        setEvents([...upcoming, ...past]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  const setCurrent = useCallback((uuid: string) => { setCurrentState(uuid); write(uuid); }, []);

  const value = useMemo<Workspace>(() => ({
    events, loading, current, setCurrent, reload,
    currentEvent: events.find((e) => e.uuid === current),
  }), [events, loading, current, setCurrent, reload]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => useContext(WorkspaceContext);

/**
 * A page's selected event, kept in step with the workspace switcher and any
 * ?event=<uuid> in the URL. Drop-in for useState(params.get("event") || "").
 */
export function useSelectedEvent(): [string, (uuid: string) => void] {
  const ws = useWorkspace();
  const [params] = useSearchParams();
  const fromUrl = params.get("event") || "";
  const [id, setId] = useState(fromUrl || ws?.current || "");

  useEffect(() => { if (fromUrl) { setId(fromUrl); ws?.setCurrent(fromUrl); } }, [fromUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ws?.current) setId(ws.current); }, [ws?.current]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((uuid: string) => { setId(uuid); ws?.setCurrent(uuid); }, [ws]);

  return [id, set];
}
