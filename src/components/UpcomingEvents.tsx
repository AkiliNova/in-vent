// components/UpcomingEvents.tsx
import React from "react";
import { mockEvents } from "@/data/mockEvents";

interface Event {
  title: string;
  price: number;
  image: string;
  link: string;
}

interface UpcomingEventsProps {
  events: Event[];
}

export default function UpcomingEvents({ events }: UpcomingEventsProps) {
  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4 md:px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
          Upcoming Events
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {events.map((event, idx) => (
            <div
              key={idx}
              className="relative rounded-2xl overflow-hidden shadow-lg group hover:shadow-2xl transition-all duration-300 bg-white"
            >
              {/* Event image */}
              <img
                src={event.image}
                alt={event.title}
                className="w-full h-64 object-cover transition-transform duration-500 group-hover:scale-105"
              />

              {/* Event details overlay */}
              <div className="p-4 flex flex-col gap-2">
                <h3 className="text-lg md:text-xl font-semibold text-foreground">
                  {event.title}
                </h3>
                <span className="text-primary font-bold">
                  KES {event.price.toLocaleString()}
                </span>

                {/* Sell Ticket button */}
                <a
                  href={event.link}
                  className="mt-2 inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm ring-offset-background transition-all duration-300
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                     disabled:pointer-events-none disabled:opacity-50
                     bg-primary text-primary-foreground font-semibold hover:bg-primary/90 hover:scale-105 hover:shadow-xl hover:shadow-primary/30
                     active:scale-100 h-10 rounded-md px-4"
                >
                  Sell Ticket
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
