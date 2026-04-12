"use client";

import { useEffect, useState } from "react";
import {
  collectionGroup, getDocs, orderBy, query, limit,
} from "firebase/firestore";
import { db } from "@/firebase/firebase";
import { Calendar, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import EventImg from "@/components/EventImg";

const MAX_EVENTS = 8;

interface Event {
  id: string;
  title: string;
  price: number;
  image: string;
  link: string;
  startDate: string;
  isPast: boolean;
}

function dateLabel(startDate: string): string {
  const now  = new Date();
  const date = new Date(startDate);
  const diffMs   = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0)  return "Recently Past";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7)  return `In ${diffDays} days`;
  if (diffDays <= 30) return `In ${Math.ceil(diffDays / 7)} weeks`;
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function mapDoc(doc: any): Event {
  const e = doc.data();
  const now = new Date().toISOString();
  return {
    id:        doc.id,
    title:     e.title,
    price:     e.price,
    image:     e.images?.[0] ?? "",
    startDate: e.startDate,
    link:      `/events/${e.tenantId}/${doc.id}`,
    isPast:    e.startDate < now,
  };
}

export default function UpcomingEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        // Single query — same index that already existed (orderBy startDate asc)
        // Fetch enough to find MAX_EVENTS with images after client-side filtering
        const snap = await getDocs(
          query(
            collectionGroup(db, "events"),
            orderBy("startDate", "asc"),
            limit(100)
          )
        );

        const now = new Date().toISOString();
        const all = snap.docs.map(mapDoc).filter(e => e.image);

        // Upcoming: already asc ordered, soonest first
        const upcoming = all.filter(e => !e.isPast);

        // Recent past: reverse so most-recently-past comes first
        const recentPast = all.filter(e => e.isPast).reverse();

        // Upcoming first, fill remainder with recent past
        const combined = [...upcoming, ...recentPast].slice(0, MAX_EVENTS);

        setEvents(combined);
      } catch (error) {
        console.error("Error loading upcoming events", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  if (loading) {
    return (
      <section className="py-16">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-80 rounded-2xl bg-secondary animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!events.length) return null;

  const upcomingCount = events.filter(e => !e.isPast).length;

  return (
    <section className="py-20 relative">
      <div className="container mx-auto px-6">
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="text-primary font-medium text-sm uppercase tracking-wider">
              {upcomingCount > 0 ? `${upcomingCount} upcoming` : "Recently featured"}
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mt-2">
              {upcomingCount > 0 ? "Upcoming Events" : "Latest Events"}
            </h2>
          </div>
          <Button variant="heroOutline" size="sm" asChild>
            <Link to="/search-events" className="flex items-center gap-2">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {events.map(event => (
            <Link
              key={event.id}
              to={event.link}
              className="group relative block rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 h-80 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {/* Background Image */}
              <EventImg
                src={event.image}
                alt={event.title}
                title={event.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                placeholderClassName="absolute inset-0 w-full h-full"
              />

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-300" />

              {/* Top badges */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                {/* Date label */}
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  event.isPast
                    ? "bg-white/20 text-white/80"
                    : dateLabel(event.startDate) === "Today" || dateLabel(event.startDate) === "Tomorrow"
                      ? "bg-primary text-white"
                      : "bg-black/50 text-white/90"
                }`}>
                  {dateLabel(event.startDate)}
                </span>
                {/* Price badge */}
                <span className="bg-[#F32B81] text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  {event.price > 0 ? `KES ${event.price.toLocaleString()}` : "Free"}
                </span>
              </div>

              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-1">
                {event.startDate && (
                  <span className="flex items-center gap-1 text-white/60 text-xs">
                    <Calendar className="w-3 h-3" />
                    {new Date(event.startDate).toLocaleDateString("en-KE", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                )}
                <h3 className="text-lg font-bold text-white leading-tight line-clamp-2">
                  {event.title}
                </h3>
                <span className="text-primary text-xs font-semibold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  View details →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
