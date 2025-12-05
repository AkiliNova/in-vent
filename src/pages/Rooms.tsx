'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, MapPin, AlertTriangle } from 'lucide-react';
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
  getDocs,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

interface Room {
  id: string;
  name: string;
  current: number;
  max: number;
}

const RoomsPage = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [form, setForm] = useState({ name: '', current: 0, max: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roomsRef = collection(db, 'rooms');

  // Load rooms from Firestore in real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(roomsRef, (snapshot) => {
      const data: Room[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Room, 'id'>),
      }));
      setRooms(data);
    });

    return () => unsubscribe();
  }, []);

  const openAddModal = () => {
    setEditingRoom(null);
    setForm({ name: '', current: 0, max: 0 });
    setModalOpen(true);
  };

  const openEditModal = (room: Room) => {
    setEditingRoom(room);
    setForm({ name: room.name, current: room.current, max: room.max });
    setModalOpen(true);
  };

  const saveRoom = async () => {
    if (!form.name || form.max <= 0) {
      toast({
        title: 'Invalid Input',
        description: 'Please provide a valid zone name and max capacity.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingRoom) {
        // Update existing room
        const docRef = doc(db, 'rooms', editingRoom.id);
        await updateDoc(docRef, { ...form, updatedAt: serverTimestamp() });
        toast({
          title: 'Room Updated',
          description: `${form.name} updated successfully.`,
        });
      } else {
        // Add new room
        await addDoc(roomsRef, { ...form, createdAt: serverTimestamp() });
        toast({
          title: 'Room Added',
          description: `${form.name} added successfully.`,
        });
      }
      setModalOpen(false);
    } catch (error: any) {
      console.error('Firestore Error:', error);
      toast({
        title: 'Failed to Save',
        description: error.message || 'Failed to save. Try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to delete this zone?')) return;
    try {
      await deleteDoc(doc(db, 'rooms', roomId));
      toast({ title: 'Deleted', description: 'Room removed successfully.' });
    } catch (error: any) {
      console.error('Firestore Delete Error:', error);
      toast({
        title: 'Failed to Delete',
        description: error.message || 'Failed to delete. Try again.',
        variant: 'destructive',
      });
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
              <h1 className="text-3xl font-bold text-foreground">Zones Management</h1>
              <p className="text-muted-foreground">Manage all zones and room capacities</p>
            </div>
            <Button variant="hero" onClick={openAddModal}>
              <Plus className="w-4 h-4 mr-2" /> Add Zone
            </Button>
          </div>

          {/* Rooms Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {rooms.map((room) => {
              const percentage = (room.current / room.max) * 100;
              return (
                <div
                  key={room.id}
                  className="glass rounded-2xl p-6 space-y-3 relative hover:shadow-lg transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-primary" />
                      <h2 className="text-lg font-semibold text-foreground">{room.name}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => openEditModal(room)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => deleteRoom(room.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{room.current} / {room.max}</span>
                    {percentage > 90 && <AlertTriangle className="w-4 h-4 text-destructive" />}
                  </div>
                  <Progress
                    value={percentage}
                    className={`h-3 ${percentage > 90 ? '[&>div]:bg-destructive' : percentage > 75 ? '[&>div]:bg-yellow-500' : ''}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoom ? 'Edit Zone' : 'Add Zone'}</DialogTitle>
            <DialogDescription>Fill in the zone details below.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="flex flex-col">
              <Label htmlFor="zone-name">Zone Name</Label>
              <Input
                id="zone-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="flex flex-col">
              <Label htmlFor="zone-current">Current Occupancy</Label>
              <Input
                id="zone-current"
                type="number"
                value={form.current}
                onChange={(e) => setForm({ ...form, current: Number(e.target.value) })}
              />
            </div>

            <div className="flex flex-col">
              <Label htmlFor="zone-max">Max Capacity</Label>
              <Input
                id="zone-max"
                type="number"
                value={form.max}
                onChange={(e) => setForm({ ...form, max: Number(e.target.value) })}
              />
            </div>
          </div>

          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="hero" onClick={saveRoom} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingRoom ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RoomsPage;
