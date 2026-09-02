export type WorkoutSet = { id: string; reps: number; loadKg: number; rpe: number | null; restSeconds: number; completed: boolean };
export type WorkoutExercise = { id: string; name: string; sets: WorkoutSet[] };
export type WorkoutSessionDraft = { id: string; name: string; startedAt: string; updatedAt: string; exercises: WorkoutExercise[]; healthConnectRunId?: string | null };

const KEY = 'hts.sessionDraft';

export const SessionStore = {
  load(): WorkoutSessionDraft | null {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  save(session: WorkoutSessionDraft) {
    const next = { ...session, updatedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  },
  clear() { localStorage.removeItem(KEY); },
};
