import { useState, useEffect } from 'react';
import { 
  MessageSquare, Send, Users, TrendingUp,
  Clock, Plus, Eye, BarChart3, Filter, Calendar,
  CheckCircle2, AlertCircle, Zap, Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import Navigation from '@/components/Navigation';
import { db } from '@/firebase/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface Campaign {
  id: string;
  name: string;
  type: 'sms' | 'email';
  status: 'draft' | 'scheduled' | 'sent' | 'sending';
  audience: string;
  message?: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  scheduledFor?: string;
  sentAt?: string;
}

const Campaigns = () => {
  const [activeTab, setActiveTab] = useState('campaigns');
  const [showComposer, setShowComposer] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [audience, setAudience] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const audienceOptions = [
    { value: 'all', label: 'All Registered', count: 1200 },
    { value: 'checked-in', label: 'Checked In', count: 847 },
    { value: 'pending', label: 'Not Checked In', count: 353 },
    { value: 'vip', label: 'VIP Only', count: 150 },
    { value: 'no-show', label: 'No Shows', count: 89 },
    { value: 'left-early', label: 'Left Before 3PM', count: 124 },
  ];

  const quickTemplates = [
    { name: 'Welcome', text: 'Welcome to Tech Summit 2024! 🎉 Show your QR code at the door for instant check-in.' },
    { name: 'Reminder', text: 'Reminder: The keynote starts in 30 minutes in Main Hall. Don\'t miss it!' },
    { name: 'Sponsor', text: 'Free drink courtesy of ACME Corp! 🍹 Show this message at the bar. Valid today only.' },
    { name: 'Feedback', text: 'Thanks for attending! We\'d love your feedback: [LINK]. Takes 2 min.' },
  ];

  const campaignsRef = collection(db, 'campaigns');

  // Fetch campaigns from Firestore
  const fetchCampaigns = async () => {
    try {
      const snapshot = await getDocs(campaignsRef);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Campaign));
      setCampaigns(data);
    } catch (error: any) {
      console.error('Fetch campaigns error:', error);
      toast({ title: 'Error', description: 'Failed to load campaigns', variant: 'destructive' });
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleSendCampaign = async () => {
    if (!audience || !messageText) return;

    try {
      await addDoc(campaignsRef, {
        name: messageText.slice(0, 30),
        type: 'sms',
        status: 'sent',
        audience,
        message: messageText,
        sent: audienceOptions.find(a => a.value === audience)?.count || 0,
        delivered: audienceOptions.find(a => a.value === audience)?.count || 0,
        opened: 0,
        clicked: 0,
        sentAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
      });

      toast({
        title: "Campaign Sent!",
        description: `Message sent to ${audienceOptions.find(a => a.value === audience)?.count || 0} recipients.`,
      });

      setShowComposer(false);
      setMessageText('');
      setAudience('');
      fetchCampaigns();
    } catch (error: any) {
      console.error('Send campaign error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to send', variant: 'destructive' });
    }
  };

  const handleSaveDraft = async () => {
    if (!messageText) return;

    try {
      await addDoc(campaignsRef, {
        name: messageText.slice(0, 30),
        type: 'sms',
        status: 'draft',
        audience,
        message: messageText,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        createdAt: serverTimestamp(),
      });

      toast({ title: 'Draft Saved', description: 'Your draft has been saved.' });
      setShowComposer(false);
      setMessageText('');
      setAudience('');
      fetchCampaigns();
    } catch (error: any) {
      console.error('Save draft error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to save draft', variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: Campaign['status']) => {
    switch (status) {
      case 'sent':
        return <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/20 text-success text-xs"><CheckCircle2 className="w-3 h-3" /> Sent</span>;
      case 'scheduled':
        return <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/20 text-primary text-xs"><Clock className="w-3 h-3" /> Scheduled</span>;
      case 'sending':
        return <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-500 text-xs"><Zap className="w-3 h-3" /> Sending</span>;
      case 'draft':
        return <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs">Draft</span>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">SMS Campaigns</h1>
            </div>
            <Button variant="hero" onClick={() => setShowComposer(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Campaign
            </Button>
          </div>

          {/* Composer */}
          {showComposer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="glass rounded-3xl p-8 max-w-2xl w-full mx-4 animate-scale-in">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-foreground">New SMS Campaign</h2>
                  <Button variant="ghost" size="icon" onClick={() => setShowComposer(false)}>×</Button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>Target Audience</Label>
                    <Select value={audience} onValueChange={setAudience}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select audience segment" />
                      </SelectTrigger>
                      <SelectContent>
                        {audienceOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center justify-between w-full">
                              <span>{option.label}</span>
                              <span className="text-muted-foreground ml-4">{option.count} recipients</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Quick Templates</Label>
                    <div className="flex flex-wrap gap-2">
                      {quickTemplates.map(template => (
                        <Button key={template.name} variant="outline" size="sm" onClick={() => setMessageText(template.text)}>
                          {template.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea placeholder="Type your message here..." value={messageText} onChange={e => setMessageText(e.target.value)} />
                  </div>

                  <div className="flex gap-4">
                    <Button variant="outline" className="flex-1" onClick={handleSaveDraft}>Save Draft</Button>
                    <Button variant="hero" className="flex-1" onClick={handleSendCampaign} disabled={!audience || !messageText}>
                      <Send className="w-4 h-4 mr-2" /> Send Now
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Campaigns List */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="campaigns">All</TabsTrigger>
              <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
              <TabsTrigger value="drafts">Drafts</TabsTrigger>
            </TabsList>

            <TabsContent value="campaigns">
              {campaigns.map(c => (
                <div key={c.id} className="glass rounded-2xl p-6 mb-4">
                  <div className="flex justify-between">
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                    {getStatusBadge(c.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{c.audience}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="scheduled">
              {campaigns.filter(c => c.status === 'scheduled').map(c => (
                <div key={c.id} className="glass rounded-2xl p-6 mb-4">
                  <div className="flex justify-between">
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                    {getStatusBadge(c.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">Scheduled for {c.scheduledFor}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="drafts">
              {campaigns.filter(c => c.status === 'draft').map(c => (
                <div key={c.id} className="glass rounded-2xl p-6 mb-4">
                  <div className="flex justify-between">
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                    {getStatusBadge(c.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{c.audience}</p>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Campaigns;
