import { Clock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Session, Speaker } from '@/types/agenda';

interface Props {
  session: Session;
  speakers: Speaker[];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AgendaSession({ session, speakers }: Props) {
  const sessionSpeakers = speakers.filter((s) => session.speakerIds.includes(s.id));

  return (
    <div className="flex gap-4 py-4 border-b border-border last:border-0">
      {/* Time column */}
      <div className="flex-shrink-0 w-24 text-right">
        <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{formatTime(session.startTime)}</span>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-0.5">{formatTime(session.endTime)}</p>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <p className="font-semibold text-foreground">{session.title}</p>
          {session.room && (
            <Badge variant="outline" className="text-xs shrink-0 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {session.room}
            </Badge>
          )}
        </div>

        {session.description && (
          <p className="text-sm text-muted-foreground mt-1">{session.description}</p>
        )}

        {sessionSpeakers.length > 0 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {sessionSpeakers.map((sp) => (
              <div key={sp.id} className="flex items-center gap-1.5">
                {sp.photoUrl ? (
                  <img src={sp.photoUrl} alt={sp.name} className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                    {sp.name.charAt(0)}
                  </div>
                )}
                <span className="text-xs text-muted-foreground">{sp.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
