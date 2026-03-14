"use client";

import { useState, useEffect } from "react";
import {
  Users, UserCheck, Clock, AlertTriangle, Crown, MapPin,
  Activity as ActivityIcon, TrendingUp, DollarSign, Ticket, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Navigation from "@/components/Navigation";
import { db } from "@/firebase/firebase";
import {
  collection, getDocs, query, orderBy, limit, doc, getDoc, onSnapshot,
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

interface Room { name: string; current: number; max: number; }
interface Activity { name: string; type: string; action: string; time: string; badge?: string | null; }
interface EventSettings { eventName: string; eventDate: string; venue: string; timezone: string; capacity: number; }
interface TicketTier { name: string; price: number; capacity: number; sold: number; }
interface GuestDoc { status: string; amountPaid?: number; createdAt?: any; ticketTier?: string; guestCategory?: string; }

const CHART_COLORS = ["#1bb3a0", "#6366f1", "#f59e0b", "#ef4444", "#22c55e", "#a855f7"];

const Dashboard = () => {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<EventSettings>({ eventName: "Event Dashboard", eventDate: "", venue: "", timezone: "UTC", capacity: 1500 });
  const [checkedIn, setCheckedIn] = useState(0);
  const [expected, setExpected] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [allGuests, setAllGuests] = useState<GuestDoc[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Settings
        const settingsSnap = await getDoc(doc(db, `tenants/${tenantId}/app_settings`, "settings"));
        if (settingsSnap.exists()) {
          const s = settingsSnap.data() as EventSettings;
          setSettings({ eventName: s.eventName || "Event Dashboard", eventDate: s.eventDate || "", venue: s.venue || "", timezone: s.timezone || "UTC", capacity: s.capacity || 1500 });
        }

        // Guests
        const guestsSnap = await getDocs(collection(db, `tenants/${tenantId}/guests`));
        const guests = guestsSnap.docs.map(d => d.data() as GuestDoc);
        setAllGuests(guests);
        setCheckedIn(guests.filter(g => g.status === "checked-in").length);
        setExpected(guests.length);
        setTotalRevenue(guests.reduce((sum, g) => sum + (g.amountPaid || 0), 0));

        // Rooms
        const roomsSnap = await getDocs(collection(db, `tenants/${tenantId}/rooms`));
        setRooms(roomsSnap.docs.map(d => d.data() as Room));

        // Activities
        const actSnap = await getDocs(query(collection(db, `tenants/${tenantId}/activities`), orderBy("timestamp", "desc"), limit(8)));
        setRecentActivity(actSnap.docs.map(d => {
          const data = d.data();
          return {
            name: data.name, type: data.type, action: data.action,
            time: data.timestamp?.toDate ? new Date(data.timestamp.toDate()).toLocaleTimeString() : "—",
            badge: data.badge || null,
          };
        }));

        // Events (for analytics)
        const eventsSnap = await getDocs(collection(db, `tenants/${tenantId}/events`));
        setEvents(eventsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantId]);

  // ---------- Analytics data derivations ----------

  // Revenue over last 7 days (buckets by date from guests)
  const revenueByDay = (() => {
    const map: Record<string, number> = {};
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      map[key] = 0;
    }
    allGuests.forEach(g => {
      if (!g.createdAt || !g.amountPaid) return;
      const date = g.createdAt?.toDate ? g.createdAt.toDate() : new Date(g.createdAt);
      const key = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      if (map[key] !== undefined) map[key] += g.amountPaid;
    });
    return Object.entries(map).map(([date, revenue]) => ({ date, revenue }));
  })();

  // Tickets sold by tier (across all events)
  const tierData = (() => {
    const map: Record<string, number> = {};
    events.forEach(ev => {
      (ev.ticketTiers || []).forEach((t: TicketTier) => {
        map[t.name] = (map[t.name] || 0) + (t.sold || 0);
      });
    });
    return Object.entries(map).map(([name, sold]) => ({ name, sold }));
  })();

  // Revenue by event
  const revenueByEvent = events.map(ev => {
    const rev = (ev.ticketTiers || []).reduce((s: number, t: TicketTier) => s + (t.sold || 0) * t.price, 0);
    return { name: ev.title?.slice(0, 20) || ev.id, revenue: rev };
  });

  // Category breakdown
  const categoryData = (() => {
    const map: Record<string, number> = {};
    allGuests.forEach(g => {
      const cat = g.ticketTier || g.guestCategory || "General";
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  })();

  // Summary metrics
  const totalTicketsSold = events.reduce((s, ev) => s + (ev.ticketTiers || []).reduce((ss: number, t: TicketTier) => ss + (t.sold || 0), 0), 0);
  const totalCapacity = events.reduce((s, ev) => s + (ev.ticketTiers || []).reduce((ss: number, t: TicketTier) => ss + t.capacity, 0), 0);
  const noShows = expected - checkedIn;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-foreground">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-7xl">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{settings.eventName}</h1>
              <p className="text-muted-foreground">{settings.venue} · Live Now</p>
            </div>
            <div className="flex items-center gap-3 mt-4 md:mt-0">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/20 text-success text-sm">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                Live
              </div>
            </div>
          </div>

          {/* Top Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Checked In", value: checkedIn, icon: UserCheck, color: "text-success" },
              { label: "Total Registered", value: expected, icon: Users, color: "text-primary" },
              { label: "No Shows", value: noShows, icon: AlertTriangle, color: "text-destructive" },
              { label: "Total Revenue", value: `KES ${totalRevenue.toLocaleString()}`, icon: DollarSign, color: "text-yellow-500" },
            ].map(stat => (
              <div key={stat.label} className="glass rounded-2xl p-5 hover:border-primary/30 transition-all">
                <div className={`w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-3 ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview">
            <TabsList className="mb-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            {/* ---- OVERVIEW TAB ---- */}
            <TabsContent value="overview">
              <div className="grid lg:grid-cols-3 gap-6">

                {/* Room Capacity */}
                <div className="lg:col-span-2 glass rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-foreground">Room Capacity</h2>
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-5">
                    {rooms.length === 0 && <p className="text-muted-foreground text-sm">No rooms configured.</p>}
                    {rooms.map(room => {
                      const pct = Math.round((room.current / room.max) * 100);
                      return (
                        <div key={room.name} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{room.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">{room.current}/{room.max}</span>
                              {pct > 90 && <AlertTriangle className="w-4 h-4 text-destructive" />}
                            </div>
                          </div>
                          <Progress value={pct} className={`h-2 ${pct > 90 ? '[&>div]:bg-destructive' : pct > 75 ? '[&>div]:bg-yellow-500' : ''}`} />
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 p-4 rounded-xl bg-secondary/50 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Overall Venue</span>
                      <span className="text-sm text-muted-foreground">{checkedIn} / {settings.capacity}</span>
                    </div>
                    <Progress value={(checkedIn / settings.capacity) * 100} className="h-2.5" />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>{Math.round((checkedIn / settings.capacity) * 100)}% filled</span>
                      <span>{settings.capacity - checkedIn} spots left</span>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="glass rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-xl font-semibold text-foreground">Recent Activity</h2>
                    <ActivityIcon className="w-5 h-5 text-primary animate-pulse" />
                  </div>
                  <div className="space-y-3">
                    {recentActivity.length === 0 && <p className="text-muted-foreground text-sm text-center py-6">No recent activity.</p>}
                    {recentActivity.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                        <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          {a.badge === "VIP" ? <Crown className="w-4 h-4 text-yellow-500" /> : <UserCheck className="w-4 h-4 text-success" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground text-sm truncate block">{a.name}</span>
                          {a.badge && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500">{a.badge}</span>}
                          <span className="text-xs text-muted-foreground block">{a.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </TabsContent>

            {/* ---- ANALYTICS TAB ---- */}
            <TabsContent value="analytics">
              <div className="space-y-6">

                {/* Analytics summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Total Revenue", value: `KES ${totalRevenue.toLocaleString()}`, icon: DollarSign, color: "text-yellow-500" },
                    { label: "Tickets Sold", value: totalTicketsSold, icon: Ticket, color: "text-primary" },
                    { label: "Total Capacity", value: totalCapacity, icon: BarChart2, color: "text-muted-foreground" },
                    { label: "Sell-through Rate", value: totalCapacity > 0 ? `${Math.round((totalTicketsSold / totalCapacity) * 100)}%` : "—", icon: TrendingUp, color: "text-success" },
                  ].map(s => (
                    <div key={s.label} className="glass rounded-2xl p-5">
                      <div className={`w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-3 ${s.color}`}>
                        <s.icon className="w-5 h-5" />
                      </div>
                      <div className="text-2xl font-bold text-foreground">{s.value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Revenue over time */}
                <div className="glass rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Revenue — Last 7 Days</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={revenueByDay} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ background: "#1e2846", border: "1px solid #334155", borderRadius: 8 }}
                        labelStyle={{ color: "#f8fafc" }}
                        formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Revenue"]}
                      />
                      <Line type="monotone" dataKey="revenue" stroke="#1bb3a0" strokeWidth={2.5} dot={{ fill: "#1bb3a0", r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Tickets sold by tier */}
                  <div className="glass rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Tickets Sold by Tier</h3>
                    {tierData.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No ticket data yet.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={tierData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                          <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ background: "#1e2846", border: "1px solid #334155", borderRadius: 8 }}
                            labelStyle={{ color: "#f8fafc" }}
                          />
                          <Bar dataKey="sold" radius={[6, 6, 0, 0]}>
                            {tierData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Attendee category breakdown */}
                  <div className="glass rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Attendee Breakdown</h3>
                    {categoryData.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No attendee data yet.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                            {categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: "#1e2846", border: "1px solid #334155", borderRadius: 8 }} labelStyle={{ color: "#f8fafc" }} />
                          <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Revenue by event */}
                {revenueByEvent.length > 0 && (
                  <div className="glass rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Revenue by Event</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={revenueByEvent} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} width={100} />
                        <Tooltip
                          contentStyle={{ background: "#1e2846", border: "1px solid #334155", borderRadius: 8 }}
                          formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Revenue"]}
                        />
                        <Bar dataKey="revenue" fill="#6366f1" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

              </div>
            </TabsContent>

          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
