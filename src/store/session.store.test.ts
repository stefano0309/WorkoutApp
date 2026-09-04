import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore, type WorkoutSessionDraft } from './session.store';

const createSession = (): WorkoutSessionDraft => ({
  id: 'session-1',
  name: 'Upper Strength',
  startedAt: '2026-09-04T15:00:00.000Z',
  updatedAt: '2026-09-04T15:00:00.000Z',
  exercises: [
    {
      id: 'exercise-1',
      name: 'Push-up',
      sets: [
        {
          id: 'set-1',
          reps: 10,
          loadKg: 0,
          rpe: 7,
          restSeconds: 90,
          completed: false,
        },
      ],
    },
  ],
  healthConnectRunId: null,
});

describe('SessionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('returns null when no draft exists', () => {
    expect(SessionStore.load()).toBeNull();
  });

  it('persists and restores a draft through the shared repository', () => {
    const session = createSession();
    const saved = SessionStore.save(session);
    const restored = SessionStore.load();

    expect(saved.updatedAt).not.toBe(session.updatedAt);
    expect(restored).toMatchObject({
      ...session,
      updatedAt: saved.updatedAt,
    });
    expect(localStorage.getItem('hts.sessionDraft')).toContain('_storageVersion');
  });

  it('clears the persisted draft', () => {
    SessionStore.save(createSession());
    SessionStore.clear();

    expect(SessionStore.load()).toBeNull();
  });
});