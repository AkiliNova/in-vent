"use client";

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, ImageIcon, Ticket, Globe, EyeOff, BellRing, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import Navigation from '@/components/Navigation';
import { toast } from '@/hooks/use-toast';

import { db } from '@/firebase/firebase';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, getDocs,
} from 'firebase/firestore';

interface TicketTier {
  name: string;
  price: number;
  capacity: number;
  sold: number;
  description?: string;
}

interface Event {
  id: string;
  tenantId: string;
  title: string;
  price: number;
  host: string;
  description: string;
  startDate: string;
  endDate?: string;
  locationName: string;
  city?: string;
  eventType?: string;
  locationMapLink?: string;
  images: string[];
  link?: string;
  ticketTiers?: TicketTier[];
  status?: 'draft' | 'published';
}

const defaultTier = (): TicketTier => ({ name: '', price: 0, capacity: 100, sold: 0, description: '' });

const EventsDashboard = ({ tenantId }: { tenantId: string }) => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [waitlistCounts, setWaitlistCounts] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [form, setForm] = useState({
    title: '',
    price: 0,
    host: '',
    description: '',
    startDate: '',
    endDate: '',
    locationName: '',
    city: '',
    eventType: '',
    locationMapLink: '',
  });
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([defaultTier()]);
  const [images, setImages] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1);

  const eventsRef = collection(db, `tenants/${tenantId}/events`);

  useEffect(() => {
    const unsubscribe = onSnapshot(eventsRef, async (snapshot) => {
      const data: Event[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Event, 'id'>),
      }));
      setEvents(data);

      // Fetch waitlist counts for each event
      const counts: Record<string, number> = {};
      await Promise.all(data.map(async (ev) => {
        try {
          const wSnap = await getDocs(collection(db, `tenants/${tenantId}/events/${ev.id}/waitlist`));
          counts[ev.id] = wSnap.size;
        } catch (_) { counts[ev.id] = 0; }
      }));
      setWaitlistCounts(counts);
    });
    return () => unsubscribe();
  }, [tenantId]);

  const openAddModal = () => {
    setEditingEvent(null);
    setForm({ title: '', price: 0, host: '', description: '', startDate: '', endDate: '', locationName: '', city: '', eventType: '', locationMapLink: '' });
    setTicketTiers([defaultTier()]);
    setImages([]);
    setStep(1);
    setModalOpen(true);
  };

  const openEditModal = (event: Event) => {
    setEditingEvent(event);
    setForm({
      title: event.title,
      price: event.price,
      host: event.host,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate || '',
      locationName: event.locationName,
      city: event.city || '',
      eventType: event.eventType || '',
      locationMapLink: event.locationMapLink || '',
    });
    setTicketTiers(event.ticketTiers?.length ? event.ticketTiers : [defaultTier()]);
    setImages([]);
    setStep(1);
    setModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setImages(Array.from(e.target.files));
  };

  const uploadImagesToServer = async (files: File[]) => {
    if (!files.length) return [];
    const formData = new FormData();
    files.forEach((file) => formData.append('images[]', file));
    formData.append('folder', `events/${tenantId}`);
    try {
      const res = await fetch('https://share.akisolve.com/tikooh/upload_events.php', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Upload failed');
      return data.uploaded;
    } catch (error: any) {
      toast({ title: 'Upload Failed', description: error.message, variant: 'destructive' });
      return [];
    }
  };

  // Ticket tier helpers
  const updateTier = (index: number, field: keyof TicketTier, value: string | number) => {
    setTicketTiers(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const addTier = () => setTicketTiers(prev => [...prev, defaultTier()]);
  const removeTier = (index: number) => setTicketTiers(prev => prev.filter((_, i) => i !== index));

  const saveEvent = async () => {
    if (!form.title || !form.host || !form.description || !form.startDate) {
      toast({ title: 'Invalid Input', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }

    const validTiers = ticketTiers.filter(t => t.name.trim() && t.price >= 0 && t.capacity > 0);
    if (validTiers.length === 0) {
      toast({ title: 'Add at least one ticket tier', description: 'Provide a name, price, and capacity.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const uploadedImages = images.length > 0 ? await uploadImagesToServer(images) : [];
      // Use lowest tier price as the event base price
      const basePrice = Math.min(...validTiers.map(t => t.price));

      const eventData = {
        ...form,
        price: basePrice,
        ticketTiers: validTiers,
      };

      if (editingEvent) {
        const docRef = doc(db, `tenants/${tenantId}/events`, editingEvent.id);
        await updateDoc(docRef, {
          ...eventData,
          images: [...(editingEvent.images || []), ...uploadedImages],
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Event Updated', description: `${form.title} updated.` });
      } else {
        await addDoc(eventsRef, {
          ...eventData,
          images: uploadedImages,
          tenantId,
          status: 'draft',
          createdAt: serverTimestamp(),
        });
        toast({ title: 'Event Created', description: `${form.title} is live.` });
      }

      setModalOpen(false);
      setImages([]);
      setUploadProgress(0);
      setStep(1);
    } catch (error: any) {
      toast({ title: 'Failed to Save', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePublish = async (event: Event) => {
    const newStatus = event.status === 'published' ? 'draft' : 'published';
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/events`, event.id), { status: newStatus, updatedAt: serverTimestamp() });
      toast({ title: newStatus === 'published' ? 'Event published!' : 'Event moved to draft' });
    } catch (error: any) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
    }
  };

  const deleteEvent = async (eventId: string) => {
    if (!confirm('Delete this event?')) return;
    try {
      await deleteDoc(doc(db, `tenants/${tenantId}/events`, eventId));
      toast({ title: 'Deleted', description: 'Event removed.' });
    } catch (error: any) {
      toast({ title: 'Failed to Delete', description: error.message, variant: 'destructive' });
    }
  };

  const totalCapacity = (tiers?: TicketTier[]) => tiers?.reduce((s, t) => s + t.capacity, 0) ?? 0;
  const totalSold = (tiers?: TicketTier[]) => tiers?.reduce((s, t) => s + (t.sold || 0), 0) ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-5xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Events Dashboard</h1>
              <p className="text-muted-foreground">Manage events and ticket tiers</p>
            </div>
            <Button variant="hero" onClick={openAddModal}>
              <Plus className="w-4 h-4 mr-2" /> Add Event
            </Button>
          </div>

          {/* Events Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {events.map((event) => {
              const cap = totalCapacity(event.ticketTiers);
              const sold = totalSold(event.ticketTiers);
              const pct = cap > 0 ? Math.round((sold / cap) * 100) : 0;

              return (
                <div key={event.id} className="glass rounded-2xl p-6 space-y-3 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-primary" />
                      <h2 className="text-lg font-semibold text-foreground">{event.title}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={event.status === 'published'
                          ? 'border-success/50 text-success bg-success/10'
                          : 'border-yellow-500/50 text-yellow-500 bg-yellow-500/10'}
                      >
                        {event.status === 'published' ? 'Published' : 'Draft'}
                      </Badge>
                      <Button
                        variant="outline"
                        size="icon"
                        title={event.status === 'published' ? 'Unpublish' : 'Publish'}
                        onClick={() => togglePublish(event)}
                      >
                        {event.status === 'published'
                          ? <EyeOff className="w-4 h-4 text-yellow-500" />
                          : <Globe className="w-4 h-4 text-success" />}
                      </Button>
                      <Button variant="outline" size="icon" title="Manage Agenda" onClick={() => navigate(`/agenda/${event.id}`)}>
                        <CalendarDays className="w-4 h-4 text-primary" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => openEditModal(event)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => deleteEvent(event.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">Host: {event.host}</p>
                  <p className="text-sm">{event.description?.slice(0, 100)}{event.description?.length > 100 ? '...' : ''}</p>
                  <p className="text-sm">
                    {new Date(event.startDate).toLocaleString()}
                    {event.endDate && ` — ${new Date(event.endDate).toLocaleString()}`}
                  </p>
                  <p className="text-sm">📍 {event.locationName}{event.city ? `, ${event.city}` : ''}</p>

                  {/* Ticket tiers summary */}
                  {event.ticketTiers?.length ? (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <Ticket className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">Ticket Tiers</span>
                        <Badge variant="outline" className="ml-auto text-xs">
                          {sold}/{cap} sold
                        </Badge>
                      </div>
                      {event.ticketTiers.map((tier, i) => {
                        const tierPct = tier.capacity > 0 ? Math.round(((tier.sold || 0) / tier.capacity) * 100) : 0;
                        return (
                          <div key={i} className="flex items-center justify-between text-xs text-muted-foreground gap-2">
                            <span className="truncate w-24">{tier.name}</span>
                            <span>KES {tier.price.toLocaleString()}</span>
                            <span className={tierPct >= 100 ? 'text-destructive font-semibold' : ''}>
                              {tier.sold || 0}/{tier.capacity}
                              {tierPct >= 100 && ' SOLD OUT'}
                            </span>
                          </div>
                        );
                      })}
                      <Progress value={pct} className="h-1.5 mt-1" />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">From KES {event.price?.toLocaleString()}</p>
                  )}

                  {/* Waitlist count */}
                  {(waitlistCounts[event.id] || 0) > 0 && (
                    <div className="flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5">
                      <BellRing className="w-3.5 h-3.5" />
                      <span><strong>{waitlistCounts[event.id]}</strong> on waitlist</span>
                    </div>
                  )}

                  {event.images?.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto mt-2">
                      {event.images.slice(0, 3).map((img, i) => (
                        <img key={i} src={img} className="h-16 w-16 object-cover rounded-md flex-shrink-0" />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-full max-w-3xl md:max-w-4xl h-[85vh] rounded-3xl p-6 shadow-xl overflow-y-auto scrollbar-none">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingEvent ? 'Edit Event' : 'Add Event'} — Step {step}/4
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {step === 1 && 'Basic event info'}
              {step === 2 && 'Dates, location and host'}
              {step === 3 && 'Ticket tiers & pricing'}
              {step === 4 && 'Event images'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* STEP 1 — Basic info */}
            {step === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col md:col-span-2">
                  <Label>Event Title *</Label>
                  <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Nairobi Jazz Night" />
                </div>
                <div className="flex flex-col">
                  <Label>Event Type</Label>
                  <Input value={form.eventType} onChange={e => setForm({ ...form, eventType: e.target.value })} placeholder="e.g. Concert, Conference" />
                </div>
                <div className="flex flex-col">
                  <Label>Host / Organizer *</Label>
                  <Input value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} placeholder="Organizer name" />
                </div>
                <div className="flex flex-col md:col-span-2">
                  <Label>Description *</Label>
                  <textarea
                    rows={4}
                    className="border rounded p-2 w-full resize-none bg-transparent text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Describe the event..."
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* STEP 2 — Dates & location */}
            {step === 2 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <Label>Start Date *</Label>
                  <Input type="datetime-local" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="flex flex-col">
                  <Label>End Date</Label>
                  <Input type="datetime-local" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                </div>
                <div className="flex flex-col">
                  <Label>Venue Name</Label>
                  <Input value={form.locationName} onChange={e => setForm({ ...form, locationName: e.target.value })} placeholder="e.g. Carnivore Grounds" />
                </div>
                <div className="flex flex-col">
                  <Label>City</Label>
                  <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="e.g. Nairobi" />
                </div>
                <div className="flex flex-col md:col-span-2">
                  <Label>Google Maps Link</Label>
                  <Input value={form.locationMapLink} onChange={e => setForm({ ...form, locationMapLink: e.target.value })} placeholder="https://maps.google.com/..." />
                </div>
              </div>
            )}

            {/* STEP 3 — Ticket tiers */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Define ticket categories, prices and how many are available.</p>
                  <Button variant="outline" size="sm" onClick={addTier}>
                    <Plus className="w-4 h-4 mr-1" /> Add Tier
                  </Button>
                </div>

                {ticketTiers.map((tier, index) => (
                  <div key={index} className="glass rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Tier {index + 1}</span>
                      {ticketTiers.length > 1 && (
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => removeTier(index)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="flex flex-col">
                        <Label className="text-xs mb-1">Tier Name *</Label>
                        <Input
                          value={tier.name}
                          onChange={e => updateTier(index, 'name', e.target.value)}
                          placeholder="e.g. Early Bird, VIP, Regular"
                        />
                      </div>
                      <div className="flex flex-col">
                        <Label className="text-xs mb-1">Price (KES) *</Label>
                        <Input
                          type="number"
                          min={0}
                          value={tier.price}
                          onChange={e => updateTier(index, 'price', Number(e.target.value))}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex flex-col">
                        <Label className="text-xs mb-1">Available Tickets *</Label>
                        <Input
                          type="number"
                          min={1}
                          value={tier.capacity}
                          onChange={e => updateTier(index, 'capacity', Number(e.target.value))}
                          placeholder="100"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <Label className="text-xs mb-1">Tier Description (optional)</Label>
                      <Input
                        value={tier.description || ''}
                        onChange={e => updateTier(index, 'description', e.target.value)}
                        placeholder="e.g. Includes meet & greet"
                      />
                    </div>
                    {tier.capacity > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {tier.sold || 0} sold · {tier.capacity - (tier.sold || 0)} remaining
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* STEP 4 — Images */}
            {step === 4 && (
              <div className="flex flex-col gap-4">
                <Label>Event Images</Label>
                <input type="file" multiple accept="image/*" onChange={handleImageChange} className="mt-1" />
                {uploadProgress > 0 && <Progress value={uploadProgress} className="mt-2" />}
                {editingEvent?.images?.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Current images:</p>
                    <div className="flex gap-2 flex-wrap">
                      {editingEvent.images.map((img, i) => (
                        <img key={i} src={img} className="h-20 w-20 object-cover rounded-md" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
            <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : setModalOpen(false)}>
              {step > 1 ? 'Back' : 'Cancel'}
            </Button>
            {step < 4 ? (
              <Button variant="hero" onClick={() => setStep(step + 1)}>Next</Button>
            ) : (
              <Button variant="hero" onClick={saveEvent} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingEvent ? 'Update Event' : 'Create Event'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventsDashboard;
