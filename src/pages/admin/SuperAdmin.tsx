"use client";

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection, getDocs, doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, setDoc,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";
import { db, firebaseConfig } from "@/firebase/firebase";
import { useAuth } from "@/context/AuthContext";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Users, Building2, Ticket, Search,
  Trash2, ShieldCheck, ShieldOff, Plus, Eye, RefreshCw,
  Mail, MessageSquare, CreditCard, Key, Save,
  CheckCircle, Clock, XCircle, Smartphone,
} from "lucide-react";

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Tenant {
  id: string;
  organizationName: string;
  email: string;
  phone?: string;
  package?: string;
  createdAt?: any;
  suspended?: boolean;
  eventCount?: number;
  guestCount?: number;
}

interface AdminUser {
  id: string;
  email: string;
  tenantId: string;
  role: string;
}

interface SmsConfig {
  proxyUrl: string;
  apiKey: string;
  partnerID: string;
  shortcode: string;
}

interface EmailConfig {
  host: string;
  port: string;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  proxyUrl: string;
}

interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
  queryUrl: string;
  proxyUrl: string;
  environment: "sandbox" | "production";
}

interface PaystackConfig {
  publicKey: string;
  secretKey: string;
  verifyUrl: string;
}

// ── Subscription packages ──────────────────────────────────────────────────────
const PACKAGES = [
  { id: "basic",      name: "Basic",      price: 0,    color: "bg-slate-500/10 text-slate-500",    description: "Up to 2 events/month" },
  { id: "pro",        name: "Pro",        price: 2000, color: "bg-primary/10 text-primary",        description: "Up to 10 events/month + analytics" },
  { id: "enterprise", name: "Enterprise", price: 5000, color: "bg-purple-500/10 text-purple-500",  description: "Unlimited events + priority support" },
];

