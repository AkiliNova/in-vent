"use client";

import React, { useEffect, useState } from "react";
import {
  collectionGroup,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase";

interface Event {
  id: string;
  title: string;
  price: number;
  image: string;
  link: string;
  startDate: string;
}

export default function UpcomingEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const q = query(
          collectionGroup(db, "events"),
          where("startDate", ">=", new Date().toISOString()),
          orderBy("startDate", "asc")
        );

        const snapshot = await getDocs(q);

        const data = snapshot.docs.map(doc => {
          const e = doc.data();

          return {
            id: doc.id,
            title: e.title,
            price: e.price,
            image: e.images?.[0],
            startDate: e.startDate,
            tenantId: e.tenantId,               // include tenantId
            link: `/events/${e.tenantId}/${doc.id}`, // dynamic event page
          };
        });

        setEvents(data);
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
      <section className="py-16 text-center">
        Loading upcoming events...
      </section>
    );
  }

  if (!events.length) {
    return null;
  }

  return (
    <section className="py-16 border border-gray-300 rounded-xl">
      <div className="container mx-auto px-4 md:px-6">
        <h2 className="text-3xl md:text-4xl font-bold mb-8">
          Upcoming Events
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {events.map(event => (
            <div
              key={event.id}
              className="relative rounded-2xl overflow-hidden shadow-lg group hover:shadow-2xl transition-all duration-300"
            >
              {/* Event image */}
              <img
                src={event.image}
                alt={event.title}
                className="w-full h-64 object-cover transition-transform duration-500 group-hover:scale-105"
              />

              {/* Event details */}
              <div className="p-4 flex flex-col gap-2">
                <h3 className="text-lg md:text-xl font-semibold">
                  {event.title}
                </h3>

                <span className="text-primary font-bold">
                  KES {event.price.toLocaleString()}
                </span>

                <a
                  href={event.link}
                  className="mt-2 inline-flex items-center justify-center h-10 rounded-md px-4
                    bg-primary text-primary-foreground font-semibold
                    hover:bg-primary/90 hover:scale-105 transition"
                >
                  Book Now
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
