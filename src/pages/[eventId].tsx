"use client";

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "@/firebase/firebase";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, increment, addDoc, serverTimestamp } from "firebase/firestore";
import Navigation from "@/components/Navigation";
import EventImg from "@/components/EventImg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { MapPin, Calendar, Share2, Ticket, Tag, CheckCircle, X, BellRing } from "lucide-react";

interface TicketTier {
  name: string;
  price: number;
  capacity: number;
  sold: number;
  description?: string;
}

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
  ticketTiers?: TicketTier[];
}

interface OtherEvent {
  id: string;
  title: string;
  price: number;
  image: string;
  startDate: string;
}

const API_URL = "https://tikooh.akilinova.tech/payment/create_payment.php";

export default function EventPage() {
  const { tenantId, eventId } = useParams<{ tenantId: string; eventId: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [otherEvents, setOtherEvents] = useState<OtherEvent[]>([]);
  const [ticketQuantities, setTicketQuantities] = useState<{ [key: string]: number }>({});
  const [formData, setFormData] = useState({ fullName: "", email: "", phone: "", agreeTerms: false });
  const [isBooking, setIsBooking] = useState(false);
  const [waitlistTier, setWaitlistTier] = useState<string | null>(null);
  const [waitlistForm, setWaitlistForm] = useState({ name: "", email: "", phone: "" });
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountType: "percent" | "fixed"; discountValue: number; id: string } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Fetch event
  useEffect(() => {
    if (!tenantId || !eventId) return;
    const fetchEvent = async () => {
      try {
        const snap = await getDoc(doc(db, "tenants", tenantId, "events", eventId));
        if (snap.exists()) {
          const data = snap.data() as EventData;
          setEvent(data);
          if (data.ticketTiers) {
            const init: { [key: string]: number } = {};
            data.ticketTiers.forEach(t => (init[t.name] = 0));
            setTicketQuantities(init);
          }
        } else {
          toast({ title: "Event not found", variant: "destructive" });
        }
      } catch (err: any) {
        toast({ title: "Failed to load event", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [tenantId, eventId]);

  // Fetch other events
  useEffect(() => {
    if (!tenantId) return;
    const fetch = async () => {
      try {
        const q = query(collection(db, "tenants", tenantId, "events"), where("startDate", ">=", new Date().toISOString()));
        const snapshot = await getDocs(q);
        setOtherEvents(
          snapshot.docs
            .filter(d => d.id !== eventId)
            .map(d => ({ id: d.id, title: d.data().title, price: d.data().price, image: d.data().images?.[0] || "", startDate: d.data().startDate }))
        );
      } catch (_) {}
    };
    fetch();
  }, [tenantId, eventId]);

  if (loading) return <p className="text-center mt-24 text-foreground">Loading event...</p>;
  if (!event) return <p className="text-center mt-24 text-foreground">Event not found.</p>;

  const handleQuantityChange = (tierName: string, delta: number, tier: TicketTier) => {
    const available = tier.capacity - (tier.sold || 0);
    setTicketQuantities(prev => ({
      ...prev,
      [tierName]: Math.max(0, Math.min(available, (prev[tierName] || 0) + delta)),
    }));
  };

  const subtotal = event.ticketTiers?.reduce((sum, tier) => {
    return sum + (ticketQuantities[tier.name] || 0) * tier.price;
  }, 0) ?? 0;

  const discount = promoApplied
    ? promoApplied.discountType === "percent"
      ? Math.round(subtotal * promoApplied.discountValue / 100)
      : Math.min(promoApplied.discountValue, subtotal)
    : 0;

  const totalAmount = Math.max(0, subtotal - discount);

  const selectedTiers = event.ticketTiers?.filter(t => (ticketQuantities[t.name] || 0) > 0) ?? [];

  const handleBookTicket = async () => {
    if (!formData.fullName.trim() || !formData.email.trim() || !formData.phone.trim()) {
      toast({ title: "Fill in all fields", variant: "destructive" });
      return;
    }
    if (!formData.agreeTerms) {
      toast({ title: "Accept terms first", variant: "destructive" });
      return;
    }
    if (totalAmount === 0 && selectedTiers.length === 0) {
      toast({ title: "Select at least one ticket", variant: "destructive" });
      return;
    }

    setIsBooking(true);
    try {
      // Build a description of selected tiers
      const tiersSummary = selectedTiers.map(t => `${ticketQuantities[t.name]}x ${t.name}`).join(", ");
      const description = `${tiersSummary} – ${event.title}`;

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: totalAmount,
          description,
          email: formData.email,
          phone: formData.phone,
          first_name: formData.fullName.split(" ")[0],
          last_name: formData.fullName.split(" ").slice(1).join(" ") || "",
          callback_url: `${window.location.origin}/payment-response`,
          // Pass metadata for the confirmation page
          metadata: JSON.stringify({
            tenantId,
            eventId,
            eventTitle: event.title,
            buyerName: formData.fullName,
            buyerEmail: formData.email,
            buyerPhone: formData.phone,
            tiers: selectedTiers.map(t => ({ name: t.name, qty: ticketQuantities[t.name], price: t.price })),
          }),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.iframe_url) throw new Error(data.message || "Payment init failed");

      // Increment promo code usage
      if (promoApplied) {
        await updateDoc(doc(db, `tenants/${tenantId}/promo_codes`, promoApplied.id), { usedCount: increment(1) });
      }

      // Store metadata locally so payment-response page can retrieve it
      localStorage.setItem("pending_payment_meta", JSON.stringify({
        tenantId,
        eventId,
        eventTitle: event.title,
        buyerName: formData.fullName,
        buyerEmail: formData.email,
        buyerPhone: formData.phone,
        tiers: selectedTiers.map(t => ({ name: t.name, qty: ticketQuantities[t.name], price: t.price })),
      }));

      setIframeUrl(data.iframe_url);
      setIframeLoading(true);
      setShowPaymentModal(true);
    } catch (err: any) {
      toast({ title: "Payment failed", description: err.message, variant: "destructive" });
    } finally {
      setIsBooking(false);
    }
  };

  const joinWaitlist = async () => {
    if (!waitlistForm.name || !waitlistForm.email || !tenantId || !eventId || !waitlistTier) return;
    setJoiningWaitlist(true);
    try {
      await addDoc(collection(db, `tenants/${tenantId}/events/${eventId}/waitlist`), {
        tierName: waitlistTier,
        name: waitlistForm.name,
        email: waitlistForm.email,
        phone: waitlistForm.phone,
        joinedAt: serverTimestamp(),
      });
      toast({ title: "You're on the waitlist!", description: "We'll notify you if a spot opens up." });
      setWaitlistTier(null);
      setWaitlistForm({ name: "", email: "", phone: "" });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setJoiningWaitlist(false);
    }
  };

  const applyPromoCode = async () => {
    if (!promoCode.trim() || !tenantId) return;
    setPromoLoading(true);
    try {
      const codesRef = collection(db, `tenants/${tenantId}/promo_codes`);
      const q = query(codesRef, where("code", "==", promoCode.trim().toUpperCase()));
      const snap = await getDocs(q);

      if (snap.empty) {
        toast({ title: "Invalid promo code", variant: "destructive" });
        return;
      }

      const codeDoc = snap.docs[0];
      const data = codeDoc.data();

      if (!data.active) { toast({ title: "This code is no longer active", variant: "destructive" }); return; }
      if (data.expiresAt && new Date(data.expiresAt) < new Date()) { toast({ title: "This code has expired", variant: "destructive" }); return; }
      if (data.usedCount >= data.maxUses) { toast({ title: "This code has reached its usage limit", variant: "destructive" }); return; }

      setPromoApplied({ code: data.code, discountType: data.discountType, discountValue: data.discountValue, id: codeDoc.id });
      toast({ title: `Promo code applied! ${data.discountType === "percent" ? `${data.discountValue}% off` : `KES ${data.discountValue} off`}` });
      setPromoCode("");
    } catch (err: any) {
      toast({ title: "Failed to validate code", description: err.message, variant: "destructive" });
    } finally {
      setPromoLoading(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: event.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied!" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 px-4 md:px-6 container mx-auto max-w-7xl pb-12">

        <div className="flex flex-col lg:flex-row gap-8 mb-12">
          {/* Left — event info */}
          <div className="flex-1 space-y-6">
            {event.images?.[0] && (
              <div className="w-full rounded-2xl overflow-hidden">
                <EventImg src={event.images[0]} alt={event.title} title={event.title} className="w-full object-cover max-h-[500px] w-full" placeholderClassName="w-full h-64" />
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={handleShare}><Share2 className="w-4 h-4 mr-1" /> Share</Button>
            </div>

            <h1 className="text-3xl font-bold text-foreground">{event.title}</h1>
            <p className="text-muted-foreground font-medium">Hosted by {event.host}</p>

            <div className="flex items-center gap-3 text-muted-foreground">
              <Calendar className="w-5 h-5 flex-shrink-0 text-primary" />
              <span>{new Date(event.startDate).toLocaleString()}{event.endDate ? ` — ${new Date(event.endDate).toLocaleString()}` : ''}</span>
            </div>

            <div className="flex items-center gap-3 text-muted-foreground">
              <MapPin className="w-5 h-5 flex-shrink-0 text-primary" />
              <span>{event.locationName}</span>
              {event.locationMapLink && (
                <a href={event.locationMapLink} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm">View on Map</a>
              )}
            </div>

            <p className="leading-relaxed">{event.description}</p>
          </div>

          {/* Right — booking card */}
          <div className="w-full lg:w-[380px] space-y-4">
            <div className="glass rounded-2xl p-6 space-y-5 border border-border sticky top-24">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">Get Tickets</h2>
              </div>

              {/* Ticket tiers */}
              {event.ticketTiers?.length ? (
                <div className="space-y-3">
                  {event.ticketTiers.map(tier => {
                    const available = tier.capacity - (tier.sold || 0);
                    const soldOut = available <= 0;
                    return (
                      <div key={tier.name} className={`rounded-xl border p-3 ${soldOut ? 'opacity-50 border-border' : 'border-border hover:border-primary/50 transition-colors'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{tier.name}</p>
                            {tier.description && <p className="text-xs text-muted-foreground">{tier.description}</p>}
                            <p className="text-primary font-bold mt-1">KES {tier.price.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">
                              {soldOut ? 'Sold Out' : `${available} left`}
                            </p>
                          </div>
                          {!soldOut && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleQuantityChange(tier.name, -1, tier)}>−</Button>
                              <span className="w-5 text-center text-sm font-medium">{ticketQuantities[tier.name] || 0}</span>
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleQuantityChange(tier.name, 1, tier)}>+</Button>
                            </div>
                          )}
                          {soldOut && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs flex-shrink-0 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                              onClick={() => setWaitlistTier(tier.name)}
                            >
                              <BellRing className="w-3 h-3 mr-1" /> Join Waitlist
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-primary font-bold text-lg">KES {event.price?.toLocaleString()}</p>
              )}

              {/* Promo code */}
              {!promoApplied ? (
                <div className="flex gap-2">
                  <Input
                    value={promoCode}
                    onChange={e => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Promo code"
                    className="font-mono text-sm"
                    onKeyDown={e => e.key === "Enter" && applyPromoCode()}
                  />
                  <Button variant="outline" size="sm" onClick={applyPromoCode} disabled={promoLoading || !promoCode.trim()}>
                    <Tag className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-2 rounded-lg bg-success/10 border border-success/30">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span className="font-mono font-bold text-success">{promoApplied.code}</span>
                    <span className="text-success">
                      {promoApplied.discountType === "percent" ? `${promoApplied.discountValue}% off` : `KES ${promoApplied.discountValue} off`}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPromoApplied(null)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}

              {/* Total */}
              {subtotal > 0 && (
                <div className="space-y-1 py-2 border-t border-border">
                  {discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="text-muted-foreground">KES {subtotal.toLocaleString()}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-sm text-success">
                      <span>Discount</span>
                      <span>− KES {discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="font-bold">Total</span>
                    <span className="font-bold text-primary text-lg">KES {totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Buyer info */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Full Name *</Label>
                  <Input value={formData.fullName} onChange={e => setFormData(p => ({ ...p, fullName: e.target.value }))} placeholder="John Doe" />
                </div>
                <div>
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="john@email.com" />
                </div>
                <div>
                  <Label className="text-xs">Phone *</Label>
                  <Input value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} placeholder="07XXXXXXXX" />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="terms"
                    checked={formData.agreeTerms}
                    onCheckedChange={checked => setFormData(p => ({ ...p, agreeTerms: checked as boolean }))}
                  />
                  <label htmlFor="terms" className="text-xs text-muted-foreground cursor-pointer">I agree to the Terms & Privacy Policy</label>
                </div>
              </div>

              <Button
                variant="hero"
                className="w-full"
                onClick={handleBookTicket}
                disabled={isBooking || totalAmount === 0}
              >
                {isBooking ? 'Processing...' : totalAmount > 0 ? `Pay KES ${totalAmount.toLocaleString()}` : 'Select Tickets'}
              </Button>
            </div>
          </div>
        </div>

        {/* Other Events */}
        {otherEvents.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold">More Events</h3>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {otherEvents.map(ev => (
                <div key={ev.id} className="min-w-[220px] glass rounded-xl p-4 flex-shrink-0">
                  {ev.image && <img src={ev.image} alt={ev.title} className="w-full h-32 object-cover rounded-lg mb-3" />}
                  <h4 className="font-semibold text-sm text-foreground">{ev.title}</h4>
                  <p className="text-primary font-bold text-sm mt-1">KES {ev.price?.toLocaleString()}</p>
                  <a href={`/events/${tenantId}/${ev.id}`} className="text-xs text-primary hover:underline mt-1 block">View →</a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Waitlist Modal */}
        {waitlistTier && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="glass w-full max-w-sm rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground">Join Waitlist</h3>
                  <p className="text-sm text-muted-foreground">{waitlistTier} — {event.title}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setWaitlistTier(null)}><X className="w-4 h-4" /></Button>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Full Name *</Label>
                  <Input value={waitlistForm.name} onChange={e => setWaitlistForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" value={waitlistForm.email} onChange={e => setWaitlistForm(f => ({ ...f, email: e.target.value }))} placeholder="your@email.com" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={waitlistForm.phone} onChange={e => setWaitlistForm(f => ({ ...f, phone: e.target.value }))} placeholder="07XXXXXXXX" className="mt-1" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">We'll notify you when a spot becomes available.</p>
              <Button variant="hero" className="w-full" onClick={joinWaitlist} disabled={joiningWaitlist}>
                <BellRing className="w-4 h-4 mr-2" />
                {joiningWaitlist ? "Joining..." : "Join Waitlist"}
              </Button>
            </div>
          </div>
        )}

        {/* Payment Modal */}
        {showPaymentModal && iframeUrl && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-3xl h-[85vh] rounded-2xl overflow-hidden relative shadow-2xl">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="absolute top-3 right-3 text-gray-700 hover:text-gray-900 z-10 text-2xl font-bold leading-none"
              >
                ✕
              </button>
              {iframeLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-2" />
                  <span className="text-gray-700">Loading payment...</span>
                </div>
              )}
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
