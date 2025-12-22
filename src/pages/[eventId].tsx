"use client";

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "@/firebase/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { MapPin, Calendar, Share2 } from "lucide-react";

interface EventData {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  locationName: string;
  locationMapLink: string;
  host: string;
  price: number;
  images: string[];
  tenantId: string;
  packages?: { name: string; price: number }[];
}

interface OtherEvent {
  id: string;
  title: string;
  price: number;
  image: string;
  startDate: string;
}

export default function EventPage() {
  const { tenantId, eventId } = useParams<{ tenantId: string; eventId: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [otherEvents, setOtherEvents] = useState<OtherEvent[]>([]);
  const [ticketQuantities, setTicketQuantities] = useState<{ [key: string]: number }>({});
  const [formData, setFormData] = useState({ fullName: "", email: "", phone: "", agreeTerms: false });

  // ------------------ Iframe Modal ------------------
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const API_URL = "https://tikooh.akilinova.tech/payment/create_payment.php";

  // ------------------ Fetch Event ------------------
  useEffect(() => {
    if (!tenantId || !eventId) return;

    const fetchEvent = async () => {
      try {
        const eventRef = doc(db, "tenants", tenantId, "events", eventId);
        const snap = await getDoc(eventRef);

        if (snap.exists()) {
          const data = snap.data() as EventData;
          setEvent(data);

          if (data.packages) {
            const initialQuantities: { [key: string]: number } = {};
            data.packages.forEach(pkg => (initialQuantities[pkg.name] = 0));
            setTicketQuantities(initialQuantities);
          }
        } else {
          toast({ title: "Event not found", variant: "destructive" });
        }
      } catch (err: any) {
        console.error(err);
        toast({ title: "Failed to load event", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [tenantId, eventId]);

  // ------------------ Fetch Other Events ------------------
  useEffect(() => {
    if (!tenantId) return;

    const fetchOtherEvents = async () => {
      try {
        const eventsRef = collection(db, "tenants", tenantId, "events");
        const q = query(eventsRef, where("startDate", ">=", new Date().toISOString()));
        const snapshot = await getDocs(q);
        const data = snapshot.docs
          .filter(doc => doc.id !== eventId)
          .map(doc => {
            const e = doc.data();
            return {
              id: doc.id,
              title: e.title,
              price: e.price,
              image: e.images?.[0] || "",
              startDate: e.startDate,
            };
          });
        setOtherEvents(data);
      } catch (err: any) {
        console.error(err);
      }
    };

    fetchOtherEvents();
  }, [tenantId, eventId]);

  if (loading) return <p className="text-center mt-24">Loading event...</p>;
  if (!event) return <p className="text-center mt-24">Event not found.</p>;

  // ------------------ Handlers ------------------
  const handleQuantityChange = (pkgName: string, delta: number) => {
    setTicketQuantities(prev => ({
      ...prev,
      [pkgName]: Math.max(0, (prev[pkgName] || 0) + delta),
    }));
  };

  const handleFormChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleBookTicket = async () => {
    if (!event) return;

    if (!formData.agreeTerms) {
      toast({ title: "Accept terms first", variant: "destructive" });
      return;
    }

    const totalAmount =
      event.packages?.reduce((sum, pkg) => {
        const qty = ticketQuantities[pkg.name] || 0;
        return sum + qty * pkg.price;
      }, 0) || event.price;

    if (!totalAmount) {
      toast({ title: "Select at least one ticket", variant: "destructive" });
      return;
    }

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: totalAmount,
          description: `Tickets for ${event.title}`,
          email: formData.email,
          phone: formData.phone,
          first_name: formData.fullName.split(" ")[0],
          last_name: formData.fullName.split(" ")[1] || "",
          callback_url: `${window.location.origin}/payment-response`
        })
      });

      const data = await res.json();

      if (!res.ok || !data.iframe_url) {
        throw new Error(data.message || "Payment initialization failed");
      }

      toast({ title: "Opening payment..." });
      setIframeUrl(data.iframe_url);
      setIframeLoading(true);
      setShowPaymentModal(true);

    } catch (err: any) {
      console.error(err);
      toast({
        title: "Payment failed",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // ------------------ Render ------------------
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 px-6 container mx-auto max-w-7xl">

        {/* Event Details */}
        <div className="flex flex-col lg:flex-row gap-8 mb-12">
          <div className="flex-1 space-y-6">
            {event.images?.[0] && (
              <div className="w-full rounded-xl bg-gray-100 overflow-hidden">
                <img src={event.images[0]} alt={event.title} className="w-full h-auto object-contain" />
              </div>
            )}

            <div className="flex gap-3">
              <Button size="sm"><Share2 className="w-4 h-4" /> Share</Button>
              <Button size="sm">Facebook</Button>
              <Button size="sm">Twitter</Button>
            </div>

            <p className="text-muted-foreground font-semibold">Hosted by {event.host}</p>
            <p>{event.description}</p>
            <div className="flex gap-4">
              <Calendar /> <span>{new Date(event.startDate).toLocaleString()} - {new Date(event.endDate).toLocaleString()}</span>
            </div>
          </div>

          {/* Booking Card */}
          <div className="w-full lg:w-[350px] space-y-6">
            <h2 className="text-2xl font-bold">{event.title}</h2>
            <div className="flex items-center gap-2"><MapPin /> <span>{event.locationName}</span></div>

            <div className="p-6 rounded-xl shadow-md space-y-4 border border-white">
              <p className="font-semibold">Get your tickets for "{event.title}"</p>

              {event.packages?.map(pkg => (
                <div key={pkg.name} className="flex justify-between items-center">
                  <span>{pkg.name} - KES {pkg.price.toLocaleString()}</span>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleQuantityChange(pkg.name, -1)}>-</Button>
                    <span>{ticketQuantities[pkg.name]}</span>
                    <Button size="sm" onClick={() => handleQuantityChange(pkg.name, 1)}>+</Button>
                  </div>
                </div>
              ))}

              <div className="space-y-2">
                <div>
                  <Label>Full Name</Label>
                  <Input value={formData.fullName} onChange={e => handleFormChange("fullName", e.target.value)} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={formData.email} onChange={e => handleFormChange("email", e.target.value)} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={formData.phone} onChange={e => handleFormChange("phone", e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={formData.agreeTerms} onCheckedChange={checked => handleFormChange("agreeTerms", checked as boolean)} />
                  <span className="text-sm">I agree to Terms & Privacy</span>
                </div>
              </div>

              <Button variant="hero" onClick={handleBookTicket}>Book Ticket</Button>
            </div>
          </div>
        </div>

        {/* Other Events */}
        {otherEvents.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold mb-4">Other Events</h3>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {otherEvents.map(ev => (
                <div key={ev.id} className="min-w-[250px] bg-white rounded-xl shadow-md p-4">
                  <img src={ev.image} alt={ev.title} className="w-full h-40 object-cover rounded-xl mb-2" />
                  <h4 className="font-semibold">{ev.title}</h4>
                  <p className="text-primary font-bold">KES {ev.price.toLocaleString()}</p>
                  <a href={`/events/${tenantId}/${ev.id}`} className="text-sm text-primary hover:underline">View Event</a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* -------------------- Payment Modal -------------------- */}
        {showPaymentModal && iframeUrl && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-3xl h-[80vh] rounded-xl overflow-hidden relative shadow-lg">
              
              {/* Close button */}
              <button
                onClick={() => setShowPaymentModal(false)}
                className="absolute top-3 right-3 text-gray-700 hover:text-gray-900 z-10 text-xl font-bold"
              >
                ✕
              </button>

              {/* Loader */}
              {iframeLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-2"></div>
                  <span>Loading payment...</span>
                </div>
              )}

              {/* Iframe */}
              <iframe
                src={iframeUrl}
                className="w-full h-full"
                onLoad={() => setIframeLoading(false)}
                title="Pesapal Payment"
              />
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
