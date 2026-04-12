"use client";

import { useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Ticket, Download, Search, Mail, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { jsPDF } from "jspdf";

interface TicketRecord {
  id: string;
  orderReference: string;
  orderTrackingId: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  amount: number;
  currency: string;
  tiers: { name: string; qty: number; price: number }[];
  status: string;
  createdAt?: any;
}

export default function MyTickets() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [searched, setSearched] = useState(false);

  const searchTickets = async () => {
    if (!email.trim()) {
      toast({ title: "Enter your email address", variant: "destructive" });
      return;
    }
    setLoading(true);
    setSearched(false);
    try {
      const q = query(collection(db, "tickets"), where("buyerEmail", "==", email.trim().toLowerCase()));
      const snap = await getDocs(q);
      const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as TicketRecord));
      setTickets(results);
      setSearched(true);
      if (results.length === 0) {
        toast({ title: "No tickets found for this email." });
      }
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (t: TicketRecord) => {
    // Load Tikooh logo
    let logoDataUrl = "";
    try {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = "/assets/logo.png";
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext("2d")!.drawImage(img, 0, 0);
          logoDataUrl = c.toDataURL("image/png");
          resolve();
        };
        img.onerror = () => resolve();
      });
    } catch (_) {}

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });

    pdf.setFillColor(10, 14, 39);
    pdf.rect(0, 0, 148, 210, "F");
    pdf.setFillColor(27, 179, 160);
    pdf.rect(0, 0, 148, 22, "F");

    if (logoDataUrl) {
      pdf.addImage(logoDataUrl, "PNG", 8, 4, 44, 14);
    } else {
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "bold");
      pdf.text("Tikooh", 10, 14);
    }
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.text("E-TICKET", 138, 14, { align: "right" });

    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    const title = pdf.splitTextToSize(t.eventTitle || "Event Ticket", 128);
    pdf.text(title, 10, 34);

    pdf.setDrawColor(27, 179, 160);
    pdf.setLineWidth(0.5);
    pdf.line(10, 52, 138, 52);

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(27, 179, 160);
    pdf.text("ATTENDEE", 10, 62);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(t.buyerName || "—", 10, 69);
    pdf.setFontSize(9);
    pdf.text(t.buyerEmail || "—", 10, 75);

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(27, 179, 160);
    pdf.text("TICKETS", 10, 87);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    let y = 94;
    (t.tiers || []).forEach(tier => {
      pdf.text(`${tier.qty}× ${tier.name}  —  KES ${(tier.qty * tier.price).toLocaleString()}`, 10, y);
      y += 7;
    });

    pdf.setDrawColor(27, 179, 160);
    pdf.line(10, y + 2, 138, y + 2);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(27, 179, 160);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(27, 179, 160);
    pdf.text(`TOTAL PAID: ${t.currency} ${Number(t.amount).toLocaleString()}`, 10, y + 10);
    pdf.setFontSize(7);
    pdf.setTextColor(130, 130, 130);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Ref: ${t.orderReference}`, 10, y + 20);

    // QR
    const canvas = document.getElementById(`qr-${t.id}`) as HTMLCanvasElement;
    if (canvas) {
      const qrDataUrl = canvas.toDataURL("image/png");
      pdf.addImage(qrDataUrl, "PNG", 49, y + 28, 50, 50);
      pdf.setFontSize(7);
      pdf.setTextColor(130, 130, 130);
      pdf.text("Scan at entry", 74, y + 82, { align: "center" });
    }

    pdf.setFontSize(7);
    pdf.setTextColor(80, 80, 80);
    pdf.text("tikooh.com  ·  Powered by Tikooh", 74, 206, { align: "center" });
    pdf.save(`tikooh-ticket-${t.orderReference}.pdf`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 container mx-auto max-w-2xl">

        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Ticket className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">My Tickets</h1>
          <p className="text-muted-foreground">Enter your email to retrieve your tickets</p>
        </div>

        <div className="glass rounded-2xl p-6 mb-8">
          <Label className="mb-2 block">Email Address</Label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="pl-9"
                onKeyDown={e => e.key === "Enter" && searchTickets()}
              />
            </div>
            <Button variant="hero" onClick={searchTickets} disabled={loading}>
              <Search className="w-4 h-4 mr-2" />
              {loading ? "Searching..." : "Find Tickets"}
            </Button>
          </div>
        </div>

        {searched && tickets.length === 0 && (
          <div className="glass rounded-2xl p-10 text-center">
            <QrCode className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">No tickets found</p>
            <p className="text-muted-foreground text-sm mt-1">Check your email address or contact support.</p>
          </div>
        )}

        {tickets.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{tickets.length} ticket{tickets.length !== 1 ? "s" : ""} found</p>
            {tickets.map(t => (
              <div key={t.id} className="glass rounded-2xl p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-foreground text-lg">{t.eventTitle || "Event Ticket"}</h3>
                    <p className="text-sm text-muted-foreground">{t.buyerName}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${t.status === "COMPLETED" ? "bg-success/20 text-success" : "bg-yellow-500/20 text-yellow-500"}`}>
                    {t.status === "COMPLETED" ? "Confirmed" : t.status}
                  </span>
                </div>

                {t.tiers?.length > 0 && (
                  <div className="space-y-1">
                    {t.tiers.map((tier, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{tier.qty}× {tier.name}</span>
                        <span>KES {(tier.qty * tier.price).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold pt-1 border-t border-border">
                      <span>Total</span>
                      <span className="text-primary">KES {Number(t.amount).toLocaleString()}</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col items-center gap-2 py-2">
                  <p className="text-xs text-muted-foreground">Your entry QR code</p>
                  <div className="bg-white p-3 rounded-xl">
                    <QRCodeCanvas
                      id={`qr-${t.id}`}
                      value={`ticket:${t.orderReference}`}
                      size={140}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{t.orderReference}</p>
                </div>

                <Button variant="hero" className="w-full" onClick={() => downloadPDF(t)}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Ticket PDF
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
