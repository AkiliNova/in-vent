import { Button } from "@/components/ui/button";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import { ArrowRight, Plane } from "lucide-react"; // optional, for icons

import "swiper/css";
import { useState } from "react";

const sampleEvents = [
  {
    title: "L-BOOGIE - Nairobi's Biggest Old Skool Party",
    price: 1500,
    images: [
      "https://admin.ticketsasa.com/storage//events/November2025/m54YUMyroe-1762477674.jpg",
      "https://admin.ticketsasa.com/storage//events/November2025/PbATxpujg1-1763508935.jpg",
      "https://admin.ticketsasa.com/storage//events/November2025/N3KuMZEHgc-1763713835.jpg",
    ],
    link: "/events/l-boogie-nairobis-biggest-old-skool-party-the-home-coming",
  },
  {
    title: "The Sound Of December - LIQUIDEEP",
    price: 3000,
    images: [
      "https://admin.ticketsasa.com/storage//events/December2025/x7MD54q83f-1765007077.jpg",
    ],
    link: "/events/the-sound-of-december-liquideep",
  },
];

export default function HeroSection() {
  const [activeTab, setActiveTab] = useState<"Events" | "Flights" | "Holidays">("Events");
  const [tripType, setTripType] = useState<"roundtrip" | "oneway">("roundtrip");
  const [passengers, setPassengers] = useState({ Adults: 1, Children: 0, Infants: 0 });
  const [passengerDialogOpen, setPassengerDialogOpen] = useState(false);
  const [flightClass, setFlightClass] = useState("Economy");

  const passengerSummary = `${passengers.Adults} Adult${passengers.Adults !== 1 ? "s" : ""}, ${passengers.Children} Child${passengers.Children !== 1 ? "ren" : ""}, ${passengers.Infants} Infant${passengers.Infants !== 1 ? "s" : ""}`;

  const incrementPassenger = (type: string) => {
    setPassengers(prev => ({ ...prev, [type]: prev[type] + 1 }));
  };

  const decrementPassenger = (type: string) => {
    setPassengers(prev => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
  };

  return (
    <section className="relative min-h-screen flex items-start md:items-center justify-center overflow-hidden py-16 md:py-32">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/hme_landing.png')" }}
      />
      <div className="absolute inset-0 bg-black/25" />

      <div className="container mx-auto px-4 md:px-6 relative z-10 flex flex-col lg:flex-row gap-10 lg:gap-16 items-start md:items-center">
        {/* LEFT: Search panel */}
        <div className="lg:w-1/2  p-6 md:p-10 rounded-3xl shadow-lg animate-slide-up">
          {/* Header */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-6 md:mb-8">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Now with offline-first architecture
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight mb-4 md:mb-6">
            Event check-in, <span className="gradient-text">reimagined</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-6 md:mb-10 max-w-full md:max-w-xl leading-relaxed">
            Self-register in 30 seconds. Scan in 3. Real-time dashboards, instant SMS reach, and zero clipboard chaos—all from a $40 tablet at the door.
          </p>

          {/* Tabs */}
          <div className="flex gap-2 mb-4 md:mb-6 flex-wrap">
            {["Events", "Flights", "Holidays"].map((tab) => (
              <button
                key={tab}
                className={`px-4 sm:px-6 py-2 rounded-t-lg font-medium ${
                  activeTab === tab
                    ? "border-t-4 border-white-700 gradient-text "
                    : "text-gray-700"
                }`}
                onClick={() => setActiveTab(tab as any)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Forms */}
          <form className="flex flex-col gap-3 md:flex-row md:gap-3 mb-4 md:mb-6 flex-wrap">
  {activeTab === "Events" && (
    <>
      <input
        type="text"
        placeholder="Event name"
        className="flex-1 p-3 border border-gray-300 rounded-lg bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
      />
      <input
        type="text"
        placeholder="City"
        className="flex-1 p-3 border border-gray-300 rounded-lg bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
      />
    </>
  )}

 {activeTab === "Flights" && (
  <div className="flex flex-col gap-3 md:gap-3 w-full">
    {/* Trip type */}
    <div className="relative">
      <button
        type="button"
        className="w-full p-3 border border-primary/50 rounded-lg bg-transparent flex justify-between items-center gradient-text focus:outline-none"
        onClick={() => setTripType(tripType === "roundtrip" ? "oneway" : "roundtrip")}
      >
        {tripType === "roundtrip" ? "Round Trip" : "One Way"}
        <svg
          className="w-4 h-4 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>

    {/* Passenger & Class */}
    <div className="relative">
      <button
        type="button"
        className="w-full p-3 border border-primary/50 rounded-lg bg-transparent flex justify-between items-center gradient-text focus:outline-none"
        onClick={() => setPassengerDialogOpen(true)}
      >
        {passengerSummary}
        <svg
          className="w-4 h-4 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {passengerDialogOpen && (
        <div className="absolute top-full left-0 w-full bg-white border border-primary/20 rounded-lg shadow-lg p-4 z-50">
          {["Adults", "Children", "Infants"].map((type) => (
            <div key={type} className="flex justify-between items-center mb-2">
              <span className="gradient-text font-semibold">{type}</span>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => decrementPassenger(type)}
                  className="px-2 py-1 bg-primary/20 rounded text-primary font-bold"
                >
                  -
                </button>
                <span className="font-semibold text-primary">{passengers[type]}</span>
                <button
                  onClick={() => incrementPassenger(type)}
                  className="px-2 py-1 bg-primary/20 rounded text-primary font-bold"
                >
                  +
                </button>
              </div>
            </div>
          ))}

          <div className="mt-3">
            <div className="mb-2 gradient-text font-semibold">Class</div>
            <div className="flex gap-2 flex-wrap">
              {["Economy", "Premium Economy", "Business", "First Class"].map((cls) => (
                <button
                  key={cls}
                  onClick={() => setFlightClass(cls)}
                  className={`px-3 py-1 rounded-lg font-semibold ${
                    flightClass === cls
                      ? "bg-gradient-to-r from-primary to-secondary text-white shadow-lg"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>
          </div>

          <button
            className="mt-4 w-full bg-primary text-primary-foreground font-semibold rounded-md py-2 hover:bg-primary/90"
            onClick={() => setPassengerDialogOpen(false)}
          >
            Done
          </button>
        </div>
      )}
    </div>

    {/* From / To */}
    <div className="flex flex-col md:flex-row gap-3">
      <div className="relative flex-1">
        <input
          type="text"
          placeholder="From"
          className="w-full p-3 border border-primary/50 rounded-lg bg-white gradient-text placeholder-gradient-text focus:outline-none pl-10"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3" />
        </svg>
      </div>
      <div className="relative flex-1">
        <input
          type="text"
          placeholder="To"
          className="w-full p-3 border border-primary/50 rounded-lg bg-white gradient-text placeholder-gradient-text focus:outline-none pl-10"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3" />
        </svg>
      </div>
    </div>

    {/* Departure / Return Dates */}
    <div className="flex flex-col md:flex-row gap-3">
      <input
        type="date"
        className="flex-1 p-3 border border-primary/50 rounded-lg bg-white gradient-text placeholder-gradient-text focus:outline-none"
      />
      {tripType === "roundtrip" && (
        <input
          type="date"
          className="flex-1 p-3 border border-primary/50 rounded-lg bg-white gradient-text placeholder-gradient-text focus:outline-none"
        />
      )}
    </div>
  </div>
)}




  {activeTab === "Holidays" && (
    <input
      type="text"
      placeholder="Location"
      className="flex-1 p-3 border border-gray-300 rounded-lg bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
    />
  )}

  <button
    type="submit"
    className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm ring-offset-background transition-all duration-300
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
               disabled:pointer-events-none disabled:opacity-50
               bg-primary text-primary-foreground font-semibold hover:bg-primary/90 hover:scale-105 hover:shadow-xl hover:shadow-primary/30
               active:scale-100 h-9 rounded-md px-3"
  >
    Find {activeTab}
  </button>
</form>



          {/* Footer info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            {["No credit card", "GDPR compliant", "Setup in minutes"].map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-success flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Event carousel */}
        <div className="lg:w-1/2 w-full mt-8 lg:mt-0 relative">
          <Swiper
            modules={[Autoplay]}
            autoplay={{ delay: 3500, disableOnInteraction: false }}
            loop
            className="rounded-3xl overflow-hidden shadow-xl"
          >
            {sampleEvents.map((event, idx) =>
              event.images.map((img, i) => (
                <SwiperSlide key={`${idx}-${i}`}>
                  <div className="relative">
                    <img
                      src={img}
                      alt={event.title}
                      className="w-full h-80 sm:h-96 md:h-[28rem] object-cover rounded-3xl"
                    />

                    {/* Price tag */}
                    <div className="absolute top-4 right-4 bg-red-700 text-white px-4 py-2 rounded-xl font-bold shadow-lg">
                      KES {event.price.toLocaleString()}
                    </div>

                    {/* Overlay details */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 md:p-6 rounded-b-3xl">
                      <h3 className="text-md sm:text-lg md:text-xl font-bold text-white">{event.title}</h3>
                      <a
                        href={event.link}
                        className="inline-block mt-2 px-3 py-1 text-sm text-white border border-white rounded hover:bg-white hover:text-red-700"
                      >
                        View
                      </a>
                    </div>
                  </div>
                </SwiperSlide>
              ))
            )}
          </Swiper>
        </div>
      </div>
    </section>
  );
}
