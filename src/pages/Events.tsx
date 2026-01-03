"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { collectionGroup, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import Navigation from "@/components/Navigation";

interface Event {
  id: string;
  title: string;
  price: number;
  image: string;
  startDate: string;
  location: string;
  city?: string;
  eventType?: string;
  link: string;
}

export default function EventsPage() {
  const locationHook = useLocation();
  const searchParams = new URLSearchParams(locationHook.search);

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [location, setLocation] = useState("");
  const [city, setCity] = useState(searchParams.get("city") || "");
  const [eventType, setEventType] = useState(searchParams.get("type") || "");

  // Fetch all events
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const q = query(collectionGroup(db, "events"), orderBy("startDate", "asc"));
        const snapshot = await getDocs(q);

        const data: Event[] = snapshot.docs.map(doc => {
          const e = doc.data();
          return {
            id: doc.id,
            title: e.title,
            price: e.price,
            image: e.images?.[0] || "",
            startDate: e.startDate,
            location: e.location || "Unknown",
            city: e.city || "",
            eventType: e.eventType || "",
            link: `/events/${e.tenantId}/${doc.id}`,
          };
        });

        setEvents(data);
      } catch (err) {
        console.error("Error loading events", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  // Unique dropdown options
  const locations = useMemo(
    () => Array.from(new Set(events.map(e => e.location).filter(loc => loc && loc !== "Unknown"))).sort(),
    [events]
  );
  const cities = useMemo(
    () => Array.from(new Set(events.map(e => e.city).filter(Boolean))).sort(),
    [events]
  );
  const eventTypes = useMemo(
    () => Array.from(new Set(events.map(e => e.eventType).filter(Boolean))).sort(),
    [events]
  );

  // Filtering logic
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (search && !event.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (maxPrice !== null && event.price > maxPrice) return false;
      if (fromDate && event.startDate < fromDate) return false;
      if (location && event.location !== location) return false;
      if (city && event.city !== city) return false;
      if (eventType && event.eventType !== eventType) return false;
      return true;
    });
  }, [events, search, maxPrice, fromDate, location, city, eventType]);

  // Split into upcoming and past
  const today = new Date().toISOString().split("T")[0];
  const upcomingEvents = filteredEvents.filter(e => e.startDate >= today);
  const pastEvents = filteredEvents.filter(e => e.startDate < today);

  if (loading) {
    return <div className="py-32 text-center text-muted-foreground">Loading events…</div>;
  }

  const renderEventGrid = (eventsList: Event[]) => {
    if (!eventsList.length)
      return <div className="col-span-full text-center text-muted-foreground">No events found.</div>;

    return eventsList.map(event => (
      <a
        key={event.id}
        href={event.link}
        className="group relative rounded-2xl overflow-hidden border border-border hover:shadow-lg transition h-96 md:h-[26rem]"
      >
        <img
          src={event.image}
          alt={event.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        <div className="absolute inset-0 p-6 flex flex-col justify-end gap-2">
          <h3 className="text-lg font-semibold">{event.title}</h3>
          <span className="font-medium">KES {event.price.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">
            {event.location}{event.city ? `, ${event.city}` : ""}
          </span>
          {event.eventType && <span className="text-sm text-muted-foreground">Type: {event.eventType}</span>}
        </div>
      </a>
    ));
  };

  return (
    <>
      <Navigation />

      <section className="container mx-auto px-4 pt-28 pb-16">
        {/* Search bar */}
        <div className="mb-10">
          <input
            type="text"
            placeholder="Search events…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-14 px-5 rounded-xl bg-background text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10">
          {/* Sidebar Filters */}
          <aside className="rounded-xl border border-border p-6 space-y-8 h-fit">
            {/* Location */}
            <div>
              <h3 className="font-semibold mb-3">Location</h3>
              <select value={location} onChange={e => setLocation(e.target.value)}
                className="w-full h-11 px-3 rounded-md bg-background border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">All locations</option>
                {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
              </select>
            </div>

            {/* City */}
            <div>
              <h3 className="font-semibold mb-3">City</h3>
              <select value={city} onChange={e => setCity(e.target.value)}
                className="w-full h-11 px-3 rounded-md bg-background border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">All cities</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Event Type */}
            <div>
              <h3 className="font-semibold mb-3">Event Type</h3>
              <select value={eventType} onChange={e => setEventType(e.target.value)}
                className="w-full h-11 px-3 rounded-md bg-background border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">All types</option>
                {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Price */}
            <div>
              <h3 className="font-semibold mb-3">Max price</h3>
              <input type="range" min={0} max={50000} step={500} onChange={e => setMaxPrice(Number(e.target.value))} className="w-full" />
              <p className="text-sm mt-2 text-muted-foreground">
                {maxPrice ? `Up to KES ${maxPrice.toLocaleString()}` : "Any price"}
              </p>
            </div>

            {/* Date */}
            <div>
              <h3 className="font-semibold mb-3">From date</h3>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="w-full h-11 px-3 rounded-md bg-background border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            {/* Clear Filters */}
            <button onClick={() => { setSearch(""); setMaxPrice(null); setFromDate(""); setLocation(""); setCity(""); setEventType(""); }}
              className="text-sm underline text-muted-foreground">Clear filters</button>
          </aside>

          {/* Events Grid */}
          <div className="space-y-12">
            <div>
              <h2 className="text-2xl font-bold mb-4">Upcoming Events</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                {renderEventGrid(upcomingEvents)}
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-4">Past Events</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                {renderEventGrid(pastEvents)}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
