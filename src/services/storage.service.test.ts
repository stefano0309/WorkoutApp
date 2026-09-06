import { describe, expect, it } from 'vitest';
import { LocalStorageRepository } from './storage.service';

type State = { _storageVersion?: number; value: string };

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('LocalStorageRepository', () => {
  it('returns defaults when no state exists', () => {
    const repository = new LocalStorageRepository<State>('state', () => ({ value: 'default' }), createStorage());
    expect(repository.load().value).toEqual({ value: 'default' });
  });

  it('persists and restores state with the current schema version', () => {
    const storage = createStorage();
    const repository = new LocalStorageRepository<State>('state', () => ({ value: 'default' }), storage, 2);
    repository.save({ value: 'saved' });
    expect(repository.load()).toEqual({ value: { value: 'saved', _storageVersion: 2 }, migrated: false });
  });

  it('marks older persisted state as migrated', () => {
    const storage = createStorage();
    storage.setItem('state', JSON.stringify({ value: 'old', _storageVersion: 1 }));
    const repository = new LocalStorageRepository<State>('state', () => ({ value: 'default' }), storage, 2);
    expect(repository.load().migrated).toBe(true);
    expect(repository.load().value._storageVersion).toBe(2);
  });

  it('falls back safely when persisted JSON is invalid', () => {
    const storage = createStorage();
    storage.setItem('state', '{invalid');
    const repository = new LocalStorageRepository<State>('state', () => ({ value: 'default' }), storage);
    expect(repository.load().value).toEqual({ value: 'default' });
  });

  it('clears persisted state', () => {
    const storage = createStorage();
    const repository = new LocalStorageRepository<State>('state', () => ({ value: 'default' }), storage);
    repository.save({ value: 'saved' });
    repository.clear();
    expect(repository.load().value).toEqual({ value: 'default' });
  });
});
