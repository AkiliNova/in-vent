"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { db } from "@/firebase/firebase";
import {
  doc, getDoc, collection, query, where, getDocs,
  updateDoc, increment, addDoc, setDoc, serverTimestamp,
} from "firebase/firestore";
import Navigation from "@/components/Navigation";
import EventImg from "@/components/EventImg";
import AgendaTab from "@/components/AgendaTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  MapPin, Calendar, Share2, Ticket, Tag, CheckCircle, X,
  BellRing, Download, Clock, CreditCard, Home,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { QRCodeCanvas } from "qrcode.react";

// ── Helpers ───────────────────────────────────────────────────────────────────
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const normalizePhone = (v: string) => v.replace(/[\s\-\(\)]/g, "");
/** Accepts: 07XXXXXXXX | 01XXXXXXXX | 254XXXXXXXXX | +254XXXXXXXXX */
const isValidPhone = (v: string) => /^(?:\+?254|0)[17]\d{8}$/.test(normalizePhone(v));

// ── Interfaces ────────────────────────────────────────────────────────────────
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

interface TierOrder { name: string; qty: number; price: number; }

interface BookingResult {
  reference: string;
  paid: boolean;
  amount: number;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
  tiers: TierOrder[];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function EventPage() {
  const { tenantId, eventId } = useParams<{ tenantId: string; eventId: string }>();
  const [event, setEvent]             = useState<EventData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [otherEvents, setOtherEvents] = useState<OtherEvent[]>([]);

  // Ticket selection
  const [ticketQuantities, setTicketQuantities] = useState<{ [key: string]: number }>({});

  // Buyer form
  const [formData, setFormData] = useState({ fullName: "", email: "", phone: "", agreeTerms: false });

  // Promo
  const [promoCode, setPromoCode]     = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string; discountType: "percent" | "fixed"; discountValue: number; id: string;
  } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  // Waitlist
  const [waitlistTier, setWaitlistTier]   = useState<string | null>(null);
  const [waitlistForm, setWaitlistForm]   = useState({ name: "", email: "", phone: "" });
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);

  // Payment
  const [paystackKey, setPaystackKey] = useState("");
  const [verifyUrl, setVerifyUrl]     = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

  // Guest lookup (email-based suggestion)
  const [suggestedGuest, setSuggestedGuest] = useState<{ name: string; phone: string } | null>(null);
  const [emailChecking, setEmailChecking]   = useState(false);

  const qrRef = useRef<HTMLDivElement>(null);

  // ── Load Paystack inline script ─────────────────────────────────────────────
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch (_) {} };
  }, []);

  // ── Load Paystack config from Firestore ─────────────────────────────────────
  useEffect(() => {
    getDoc(doc(db, "config", "paystack")).then(snap => {
      if (snap.exists()) {
        setPaystackKey(snap.data().publicKey || "");
        setVerifyUrl(snap.data().verifyUrl || "");
      }
    }).catch(() => {});
  }, []);

  // ── Load event ──────────────────────────────────────────────────────────────
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

  // ── Load other events ───────────────────────────────────────────────────────
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
  if (!event)  return <p className="text-center mt-24 text-foreground">Event not found.</p>;

  // ── Calculations ─────────────────────────────────────────────────────────────
  const handleQuantityChange = (tierName: string, delta: number, tier: TicketTier) => {
    const available = tier.capacity - (tier.sold || 0);
    setTicketQuantities(prev => ({
      ...prev,
      [tierName]: Math.max(0, Math.min(available, (prev[tierName] || 0) + delta)),
    }));
  };

  const selectedTiers = event.ticketTiers?.filter(t => (ticketQuantities[t.name] || 0) > 0) ?? [];

  const subtotal = event.ticketTiers?.reduce((sum, tier) =>
    sum + (ticketQuantities[tier.name] || 0) * tier.price, 0) ?? 0;

  const discount = promoApplied
    ? promoApplied.discountType === "percent"
      ? Math.round(subtotal * promoApplied.discountValue / 100)
      : Math.min(promoApplied.discountValue, subtotal)
    : 0;

  const totalAmount = Math.max(0, subtotal - discount);
  const isFree = totalAmount === 0 && selectedTiers.length > 0;

  // ── Validation ────────────────────────────────────────────────────────────────
  const validateForm = (): boolean => {
    if (!formData.fullName.trim()) {
      toast({ title: "Enter your full name", variant: "destructive" }); return false;
    }
    if (!isValidEmail(formData.email)) {
      toast({ title: "Enter a valid email address", variant: "destructive" }); return false;
    }
    if (!isValidPhone(formData.phone)) {
      toast({ title: "Enter a valid Kenyan phone number (e.g. 0712345678)", variant: "destructive" }); return false;
    }
    if (!formData.agreeTerms) {
      toast({ title: "Accept terms to continue", variant: "destructive" }); return false;
    }
    if (selectedTiers.length === 0) {
      toast({ title: "Select at least one ticket", variant: "destructive" }); return false;
    }
    return true;
  };

  // ── Existing guest lookup on email blur ────────────────────────────────────
  const handleEmailBlur = async () => {
    if (!isValidEmail(formData.email) || !tenantId) return;
    setEmailChecking(true);
    setSuggestedGuest(null);
    try {
      const q = query(
        collection(db, `tenants/${tenantId}/guests`),
        where("email", "==", formData.email.trim().toLowerCase()),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0].data();
        const fullName = d.name || `${d.firstName || ""} ${d.lastName || ""}`.trim();
        setSuggestedGuest({ name: fullName, phone: d.phone || "" });
      }
    } catch (_) {}
    finally { setEmailChecking(false); }
  };

  // ── Save booking to Firestore ─────────────────────────────────────────────────
  const saveBooking = async (paymentStatus: "paid" | "unpaid" | "free", reference: string, amountPaid: number) => {
    if (!tenantId || !eventId) return;

    const tiersSummary = selectedTiers.map(t => `${ticketQuantities[t.name]}x ${t.name}`).join(", ");
    const guestId = `booking_${reference}`;

    const nameParts = formData.fullName.trim().split(/\s+/);
    await setDoc(doc(db, `tenants/${tenantId}/guests`, guestId), {
      // Core identity — matches Guests page interface
      firstName:     nameParts[0] || formData.fullName,
      lastName:      nameParts.slice(1).join(" ") || "",
      name:          formData.fullName.trim(),
      email:         formData.email.trim().toLowerCase(),
      phone:         normalizePhone(formData.phone),
      // Ticket fields — ticketType matches Guests page filter/display
      ticketType:    selectedTiers[0]?.name || "General",
      guestCategory: selectedTiers[0]?.name || "General",
      ticketTier:    tiersSummary,
      // Status / payment
      status:        "pending",
      paymentStatus,
      amountPaid:    amountPaid,
      amountDue:     paymentStatus === "unpaid" ? totalAmount : 0,
      orderReference: reference,
      eventId,
      eventTitle:    event.title,
      tiers:         selectedTiers.map(t => ({ name: t.name, qty: ticketQuantities[t.name], price: t.price })),
      registeredAt:  new Date().toISOString(),
      createdAt:     serverTimestamp(),
    }, { merge: true });

    // Increment sold count per tier
    if (selectedTiers.length) {
      const eventRef  = doc(db, `tenants/${tenantId}/events`, eventId);
      const eventSnap = await getDoc(eventRef);
      if (eventSnap.exists()) {
        const updatedTiers = (eventSnap.data().ticketTiers || []).map((t: any) => {
          const ordered = selectedTiers.find(o => o.name === t.name);
          return ordered ? { ...t, sold: (t.sold || 0) + ticketQuantities[ordered.name] } : t;
        });
        await updateDoc(eventRef, { ticketTiers: updatedTiers });
      }
    }

    // Increment promo usage
    if (promoApplied) {
      await updateDoc(doc(db, `tenants/${tenantId}/promo_codes`, promoApplied.id), { usedCount: increment(1) });
    }
  };

  // ── Pay Now via Paystack inline ───────────────────────────────────────────────
  const handlePayNow = () => {
    if (!validateForm()) return;

    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) {
      toast({ title: "Payment loading, please try again in a moment", variant: "destructive" }); return;
    }
    if (!paystackKey) {
      toast({ title: "Online payment not configured", description: "Use Pay Later or contact the organizer.", variant: "destructive" }); return;
    }

    const reference = `INVENT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const handler = PaystackPop.setup({
      key:      paystackKey,
      email:    formData.email,
      amount:   totalAmount * 100, // Paystack uses smallest currency unit
      currency: "KES",
      ref:      reference,
      metadata: {
        custom_fields: [
          { display_name: "Full Name",  variable_name: "full_name", value: formData.fullName },
          { display_name: "Phone",      variable_name: "phone",     value: formData.phone },
          { display_name: "Event",      variable_name: "event",     value: event.title },
          { display_name: "Tickets",    variable_name: "tickets",   value: selectedTiers.map(t => `${ticketQuantities[t.name]}x ${t.name}`).join(", ") },
        ],
      },
      callback: async (transaction: any) => {
        setIsProcessing(true);
        try {
          // Server-side verification (if endpoint configured)
          if (verifyUrl) {
            const res = await fetch(verifyUrl, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ reference: transaction.reference }),
            });
            const vData = await res.json();
            if (!vData.success) throw new Error(vData.message || "Payment verification failed");
          }

          await saveBooking("paid", transaction.reference, totalAmount);

          setBookingResult({
            reference: transaction.reference,
            paid:       true,
            amount:     totalAmount,
            eventTitle: event.title,
            buyerName:  formData.fullName,
            buyerEmail: formData.email,
            tiers:      selectedTiers.map(t => ({ name: t.name, qty: ticketQuantities[t.name], price: t.price })),
          });

          toast({ title: "Payment Confirmed!", description: "Your ticket is ready." });
        } catch (err: any) {
          toast({ title: "Failed to save ticket", description: err.message, variant: "destructive" });
        } finally {
          setIsProcessing(false);
        }
      },
      onClose: () => {
        toast({ title: "Payment cancelled" });
      },
    });

    handler.openIframe();
  };

  // ── Pay Later (Reserve) ───────────────────────────────────────────────────────
  const handlePayLater = async () => {
    if (!validateForm()) return;

    setIsProcessing(true);
    try {
      const reference = `RESERVE-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      await saveBooking("unpaid", reference, 0);

      setBookingResult({
        reference,
        paid:       false,
        amount:     totalAmount,
        eventTitle: event.title,
        buyerName:  formData.fullName,
        buyerEmail: formData.email,
        tiers:      selectedTiers.map(t => ({ name: t.name, qty: ticketQuantities[t.name], price: t.price })),
      });

      toast({ title: "Spot Reserved!", description: "Payment due at the door." });
    } catch (err: any) {
      toast({ title: "Reservation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Register Free ─────────────────────────────────────────────────────────────
  const handleRegisterFree = async () => {
    if (!validateForm()) return;

    setIsProcessing(true);
    try {
      const reference = `FREE-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      await saveBooking("free", reference, 0);

      setBookingResult({
        reference,
        paid:       true,
        amount:     0,
        eventTitle: event.title,
        buyerName:  formData.fullName,
        buyerEmail: formData.email,
        tiers:      selectedTiers.map(t => ({ name: t.name, qty: ticketQuantities[t.name], price: t.price })),
      });

      toast({ title: "Registration Confirmed!" });
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Download PDF Ticket ────────────────────────────────────────────────────────
  const downloadPDF = async () => {
    if (!bookingResult) return;

    // ── Load Tikooh logo from public assets ────────────────────────────────────
    let logoDataUrl = "";
    try {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = "/assets/logo.png";
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width  = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext("2d")!.drawImage(img, 0, 0);
          logoDataUrl = canvas.toDataURL("image/png");
          resolve();
        };
        img.onerror = () => resolve(); // fallback to text if image fails
      });
    } catch (_) {}

    // ── Build PDF (A5 portrait: 148 × 210 mm) ──────────────────────────────────
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });

    // Dark background
    pdf.setFillColor(10, 14, 39);
    pdf.rect(0, 0, 148, 210, "F");

    // Teal header bar
    pdf.setFillColor(27, 179, 160);
    pdf.rect(0, 0, 148, 22, "F");

    // Logo in header (max 44 × 14 mm, vertically centred in 22 mm bar)
    if (logoDataUrl) {
      const logoW = 44;
      const logoH = 14;
      const logoY = (22 - logoH) / 2;
      pdf.addImage(logoDataUrl, "PNG", 8, logoY, logoW, logoH);
    } else {
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "bold");
      pdf.text("Tikooh", 10, 14);
    }

    // Ticket type badge (right side of header)
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.text(
      bookingResult.paid ? "E-TICKET" : "RESERVATION",
      138, 14,
      { align: "right" }
    );

    // Event title
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    const title = pdf.splitTextToSize(bookingResult.eventTitle, 128);
    pdf.text(title, 10, 34);

    // Divider
    pdf.setDrawColor(27, 179, 160);
    pdf.setLineWidth(0.5);
    pdf.line(10, 52, 138, 52);

    // Attendee
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(27, 179, 160);
    pdf.text("ATTENDEE", 10, 62);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(bookingResult.buyerName  || "—", 10, 69);
    pdf.setFontSize(9);
    pdf.text(bookingResult.buyerEmail || "—", 10, 75);

    // Tickets
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(27, 179, 160);
    pdf.text("TICKETS", 10, 87);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    let y = 94;
    bookingResult.tiers.forEach(t => {
      pdf.text(`${t.qty}× ${t.name}   KES ${(t.qty * t.price).toLocaleString()}`, 10, y);
      y += 7;
    });

    // Total line
    pdf.setDrawColor(27, 179, 160);
    pdf.line(10, y + 2, 138, y + 2);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(27, 179, 160);

    if (bookingResult.paid && bookingResult.amount > 0) {
      pdf.text(`TOTAL PAID: KES ${bookingResult.amount.toLocaleString()}`, 10, y + 10);
    } else if (!bookingResult.paid) {
      pdf.text(`AMOUNT DUE: KES ${bookingResult.amount.toLocaleString()}`, 10, y + 10);
      pdf.setFontSize(8);
      pdf.setTextColor(255, 180, 0);
      pdf.text("Payment pending — please pay at the door", 10, y + 17);
    } else {
      pdf.text("FREE ENTRY", 10, y + 10);
    }

    // Reference
    pdf.setFontSize(7);
    pdf.setTextColor(130, 130, 130);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Ref: ${bookingResult.reference}`, 10, y + 26);

    // QR code (centred)
    const qrCanvas = qrRef.current?.querySelector("canvas");
    if (qrCanvas) {
      const qrDataUrl = qrCanvas.toDataURL("image/png");
      pdf.addImage(qrDataUrl, "PNG", 49, y + 32, 50, 50);
      pdf.setFontSize(7);
      pdf.setTextColor(130, 130, 130);
      pdf.text("Scan at entry", 74, y + 86, { align: "center" });
    }

    // Footer
    pdf.setFontSize(7);
    pdf.setTextColor(80, 80, 80);
    pdf.text("tikooh.com  ·  Powered by Tikooh", 74, 206, { align: "center" });

    pdf.save(`tikooh-ticket-${bookingResult.reference}.pdf`);
  };

  // ── Promo code ────────────────────────────────────────────────────────────────
  const applyPromoCode = async () => {
    if (!promoCode.trim() || !tenantId) return;
    setPromoLoading(true);
    try {
      const q = query(collection(db, `tenants/${tenantId}/promo_codes`), where("code", "==", promoCode.trim().toUpperCase()));
      const snap = await getDocs(q);

      if (snap.empty) { toast({ title: "Invalid promo code", variant: "destructive" }); return; }

      const codeDoc = snap.docs[0];
      const data    = codeDoc.data();

      if (!data.active)                                    { toast({ title: "Code no longer active", variant: "destructive" }); return; }
      if (data.expiresAt && new Date(data.expiresAt) < new Date()) { toast({ title: "Code has expired", variant: "destructive" }); return; }
      if (data.usedCount >= data.maxUses)                  { toast({ title: "Code has reached its limit", variant: "destructive" }); return; }

      setPromoApplied({ code: data.code, discountType: data.discountType, discountValue: data.discountValue, id: codeDoc.id });
      toast({ title: `Promo applied! ${data.discountType === "percent" ? `${data.discountValue}% off` : `KES ${data.discountValue} off`}` });
      setPromoCode("");
    } catch (err: any) {
      toast({ title: "Failed to validate code", description: err.message, variant: "destructive" });
    } finally {
      setPromoLoading(false);
    }
  };

  // ── Waitlist ──────────────────────────────────────────────────────────────────
  const joinWaitlist = async () => {
    if (!waitlistForm.name || !waitlistForm.email || !tenantId || !eventId || !waitlistTier) return;
    setJoiningWaitlist(true);
    try {
      await addDoc(collection(db, `tenants/${tenantId}/events/${eventId}/waitlist`), {
        tierName: waitlistTier,
        name:     waitlistForm.name,
        email:    waitlistForm.email,
        phone:    waitlistForm.phone,
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

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: event.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied!" });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 px-4 md:px-6 container mx-auto max-w-7xl pb-12">

        <div className="flex flex-col lg:flex-row gap-8 mb-12">

          {/* ── Left: event info ──────────────────────────────────────────── */}
          <div className="flex-1 space-y-6">
            {event.images?.[0] && (
              <div className="w-full rounded-2xl overflow-hidden">
                <EventImg src={event.images[0]} alt={event.title} title={event.title}
                  className="w-full object-cover max-h-[500px]" placeholderClassName="w-full h-64" />
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

            <Tabs defaultValue="about">
              <TabsList>
                <TabsTrigger value="about">About</TabsTrigger>
                <TabsTrigger value="agenda">Agenda</TabsTrigger>
              </TabsList>
              <TabsContent value="about">
                <p className="leading-relaxed mt-4">{event.description}</p>
              </TabsContent>
              <TabsContent value="agenda">
                <AgendaTab tenantId={tenantId!} eventId={eventId!} />
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Right: booking card ───────────────────────────────────────── */}
          <div className="w-full lg:w-[380px]">
            <div className="glass rounded-2xl p-6 space-y-5 border border-border sticky top-24">

              {/* ── SUCCESS VIEW ────────────────────────────────────────────── */}
              {bookingResult ? (
                <div className="space-y-5 text-center">
                  {/* Status icon */}
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
                    bookingResult.paid ? "bg-success/20" : "bg-yellow-500/20"
                  }`}>
                    {bookingResult.paid
                      ? <CheckCircle className="w-8 h-8 text-success" />
                      : <Clock className="w-8 h-8 text-yellow-500" />
                    }
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      {bookingResult.paid
                        ? bookingResult.amount === 0 ? "Registration Confirmed!" : "Payment Confirmed!"
                        : "Spot Reserved!"}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {bookingResult.paid
                        ? "Your ticket is confirmed."
                        : `KES ${bookingResult.amount.toLocaleString()} due at the door.`}
                    </p>
                  </div>

                  {/* Ticket summary */}
                  <div className="bg-secondary/50 rounded-xl p-4 text-left space-y-2">
                    <p className="font-semibold text-sm text-foreground">{bookingResult.eventTitle}</p>
                    <p className="text-sm text-muted-foreground">{bookingResult.buyerName}</p>

                    {bookingResult.tiers.map((t, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{t.qty}× {t.name}</span>
                        <span className="text-primary font-medium">KES {(t.qty * t.price).toLocaleString()}</span>
                      </div>
                    ))}

                    <div className="flex justify-between pt-2 border-t border-border text-sm font-bold">
                      <span>{bookingResult.paid ? "Paid" : "Due at door"}</span>
                      <span className={bookingResult.paid ? "text-success" : "text-yellow-500"}>
                        {bookingResult.amount === 0 ? "Free" : `KES ${bookingResult.amount.toLocaleString()}`}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">Ref: {bookingResult.reference}</p>
                  </div>

                  {/* QR code */}
                  <div ref={qrRef} className="flex flex-col items-center gap-2">
                    <div className="bg-white p-3 rounded-xl inline-block">
                      <QRCodeCanvas value={`ticket:${bookingResult.reference}`} size={120} />
                    </div>
                    <p className="text-xs text-muted-foreground">Show this at the entrance</p>
                  </div>

                  {/* Badge */}
                  {!bookingResult.paid && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/10 text-yellow-600 text-sm">
                      <Clock className="w-4 h-4 flex-shrink-0" />
                      <span>Payment pending — reserved spot, pay at the event.</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button variant="hero" className="flex-1" onClick={downloadPDF}>
                      <Download className="w-4 h-4 mr-2" />
                      {bookingResult.paid ? "Download Ticket" : "Download Reservation"}
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => window.location.href = "/"}>
                      <Home className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── BOOKING FORM ──────────────────────────────────────────── */
                <>
                  <div className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-bold">Get Tickets</h2>
                  </div>

                  {/* Ticket tiers */}
                  {event.ticketTiers?.length ? (
                    <div className="space-y-3">
                      {event.ticketTiers.map(tier => {
                        const available = tier.capacity - (tier.sold || 0);
                        const soldOut   = available <= 0;
                        return (
                          <div key={tier.name} className={`rounded-xl border p-3 ${soldOut ? "opacity-50 border-border" : "border-border hover:border-primary/50 transition-colors"}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-sm">{tier.name}</p>
                                {tier.description && <p className="text-xs text-muted-foreground">{tier.description}</p>}
                                <p className="text-primary font-bold mt-1">
                                  {tier.price === 0 ? "Free" : `KES ${tier.price.toLocaleString()}`}
                                </p>
                                <p className="text-xs text-muted-foreground">{soldOut ? "Sold Out" : `${available} left`}</p>
                              </div>
                              {!soldOut && (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleQuantityChange(tier.name, -1, tier)}>−</Button>
                                  <span className="w-5 text-center text-sm font-medium">{ticketQuantities[tier.name] || 0}</span>
                                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleQuantityChange(tier.name, 1, tier)}>+</Button>
                                </div>
                              )}
                              {soldOut && (
                                <Button variant="outline" size="sm" className="text-xs flex-shrink-0 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10" onClick={() => setWaitlistTier(tier.name)}>
                                  <BellRing className="w-3 h-3 mr-1" /> Waitlist
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
                      <Input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="Promo code" className="font-mono text-sm"
                        onKeyDown={e => e.key === "Enter" && applyPromoCode()} />
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
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="text-muted-foreground">KES {subtotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm text-success">
                            <span>Discount</span>
                            <span>− KES {discount.toLocaleString()}</span>
                          </div>
                        </>
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
                      <div className="flex justify-between items-center mb-1">
                        <Label className="text-xs">Full Name *</Label>
                        <span className={`text-xs ${formData.fullName.length > 50 ? "text-destructive" : "text-muted-foreground"}`}>
                          {formData.fullName.length}/60
                        </span>
                      </div>
                      <Input
                        value={formData.fullName}
                        onChange={e => setFormData(p => ({ ...p, fullName: e.target.value.slice(0, 60) }))}
                        placeholder="Jane Doe"
                        maxLength={60}
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Email *</Label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={e => { setFormData(p => ({ ...p, email: e.target.value })); setSuggestedGuest(null); }}
                        onBlur={handleEmailBlur}
                        placeholder="jane@email.com"
                        className={formData.email && !isValidEmail(formData.email) ? "border-destructive" : ""}
                      />
                      {emailChecking && <p className="text-xs text-muted-foreground mt-1">Checking…</p>}
                      {/* "Is this you?" suggestion */}
                      {suggestedGuest && (
                        <div className="mt-2 p-2.5 rounded-lg border border-primary/40 bg-primary/5 text-xs space-y-1">
                          <p className="font-medium text-foreground">We found your details. Is this you?</p>
                          <p className="text-muted-foreground">{suggestedGuest.name} · {suggestedGuest.phone}</p>
                          <div className="flex gap-2 mt-1">
                            <button
                              type="button"
                              className="text-primary font-semibold hover:underline"
                              onClick={() => {
                                setFormData(p => ({
                                  ...p,
                                  fullName: suggestedGuest.name || p.fullName,
                                  phone:    suggestedGuest.phone || p.phone,
                                }));
                                setSuggestedGuest(null);
                              }}
                            >
                              Yes, pre-fill my details
                            </button>
                            <span className="text-muted-foreground">·</span>
                            <button type="button" className="text-muted-foreground hover:underline" onClick={() => setSuggestedGuest(null)}>
                              No, continue
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <Label className="text-xs">Phone *</Label>
                        <span className={`text-xs ${formData.phone && !isValidPhone(formData.phone) ? "text-destructive" : "text-muted-foreground"}`}>
                          {formData.phone ? (isValidPhone(formData.phone) ? "✓ valid" : "07XX / 01XX / 254XX") : "07XX / 01XX / 254XX"}
                        </span>
                      </div>
                      <Input
                        value={formData.phone}
                        onChange={e => setFormData(p => ({ ...p, phone: e.target.value.slice(0, 15) }))}
                        placeholder="0712 345 678"
                        maxLength={15}
                        className={formData.phone && !isValidPhone(formData.phone) ? "border-destructive" : ""}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="terms" checked={formData.agreeTerms}
                        onCheckedChange={checked => setFormData(p => ({ ...p, agreeTerms: checked as boolean }))} />
                      <label htmlFor="terms" className="text-xs text-muted-foreground cursor-pointer">I agree to the Terms & Privacy Policy</label>
                    </div>
                  </div>

                  {/* ── Payment buttons ──────────────────────────────────────── */}
                  {isProcessing ? (
                    <div className="flex items-center justify-center gap-2 py-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                      <span className="text-sm text-muted-foreground">Processing…</span>
                    </div>
                  ) : isFree ? (
                    /* Free ticket */
                    <Button variant="hero" className="w-full" onClick={handleRegisterFree} disabled={selectedTiers.length === 0}>
                      <Ticket className="w-4 h-4 mr-2" /> Register Free
                    </Button>
                  ) : totalAmount > 0 ? (
                    /* Paid ticket — Pay Now + Pay Later */
                    <div className="space-y-2">
                      <Button variant="hero" className="w-full" onClick={handlePayNow}>
                        <CreditCard className="w-4 h-4 mr-2" /> Pay KES {totalAmount.toLocaleString()} Now
                      </Button>
                      <Button variant="outline" className="w-full" onClick={handlePayLater}>
                        <Clock className="w-4 h-4 mr-2" /> Reserve — Pay Later
                      </Button>
                      <p className="text-xs text-center text-muted-foreground">
                        Pay Later reserves your spot. Amount due at the door.
                      </p>
                    </div>
                  ) : (
                    /* No tickets selected */
                    <Button variant="hero" className="w-full" disabled>
                      Select Tickets to Continue
                    </Button>
                  )}
                </>
              )}
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
              <p className="text-xs text-muted-foreground">We'll notify you when a spot opens.</p>
              <Button variant="hero" className="w-full" onClick={joinWaitlist} disabled={joiningWaitlist}>
                <BellRing className="w-4 h-4 mr-2" />
                {joiningWaitlist ? "Joining..." : "Join Waitlist"}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
