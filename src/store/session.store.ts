import { LocalStorageRepository } from '../services/storage.service';

export type WorkoutSet = {
  id: string;
  reps: number;
  loadKg: number;
  rpe: number | null;
  restSeconds: number;
  completed: boolean;
};

export type WorkoutExercise = {
  id: string;
  name: string;
  sets: WorkoutSet[];
};

export type WorkoutSessionDraft = {
  id: string;
  name: string;
  startedAt: string;
  updatedAt: string;
  exercises: WorkoutExercise[];
  healthConnectRunId?: string | null;
};

const KEY = 'hts.sessionDraft';
const repository = new LocalStorageRepository<WorkoutSessionDraft | null>(KEY, () => null);

export const SessionStore = {
  load(): WorkoutSessionDraft | null {
    return repository.load().value;
  },

  save(session: WorkoutSessionDraft): WorkoutSessionDraft {
    const next = { ...session, updatedAt: new Date().toISOString() };
    repository.save(next);
    return next;
  },

  clear(): void {
    repository.clear();
  },
};