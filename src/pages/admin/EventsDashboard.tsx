'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, ImageIcon } from 'lucide-react';
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
import Navigation from '@/components/Navigation';
import { toast } from '@/hooks/use-toast';

// Firestore
import { db } from '@/firebase/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

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
  locationMapLink?: string;
  images: string[];
  link?: string;
}

const EventsDashboard = ({ tenantId }: { tenantId: string }) => {
  const [events, setEvents] = useState<Event[]>([]);
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
    locationMapLink: '',
  });
  const [images, setImages] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const eventsRef = collection(db, `tenants/${tenantId}/events`);

  // Real-time Firestore listener
  useEffect(() => {
    const unsubscribe = onSnapshot(eventsRef, (snapshot) => {
      const data: Event[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Event, 'id'>),
      }));
      setEvents(data);
    });
    return () => unsubscribe();
  }, [tenantId]);

  const openAddModal = () => {
    setEditingEvent(null);
    setForm({
      title: '',
      price: 0,
      host: '',
      description: '',
      startDate: '',
      endDate: '',
      locationName: '',
      locationMapLink: '',
    });
    setImages([]);
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
      locationMapLink: event.locationMapLink || '',
    });
    setImages([]);
    setModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setImages(Array.from(e.target.files));
  };

  // Upload images to PHP server
  const uploadImagesToServer = async (files: File[], folder = 'events') => {
    if (!files.length) return [];
    const formData = new FormData();
    files.forEach((file) => formData.append('images[]', file));
    formData.append('folder', `${folder}/${tenantId}`);

    try {
      const res = await fetch('https://tikooh.akilinova.tech/upload_events.php', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Upload failed');
      return data.uploaded;
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error.message || 'Unable to upload images',
        variant: 'destructive',
      });
      return [];
    }
  };

  const saveEvent = async () => {
    if (!form.title || form.price <= 0 || !form.host || !form.description || !form.startDate) {
      toast({
        title: 'Invalid Input',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const uploadedImages = images.length > 0 ? await uploadImagesToServer(images) : [];

      if (editingEvent) {
        const docRef = doc(db, `tenants/${tenantId}/events`, editingEvent.id);
        await updateDoc(docRef, {
          ...form,
          images: [...(editingEvent.images || []), ...uploadedImages],
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Event Updated', description: `${form.title} updated successfully.` });
      } else {
        await addDoc(eventsRef, {
          ...form,
          images: uploadedImages,
          tenantId,
          createdAt: serverTimestamp(),
        });
        toast({ title: 'Event Added', description: `${form.title} added successfully.` });
      }

      setModalOpen(false);
      setImages([]);
      setUploadProgress(0);
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Failed to Save', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      await deleteDoc(doc(db, `tenants/${tenantId}/events`, eventId));
      toast({ title: 'Deleted', description: 'Event removed successfully.' });
    } catch (error: any) {
      toast({ title: 'Failed to Delete', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-5xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Events Dashboard</h1>
              <p className="text-muted-foreground">Manage all events and media uploads</p>
            </div>
            <Button variant="hero" onClick={openAddModal}>
              <Plus className="w-4 h-4 mr-2" /> Add Event
            </Button>
          </div>

          {/* Events Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {events.map((event) => (
              <div key={event.id} className="glass rounded-2xl p-6 space-y-3 relative hover:shadow-lg transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">{event.title}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => openEditModal(event)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => deleteEvent(event.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">Host: {event.host}</p>
                <p className="text-sm">{event.description}</p>
                <p className="text-sm">Price: ${event.price}</p>
                <p className="text-sm">
                  Date: {new Date(event.startDate).toLocaleString()}
                  {event.endDate && ` - ${new Date(event.endDate).toLocaleString()}`}
                </p>
                <p className="text-sm">Location: {event.locationName}</p>
                {event.locationMapLink && (
                  <a href={event.locationMapLink} target="_blank" className="text-blue-500 underline">
                    View on Map
                  </a>
                )}

                <div className="flex gap-2 overflow-x-auto mt-2">
                  {event.images.map((img, i) => (
                    <img key={i} src={img} className="h-24 w-24 object-cover rounded-md" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Modal */}
     <Dialog open={modalOpen} onOpenChange={setModalOpen}>
  <DialogContent className="max-w-lg w-full rounded-3xl p-6 shadow-lg max-h-[80vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>{editingEvent ? 'Edit Event' : 'Add Event'}</DialogTitle>
      <DialogDescription>Fill in event details below and upload images.</DialogDescription>
    </DialogHeader>

    <div className="space-y-4 mt-2">
      {/* Form Fields */}
      <div className="flex flex-col">
        <Label htmlFor="event-title">Title</Label>
        <Input
          id="event-title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>

      <div className="flex flex-col">
        <Label htmlFor="event-price">Price</Label>
        <Input
          id="event-price"
          type="number"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
        />
      </div>

      <div className="flex flex-col">
        <Label htmlFor="host">Host</Label>
        <Input
          id="host"
          value={form.host}
          onChange={(e) => setForm({ ...form, host: e.target.value })}
        />
      </div>

      <div className="flex flex-col">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          rows={4}
          className="border rounded p-2"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>

      <div className="flex flex-col">
        <Label htmlFor="startDate">Start Date</Label>
        <Input
          id="startDate"
          type="datetime-local"
          value={form.startDate}
          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
        />
      </div>

      <div className="flex flex-col">
        <Label htmlFor="endDate">End Date</Label>
        <Input
          id="endDate"
          type="datetime-local"
          value={form.endDate}
          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
        />
      </div>

      <div className="flex flex-col">
        <Label htmlFor="locationName">Location Name</Label>
        <Input
          id="locationName"
          value={form.locationName}
          onChange={(e) => setForm({ ...form, locationName: e.target.value })}
        />
      </div>

      <div className="flex flex-col">
        <Label htmlFor="locationMapLink">Map Link</Label>
        <Input
          id="locationMapLink"
          value={form.locationMapLink}
          onChange={(e) => setForm({ ...form, locationMapLink: e.target.value })}
        />
      </div>

      <div className="flex flex-col">
        <Label htmlFor="event-images">Images</Label>
        <input
          type="file"
          id="event-images"
          multiple
          accept="image/*"
          onChange={handleImageChange}
        />
        {uploadProgress > 0 && <Progress value={uploadProgress} className="mt-2" />}
      </div>
    </div>

    <DialogFooter className="mt-4 flex justify-end gap-2">
      <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
      <Button variant="hero" onClick={saveEvent} disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : editingEvent ? 'Update' : 'Add'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

    </div>
  );
};

export default EventsDashboard;
