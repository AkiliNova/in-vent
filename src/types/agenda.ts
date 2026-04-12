export interface Speaker {
  id: string;
  name: string;
  bio?: string;
  photoUrl?: string;
  twitter?: string;
  linkedin?: string;
  website?: string;
}

export interface Session {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  room?: string;
  speakerIds: string[];
  order: number;
}
