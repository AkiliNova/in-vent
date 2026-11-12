import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, CheckCircle2, XCircle, AlertTriangle, Keyboard } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, EventItem } from "@/lib/api";
import { fetchAll } from "@/lib/paging";

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
  const [overlay, setOverlay] = useState<ScanResult | null>(null);
  const scanner = useRef<Html5Qrcode | null>(null);
  const eventRef = useRef(eventId);
  eventRef.current = eventId;
  // One scan at a time: the camera is paused while a result is on screen.
  const busy = useRef(false);
  const dismissTimer = useRef<number>();
  // A ticket held up to the lens keeps decoding after the overlay closes.
  // Ignore a code the camera already handled for a while, so the green tick
  // isn't immediately replaced by "already checked in".
  const seen = useRef(new Map<string, number>());

  useEffect(() => {
    fetchAll<EventItem>("events").then((all) => {
      setEvents(all);
      if (!eventId) {
        const next = all.filter((e) => e.status === "published")
          .sort((a, b) => +new Date(a.start_date) - +new Date(b.start_date))
          .find((e) => +new Date(e.end_date || e.start_date) > Date.now() - 12 * 3600_000);
        if (next) setEventId(next.uuid);
      }
    });
    return () => {
      window.clearTimeout(dismissTimer.current);
      scanner.current?.stop().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    window.clearTimeout(dismissTimer.current);
    setOverlay(null);
    try { scanner.current?.resume(); } catch { /* not paused */ }
    busy.current = false;
  };

  const submit = async (code: string, method: "qr" | "manual") => {
    if (busy.current || !code || !eventRef.current) return;
    const now = Date.now();
    if (method === "qr") {
      if (now - (seen.current.get(code) ?? 0) < 15_000) return;
      seen.current.set(code, now);
    }
    busy.current = true;
    try { scanner.current?.pause(true); } catch { /* not running */ }

    let res: ScanResult;
    try {
      res = { ...(await api.post(`events/${eventRef.current}/check-in/scan`, { code, method })), at: now };
    } catch (e) {
      res = e instanceof ApiError && e.data?.result
        ? { ...e.data, at: now }
        : { result: "rejected", message: e instanceof Error ? e.message : "Scan failed", attendee: null, at: now };
    }
    setLast(res);
    setHistory((h) => [res, ...h].slice(0, 20));
    setOverlay(res);
    navigator.vibrate?.(res.result === "accepted" ? 80 : [60, 60, 60]);
    // Problems stay up longer so the staff member actually reads them.
    dismissTimer.current = window.setTimeout(dismiss, res.result === "accepted" ? 1800 : 3500);
  };

  const start = async () => {
    if (scanner.current) return;
    setCamError(null);
    const s = new Html5Qrcode(READER_ID);
    scanner.current = s;
    try {
      await s.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => submit(text.trim(), "qr"), () => {});
      setRunning(true);
    } catch (e) {
      scanner.current = null;
      setCamError("Couldn't open the camera. Allow camera access, or type codes below.");
    }
  };

  const stop = async () => {
    await scanner.current?.stop().catch(() => {});
    scanner.current = null;
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

      {overlay && <ScanOverlay key={overlay.at} res={overlay} onClose={dismiss} />}
    </div>
  );
}

/** Full-screen result after a scan; tap anywhere to scan the next guest. */
function ScanOverlay({ res, onClose }: { res: ScanResult; onClose: () => void }) {
  const ok = res.result === "accepted";
  const dup = res.result === "duplicate";
  const color = ok ? "text-success" : dup ? "text-yellow-500" : "text-destructive";
  const title = ok ? "Checked in" : dup ? "Already used" : "Not allowed";

  return (
    <div role="alertdialog" aria-live="assertive" aria-label={title} onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/85 backdrop-blur-md px-6 text-center animate-fade-in cursor-pointer"
      style={{ animationDuration: "0.2s" }}>
      <div className={`rounded-full ${color} ${ok ? "scan-pulse" : "scan-shake"}`}>
        <svg viewBox="0 0 52 52" className="w-36 h-36 scan-pop" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <circle className="scan-ring" cx="26" cy="26" r="25" fill="currentColor" fillOpacity={0.12} />
          {ok && <path className="scan-mark" d="M14 27l8 8 16-16" />}
          {dup && <><path className="scan-mark" d="M26 14v15" /><path className="scan-mark" d="M26 37v1" /></>}
          {!ok && !dup && <><path className="scan-mark" d="M18 18l16 16" /><path className="scan-mark" d="M34 18L18 34" /></>}
        </svg>
      </div>

      <div className="animate-slide-up space-y-1" style={{ animationDuration: "0.4s" }}>
        <div className={`text-3xl font-bold ${color}`}>{title}</div>
        {res.attendee ? (
          <>
            <div className="text-2xl font-semibold text-foreground">
              {res.attendee.name}
              {res.attendee.is_vip && <span className="ml-2 align-middle text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">VIP</span>}
            </div>
            {res.attendee.category && <div className="text-muted-foreground">{res.attendee.category}</div>}
            {!ok && <div className="text-foreground/80 pt-2">{res.message}</div>}
          </>
        ) : (
          <div className="text-foreground/80">{res.message}</div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">Tap to scan the next guest</p>
    </div>
  );
}
