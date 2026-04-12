"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navigation from "@/components/Navigation";
import { toast } from "@/hooks/use-toast";
import { db } from "@/firebase/firebase";
import { doc, setDoc, updateDoc, increment, serverTimestamp, getDoc } from "firebase/firestore";
import { CheckCircle, XCircle, Download, Home, Ticket } from "lucide-react";
import { jsPDF } from "jspdf";
import { QRCodeCanvas } from "qrcode.react";

interface TierOrder {
  name: string;
  qty: number;
  price: number;
}

interface TicketInfo {
  orderReference: string;
  orderTrackingId: string;
  amount: number;
  currency: string;
  description: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  tiers: TierOrder[];
  tenantId: string;
  eventId: string;
}

export default function PaymentResponsePage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const orderTrackingId = searchParams.get("OrderTrackingId");
  const orderReference = searchParams.get("OrderMerchantReference");

  useEffect(() => {
    if (!orderTrackingId || !orderReference) {
      toast({ title: "Invalid payment response", variant: "destructive" });
      setLoading(false);
      return;
    }

    const verifyAndSave = async () => {
      try {
        const res = await fetch(
          `https://share.akisolve.com/tikooh/payment/verify_payment.php?orderTrackingId=${orderTrackingId}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Verification failed");

        const isPaid = data.status === "COMPLETED" || data.payment_status_description === "Completed" || String(data.status_code) === "1";

        if (isPaid) {
          // Parse metadata from description or from stored data
          let meta: Partial<TicketInfo> = {};
          // Read metadata from localStorage (saved before payment was initiated)
          try {
            const stored = localStorage.getItem("pending_payment_meta");
            if (stored) {
              meta = JSON.parse(stored);
              localStorage.removeItem("pending_payment_meta");
            }
          } catch (_) {}
          // Fallback: check Firestore if already processed
          if (!meta.tenantId) {
            try {
              const existingDoc = await getDoc(doc(db, "tickets", orderReference));
              if (existingDoc.exists()) meta = existingDoc.data() as Partial<TicketInfo>;
            } catch (_) {}
          }

          const info: TicketInfo = {
            orderReference,
            orderTrackingId,
            amount: data.amount || meta.amount || 0,
            currency: data.currency || meta.currency || "KES",
            description: data.description || meta.description || "",
            eventTitle: meta.eventTitle || data.description || "Event",
            buyerName: meta.buyerName || "",
            buyerEmail: meta.buyerEmail || "",
            buyerPhone: meta.buyerPhone || "",
            tiers: meta.tiers || [],
            tenantId: meta.tenantId || "",
            eventId: meta.eventId || "",
          };

          setTicketInfo(info);
          setSuccess(true);

          // Save ticket record
          await setDoc(doc(db, "tickets", orderReference), {
            ...info,
            status: "COMPLETED",
            createdAt: serverTimestamp(),
          }, { merge: true });

          // If we have tenantId + eventId, save buyer as guest and update sold counts
          if (info.tenantId && info.eventId) {
            const guestId = `ticket_${orderReference}`;

            // Save guest in tenant guests collection
            await setDoc(doc(db, `tenants/${info.tenantId}/guests`, guestId), {
              firstName: info.buyerName.split(" ")[0] || info.buyerName,
              lastName: info.buyerName.split(" ").slice(1).join(" ") || "",
              email: info.buyerEmail,
              phone: info.buyerPhone,
              guestCategory: info.tiers?.[0]?.name || "General",
              ticketTier: info.tiers?.map(t => `${t.qty}x ${t.name}`).join(", ") || "",
              status: "pending",
              amountPaid: info.amount,
              orderReference,
              eventId: info.eventId,
              createdAt: serverTimestamp(),
            }, { merge: true });

            // Increment sold count per tier
            if (info.tiers?.length) {
              const eventRef = doc(db, `tenants/${info.tenantId}/events`, info.eventId);
              const eventSnap = await getDoc(eventRef);
              if (eventSnap.exists()) {
                const eventData = eventSnap.data();
                const updatedTiers = (eventData.ticketTiers || []).map((t: any) => {
                  const ordered = info.tiers.find(o => o.name === t.name);
                  if (ordered) {
                    return { ...t, sold: (t.sold || 0) + ordered.qty };
                  }
                  return t;
                });
                await updateDoc(eventRef, { ticketTiers: updatedTiers });
              }
            }
          }

          toast({ title: "Payment Confirmed!", description: "Your ticket is ready." });
        } else {
          setSuccess(false);
          toast({ title: "Payment not completed", variant: "destructive" });
        }
      } catch (err: any) {
        console.error(err);
        toast({ title: "Verification failed", description: err.message, variant: "destructive" });
        setSuccess(false);
      } finally {
        setLoading(false);
      }
    };

    verifyAndSave();
  }, [orderTrackingId, orderReference]);

  const downloadPDF = async () => {
    if (!ticketInfo) return;

    // Load Tikooh logo
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
        img.onerror = () => resolve();
      });
    } catch (_) {}

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });

    // Background
    pdf.setFillColor(10, 14, 39);
    pdf.rect(0, 0, 148, 210, "F");

    // Teal header bar
    pdf.setFillColor(27, 179, 160);
    pdf.rect(0, 0, 148, 22, "F");

    // Tikooh logo in header
    if (logoDataUrl) {
      const logoW = 44, logoH = 14;
      pdf.addImage(logoDataUrl, "PNG", 8, (22 - logoH) / 2, logoW, logoH);
    } else {
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "bold");
      pdf.text("Tikooh", 10, 14);
    }

    // Ticket badge
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.text("E-TICKET", 138, 14, { align: "right" });

    // Event title
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    const title = pdf.splitTextToSize(ticketInfo.eventTitle, 128);
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
    pdf.text(ticketInfo.buyerName  || "—", 10, 69);
    pdf.setFontSize(9);
    pdf.text(ticketInfo.buyerEmail || "—", 10, 75);

    // Tickets
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(27, 179, 160);
    pdf.text("TICKETS", 10, 87);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    let y = 94;
    if (ticketInfo.tiers?.length) {
      ticketInfo.tiers.forEach(t => {
        pdf.text(`${t.qty}× ${t.name}   KES ${(t.qty * t.price).toLocaleString()}`, 10, y);
        y += 7;
      });
    } else {
      pdf.text(ticketInfo.description || "General Admission", 10, y);
      y += 7;
    }

    // Total
    pdf.setDrawColor(27, 179, 160);
    pdf.line(10, y + 2, 138, y + 2);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(27, 179, 160);
    pdf.text(`TOTAL PAID: ${ticketInfo.currency} ${Number(ticketInfo.amount).toLocaleString()}`, 10, y + 10);

    // Ref
    pdf.setFontSize(7);
    pdf.setTextColor(130, 130, 130);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Ref: ${ticketInfo.orderReference}`, 10, y + 20);

    // QR code
    const qrCanvas = qrRef.current?.querySelector("canvas");
    if (qrCanvas) {
      const qrDataUrl = qrCanvas.toDataURL("image/png");
      pdf.addImage(qrDataUrl, "PNG", 49, y + 28, 50, 50);
      pdf.setFontSize(7);
      pdf.setTextColor(130, 130, 130);
      pdf.text("Scan at entry", 74, y + 82, { align: "center" });
    }

    // Footer
    pdf.setFontSize(7);
    pdf.setTextColor(80, 80, 80);
    pdf.text("tikooh.com  ·  Powered by Tikooh", 74, 206, { align: "center" });

    pdf.save(`tikooh-ticket-${ticketInfo.orderReference}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 px-4 container mx-auto max-w-lg pb-12">
        {success && ticketInfo ? (
          <div className="glass rounded-2xl p-8 text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-success" />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1">Payment Successful!</h1>
              <p className="text-muted-foreground">Your ticket has been confirmed.</p>
            </div>

            {/* Ticket card */}
            <div className="bg-secondary/50 rounded-xl p-5 text-left space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Ticket className="w-5 h-5 text-primary" />
                <span className="font-bold text-foreground">{ticketInfo.eventTitle}</span>
              </div>

              {ticketInfo.buyerName && (
                <div>
                  <p className="text-xs text-muted-foreground">Attendee</p>
                  <p className="font-medium text-foreground">{ticketInfo.buyerName}</p>
                  <p className="text-sm text-muted-foreground">{ticketInfo.buyerEmail}</p>
                </div>
              )}

              {ticketInfo.tiers?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tickets</p>
                  {ticketInfo.tiers.map((t, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{t.qty}× {t.name}</span>
                      <span className="text-primary font-medium">KES {(t.qty * t.price).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between pt-2 border-t border-border">
                <span className="font-bold text-foreground">Total Paid</span>
                <span className="font-bold text-primary">{ticketInfo.currency} {Number(ticketInfo.amount).toLocaleString()}</span>
              </div>

              <p className="text-xs text-muted-foreground">Ref: {ticketInfo.orderReference}</p>
            </div>

            {/* QR code (hidden canvas for PDF generation) */}
            <div ref={qrRef} className="flex flex-col items-center gap-2">
              <p className="text-sm text-muted-foreground">Your entry QR code</p>
              <div className="bg-white p-3 rounded-xl">
                <QRCodeCanvas
                  value={`ticket:${ticketInfo.orderReference}`}
                  size={160}
                />
              </div>
              <p className="text-xs text-muted-foreground">Show this at the entrance</p>
            </div>

            <div className="flex gap-3">
              <Button variant="hero" className="flex-1" onClick={downloadPDF}>
                <Download className="w-4 h-4 mr-2" />
                Download Ticket
              </Button>
              <Button variant="outline" onClick={() => window.location.href = "/"}>
                <Home className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-8 text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mx-auto">
              <XCircle className="w-10 h-10 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1">Payment Failed</h1>
              <p className="text-muted-foreground">Your payment could not be processed.</p>
              {orderReference && <p className="text-xs text-muted-foreground mt-2">Ref: {orderReference}</p>}
            </div>
            <Button variant="hero" className="w-full" onClick={() => window.history.back()}>
              Try Again
            </Button>
            <Button variant="outline" className="w-full" onClick={() => window.location.href = "/"}>
              <Home className="w-4 h-4 mr-2" /> Go Home
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
