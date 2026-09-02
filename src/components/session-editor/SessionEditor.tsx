import { useEffect, useState } from 'react';
import { SessionStore, type WorkoutSessionDraft } from '../../store/session.store';

export function SessionEditor() {
  const [session, setSession] = useState<WorkoutSessionDraft>(() => SessionStore.load() || {
    id: `session-${Date.now()}`,
    name: 'Nuova sessione',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    exercises: [],
    healthConnectRunId: null,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => SessionStore.save(session), 500);
    return () => window.clearTimeout(timer);
  }, [session]);

  const addExercise = () => setSession(prev => ({
    ...prev,
    exercises: [...prev.exercises, {
      id: `exercise-${Date.now()}`,
      name: 'Nuovo esercizio',
      sets: [{ id: `set-${Date.now()}`, reps: 8, loadKg: 0, rpe: 7, restSeconds: 90, completed: false }],
    }],
  }));

  return {
    session,
    setSession,
    addExercise,
    clear: () => { SessionStore.clear(); setSession({ ...session, exercises: [] }); },
  };
}

export default SessionEditor;
