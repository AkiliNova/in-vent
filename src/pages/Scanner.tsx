import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, CheckCircle2, XCircle, AlertTriangle, Keyboard } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, EventItem } from "@/lib/api";

interface ScanResult {
  result: "accepted" | "duplicate" | "rejected" | string;
  message: string;
  attendee: { name: string; email: string; category: string | null; is_vip: boolean; checked_in_at: string | null } | null;
  at: number;
}

const READER_ID = "qr-reader";

export default function Scanner() {
  const [params] = useSearchParams();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventId, setEventId] = useState<string>(params.get("event") || "");
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [manual, setManual] = useState("");
  const [camError, setCamError] = useState<string | null>(null);
  const scanner = useRef<Html5Qrcode | null>(null);
  // The camera reports the same code many times a second; ignore repeats.
  const recent = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    api.get<{ data: EventItem[] }>("events?per_page=100").then((r) => {
      setEvents(r.data);
      if (!eventId) {
        const next = r.data.filter((e) => e.status === "published")
          .sort((a, b) => +new Date(a.start_date) - +new Date(b.start_date))
          .find((e) => +new Date(e.end_date || e.start_date) > Date.now() - 12 * 3600_000);
        if (next) setEventId(next.uuid);
      }
    });
    return () => { scanner.current?.stop().catch(() => {}); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (code: string, method: "qr" | "manual") => {
    const now = Date.now();
    if (code === recent.current.code && now - recent.current.at < 4000) return;
    recent.current = { code, at: now };

    let res: ScanResult;
    try {
      res = { ...(await api.post(`events/${eventId}/check-in/scan`, { code, method })), at: now };
    } catch (e) {
      res = e instanceof ApiError && e.data?.result
        ? { ...e.data, at: now }
        : { result: "rejected", message: e instanceof Error ? e.message : "Scan failed", attendee: null, at: now };
    }
    setLast(res);
    setHistory((h) => [res, ...h].slice(0, 20));
    navigator.vibrate?.(res.result === "accepted" ? 80 : [60, 60, 60]);
  };

  const start = async () => {
    setCamError(null);
    try {
      const s = new Html5Qrcode(READER_ID);
      scanner.current = s;
      await s.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => submit(text.trim(), "qr"), () => {});
      setRunning(true);
    } catch (e) {
      setCamError("Couldn't open the camera. Allow camera access, or type codes below.");
    }
  };

  const stop = async () => {
    await scanner.current?.stop().catch(() => {});
    setRunning(false);
  };

  const tone = !last ? "" : last.result === "accepted"
    ? "border-success bg-success/10" : last.result === "duplicate" ? "border-yellow-500 bg-yellow-500/10" : "border-destructive bg-destructive/10";
  const Icon = !last ? null : last.result === "accepted" ? CheckCircle2 : last.result === "duplicate" ? AlertTriangle : XCircle;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-md space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Check-in</h1>

          <label className="block text-sm">
            <span className="text-muted-foreground">Event</span>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Choose an event…</option>
              {events.map((e) => <option key={e.id} value={e.uuid}>{e.title}</option>)}
            </select>
          </label>

          <div className="glass rounded-2xl overflow-hidden">
            <div id={READER_ID} className="w-full aspect-square bg-black/40" />
            <div className="p-3 flex justify-center">
              {running
                ? <Button variant="secondary" onClick={stop}><CameraOff className="w-4 h-4 mr-2" /> Stop camera</Button>
                : <Button disabled={!eventId} onClick={start}><Camera className="w-4 h-4 mr-2" /> Start scanning</Button>}
            </div>
            {camError && <p className="px-4 pb-3 text-sm text-destructive">{camError}</p>}
          </div>

          {last && Icon && (
            <div role="status" aria-live="assertive" className={`rounded-2xl border-2 p-4 ${tone}`}>
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Icon className="w-5 h-5" /> {last.message}
              </div>
              {last.attendee && (
                <div className="mt-2 text-sm">
                  <div className="text-foreground text-lg">{last.attendee.name}{last.attendee.is_vip && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">VIP</span>}</div>
                  <div className="text-muted-foreground">{last.attendee.category} · {last.attendee.email}</div>
                </div>
              )}
            </div>
          )}

          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { submit(manual.trim(), "manual"); setManual(""); } }}>
            <Input placeholder="Type ticket code" value={manual} onChange={(e) => setManual(e.target.value)} aria-label="Ticket code" disabled={!eventId} />
            <Button type="submit" variant="secondary" disabled={!eventId}><Keyboard className="w-4 h-4" /></Button>
          </form>

          {history.length > 1 && (
            <ul className="text-sm divide-y divide-border glass rounded-2xl">
              {history.slice(1).map((h) => (
                <li key={h.at} className="px-4 py-2 flex justify-between">
                  <span className="text-foreground truncate">{h.attendee?.name || "Unknown code"}</span>
                  <span className={h.result === "accepted" ? "text-success" : h.result === "duplicate" ? "text-yellow-500" : "text-destructive"}>{h.result}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