const DEFAULT_SMS: SmsConfig    = { proxyUrl: "", apiKey: "", partnerID: "", shortcode: "TIKOOH" };
const DEFAULT_EMAIL: EmailConfig = { host: "", port: "587", username: "", password: "", fromName: "Tikooh", fromEmail: "", proxyUrl: "" };
const DEFAULT_MPESA: MpesaConfig = { consumerKey: "", consumerSecret: "", shortcode: "", passkey: "", callbackUrl: "", queryUrl: "", proxyUrl: "", environment: "production" };
const DEFAULT_PAYSTACK: PaystackConfig = { publicKey: "", secretKey: "", verifyUrl: "" };

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | string; color: string }) {
  return (
    <div className="glass rounded-2xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function CredField({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="text-sm" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Tenants / Admins
  const [tenants, setTenants]     = useState<Tenant[]>([]);
  const [admins, setAdmins]       = useState<AdminUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Add tenant modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ orgName: "", email: "", phone: "", password: "", package: "basic" });
  const [isAdding, setIsAdding]   = useState(false);

  // View tenant modal
  const [viewTenant, setViewTenant] = useState<Tenant | null>(null);

  // Credentials
  const [smsConfig,   setSmsConfig]   = useState<SmsConfig>(DEFAULT_SMS);
  const [emailConfig, setEmailConfig] = useState<EmailConfig>(DEFAULT_EMAIL);
  const [mpesaConfig,     setMpesaConfig]     = useState<MpesaConfig>(DEFAULT_MPESA);
  const [paystackConfig,  setPaystackConfig]  = useState<PaystackConfig>(DEFAULT_PAYSTACK);
  const [savingCreds, setSavingCreds] = useState(false);

  // Subscription
  const [subTenant,   setSubTenant]   = useState<Tenant | null>(null);
  const [subPackage,  setSubPackage]  = useState("");
  const [subPhone,    setSubPhone]    = useState("");
  const [subLoading,  setSubLoading]  = useState(false);
  const [subStatus,   setSubStatus]   = useState<"idle" | "pending" | "success" | "failed">("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Guard ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { navigate("/admin/login"); return; }
    const checkRole = async () => {
      try {
        const meDoc = await getDoc(doc(db, "admins", user.uid));
        if (!meDoc.exists() || meDoc.data().role !== "super_admin") {
          toast({ title: "Access denied — super_admin only", variant: "destructive" });
          navigate("/dashboard");
          return;
        }
        setIsSuperAdmin(true);
      } catch (err: any) {
        toast({ title: "Access check failed", description: err.message, variant: "destructive" });
        navigate("/dashboard");
      }
    };
    checkRole();
  }, [user]);

  // ── Load data ─────────────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const [tenantSnap, adminSnap] = await Promise.all([
        getDocs(collection(db, "tenants")),
        getDocs(collection(db, "admins")),
      ]);

      const adminList: AdminUser[] = adminSnap.docs.map(d => ({
        id: d.id, ...(d.data() as Omit<AdminUser, "id">),
      }));
      setAdmins(adminList);

      const tenantList: Tenant[] = await Promise.all(
        tenantSnap.docs.map(async (d) => {
          const data = d.data();
          let eventCount = 0, guestCount = 0;
          try {
            const [evSnap, gSnap] = await Promise.all([
              getDocs(collection(db, `tenants/${d.id}/events`)),
              getDocs(collection(db, `tenants/${d.id}/guests`)),
            ]);
            eventCount = evSnap.size;
            guestCount = gSnap.size;
          } catch (_) {}
          return {
            id: d.id,
            organizationName: data.organizationName || "—",
            email: data.email || "—",
            phone: data.phone || "",
            package: data.package || "basic",
            createdAt: data.createdAt,
            suspended: data.suspended || false,
            eventCount,
            guestCount,
          };
        })
      );
      setTenants(tenantList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    } catch (err: any) {
      toast({ title: "Failed to load", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isSuperAdmin) loadData(); }, [isSuperAdmin]);

  // ── Load credentials ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSuperAdmin) return;
    const loadCreds = async () => {
      try {
        const [smsSnap, emailSnap, mpesaSnap, paystackSnap] = await Promise.all([
          getDoc(doc(db, "config", "sms")),
          getDoc(doc(db, "config", "email")),
          getDoc(doc(db, "config", "mpesa")),
          getDoc(doc(db, "config", "paystack")),
        ]);
        if (smsSnap.exists())      setSmsConfig({ ...DEFAULT_SMS,      ...smsSnap.data() as SmsConfig });
        if (emailSnap.exists())    setEmailConfig({ ...DEFAULT_EMAIL,    ...emailSnap.data() as EmailConfig });
        if (mpesaSnap.exists())    setMpesaConfig({ ...DEFAULT_MPESA,    ...mpesaSnap.data() as MpesaConfig });
        if (paystackSnap.exists()) setPaystackConfig({ ...DEFAULT_PAYSTACK, ...paystackSnap.data() as PaystackConfig });
      } catch (_) {}
    };
    loadCreds();
  }, [isSuperAdmin]);

  // ── Save credentials ──────────────────────────────────────────────────────────
  const saveCredentials = async () => {
    setSavingCreds(true);
    try {
      await Promise.all([
        setDoc(doc(db, "config", "sms"),      smsConfig),
        setDoc(doc(db, "config", "email"),    emailConfig),
        setDoc(doc(db, "config", "mpesa"),    mpesaConfig),
        setDoc(doc(db, "config", "paystack"), paystackConfig),
      ]);
      toast({ title: "Credentials saved successfully" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSavingCreds(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const totalEvents   = tenants.reduce((s, t) => s + (t.eventCount || 0), 0);
  const totalGuests   = tenants.reduce((s, t) => s + (t.guestCount || 0), 0);
  const activeTenants = tenants.filter(t => !t.suspended).length;

  // ── Tenant actions ────────────────────────────────────────────────────────────
  const toggleSuspend = async (tenant: Tenant) => {
    if (!confirm(`${tenant.suspended ? "Reinstate" : "Suspend"} ${tenant.organizationName}?`)) return;
    await updateDoc(doc(db, "tenants", tenant.id), { suspended: !tenant.suspended });
    setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, suspended: !t.suspended } : t));
    toast({ title: tenant.suspended ? "Tenant reinstated" : "Tenant suspended" });
  };

  const deleteTenant = async (tenant: Tenant) => {
    if (!confirm(`Permanently delete "${tenant.organizationName}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, "tenants", tenant.id));
    setTenants(prev => prev.filter(t => t.id !== tenant.id));
    toast({ title: "Tenant deleted" });
  };

  const addTenant = async () => {
    if (!addForm.orgName || !addForm.email || !addForm.password) {
      toast({ title: "Fill all required fields", variant: "destructive" }); return;
    }
    setIsAdding(true);
    try {
      const secondaryApp = getApps().find(a => a.name === "secondary") ?? initializeApp(firebaseConfig, "secondary");
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, addForm.email, addForm.password);
      await secondaryAuth.signOut();
      const uid = cred.user.uid;
      await Promise.all([
        setDoc(doc(db, "tenants", uid), {
          organizationName: addForm.orgName,
          email: addForm.email,
          phone: addForm.phone,
          package: addForm.package,
          createdAt: serverTimestamp(),
          admins: [uid],
          suspended: false,
        }),
        setDoc(doc(db, "admins", uid), {
          email: addForm.email,
          tenantId: uid,
          role: "admin",
          createdAt: serverTimestamp(),
        }),
      ]);
      toast({ title: `Tenant "${addForm.orgName}" created` });
      setShowAddModal(false);
      setAddForm({ orgName: "", email: "", phone: "", password: "", package: "basic" });
      loadData();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  // ── Subscription / Mpesa ──────────────────────────────────────────────────────
  const openSubscriptionModal = (tenant: Tenant) => {
    setSubTenant(tenant);
    setSubPackage(tenant.package || "basic");
    setSubPhone(tenant.phone || "");
    setSubStatus("idle");
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const initiateMpesaPayment = async () => {
    if (!subTenant || !subPackage || !subPhone) {
      toast({ title: "Fill all fields", variant: "destructive" }); return;
    }
    const pkg = PACKAGES.find(p => p.id === subPackage);
    if (!pkg) return;

    // Free plan — just update without payment
    if (pkg.price === 0) {
      await updateDoc(doc(db, "tenants", subTenant.id), { package: subPackage });
      setTenants(prev => prev.map(t => t.id === subTenant!.id ? { ...t, package: subPackage } : t));
      toast({ title: `Package set to ${pkg.name}` });
      setSubTenant(null);
      return;
    }

    if (!mpesaConfig.proxyUrl) {
      toast({ title: "Mpesa not configured — set credentials first", variant: "destructive" }); return;
    }

    setSubLoading(true);
    setSubStatus("pending");
    try {
      const res = await fetch(mpesaConfig.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: pkg.price,
          phone: subPhone,
          accountRef: `INVENT-${subTenant.id.slice(0, 6).toUpperCase()}`,
          description: `Tikooh ${pkg.name} Subscription`,
          consumerKey: mpesaConfig.consumerKey,
          consumerSecret: mpesaConfig.consumerSecret,
          shortcode: mpesaConfig.shortcode,
          passkey: mpesaConfig.passkey,
          callbackUrl: mpesaConfig.callbackUrl,
          environment: mpesaConfig.environment,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ResponseCode !== "0") {
        throw new Error(data.CustomerMessage || data.errorMessage || "STK push failed");
      }
      const checkoutId = data.CheckoutRequestID;
      toast({ title: "Mpesa prompt sent", description: "Check your phone and enter your PIN" });

      // Poll for payment status every 5 s
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const qRes = await fetch(mpesaConfig.queryUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              checkoutRequestId: checkoutId,
              consumerKey: mpesaConfig.consumerKey,
              consumerSecret: mpesaConfig.consumerSecret,
              shortcode: mpesaConfig.shortcode,
              passkey: mpesaConfig.passkey,
              environment: mpesaConfig.environment,
            }),
          });
          const qData = await qRes.json();
          const code = String(qData.ResultCode ?? "");

          if (code === "0") {
            clearInterval(pollRef.current!);
            setSubStatus("success");
            await updateDoc(doc(db, "tenants", subTenant!.id), {
              package: subPackage,
              lastPayment: { amount: pkg.price, date: new Date().toISOString(), checkoutId },
            });
            setTenants(prev => prev.map(t => t.id === subTenant!.id ? { ...t, package: subPackage } : t));
            toast({ title: `Subscription upgraded to ${pkg.name}!`, description: `KES ${pkg.price} received` });
          } else if (code === "1032" || attempts >= 12) {
            clearInterval(pollRef.current!);
            setSubStatus("failed");
            toast({ title: "Payment cancelled or timed out", variant: "destructive" });
          }
        } catch (_) {
          if (attempts >= 12) { clearInterval(pollRef.current!); setSubStatus("failed"); }
        }
      }, 5000);
    } catch (err: any) {
      setSubStatus("failed");
      toast({ title: "Payment failed", description: err.message, variant: "destructive" });
    } finally {
      setSubLoading(false);
    }
  };

  // cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const filtered = tenants.filter(t =>
    t.organizationName.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase())
  );

  if (!isSuperAdmin) return null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-6xl">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="w-7 h-7 text-primary" /> Super Admin
              </h1>
              <p className="text-muted-foreground">Platform-wide management</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <Button variant="hero" size="sm" onClick={() => setShowAddModal(true)}>
                <Plus className="w-4 h-4 mr-2" /> Add Tenant
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard icon={Building2} label="Total Tenants" value={tenants.length}  color="bg-primary/10 text-primary" />
            <StatCard icon={ShieldCheck} label="Active"       value={activeTenants}  color="bg-success/10 text-success" />
            <StatCard icon={Ticket}      label="Total Events"  value={totalEvents}    color="bg-blue-500/10 text-blue-500" />
            <StatCard icon={Users}       label="Total Guests"  value={totalGuests}    color="bg-purple-500/10 text-purple-500" />
          </div>

          {/* ── Tabs ─────────────────────────────────────────────────────────── */}
          <Tabs defaultValue="tenants">
            <TabsList className="mb-6">
              <TabsTrigger value="tenants">Tenants ({tenants.length})</TabsTrigger>
              <TabsTrigger value="admins">Admin Users ({admins.length})</TabsTrigger>
              <TabsTrigger value="subscriptions"><CreditCard className="w-4 h-4 mr-1 inline" />Subscriptions</TabsTrigger>
              <TabsTrigger value="credentials"><Key className="w-4 h-4 mr-1 inline" />Credentials</TabsTrigger>
            </TabsList>

            {/* ── TENANTS ──────────────────────────────────────────────────── */}
            <TabsContent value="tenants">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-10" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {loading ? (
                <p className="text-center text-muted-foreground py-12">Loading tenants…</p>
              ) : (
                <div className="space-y-3">
                  {filtered.map(tenant => (
                    <div key={tenant.id} className={`glass rounded-2xl p-4 flex items-center gap-4 ${tenant.suspended ? "opacity-60" : ""}`}>
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{tenant.organizationName}</p>
                          <Badge variant="outline" className="text-xs capitalize">{tenant.package}</Badge>
                          {tenant.suspended && (
                            <Badge variant="outline" className="text-xs border-destructive/50 text-destructive bg-destructive/10">Suspended</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{tenant.email}</p>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{tenant.eventCount} events</span>
                          <span>{tenant.guestCount} guests</span>
                          {tenant.createdAt && (
                            <span>Joined {new Date(tenant.createdAt.seconds * 1000).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button variant="outline" size="icon" title="View details" onClick={() => setViewTenant(tenant)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" title={tenant.suspended ? "Reinstate" : "Suspend"} onClick={() => toggleSuspend(tenant)}>
                          {tenant.suspended ? <ShieldCheck className="w-4 h-4 text-success" /> : <ShieldOff className="w-4 h-4 text-yellow-500" />}
                        </Button>
                        <Button variant="outline" size="icon" title="Delete tenant" onClick={() => deleteTenant(tenant)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && <p className="text-center text-muted-foreground py-12">No tenants found</p>}
                </div>
              )}
            </TabsContent>

            {/* ── ADMINS ───────────────────────────────────────────────────── */}
            <TabsContent value="admins">
              <div className="space-y-3">
                {admins.map(admin => (
                  <div key={admin.id} className="glass rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">{admin.email.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{admin.email}</p>
                      <p className="text-xs text-muted-foreground">Tenant: {admin.tenantId}</p>
                    </div>
                    <Badge variant="outline" className={`text-xs ${admin.role === "super_admin" ? "border-primary/50 text-primary bg-primary/10" : ""}`}>
                      {admin.role}
                    </Badge>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── SUBSCRIPTIONS ─────────────────────────────────────────────── */}
            <TabsContent value="subscriptions">
              {/* Pricing cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {PACKAGES.map(pkg => (
                  <div key={pkg.id} className={`glass rounded-2xl p-5 border-2 ${pkg.id === "pro" ? "border-primary" : "border-border"}`}>
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium mb-3 ${pkg.color}`}>
                      <CreditCard className="w-4 h-4" /> {pkg.name}
                    </div>
                    <p className="text-2xl font-bold text-foreground mb-1">
                      {pkg.price === 0 ? "Free" : `KES ${pkg.price.toLocaleString()}`}
                      {pkg.price > 0 && <span className="text-sm font-normal text-muted-foreground">/month</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{pkg.description}</p>
                  </div>
                ))}
              </div>

              {/* Tenant subscription list */}
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tenant Subscriptions</h3>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading…</p>
              ) : (
                <div className="space-y-3">
                  {tenants.map(tenant => {
                    const pkg = PACKAGES.find(p => p.id === tenant.package) || PACKAGES[0];
                    return (
                      <div key={tenant.id} className="glass rounded-2xl p-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground">{tenant.organizationName}</p>
                          <p className="text-sm text-muted-foreground">{tenant.email}</p>
                        </div>
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${pkg.color}`}>
                          {pkg.name}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => openSubscriptionModal(tenant)}>
                          Change Plan
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── CREDENTIALS ───────────────────────────────────────────────── */}
            <TabsContent value="credentials">
              <div className="space-y-6">

                {/* SMS */}
                <div className="glass rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
                    <MessageSquare className="w-5 h-5 text-primary" /> Advanta SMS
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CredField label="SMS Proxy URL (PHP endpoint)" value={smsConfig.proxyUrl} onChange={v => setSmsConfig(c => ({ ...c, proxyUrl: v }))} placeholder="https://yourdomain.com/sms/send_sms.php" />
                    <CredField label="API Key" value={smsConfig.apiKey} onChange={v => setSmsConfig(c => ({ ...c, apiKey: v }))} type="password" placeholder="Advanta API key" />
                    <CredField label="Partner ID" value={smsConfig.partnerID} onChange={v => setSmsConfig(c => ({ ...c, partnerID: v }))} placeholder="e.g. 600123" />
                    <CredField label="Shortcode / Sender ID" value={smsConfig.shortcode} onChange={v => setSmsConfig(c => ({ ...c, shortcode: v }))} placeholder="e.g. TIKOOH" />
                  </div>
                </div>

                {/* Email */}
                <div className="glass rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
                    <Mail className="w-5 h-5 text-primary" /> SMTP Email
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CredField label="Email Proxy URL (PHP endpoint)" value={emailConfig.proxyUrl} onChange={v => setEmailConfig(c => ({ ...c, proxyUrl: v }))} placeholder="https://yourdomain.com/email/send_email.php" />
                    <CredField label="SMTP Host" value={emailConfig.host} onChange={v => setEmailConfig(c => ({ ...c, host: v }))} placeholder="mail.yourdomain.com" />
                    <CredField label="SMTP Port" value={emailConfig.port} onChange={v => setEmailConfig(c => ({ ...c, port: v }))} placeholder="587" />
                    <CredField label="SMTP Username" value={emailConfig.username} onChange={v => setEmailConfig(c => ({ ...c, username: v }))} placeholder="noreply@yourdomain.com" />
                    <CredField label="SMTP Password" value={emailConfig.password} onChange={v => setEmailConfig(c => ({ ...c, password: v }))} type="password" />
                    <CredField label="From Name" value={emailConfig.fromName} onChange={v => setEmailConfig(c => ({ ...c, fromName: v }))} placeholder="Tikooh" />
                    <CredField label="From Email" value={emailConfig.fromEmail} onChange={v => setEmailConfig(c => ({ ...c, fromEmail: v }))} placeholder="noreply@tikooh.com" />
                  </div>
                </div>

                {/* Mpesa */}
                <div className="glass rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
                    <Smartphone className="w-5 h-5 text-primary" /> Mpesa (Daraja)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CredField label="STK Push Proxy URL" value={mpesaConfig.proxyUrl} onChange={v => setMpesaConfig(c => ({ ...c, proxyUrl: v }))} placeholder="https://yourdomain.com/mpesa/stk_push.php" />
                    <CredField label="Query Status URL" value={mpesaConfig.queryUrl} onChange={v => setMpesaConfig(c => ({ ...c, queryUrl: v }))} placeholder="https://yourdomain.com/mpesa/query.php" />
                    <CredField label="Consumer Key" value={mpesaConfig.consumerKey} onChange={v => setMpesaConfig(c => ({ ...c, consumerKey: v }))} type="password" />
                    <CredField label="Consumer Secret" value={mpesaConfig.consumerSecret} onChange={v => setMpesaConfig(c => ({ ...c, consumerSecret: v }))} type="password" />
                    <CredField label="Shortcode (Paybill/Till)" value={mpesaConfig.shortcode} onChange={v => setMpesaConfig(c => ({ ...c, shortcode: v }))} placeholder="174379" />
                    <CredField label="Passkey" value={mpesaConfig.passkey} onChange={v => setMpesaConfig(c => ({ ...c, passkey: v }))} type="password" />
                    <CredField label="Callback URL" value={mpesaConfig.callbackUrl} onChange={v => setMpesaConfig(c => ({ ...c, callbackUrl: v }))} placeholder="https://yourdomain.com/mpesa/callback.php" />
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Environment</Label>
                      <select
                        className="w-full border rounded-md px-3 py-2 bg-transparent text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={mpesaConfig.environment}
                        onChange={e => setMpesaConfig(c => ({ ...c, environment: e.target.value as "sandbox" | "production" }))}
                      >
                        <option value="sandbox">Sandbox (Testing)</option>
                        <option value="production">Production</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Paystack */}
                <div className="glass rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
                    <CreditCard className="w-5 h-5 text-primary" /> Paystack
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CredField label="Public Key (pk_live_... or pk_test_...)" value={paystackConfig.publicKey} onChange={v => setPaystackConfig(c => ({ ...c, publicKey: v }))} placeholder="pk_live_xxxxxxxxxxxxxxxx" />
                    <CredField label="Secret Key (sk_live_... or sk_test_...)" value={paystackConfig.secretKey} onChange={v => setPaystackConfig(c => ({ ...c, secretKey: v }))} type="password" placeholder="sk_live_xxxxxxxxxxxxxxxx" />
                    <CredField label="Verify URL (PHP endpoint)" value={paystackConfig.verifyUrl} onChange={v => setPaystackConfig(c => ({ ...c, verifyUrl: v }))} placeholder="https://yourdomain.com/payment/paystack_verify.php" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    The public key is used client-side (safe to expose). The secret key is only sent to your PHP verify endpoint — never to the browser directly.
                  </p>
                </div>

                <Button variant="hero" onClick={saveCredentials} disabled={savingCreds} className="w-full md:w-auto">
                  <Save className="w-4 h-4 mr-2" />
                  {savingCreds ? "Saving…" : "Save All Credentials"}
                </Button>
              </div>
            </TabsContent>

          </Tabs>
        </div>
      </main>

      {/* ── Add Tenant Modal ───────────────────────────────────────────────────── */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Add New Tenant</DialogTitle>
            <DialogDescription>Creates a Firebase Auth account + tenant document</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label>Organization Name *</Label>
              <Input value={addForm.orgName} onChange={e => setAddForm({ ...addForm, orgName: e.target.value })} placeholder="e.g. Nairobi Events Co." />
            </div>
            <div><Label>Email *</Label>
              <Input type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} placeholder="admin@org.com" />
            </div>
            <div><Label>Phone</Label>
              <Input value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} placeholder="0712 345 678" />
            </div>
            <div><Label>Password *</Label>
              <Input type="password" value={addForm.password} onChange={e => setAddForm({ ...addForm, password: e.target.value })} placeholder="Min 6 characters" />
            </div>
            <div><Label>Package</Label>
              <select
                className="w-full border rounded-md px-3 py-2 bg-transparent text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={addForm.package}
                onChange={e => setAddForm({ ...addForm, package: e.target.value })}
              >
                {PACKAGES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button variant="hero" onClick={addTenant} disabled={isAdding}>
              {isAdding ? "Creating…" : "Create Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Tenant Modal ──────────────────────────────────────────────────── */}
      {viewTenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">{viewTenant.organizationName}</h2>
              <Button variant="ghost" size="icon" onClick={() => setViewTenant(null)}><span className="text-lg">×</span></Button>
            </div>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Email:</span> <strong>{viewTenant.email}</strong></p>
              <p><span className="text-muted-foreground">Phone:</span> <strong>{viewTenant.phone || "—"}</strong></p>
              <p><span className="text-muted-foreground">Package:</span> <strong className="capitalize">{viewTenant.package}</strong></p>
              <p><span className="text-muted-foreground">Tenant ID:</span> <code className="text-xs bg-secondary px-1 py-0.5 rounded">{viewTenant.id}</code></p>
              <p><span className="text-muted-foreground">Events:</span> <strong>{viewTenant.eventCount}</strong></p>
              <p><span className="text-muted-foreground">Guests:</span> <strong>{viewTenant.guestCount}</strong></p>
              <p><span className="text-muted-foreground">Status:</span> <strong>{viewTenant.suspended ? "Suspended" : "Active"}</strong></p>
              {viewTenant.createdAt && (
                <p><span className="text-muted-foreground">Joined:</span> <strong>{new Date(viewTenant.createdAt.seconds * 1000).toLocaleString()}</strong></p>
              )}
            </div>
            <Button className="w-full mt-2" variant="outline" onClick={() => setViewTenant(null)}>Close</Button>
          </div>
        </div>
      )}

      {/* ── Subscription / Mpesa Modal ─────────────────────────────────────────── */}
      {subTenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-lg space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Change Subscription</h2>
              <Button variant="ghost" size="icon" onClick={() => { setSubTenant(null); if (pollRef.current) clearInterval(pollRef.current); }}>
                <span className="text-lg">×</span>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Tenant: <strong className="text-foreground">{subTenant.organizationName}</strong></p>

            {/* Package selection */}
            <div className="grid grid-cols-3 gap-3">
              {PACKAGES.map(pkg => (
                <button
                  key={pkg.id}
                  onClick={() => setSubPackage(pkg.id)}
                  className={`rounded-xl p-3 border-2 text-left transition-all ${subPackage === pkg.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <p className="font-semibold text-sm text-foreground">{pkg.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pkg.price === 0 ? "Free" : `KES ${pkg.price.toLocaleString()}/mo`}
                  </p>
                </button>
              ))}
            </div>

            {/* Mpesa payment (only for paid plans) */}
            {subPackage !== "basic" && subStatus === "idle" && (
              <div>
                <Label className="text-sm mb-1 block">Mpesa Phone Number</Label>
                <Input
                  value={subPhone}
                  onChange={e => setSubPhone(e.target.value)}
                  placeholder="0712 345 678"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  KES {PACKAGES.find(p => p.id === subPackage)?.price.toLocaleString()} will be charged via Mpesa STK Push
                </p>
              </div>
            )}

            {/* Status indicators */}
            {subStatus === "pending" && (
              <div className="flex items-center gap-3 p-4 bg-yellow-500/10 rounded-xl">
                <Clock className="w-5 h-5 text-yellow-500 animate-pulse" />
                <div>
                  <p className="text-sm font-medium text-foreground">Waiting for payment…</p>
                  <p className="text-xs text-muted-foreground">Check your phone and enter your Mpesa PIN</p>
                </div>
              </div>
            )}
            {subStatus === "success" && (
              <div className="flex items-center gap-3 p-4 bg-success/10 rounded-xl">
                <CheckCircle className="w-5 h-5 text-success" />
                <p className="text-sm font-medium text-success">Payment received! Package updated.</p>
              </div>
            )}
            {subStatus === "failed" && (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl">
                <XCircle className="w-5 h-5 text-destructive" />
                <p className="text-sm font-medium text-destructive">Payment failed or cancelled.</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setSubTenant(null); if (pollRef.current) clearInterval(pollRef.current); }}>
                Cancel
              </Button>
              {(subStatus === "idle" || subStatus === "failed") && (
                <Button
                  variant="hero"
                  className="flex-1"
                  onClick={initiateMpesaPayment}
                  disabled={subLoading}
                >
                  {subPackage === "basic" ? "Set Free Plan" : subLoading ? "Sending…" : "Pay with Mpesa"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
