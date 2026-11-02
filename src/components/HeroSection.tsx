import { useState, useEffect } from "react";
import { fetchPublicEvents } from "@/lib/api";
import { Link, useNavigate } from "react-router-dom";
import { Search, MapPin, Calendar, Ticket, ArrowRight, Smartphone, QrCode, Zap, Sparkles } from "lucide-react";
import EventImg from "./EventImg";

interface HeroEvent {
  id: string;
  title: string;
  price: number;
  images: string[];
  link: string;
  startDate: string;
  location?: string;
}

const CATEGORIES = [
  { label: "🎵 Music", value: "Music" },
  { label: "😂 Comedy", value: "Comedy" },
  { label: "⚽ Sports", value: "Football" },
  { label: "🎨 Arts", value: "Arts" },
  { label: "🍽️ Food", value: "Food" },
  { label: "🏋️ Fitness", value: "Fitness" },
];

const ROTATE_MS = 5000;

export default function HeroSection() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<HeroEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let live = true;
    fetchPublicEvents()
      .then((all) => live && setEvents(all.filter((e) => e.images.length > 0).slice(0, 5)))
      .catch(() => {})
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (events.length <= 1 || paused) return;
    const t = setInterval(() => setActive((i) => (i + 1) % events.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [events, paused]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/search-events?q=${encodeURIComponent(q.trim())}` : "/search-events");
  };

  const ev = events[active];
  const price = (p: number) => (p > 0 ? `KES ${p.toLocaleString()}` : "Free");

  return (
    <section className="relative overflow-hidden bg-[#07071a]">
      {/* Atmosphere: soft colour fields + a fine grid that fades out */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 h-[620px] w-[620px] rounded-full bg-[#F32B81]/15 blur-[140px]" />
        <div className="absolute top-1/3 -right-40 h-[560px] w-[560px] rounded-full bg-[#3ED2D1]/12 blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-[300px] w-[500px] rounded-full bg-[#F8D21F]/[0.06] blur-[110px]" />
        <div className="absolute inset-0 opacity-[0.04] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
          style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "56px 56px" }} />
      </div>

      <div className="container relative z-10 mx-auto grid min-h-[100svh] items-center gap-12 px-6 pt-28 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        {/* ── Copy ── */}
        <div className="flex flex-col gap-7 animate-slide-up">
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3ED2D1] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3ED2D1]" />
            </span>
            Tickets for Kenya's best nights out
          </div>

          <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight text-white sm:text-6xl xl:text-7xl">
            Find it. Book it.
            <br />
            <span className="bg-gradient-to-r from-[#F32B81] via-[#FF7AB6] to-[#F8D21F] bg-clip-text text-transparent">Be there.</span>
          </h1>

          <p className="max-w-md text-lg leading-relaxed text-white/60">
            Concerts, comedy, festivals and games. Pay with M-Pesa in seconds and your QR ticket lands by email and SMS.
          </p>

          <form onSubmit={search} className="w-full max-w-lg">
            <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.07] p-2 pl-4 backdrop-blur-md transition-colors focus-within:border-[#3ED2D1]/60">
              <Search className="h-5 w-5 flex-shrink-0 text-white/40" />
              <input
                type="text"
                placeholder="Search events, artists, venues…"
                aria-label="Search events"
                className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/40 focus:outline-none"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button type="submit" className="flex-shrink-0 rounded-xl bg-[#F32B81] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#F32B81]/25 transition hover:bg-[#E02575]">
                Search
              </button>
            </div>
          </form>

          <div className="flex max-w-lg flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c.value} onClick={() => navigate(`/search-events?type=${encodeURIComponent(c.value)}`)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/25 hover:bg-white/10 hover:text-white">
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-xs text-white/50">
            {[
              { icon: Smartphone, label: "Pay with M-Pesa" },
              { icon: QrCode, label: "QR ticket by email & SMS" },
              { icon: Zap, label: "Scanned in a second" },
            ].map((b) => (
              <span key={b.label} className="flex items-center gap-2"><b.icon className="h-3.5 w-3.5 text-[#3ED2D1]" />{b.label}</span>
            ))}
          </div>
        </div>

        {/* ── Featured events ── */}
        <div className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {/* Floating "ticket" accents */}
          <div className="absolute -left-6 top-10 z-20 hidden rotate-[-8deg] rounded-2xl border border-white/10 bg-[#0d0d26]/90 px-4 py-3 shadow-2xl backdrop-blur md:block animate-float">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3ED2D1]/15"><QrCode className="h-5 w-5 text-[#3ED2D1]" /></div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-white/40">Admit one</div>
                <div className="text-sm font-semibold text-white">Checked in ✓</div>
              </div>
            </div>
          </div>
          <div className="absolute -right-3 bottom-24 z-20 hidden rotate-[6deg] rounded-2xl border border-white/10 bg-[#0d0d26]/90 px-4 py-3 shadow-2xl backdrop-blur md:block animate-float" style={{ animationDelay: "1.5s" }}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F32B81]/15"><Smartphone className="h-5 w-5 text-[#F32B81]" /></div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-white/40">M-Pesa</div>
                <div className="text-sm font-semibold text-white">Payment received</div>
              </div>
            </div>
          </div>

          <div className="relative h-[380px] overflow-hidden rounded-[28px] border border-white/10 shadow-2xl shadow-black/50 md:h-[480px]">
            {loading ? (
              <div className="flex h-full w-full items-center justify-center bg-white/5 animate-pulse"><Ticket className="h-12 w-12 text-white/10" /></div>
            ) : ev ? (
              <div key={ev.id} className="absolute inset-0 animate-fade-in" style={{ animationDuration: "0.6s" }}>
                <EventImg src={ev.images[0]} alt={ev.title} title={ev.title}
                  className="absolute inset-0 h-full w-full scale-105 object-cover" placeholderClassName="absolute inset-0 h-full w-full" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07071a] via-[#07071a]/40 to-transparent" />
                <div className="absolute right-4 top-4 rounded-full bg-white/95 px-3 py-1 text-sm font-bold text-[#07071a] shadow-lg">{price(ev.price)}</div>
                <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/70">
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />
                      {new Date(ev.startDate).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}</span>
                    {ev.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{ev.location}</span>}
                  </div>
                  <h3 className="mb-4 font-display text-2xl font-bold leading-tight text-white md:text-3xl">{ev.title}</h3>
                  <Link to={ev.link} className="inline-flex items-center gap-2 rounded-xl bg-[#F32B81] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#F32B81]/30 transition hover:bg-[#E02575]">
                    Get tickets <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                {/* Progress for the auto-rotate */}
                {events.length > 1 && (
                  <div className="absolute inset-x-6 top-4 flex gap-1.5 md:inset-x-8">
                    {events.map((_, i) => (
                      <button key={i} aria-label={`Show event ${i + 1}`} onClick={() => setActive(i)} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                        <span className={`block h-full rounded-full bg-white ${i < active ? "w-full" : i === active ? (paused ? "w-full" : "animate-[grow_5s_linear_forwards] w-0") : "w-0"}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-white/5 text-center">
                <Sparkles className="h-12 w-12 text-[#F32B81]/50" />
                <p className="text-white/60">New events are on the way.</p>
                <Link to="/onboarding" className="text-sm font-medium text-[#3ED2D1] hover:underline">Hosting one? List it on Tikooh →</Link>
              </div>
            )}
          </div>

          {events.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {events.map((e, i) => (
                <button key={e.id} onClick={() => setActive(i)} aria-label={e.title}
                  className={`relative h-14 overflow-hidden rounded-xl transition ${i === active ? "ring-2 ring-[#F32B81] ring-offset-2 ring-offset-[#07071a]" : "opacity-50 hover:opacity-90"}`}>
                  <EventImg src={e.images[0]} alt="" title={e.title} className="h-full w-full object-cover" placeholderClassName="h-full w-full" />
                </button>
              ))}
            </div>
          )}

          <Link to="/search-events" className="mt-4 flex items-center justify-center gap-2 py-1 text-sm text-white/50 transition hover:text-white">
            Browse all events <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
