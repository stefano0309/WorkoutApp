import { useMemo, useState } from 'react';
import { SessionStore } from '../../store/session.store';
import { useSessionEditor } from './SessionEditor';
import './session-editor.css';

export type SessionEditorViewProps = {
  onSaved?: () => void;
};

export function SessionEditorView({ onSaved }: SessionEditorViewProps) {
  const { session, setSession, addExercise, clear } = useSessionEditor();
  const [feedback, setFeedback] = useState('');

  const exerciseCount = useMemo(() => session.exercises.length, [session.exercises.length]);

  const updateName = (name: string) => setSession((prev) => ({ ...prev, name }));

  const updateExerciseName = (exerciseId: string, name: string) => {
    setSession((prev) => ({
      ...prev,
      exercises: prev.exercises.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, name } : exercise,
      ),
    }));
  };

  const updateSet = (exerciseId: string, setId: string, field: 'reps' | 'loadKg' | 'rpe' | 'restSeconds', value: number | null) => {
    setSession((prev) => ({
      ...prev,
      exercises: prev.exercises.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId ? { ...set, [field]: value } : set,
              ),
            },
      ),
    }));
  };

  const addSet = (exerciseId: string) => {
    setSession((prev) => ({
      ...prev,
      exercises: prev.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const source = exercise.sets.at(-1);
        return {
          ...exercise,
          sets: [
            ...exercise.sets,
            {
              id: `set-${Date.now()}`,
              reps: source?.reps ?? 8,
              loadKg: source?.loadKg ?? 0,
              rpe: source?.rpe ?? 7,
              restSeconds: source?.restSeconds ?? 90,
              completed: false,
            },
          ],
        };
      }),
    }));
  };

  const handleSave = () => {
    SessionStore.save(session);
    setFeedback('Sessione salvata');
    onSaved?.();
  };

  const handleClear = () => {
    clear();
    setFeedback('Sessione azzerata');
  };

  return (
    <section className="session-editor" aria-labelledby="session-editor-title">
      <header className="session-editor__header">
        <div>
          <h2 id="session-editor-title">Modifica sessione</h2>
          <p>{exerciseCount} {exerciseCount === 1 ? 'esercizio' : 'esercizi'}</p>
        </div>
        <span className="session-editor__status" role="status" aria-live="polite">{feedback}</span>
      </header>

      <div className="session-editor__card">
        <label className="session-editor__field" htmlFor="session-name">
          <span>Nome sessione</span>
          <input id="session-name" value={session.name} onChange={(event) => updateName(event.target.value)} />
        </label>
      </div>

      <ol className="session-editor__exercises" aria-label="Esercizi della sessione">
        {session.exercises.map((exercise, exerciseIndex) => (
          <li className="session-editor__card" key={exercise.id}>
            <div className="session-editor__exercise-header">
              <label className="session-editor__field" htmlFor={`exercise-${exercise.id}`}>
                <span>Esercizio {exerciseIndex + 1}</span>
                <input id={`exercise-${exercise.id}`} value={exercise.name} onChange={(event) => updateExerciseName(exercise.id, event.target.value)} />
              </label>
              <button type="button" onClick={() => addSet(exercise.id)}>Aggiungi serie</button>
            </div>

            {exercise.sets.map((set, setIndex) => (
              <div className="session-editor__set-row" key={set.id} aria-label={`Serie ${setIndex + 1}`}>
                <label className="session-editor__field">
                  <span>Ripetizioni</span>
                  <input type="number" min="0" inputMode="numeric" value={set.reps} onChange={(event) => updateSet(exercise.id, set.id, 'reps', Number(event.target.value))} />
                </label>
                <label className="session-editor__field">
                  <span>Carico (kg)</span>
                  <input type="number" min="0" step="0.5" inputMode="decimal" value={set.loadKg} onChange={(event) => updateSet(exercise.id, set.id, 'loadKg', Number(event.target.value))} />
                </label>
                <label className="session-editor__field">
                  <span>RPE</span>
                  <input type="number" min="1" max="10" step="0.5" inputMode="decimal" value={set.rpe ?? ''} onChange={(event) => updateSet(exercise.id, set.id, 'rpe', event.target.value === '' ? null : Number(event.target.value))} />
                </label>
                <label className="session-editor__field">
                  <span>Recupero (s)</span>
                  <input type="number" min="0" inputMode="numeric" value={set.restSeconds} onChange={(event) => updateSet(exercise.id, set.id, 'restSeconds', Number(event.target.value))} />
                </label>
              </div>
            ))}
          </li>
        ))}
      </ol>

      <div className="session-editor__actions">
        <button type="button" onClick={addExercise}>Aggiungi esercizio</button>
        <button type="button" onClick={handleSave}>Salva</button>
        <button type="button" onClick={handleClear}>Azzera</button>
      </div>
    </section>
  );
}

export default SessionEditorView;
