"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/firebase/firebase";
import { collectionGroup, getDocs, query, orderBy } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { Search, MapPin, Calendar, Ticket, ArrowRight, Zap, Shield, Smartphone } from "lucide-react";
import EventImg from "./EventImg";

interface Event {
  id: string;
  title: string;
  price: number;
  images: string[];
  tenantId: string;
  link: string;
  startDate: string;
  location?: string;
}

const CATEGORIES = [
  { label: "🎵 Music", value: "Music" },
  { label: "⚽ Sports", value: "Football" },
  { label: "😂 Comedy", value: "Comedy" },
  { label: "🎨 Arts", value: "Arts" },
  { label: "🏋️ Fitness", value: "Fitness" },
  { label: "🍽️ Food", value: "Food" },
  { label: "🏀 Basketball", value: "Basketball" },
  { label: "🎤 Spoken Word", value: "Spoken Word" },
];

export default function HeroSection() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchEvents = async () => {
      try {
        const snap = await getDocs(
          query(collectionGroup(db, "events"), orderBy("startDate", "asc"))
        );
        if (!isMounted) return;
        const data = snap.docs
          .map(doc => {
            const e = doc.data();
            return {
              id: doc.id,
              title: e.title,
              price: e.price,
              images: e.images || [],
              tenantId: e.tenantId,
              startDate: e.startDate,
              location: e.locationName || e.location || '',
              link: `/events/${e.tenantId}/${doc.id}`,
            };
          })
          .filter(e => e.title);
        setEvents(data);
      } catch (err) {
        console.error("Failed to fetch hero events", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchEvents();
    return () => { isMounted = false; };
  }, []);

  // Auto-rotate featured event
  useEffect(() => {
    if (events.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setActiveIdx(i => (i + 1) % Math.min(events.length, 5));
    }, 4000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [events]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate(`/search-events?q=${encodeURIComponent(searchQuery)}`);
    else navigate('/search-events');
  };

  const featured = events.slice(0, 5);
  const active = featured[activeIdx];

  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden bg-[#07071a]">

      {/* ── Animated background blobs ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#F32B81]/10 blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[#3ED2D1]/10 blur-[100px] animate-pulse-slow" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] rounded-full bg-[#F8D21F]/5 blur-[80px]" />
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
      </div>

      <div className="container mx-auto px-6 pt-32 pb-10 flex flex-col lg:flex-row gap-12 lg:gap-8 items-center flex-1 relative z-10 min-h-screen">

        {/* ── LEFT COLUMN ── */}
        <div className="w-full lg:w-1/2 flex flex-col gap-6 animate-slide-up">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-full border border-[#F32B81]/30 bg-[#F32B81]/10 text-[#F32B81] text-sm font-medium">
            <Zap className="w-3.5 h-3.5" />
            Kenya's Event Ticketing Platform
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight">
            <span className="text-white">Discover </span>
            <span className="text-[#F32B81]">&amp; Book</span>
            <br />
            <span className="text-[#3ED2D1]">Amazing </span>
            <span className="text-white">Events</span>
            <br />
            <span className="text-[#F8D21F]">Near You</span>
          </h1>

          <p className="text-white/60 text-lg max-w-md leading-relaxed">
            Concerts, sports, festivals, comedy nights — find and book with M-Pesa in seconds. Get your ticket PDF instantly.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="relative w-full max-w-lg">
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-3 focus-within:border-[#3ED2D1]/60 transition-colors">
              <Search className="w-5 h-5 text-white/50 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search events, artists, venues..."
                className="flex-1 bg-transparent text-white placeholder-white/40 focus:outline-none text-sm"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <button
                type="submit"
                className="bg-[#F32B81] hover:bg-[#E02575] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex-shrink-0"
              >
                Search
              </button>
            </div>
          </form>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2 max-w-lg">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => navigate(`/search-events?type=${encodeURIComponent(cat.value)}`)}
                className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all"
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            {[
              { icon: Smartphone, label: 'M-Pesa payments' },
              { icon: Ticket, label: 'Instant PDF ticket' },
              { icon: Shield, label: 'Secure checkout' },
            ].map(b => (
              <div key={b.label} className="flex items-center gap-2 text-xs text-white/50">
                <b.icon className="w-3.5 h-3.5 text-[#3ED2D1]" />
                {b.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT COLUMN — Event showcase ── */}
        <div className="w-full lg:w-1/2 relative flex flex-col gap-4" style={{ animationDelay: '200ms' }}>

          {/* Main featured card */}
          <div className="relative rounded-3xl overflow-hidden h-[340px] md:h-[420px] shadow-2xl">
            {loading ? (
              <div className="w-full h-full bg-white/5 animate-pulse flex items-center justify-center">
                <Ticket className="w-12 h-12 text-white/10" />
              </div>
            ) : active ? (
              <>
                <EventImg
                  src={active.images[0]}
                  alt={active.title}
                  title={active.title}
                  className="absolute inset-0 w-full h-full object-cover transition-all duration-700"
                  placeholderClassName="absolute inset-0 w-full h-full"
                />
                {/* gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                {/* Price badge */}
                <div className="absolute top-4 right-4 bg-[#F32B81] text-white text-sm font-bold px-3 py-1 rounded-full shadow-lg">
                  KES {active.price?.toLocaleString() ?? 'Free'}
                </div>

                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  {active.startDate && (
                    <div className="flex items-center gap-1 text-white/60 text-xs mb-2">
                      <Calendar className="w-3 h-3" />
                      {new Date(active.startDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {active.location && (
                        <><span className="mx-1">·</span><MapPin className="w-3 h-3" />{active.location}</>
                      )}
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-white mb-3 leading-tight">{active.title}</h3>
                  <Link
                    to={active.link}
                    className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-white/20 transition-colors"
                  >
                    Get Tickets <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Dot indicators */}
                {featured.length > 1 && (
                  <div className="absolute bottom-4 right-4 flex gap-1.5">
                    {featured.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveIdx(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeIdx ? 'bg-[#F32B81] w-4' : 'bg-white/30'}`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-white/5">
                <Ticket className="w-14 h-14 text-[#F32B81]/40" />
                <p className="text-white/40 text-sm">Events coming soon</p>
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {featured.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {featured.slice(0, 4).map((ev, i) => (
                <button
                  key={ev.id}
                  onClick={() => setActiveIdx(i)}
                  className={`relative rounded-xl overflow-hidden h-16 transition-all ${i === activeIdx ? 'ring-2 ring-[#F32B81] scale-105' : 'opacity-60 hover:opacity-90'}`}
                >
                  <EventImg
                    src={ev.images[0]}
                    alt={ev.title}
                    title={ev.title}
                    className="w-full h-full object-cover"
                    placeholderClassName="w-full h-full"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Browse all pill */}
          <Link
            to="/search-events"
            className="self-center flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors py-2"
          >
            Browse all events <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* ── Bottom stats bar ── */}
      <div className="relative z-10 border-t border-white/5 bg-white/[0.02] backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { value: '50K+', label: 'Tickets Sold' },
              { value: '200+', label: 'Events Listed' },
              { value: 'KES', label: 'M-Pesa Powered' },
            ].map(s => (
              <div key={s.label}>
                <div className="text-lg font-bold text-[#3ED2D1]">{s.value}</div>
                <div className="text-xs text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
