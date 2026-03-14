"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import { useAuth } from "@/context/AuthContext";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { DollarSign, TrendingUp, Wallet, Clock, Download, ChevronDown, ChevronUp } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const PLATFORM_FEE_PCT = 0.10; // 10% platform fee

interface TicketTier { name: string; price: number; capacity: number; sold: number; }
interface EventPayout {
  id: string;
  title: string;
  startDate: string;
  status: "draft" | "published";
  tiers: TicketTier[];
  gross: number;
  fee: number;
  net: number;
  ticketsSold: number;
  payoutStatus: "pending" | "paid";
}

interface GuestDoc { amountPaid?: number; eventId?: string; createdAt?: any; }

export default function Payouts() {
  const { tenantId } = useAuth();
  const [events, setEvents] = useState<EventPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const eventsSnap = await getDocs(collection(db, `tenants/${tenantId}/events`));
        const guestsSnap = await getDocs(collection(db, `tenants/${tenantId}/guests`));
        const guests = guestsSnap.docs.map(d => d.data() as GuestDoc);

        const payouts: EventPayout[] = eventsSnap.docs.map(d => {
          const ev = d.data();
          const tiers: TicketTier[] = ev.ticketTiers || [];
          const gross = tiers.reduce((s, t) => s + (t.sold || 0) * t.price, 0);
          const fee = Math.round(gross * PLATFORM_FEE_PCT);
          const net = gross - fee;
          const ticketsSold = tiers.reduce((s, t) => s + (t.sold || 0), 0);
          return {
            id: d.id,
            title: ev.title || "Untitled Event",
            startDate: ev.startDate || "",
            status: ev.status || "draft",
            tiers,
            gross,
            fee,
            net,
            ticketsSold,
            payoutStatus: net > 0 ? "pending" : "paid",
          };
        });

        // Sort by startDate desc
        payouts.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        setEvents(payouts);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tenantId]);

  const totalGross = events.reduce((s, e) => s + e.gross, 0);
  const totalFee = events.reduce((s, e) => s + e.fee, 0);
  const totalNet = events.reduce((s, e) => s + e.net, 0);
  const totalTickets = events.reduce((s, e) => s + e.ticketsSold, 0);
  const pendingNet = events.filter(e => e.payoutStatus === "pending").reduce((s, e) => s + e.net, 0);

  const exportCSV = () => {
    const rows = events.map(e => ({
      Event: e.title,
      Date: e.startDate ? new Date(e.startDate).toLocaleDateString() : "—",
      "Tickets Sold": e.ticketsSold,
      "Gross Revenue (KES)": e.gross,
      "Platform Fee 10% (KES)": e.fee,
      "Net Payout (KES)": e.net,
      "Payout Status": e.payoutStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payouts");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([out], { type: "application/octet-stream" }), "payouts.xlsx");
    toast({ title: "Exported!" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-muted-foreground">Loading payouts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-5xl">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Payouts</h1>
              <p className="text-muted-foreground">Revenue, fees, and net payouts per event</p>
            </div>
            <Button variant="outline" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Gross Revenue", value: `KES ${totalGross.toLocaleString()}`, icon: DollarSign, color: "text-yellow-500" },
              { label: "Platform Fees (10%)", value: `KES ${totalFee.toLocaleString()}`, icon: TrendingUp, color: "text-destructive" },
              { label: "Net Earnings", value: `KES ${totalNet.toLocaleString()}`, icon: Wallet, color: "text-success" },
              { label: "Pending Payout", value: `KES ${pendingNet.toLocaleString()}`, icon: Clock, color: "text-primary" },
            ].map(s => (
              <div key={s.label} className="glass rounded-2xl p-5">
                <div className={`w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-3 ${s.color}`}>
                  <s.icon className="w-5 h-5" />
                </div>
                <div className="text-xl font-bold text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Platform fee notice */}
          <div className="glass rounded-xl p-4 mb-6 border border-primary/20 flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              In-Vent charges a <strong className="text-foreground">10% platform fee</strong> on all ticket sales.
              Payouts are processed within 3–5 business days after your event ends.
            </div>
          </div>

          {/* Events table */}
          {events.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center">
              <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No events with ticket sales yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map(ev => (
                <div key={ev.id} className="glass rounded-2xl overflow-hidden">
                  {/* Event row */}
                  <button
                    className="w-full p-5 flex flex-col sm:flex-row sm:items-center gap-4 text-left hover:bg-secondary/30 transition-colors"
                    onClick={() => setExpandedEvent(expandedEvent === ev.id ? null : ev.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <span className="font-semibold text-foreground">{ev.title}</span>
                        <Badge variant="outline" className={ev.status === "published" ? "border-success/50 text-success" : "border-yellow-500/50 text-yellow-500"}>
                          {ev.status}
                        </Badge>
                        <Badge variant="outline" className={ev.payoutStatus === "paid" ? "border-success/50 text-success bg-success/10" : "border-primary/50 text-primary bg-primary/10"}>
                          {ev.payoutStatus === "paid" ? "Paid Out" : "Pending"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {ev.startDate ? new Date(ev.startDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        {" · "}{ev.ticketsSold} tickets sold
                      </div>
                    </div>

                    <div className="flex items-center gap-6 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Gross</div>
                        <div className="font-medium text-foreground">KES {ev.gross.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Fee</div>
                        <div className="font-medium text-destructive">− {ev.fee.toLocaleString()}</div>
                      </div>
                      <div className="text-right min-w-[90px]">
                        <div className="text-xs text-muted-foreground">Net</div>
                        <div className="font-bold text-success text-lg">KES {ev.net.toLocaleString()}</div>
                      </div>
                      {expandedEvent === ev.id
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Expanded tier breakdown */}
                  {expandedEvent === ev.id && ev.tiers.length > 0 && (
                    <div className="border-t border-border px-5 pb-5 pt-4 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tier Breakdown</p>
                      {ev.tiers.map((tier, i) => {
                        const tierGross = (tier.sold || 0) * tier.price;
                        const tierFee = Math.round(tierGross * PLATFORM_FEE_PCT);
                        const tierNet = tierGross - tierFee;
                        const pct = tier.capacity > 0 ? Math.round(((tier.sold || 0) / tier.capacity) * 100) : 0;
                        return (
                          <div key={i} className="bg-secondary/30 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-foreground">{tier.name}</span>
                              <span className="text-sm text-muted-foreground">KES {tier.price.toLocaleString()} × {tier.sold || 0}</span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <Progress value={pct} className="h-1.5 flex-1" />
                              <span className="text-xs text-muted-foreground w-16 text-right">{tier.sold || 0}/{tier.capacity}</span>
                            </div>
                            <div className="flex gap-4 text-sm">
                              <span className="text-muted-foreground">Gross: <span className="text-foreground font-medium">KES {tierGross.toLocaleString()}</span></span>
                              <span className="text-muted-foreground">Fee: <span className="text-destructive">−{tierFee.toLocaleString()}</span></span>
                              <span className="text-muted-foreground">Net: <span className="text-success font-bold">KES {tierNet.toLocaleString()}</span></span>
                            </div>
                          </div>
                        );
                      })}

                      <div className="flex justify-between pt-2 border-t border-border text-sm font-bold">
                        <span className="text-foreground">Event Total</span>
                        <div className="flex gap-6">
                          <span className="text-muted-foreground">Gross: KES {ev.gross.toLocaleString()}</span>
                          <span className="text-destructive">Fee: −{ev.fee.toLocaleString()}</span>
                          <span className="text-success">Net: KES {ev.net.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Total row */}
          {events.length > 0 && (
            <div className="glass rounded-2xl p-5 mt-4 flex flex-wrap gap-6 items-center justify-between">
              <span className="font-bold text-foreground text-lg">All Events Total</span>
              <div className="flex gap-6 flex-wrap">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Gross</div>
                  <div className="font-bold text-foreground">KES {totalGross.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Fees</div>
                  <div className="font-bold text-destructive">−KES {totalFee.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Net Earnings</div>
                  <div className="font-bold text-success text-xl">KES {totalNet.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
