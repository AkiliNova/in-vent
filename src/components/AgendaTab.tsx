import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import type { Speaker, Session } from '@/types/agenda';
import SpeakerCard from './SpeakerCard';
import AgendaSession from './AgendaSession';

interface Props {
  tenantId: string;
  eventId: string;
}

function groupByDate(sessions: Session[]): Record<string, Session[]> {
  const groups: Record<string, Session[]> = {};
  for (const s of sessions) {
    const day = new Date(s.startTime).toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    if (!groups[day]) groups[day] = [];
    groups[day].push(s);
  }
  return groups;
}

export default function AgendaTab({ tenantId, eventId }: Props) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [spSnap, seSnap] = await Promise.all([
          getDocs(collection(db, `tenants/${tenantId}/events/${eventId}/speakers`)),
          getDocs(query(
            collection(db, `tenants/${tenantId}/events/${eventId}/sessions`),
            orderBy('order', 'asc'),
          )),
        ]);
        setSpeakers(spSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Speaker, 'id'>) })));
        setSessions(seSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Session, 'id'>) })));
      } catch (_) {
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantId, eventId]);

  if (loading) return <p className="text-sm text-muted-foreground py-6 text-center">Loading agenda…</p>;

  const grouped = groupByDate(sessions);
  const days = Object.keys(grouped);

  return (
    <div className="space-y-8 mt-4">
      {/* Schedule */}
      {days.length > 0 ? (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Schedule</h3>
          {days.map((day) => (
            <div key={day} className="mb-6">
              {days.length > 1 && (
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">{day}</p>
              )}
              {grouped[day].map((s) => (
                <AgendaSession key={s.id} session={s} speakers={speakers} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4 text-center">No sessions added yet.</p>
      )}

      {/* Speakers */}
      {speakers.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Speakers</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {speakers.map((sp) => (
              <SpeakerCard key={sp.id} speaker={sp} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
