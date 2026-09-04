import { useEffect, useState } from 'react';
import { SessionStore, type WorkoutSessionDraft } from '../../store/session.store';

const createSessionDraft = (): WorkoutSessionDraft => {
  const now = new Date().toISOString();
  return {
    id: `session-${Date.now()}`,
    name: 'Nuova sessione',
    startedAt: now,
    updatedAt: now,
    exercises: [],
    healthConnectRunId: null,
  };
};

export function useSessionEditor() {
  const [session, setSession] = useState<WorkoutSessionDraft>(
    () => SessionStore.load() ?? createSessionDraft(),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => SessionStore.save(session), 500);
    return () => window.clearTimeout(timer);
  }, [session]);

  const addExercise = () =>
    setSession((prev) => ({
      ...prev,
      exercises: [
        ...prev.exercises,
        {
          id: `exercise-${Date.now()}`,
          name: 'Nuovo esercizio',
          sets: [
            {
              id: `set-${Date.now()}`,
              reps: 8,
              loadKg: 0,
              rpe: 7,
              restSeconds: 90,
              completed: false,
            },
          ],
        },
      ],
    }));

  const clear = () => {
    SessionStore.clear();
    setSession(createSessionDraft());
  };

  return {
    session,
    setSession,
    addExercise,
    clear,
  };
}

export default useSessionEditor;
