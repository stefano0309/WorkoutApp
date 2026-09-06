export const STORAGE_KEY = 'hybridTrainingSystem';
export const STORAGE_VERSION = 2;

export type StorageResult<T> = {
  value: T;
  migrated: boolean;
};

export interface StorageRepository<T> {
  load(): StorageResult<T>;
  save(value: T): void;
  clear(): void;
}

export type StorageAdapter = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type PersistedRecord = Record<string, unknown> & {
  _storageVersion?: number;
};

export class StorageQuotaExceededError extends Error {
  constructor(message = 'Persistent storage quota exceeded') {
    super(message);
    this.name = 'StorageQuotaExceededError';
  }
}

const isRecord = (value: unknown): value is PersistedRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isQuotaExceededError = (error: unknown): boolean => {
  if (!(error instanceof DOMException)) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  );
};

export class LocalStorageRepository<T> implements StorageRepository<T> {
  constructor(
    private readonly key: string,
    private readonly defaults: () => T,
    private readonly storage: StorageAdapter = window.localStorage,
    private readonly version = STORAGE_VERSION,
  ) {}

  load(): StorageResult<T> {
    const fallback = this.defaults();
    const raw = this.storage.getItem(this.key);

    if (!raw) return { value: fallback, migrated: false };

    try {
      const parsed = JSON.parse(raw) as T;
      const migrated = isRecord(parsed)
        ? Number(parsed._storageVersion ?? 0) !== this.version
        : false;

      if (isRecord(parsed) && isRecord(fallback)) {
        return {
          value: {
            ...fallback,
            ...parsed,
            _storageVersion: this.version,
          } as T,
          migrated,
        };
      }

      return { value: parsed, migrated };
    } catch (error) {
      console.warn(`Unable to parse persisted state for ${this.key}`, error);
      return { value: fallback, migrated: false };
    }
  }

  save(value: T): void {
    const persisted = isRecord(value)
      ? { ...value, _storageVersion: this.version }
      : value;

    try {
      this.storage.setItem(this.key, JSON.stringify(persisted));
    } catch (error) {
      if (isQuotaExceededError(error)) {
        throw new StorageQuotaExceededError(`Unable to persist ${this.key}: quota exceeded`);
      }
      throw error;
    }
  }

  clear(): void {
    this.storage.removeItem(this.key);
  }
}