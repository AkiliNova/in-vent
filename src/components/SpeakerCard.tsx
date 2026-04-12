import { Globe, Link2 } from 'lucide-react';
import type { Speaker } from '@/types/agenda';

export default function SpeakerCard({ speaker }: { speaker: Speaker }) {
  return (
    <div className="glass rounded-2xl p-5 flex flex-col items-center text-center gap-3">
      {speaker.photoUrl ? (
        <img
          src={speaker.photoUrl}
          alt={speaker.name}
          className="w-20 h-20 rounded-full object-cover ring-2 ring-primary/30"
        />
      ) : (
        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary">
          {speaker.name.charAt(0).toUpperCase()}
        </div>
      )}

      <div>
        <p className="font-semibold text-foreground">{speaker.name}</p>
        {speaker.bio && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{speaker.bio}</p>
        )}
      </div>

      {(speaker.twitter || speaker.linkedin || speaker.website) && (
        <div className="flex items-center gap-3 mt-1">
          {speaker.twitter && (
            <a href={speaker.twitter} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
              <span className="text-sm font-bold">𝕏</span>
            </a>
          )}
          {speaker.linkedin && (
            <a href={speaker.linkedin} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
              <Link2 className="w-4 h-4" />
            </a>
          )}
          {speaker.website && (
            <a href={speaker.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
              <Globe className="w-4 h-4" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
