"use client";

import React, { useEffect, useState } from "react";
import {
  collectionGroup,
  getDocs,
  orderBy,
  query,
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
            link: `/events/${e.tenantId}/${doc.id}`,
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
            <a
              key={event.id}
              href={event.link}
              className="
                group relative block rounded-2xl overflow-hidden
                shadow-lg hover:shadow-2xl
                transition-all duration-300
                h-96 md:h-[26rem] lg:h-[28rem]
                focus:outline-none focus:ring-4 focus:ring-black/30
              "
            >
              {/* Background Image */}
              <img
                src={event.image}
                alt={event.title}
                className="
                  absolute inset-0 w-full h-full object-cover
                  transition-transform duration-500
                  group-hover:scale-110
                "
              />

              {/* Gradient Overlay */}
              <div className="
                absolute inset-0
                bg-gradient-to-t from-black/80 via-black/40 to-transparent
                opacity-80 group-hover:opacity-90
                transition-opacity duration-300
              " />

              {/* Content */}
              <div className="absolute inset-0 p-8 flex flex-col justify-end gap-4">
                <h3 className="text-xl md:text-2xl font-bold text-white drop-shadow-lg">
                  {event.title}
                </h3>

                <span className="text-2xl font-bold text-white drop-shadow-lg">
                  KES {event.price.toLocaleString()}
                </span>

                <span className="text-sm text-white/90 font-medium">
                  Tap to view details →
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
