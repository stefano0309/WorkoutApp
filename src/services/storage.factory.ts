import { LocalStorageRepository, STORAGE_KEY, STORAGE_VERSION } from './storage.service';
import type { PersistedState } from '../types/storage.types';

export function createStateRepository(
  defaults: () => PersistedState,
): LocalStorageRepository<PersistedState> {
  return new LocalStorageRepository<PersistedState>(
    STORAGE_KEY,
    defaults,
    window.localStorage,
    STORAGE_VERSION,
  );
}
