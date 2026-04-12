"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { uploadImages } from '@/utils/uploadImages';
import { Plus, Pencil, Trash2, Globe, User, Clock, Link2 } from 'lucide-react';
import type { Speaker, Session } from '@/types/agenda';

// ── helpers ──────────────────────────────────────────────────────────────────
const blankSpeaker = () => ({ name: '', bio: '', twitter: '', linkedin: '', website: '' });
const blankSession = () => ({
  title: '', description: '', startTime: '', endTime: '', room: '', speakerIds: [] as string[], order: 0,
});

function formatTime(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AgendaManager() {
  const { eventId } = useParams<{ eventId: string }>();
  const { tenantId } = useAuth();

  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  // Speaker modal
  const [spModalOpen, setSpModalOpen] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<Speaker | null>(null);
  const [spForm, setSpForm] = useState(blankSpeaker());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [spSubmitting, setSpSubmitting] = useState(false);

  // Session modal
  const [seModalOpen, setSeModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [seForm, setSeForm] = useState(blankSession());
  const [seSubmitting, setSeSubmitting] = useState(false);

  const basePath = `tenants/${tenantId}/events/${eventId}`;

  // ── real-time listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId || !eventId) return;
    const unsubSp = onSnapshot(collection(db, `${basePath}/speakers`), (snap) => {
      setSpeakers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Speaker, 'id'>) })));
    });
    const unsubSe = onSnapshot(collection(db, `${basePath}/sessions`), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Session, 'id'>) }));
      setSessions(data.sort((a, b) => a.order - b.order));
    });
    return () => { unsubSp(); unsubSe(); };
  }, [tenantId, eventId]);

  // ── speaker CRUD ───────────────────────────────────────────────────────────
  const openAddSpeaker = () => {
    setEditingSpeaker(null);
    setSpForm(blankSpeaker());
    setPhotoFile(null);
    setSpModalOpen(true);
  };

  const openEditSpeaker = (sp: Speaker) => {
    setEditingSpeaker(sp);
    setSpForm({ name: sp.name, bio: sp.bio || '', twitter: sp.twitter || '', linkedin: sp.linkedin || '', website: sp.website || '' });
    setPhotoFile(null);
    setSpModalOpen(true);
  };

  const saveSpeaker = async () => {
    if (!spForm.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' }); return;
    }
    setSpSubmitting(true);
    try {
      let photoUrl = editingSpeaker?.photoUrl || '';
      if (photoFile) {
        const urls = await uploadImages([photoFile], `speakers/${tenantId}`);
        if (urls.length) photoUrl = urls[0];
      }
      const data = { ...spForm, photoUrl, updatedAt: serverTimestamp() };
      if (editingSpeaker) {
        await updateDoc(doc(db, `${basePath}/speakers`, editingSpeaker.id), data);
        toast({ title: 'Speaker updated' });
      } else {
        await addDoc(collection(db, `${basePath}/speakers`), { ...data, createdAt: serverTimestamp() });
        toast({ title: 'Speaker added' });
      }
      setSpModalOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSpSubmitting(false);
    }
  };

  const deleteSpeaker = async (sp: Speaker) => {
    if (!confirm(`Delete ${sp.name}?`)) return;
    await deleteDoc(doc(db, `${basePath}/speakers`, sp.id));
    toast({ title: 'Speaker removed' });
  };

  // ── session CRUD ───────────────────────────────────────────────────────────
  const openAddSession = () => {
    setEditingSession(null);
    setSeForm({ ...blankSession(), order: sessions.length });
    setSeModalOpen(true);
  };

  const openEditSession = (se: Session) => {
    setEditingSession(se);
    setSeForm({
      title: se.title, description: se.description || '',
      startTime: se.startTime, endTime: se.endTime,
      room: se.room || '', speakerIds: se.speakerIds || [], order: se.order,
    });
    setSeModalOpen(true);
  };

  const saveSession = async () => {
    if (!seForm.title.trim() || !seForm.startTime || !seForm.endTime) {
      toast({ title: 'Title, start and end time are required', variant: 'destructive' }); return;
    }
    setSeSubmitting(true);
    try {
      const data = { ...seForm, updatedAt: serverTimestamp() };
      if (editingSession) {
        await updateDoc(doc(db, `${basePath}/sessions`, editingSession.id), data);
        toast({ title: 'Session updated' });
      } else {
        await addDoc(collection(db, `${basePath}/sessions`), { ...data, createdAt: serverTimestamp() });
        toast({ title: 'Session added' });
      }
      setSeModalOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSeSubmitting(false);
    }
  };

  const deleteSession = async (se: Session) => {
    if (!confirm(`Delete "${se.title}"?`)) return;
    await deleteDoc(doc(db, `${basePath}/sessions`, se.id));
    toast({ title: 'Session removed' });
  };

  const toggleSpeakerInSession = (speakerId: string) => {
    setSeForm((prev) => ({
      ...prev,
      speakerIds: prev.speakerIds.includes(speakerId)
        ? prev.speakerIds.filter((id) => id !== speakerId)
        : [...prev.speakerIds, speakerId],
    }));
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Agenda Manager</h1>
            <p className="text-muted-foreground">Manage speakers and schedule for this event</p>
          </div>

          <Tabs defaultValue="sessions">
            <TabsList className="mb-6">
              <TabsTrigger value="sessions">Schedule</TabsTrigger>
              <TabsTrigger value="speakers">Speakers</TabsTrigger>
            </TabsList>

            {/* ── SESSIONS tab ─────────────────────────────────────────────── */}
            <TabsContent value="sessions">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
                <Button variant="hero" size="sm" onClick={openAddSession}>
                  <Plus className="w-4 h-4 mr-1" /> Add Session
                </Button>
              </div>

              {sessions.length === 0 ? (
                <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
                  No sessions yet. Add your first session.
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((se) => {
                    const seSpeakers = speakers.filter((sp) => se.speakerIds?.includes(sp.id));
                    return (
                      <div key={se.id} className="glass rounded-2xl p-4 flex items-start gap-4">
                        <div className="flex-shrink-0 w-20 text-right">
                          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(se.startTime)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground/60">{formatTime(se.endTime)}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground">{se.title}</p>
                          {se.room && <Badge variant="outline" className="text-xs mt-1">{se.room}</Badge>}
                          {seSpeakers.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {seSpeakers.map((sp) => sp.name).join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button variant="outline" size="icon" onClick={() => openEditSession(se)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => deleteSession(se)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── SPEAKERS tab ──────────────────────────────────────────────── */}
            <TabsContent value="speakers">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">{speakers.length} speaker{speakers.length !== 1 ? 's' : ''}</p>
                <Button variant="hero" size="sm" onClick={openAddSpeaker}>
                  <Plus className="w-4 h-4 mr-1" /> Add Speaker
                </Button>
              </div>

              {speakers.length === 0 ? (
                <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
                  No speakers yet. Add your first speaker.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {speakers.map((sp) => (
                    <div key={sp.id} className="glass rounded-2xl p-4 flex items-center gap-4">
                      {sp.photoUrl ? (
                        <img src={sp.photoUrl} alt={sp.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <User className="w-6 h-6 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{sp.name}</p>
                        {sp.bio && <p className="text-xs text-muted-foreground line-clamp-2">{sp.bio}</p>}
                        <div className="flex gap-2 mt-1">
                          {sp.twitter && <span className="text-xs font-bold text-muted-foreground">𝕏</span>}
                          {sp.linkedin && <Link2 className="w-3.5 h-3.5 text-muted-foreground" />}
                          {sp.website && <Globe className="w-3.5 h-3.5 text-muted-foreground" />}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button variant="outline" size="icon" onClick={() => openEditSpeaker(sp)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => deleteSpeaker(sp)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* ── Speaker Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={spModalOpen} onOpenChange={setSpModalOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>{editingSpeaker ? 'Edit Speaker' : 'Add Speaker'}</DialogTitle>
            <DialogDescription>Speaker details shown on the public event page</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Name *</Label>
              <Input value={spForm.name} onChange={(e) => setSpForm({ ...spForm, name: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <Label>Bio</Label>
              <textarea
                rows={3}
                className="border rounded p-2 w-full resize-none bg-transparent text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                placeholder="Short bio"
                value={spForm.bio}
                onChange={(e) => setSpForm({ ...spForm, bio: e.target.value })}
              />
            </div>
            <div>
              <Label>Photo</Label>
              {editingSpeaker?.photoUrl && !photoFile && (
                <img src={editingSpeaker.photoUrl} className="w-16 h-16 rounded-full object-cover mb-2" alt="current" />
              )}
              <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} className="mt-1 text-sm" />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>Twitter / X URL</Label>
                <Input value={spForm.twitter} onChange={(e) => setSpForm({ ...spForm, twitter: e.target.value })} placeholder="https://x.com/handle" />
              </div>
              <div>
                <Label>LinkedIn URL</Label>
                <Input value={spForm.linkedin} onChange={(e) => setSpForm({ ...spForm, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." />
              </div>
              <div>
                <Label>Website</Label>
                <Input value={spForm.website} onChange={(e) => setSpForm({ ...spForm, website: e.target.value })} placeholder="https://..." />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setSpModalOpen(false)}>Cancel</Button>
            <Button variant="hero" onClick={saveSpeaker} disabled={spSubmitting}>
              {spSubmitting ? 'Saving…' : 'Save Speaker'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Session Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={seModalOpen} onOpenChange={setSeModalOpen}>
        <DialogContent className="max-w-lg rounded-3xl max-h-[90vh] overflow-y-auto scrollbar-none">
          <DialogHeader>
            <DialogTitle>{editingSession ? 'Edit Session' : 'Add Session'}</DialogTitle>
            <DialogDescription>Schedule entry visible on the public event page</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Title *</Label>
              <Input value={seForm.title} onChange={(e) => setSeForm({ ...seForm, title: e.target.value })} placeholder="e.g. Opening Keynote" />
            </div>
            <div>
              <Label>Description</Label>
              <textarea
                rows={2}
                className="border rounded p-2 w-full resize-none bg-transparent text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                placeholder="Optional short description"
                value={seForm.description}
                onChange={(e) => setSeForm({ ...seForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Time *</Label>
                <Input type="datetime-local" value={seForm.startTime} onChange={(e) => setSeForm({ ...seForm, startTime: e.target.value })} />
              </div>
              <div>
                <Label>End Time *</Label>
                <Input type="datetime-local" value={seForm.endTime} onChange={(e) => setSeForm({ ...seForm, endTime: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Room</Label>
                <Input value={seForm.room} onChange={(e) => setSeForm({ ...seForm, room: e.target.value })} placeholder="e.g. Main Hall" />
              </div>
              <div>
                <Label>Order</Label>
                <Input type="number" min={0} value={seForm.order} onChange={(e) => setSeForm({ ...seForm, order: Number(e.target.value) })} />
              </div>
            </div>

            {speakers.length > 0 && (
              <div>
                <Label className="mb-2 block">Speakers</Label>
                <div className="space-y-2">
                  {speakers.map((sp) => (
                    <label key={sp.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={seForm.speakerIds.includes(sp.id)}
                        onChange={() => toggleSpeakerInSession(sp.id)}
                        className="rounded"
                      />
                      {sp.photoUrl ? (
                        <img src={sp.photoUrl} alt={sp.name} className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                          {sp.name.charAt(0)}
                        </div>
                      )}
                      <span className="text-sm">{sp.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setSeModalOpen(false)}>Cancel</Button>
            <Button variant="hero" onClick={saveSession} disabled={seSubmitting}>
              {seSubmitting ? 'Saving…' : 'Save Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
