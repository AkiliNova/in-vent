"use client";

import { useState, useEffect } from "react";
import {
  Plus, Send, CheckCircle2, Zap, Clock, Edit2, Trash2, Users, Mail, Phone, X
} from "lucide-react";
import { db, storage } from "@/firebase/firebase";
import {
  collection, addDoc, getDocs, updateDoc, doc, serverTimestamp, deleteDoc, query, where, onSnapshot
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/context/AuthContext";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

interface Campaign {
  id: string;
  name: string;
  type: "sms" | "email";
  status: "draft" | "scheduled" | "sent" | "sending";
  audience: string;
  message?: string;
  subject?: string;
  imageUrl?: string;
  sent: number;
  delivered: number;
  scheduledFor?: string;
  sentAt?: string;
  createdAt?: any;
}

interface GuestDoc {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  status: string;
  guestCategory?: string;
}

const AUDIENCE_OPTIONS = [
  { value: "all", label: "All Registered" },
  { value: "checked-in", label: "Checked In" },
  { value: "pending", label: "Not Yet Checked In" },
  { value: "VIP", label: "VIP Only" },
];

const CampaignsUI = () => {
  const { tenantId } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [showComposer, setShowComposer] = useState(false);
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const [allGuests, setAllGuests] = useState<GuestDoc[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendingProgress, setSendingProgress] = useState(0);

  // Form state
  const [form, setForm] = useState({
    name: "",
    type: "email" as "email" | "sms",
    audience: "all",
    subject: "",
    message: "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Load campaigns
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `tenants/${tenantId}/campaigns`), snap => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as Campaign))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });
    return () => unsub();
  }, [tenantId]);

  // Load guests for audience preview
  useEffect(() => {
    if (!tenantId) return;
    getDocs(collection(db, `tenants/${tenantId}/guests`)).then(snap => {
      setAllGuests(snap.docs.map(d => d.data() as GuestDoc));
    });
  }, [tenantId]);

  // Compute audience based on filter
  const getAudience = (audienceKey: string): GuestDoc[] => {
    switch (audienceKey) {
      case "all": return allGuests;
      case "checked-in": return allGuests.filter(g => g.status === "checked-in");
      case "pending": return allGuests.filter(g => g.status !== "checked-in");
      case "VIP": return allGuests.filter(g => g.guestCategory === "VIP");
      default: return allGuests;
    }
  };

  const audienceCount = getAudience(form.audience).length;

  const openComposer = () => {
    setEditCampaignId(null);
    setForm({ name: "", type: "email", audience: "all", subject: "", message: "" });
    setImageFile(null); setImagePreview(null);
    setShowComposer(true);
  };

  const handleEdit = (c: Campaign) => {
    setEditCampaignId(c.id);
    setForm({ name: c.name, type: c.type || "email", audience: c.audience, subject: c.subject || "", message: c.message || "" });
    setImagePreview(c.imageUrl || null);
    setShowComposer(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.message || !tenantId) {
      toast({ title: "Fill in all required fields", variant: "destructive" });
      return;
    }

    try {
      let imageUrl = imagePreview || undefined;
      if (imageFile) {
        const imgRef = ref(storage, `tenants/${tenantId}/campaign-images/${Date.now()}-${imageFile.name}`);
        await uploadBytes(imgRef, imageFile);
        imageUrl = await getDownloadURL(imgRef);
      }

      const data = { name: form.name, type: form.type, audience: form.audience, subject: form.subject, message: form.message, imageUrl };

      if (editCampaignId) {
        await updateDoc(doc(db, `tenants/${tenantId}/campaigns`, editCampaignId), data);
        toast({ title: "Campaign updated!" });
      } else {
        await addDoc(collection(db, `tenants/${tenantId}/campaigns`), {
          ...data, status: "draft", sent: 0, delivered: 0, createdAt: serverTimestamp(),
        });
        toast({ title: "Campaign saved as draft!" });
      }

      setShowComposer(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
  };

  const handleSend = async (campaign: Campaign) => {
    if (!tenantId) return;
    const targets = getAudience(campaign.audience);
    if (targets.length === 0) {
      toast({ title: "No recipients in this audience", variant: "destructive" });
      return;
    }

    if (!confirm(`Send "${campaign.name}" to ${targets.length} recipients?`)) return;

    setIsSending(true);
    setSendingProgress(0);

    try {
      // Mark as sending
      await updateDoc(doc(db, `tenants/${tenantId}/campaigns`, campaign.id), { status: "sending" });

      // Simulate batch sending — in production, call your SMS/email API here
      // e.g. POST to https://tikooh.akilinova.tech/campaigns/send.php
      let sent = 0;
      const batchSize = Math.max(1, Math.floor(targets.length / 10));

      for (let i = 0; i < targets.length; i += batchSize) {
        // In production: send actual SMS/email to targets.slice(i, i + batchSize)
        // For now we simulate the send with a short delay
        await new Promise(r => setTimeout(r, 200));
        sent = Math.min(i + batchSize, targets.length);
        setSendingProgress(Math.round((sent / targets.length) * 100));
      }

      // Mark as sent
      await updateDoc(doc(db, `tenants/${tenantId}/campaigns`, campaign.id), {
        status: "sent",
        sent: targets.length,
        delivered: targets.length,
        sentAt: new Date().toISOString(),
      });

      toast({ title: `Sent to ${targets.length} recipients!` });
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
      await updateDoc(doc(db, `tenants/${tenantId}/campaigns`, campaign.id), { status: "draft" });
    } finally {
      setIsSending(false);
      setSendingProgress(0);
    }
  };

  const handleDelete = async (id: string) => {
    if (!tenantId || !confirm("Delete this campaign?")) return;
    try {
      await deleteDoc(doc(db, `tenants/${tenantId}/campaigns`, id));
      toast({ title: "Deleted" });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const StatusBadge = ({ status }: { status: Campaign["status"] }) => {
    const map = {
      sent: { label: "Sent", cls: "bg-success/20 text-success", icon: <CheckCircle2 className="w-3 h-3" /> },
      draft: { label: "Draft", cls: "bg-secondary text-muted-foreground", icon: null },
      sending: { label: "Sending", cls: "bg-yellow-500/20 text-yellow-500", icon: <Zap className="w-3 h-3" /> },
      scheduled: { label: "Scheduled", cls: "bg-blue-500/20 text-blue-400", icon: <Clock className="w-3 h-3" /> },
    };
    const s = map[status];
    return (
      <span className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 ${s.cls}`}>
        {s.icon} {s.label}
      </span>
    );
  };

  const filteredCampaigns = campaigns.filter(c =>
    activeTab === "all" || c.status === activeTab || (activeTab === "drafts" && c.status === "draft")
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-5xl">

          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold">Campaigns</h1>
              <p className="text-muted-foreground">Send messages to your attendees</p>
            </div>
            <Button variant="hero" onClick={openComposer}>
              <Plus className="w-4 h-4 mr-2" /> New Campaign
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: "Total Campaigns", value: campaigns.length, icon: Mail },
              { label: "Total Sent", value: campaigns.reduce((s, c) => s + (c.sent || 0), 0), icon: Send },
              { label: "Audience Size", value: allGuests.length, icon: Users },
            ].map(s => (
              <div key={s.label} className="glass rounded-2xl p-4 text-center">
                <s.icon className="w-5 h-5 text-primary mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Sending progress */}
          {isSending && (
            <div className="glass rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-3 mb-2">
                <Zap className="w-4 h-4 text-yellow-500 animate-pulse" />
                <span className="font-medium text-foreground">Sending campaign...</span>
                <span className="ml-auto text-sm text-muted-foreground">{sendingProgress}%</span>
              </div>
              <Progress value={sendingProgress} className="h-2" />
            </div>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-5">
              <TabsTrigger value="all">All ({campaigns.length})</TabsTrigger>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {filteredCampaigns.length === 0 ? (
                <div className="glass rounded-2xl p-10 text-center">
                  <Mail className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No campaigns here yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCampaigns.map(c => {
                    const targets = getAudience(c.audience);
                    return (
                      <div key={c.id} className="glass rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap mb-1">
                            <h3 className="font-semibold text-foreground">{c.name}</h3>
                            <StatusBadge status={c.status} />
                            <Badge variant="outline" className="text-xs">
                              {c.type === "email" ? <Mail className="w-3 h-3 mr-1 inline" /> : <Phone className="w-3 h-3 mr-1 inline" />}
                              {c.type.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{c.message}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {targets.length} recipients ({AUDIENCE_OPTIONS.find(a => a.value === c.audience)?.label})</span>
                            {c.sent > 0 && <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-success" /> {c.sent} sent</span>}
                            {c.sentAt && <span>Sent {new Date(c.sentAt).toLocaleDateString()}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {c.status === "draft" && (
                            <Button
                              variant="hero"
                              size="sm"
                              onClick={() => handleSend(c)}
                              disabled={isSending}
                            >
                              <Send className="w-4 h-4 mr-1" /> Send Now
                            </Button>
                          )}
                          {c.status === "draft" && (
                            <Button variant="outline" size="icon" onClick={() => handleEdit(c)}>
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="outline" size="icon" onClick={() => handleDelete(c.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Composer Modal */}
      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="glass rounded-3xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">{editCampaignId ? "Edit Campaign" : "New Campaign"}</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowComposer(false)}><X className="w-5 h-5" /></Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Campaign Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Pre-event reminder" className="mt-1" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as "email" | "sms" }))}
                    className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground"
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>
                <div>
                  <Label>Audience</Label>
                  <select
                    value={form.audience}
                    onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground"
                  >
                    {AUDIENCE_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Audience preview */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/20">
                <Users className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm text-foreground">
                  <strong>{audienceCount}</strong> recipients will receive this message
                </span>
              </div>

              {form.type === "email" && (
                <div>
                  <Label>Subject</Label>
                  <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Email subject line" className="mt-1" />
                </div>
              )}

              <div>
                <Label>Message *</Label>
                <Textarea
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder={form.type === "sms" ? "Your SMS message (max 160 chars)" : "Email body..."}
                  rows={5}
                  className="mt-1"
                  maxLength={form.type === "sms" ? 160 : undefined}
                />
                {form.type === "sms" && (
                  <p className="text-xs text-muted-foreground mt-1 text-right">{form.message.length}/160</p>
                )}
              </div>

              {form.type === "email" && (
                <div>
                  <Label>Image (optional)</Label>
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 text-sm"
                    onChange={e => {
                      if (e.target.files?.[0]) {
                        setImageFile(e.target.files[0]);
                        setImagePreview(URL.createObjectURL(e.target.files[0]));
                      }
                    }}
                  />
                  {imagePreview && <img src={imagePreview} className="mt-2 w-full h-40 object-cover rounded-xl" />}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowComposer(false)}>Cancel</Button>
              <Button variant="hero" className="flex-1" onClick={handleSave}>
                {editCampaignId ? "Update" : "Save Draft"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignsUI;
