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
  const [searchCategory, setSearchCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const passengerSummary = `${passengers.Adults} Adult${passengers.Adults !== 1 ? "s" : ""}, ${passengers.Children} Child${passengers.Children !== 1 ? "ren" : ""}, ${passengers.Infants} Infant${passengers.Infants !== 1 ? "s" : ""}`;

  const incrementPassenger = (type: string) => {
    setPassengers(prev => ({ ...prev, [type]: prev[type] + 1 }));
  };

  const decrementPassenger = (type: string) => {
    setPassengers(prev => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
  };

  const handleSearch = () => {
    // Add your search logic here
    console.log("Search:", { searchCategory, searchQuery });
  };

  return (
    <section className="relative min-h-screen flex items-start md:items-center justify-center overflow-hidden py-16 md:py-32">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/hme_landing.png')" }}
      />
      <div className="absolute inset-0 bg-black/25" />

      <div className="container mx-auto px-4 md:px-6 relative z-10 flex flex-col lg:flex-row gap-10 lg:gap-16 items-start md:items-center">
        {/* LEFT: Search panel */}
        <div className="lg:w-1/2  p-6 md:p-10 rounded-3xl shadow-lg animate-slide-up">
          {/* Header */}
          {/* <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold mb-6 md:mb-8">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Now with offline-first architecture
          </div> */}

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4 md:mb-6">
            <span className="inline-block">
              <span className="text-[#F5658C] rotate-[-1deg] inline-block">Discover </span>{' '}
              <span className="text-[#3ED2D1]">the Best </span>{' '}

              <span className="text-[#F8D21F]">Local Events</span>{' '}
            </span>
            <span className="text-black inline-block ">and Things to do</span>
          </h1>



          <p className="text-lg sm:text-xl font-bold text-black mb-6 md:mb-10 max-w-full md:max-w-xl leading-relaxed">
            Search Events, Artist Performances, Festivals, and More!
          </p>


<div className="w-full flex flex-col md:flex-row items-center gap-3 p-4 
     bg-white border border-gray-300 rounded-full shadow-sm">


  <input
    type="text"
    placeholder="Search Events and More!.."
    className="flex-1 p-3 bg-transparent text-black placeholder-gray-500 
               focus:outline-none"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
  />

  <button
    type="submit"
    className="px-6 py-3 bg-black text-white font-semibold rounded-full
               hover:bg-gray-900 transition"
    onClick={handleSearch}
  >
    Search
  </button>
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
