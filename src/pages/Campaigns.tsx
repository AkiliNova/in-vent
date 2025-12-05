"use client";

import { useState, useEffect } from "react";
import { 
  Plus, Send, CheckCircle2, Zap, Clock, Edit2, Trash2 
} from "lucide-react";
import { db, storage } from "@/firebase/firebase";
import {
  collection, addDoc, getDocs, updateDoc, doc, serverTimestamp, deleteDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/context/AuthContext";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

interface Campaign {
  id: string;
  name: string;
  type: 'sms' | 'email';
  status: 'draft' | 'scheduled' | 'sent' | 'sending';
  audience: string;
  message?: string;
  imageUrl?: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  scheduledFor?: string;
  sentAt?: string;
}

const audienceOptions = [
  { value: 'all', label: 'All Registered', count: 1200 },
  { value: 'checked-in', label: 'Checked In', count: 847 },
  { value: 'pending', label: 'Not Checked In', count: 353 },
  { value: 'vip', label: 'VIP Only', count: 150 },
];

const CampaignsUI = () => {
  const { tenantId } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [showComposer, setShowComposer] = useState(false);

  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    if (!tenantId) return;
    try {
      const campaignsRef = collection(db, `tenants/${tenantId}/campaigns`);
      const snapshot = await getDocs(campaignsRef);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Campaign));
      setCampaigns(data);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to load campaigns", variant: "destructive" });
    }
  };

  useEffect(() => { fetchCampaigns(); }, [tenantId]);

  const handleSaveCampaign = async () => {
    if (!name || !message || !audience || !tenantId) return;

    try {
      let imageUrl = imagePreview || undefined;
      if (imageFile) {
        const imageRef = ref(storage, `tenants/${tenantId}/campaign-images/${Date.now()}-${imageFile.name}`);
        await uploadBytes(imageRef, imageFile);
        imageUrl = await getDownloadURL(imageRef);
      }

      if (editCampaignId) {
        const campaignRef = doc(db, `tenants/${tenantId}/campaigns/${editCampaignId}`);
        await updateDoc(campaignRef, { name, message, audience, imageUrl });
        toast({ title: "Campaign Updated!" });
      } else {
        const campaignsRef = collection(db, `tenants/${tenantId}/campaigns`);
        await addDoc(campaignsRef, {
          name, message, audience, imageUrl,
          status: 'draft', sent: 0, delivered: 0, opened: 0, clicked: 0,
          createdAt: serverTimestamp(),
        });
        toast({ title: "Campaign Created!" });
      }

      setShowComposer(false);
      setEditCampaignId(null);
      setName(''); setMessage(''); setAudience('');
      setImageFile(null); setImagePreview(null);
      fetchCampaigns();
    } catch (error: any) {
      console.error(error);
      toast({ title: "Error", description: error.message || "Failed to save campaign", variant: "destructive" });
    }
  };

  const handleEdit = (c: Campaign) => {
    setEditCampaignId(c.id);
    setName(c.name);
    setMessage(c.message || '');
    setAudience(c.audience);
    setImagePreview(c.imageUrl || null);
    setShowComposer(true);
  };

  const handleDelete = async (id: string) => {
    if (!tenantId) return;
    try {
      await deleteDoc(doc(db, `tenants/${tenantId}/campaigns/${id}`));
      toast({ title: "Campaign Deleted" });
      fetchCampaigns();
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const getStatusBadge = (status: Campaign['status']) => {
    switch (status) {
      case 'sent': return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Sent</span>;
      case 'draft': return <span className="px-2 py-1 text-xs rounded-full bg-gray-800/20 text-gray-100 flex items-center gap-1">Draft</span>;
      case 'sending': return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700 flex items-center gap-1"><Zap className="w-3 h-3"/> Sending</span>;
      case 'scheduled': return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 flex items-center gap-1"><Clock className="w-3 h-3"/> Scheduled</span>;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-7xl">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Campaigns</h1>
            <Button variant="hero" onClick={() => setShowComposer(true)}>
              <Plus className="w-4 h-4 mr-2"/> New Campaign
            </Button>
          </div>

          {/* Composer Modal */}
          {showComposer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-background/80 border border-border glass rounded-3xl p-8 max-w-xl w-full shadow-lg space-y-4 animate-scale-in">
                <h2 className="text-2xl font-bold">{editCampaignId ? "Edit Campaign" : "New Campaign"}</h2>
                
                <Input placeholder="Campaign Name" value={name} onChange={e => setName(e.target.value)} className="bg-background"/>
                
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger><SelectValue placeholder="Select Audience"/></SelectTrigger>
                  <SelectContent>
                    {audienceOptions.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Textarea placeholder="Message" value={message} onChange={e => setMessage(e.target.value)} className="bg-background"/>
                
                <div className="flex flex-col">
                  <label className="font-medium mb-1">Image</label>
                  <input type="file" accept="image/*" onChange={e => {
                    if (e.target.files) {
                      setImageFile(e.target.files[0]);
                      setImagePreview(URL.createObjectURL(e.target.files[0]));
                    }
                  }} className="text-sm"/>
                  {imagePreview && <img src={imagePreview} className="mt-2 w-full h-60 object-cover rounded-lg shadow-md"/>}
                </div>

                <div className="flex gap-4 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setShowComposer(false)}>Cancel</Button>
                  <Button variant="hero" className="flex-1" onClick={handleSaveCampaign}>
                    <Send className="w-4 h-4 mr-2"/> {editCampaignId ? "Update" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Campaigns Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="drafts">Drafts</TabsTrigger>
              <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
            </TabsList>

            {/* Campaign Cards */}
            {['all','drafts','scheduled','sent'].map(tab => (
              <TabsContent key={tab} value={tab} className="space-y-4 mt-4">
                {campaigns.filter(c => tab==='all' || c.status===tab).map(c => (
                  <div key={c.id} className="glass border border-border rounded-xl p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-4 hover:shadow-lg transition">
                    <div className="flex items-center gap-4">
                      {c.imageUrl && <img src={c.imageUrl} className="w-24 h-24 rounded-lg object-cover"/>}
                      <div>
                        <h3 className="font-semibold text-lg">{c.name}</h3>
                        <p className="text-sm text-muted-foreground">{c.audience}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(c.status)}
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}><Edit2 className="w-4 h-4"/></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="w-4 h-4 text-red-500"/></Button>
                    </div>
                  </div>
                ))}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default CampaignsUI;
