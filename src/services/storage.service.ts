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

export class LocalStorageRepository<T extends { _storageVersion?: number }> implements StorageRepository<T> {
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
      const parsed = JSON.parse(raw) as Partial<T>;
      const migrated = Number(parsed._storageVersion || 0) !== this.version;
      return {
        value: { ...fallback, ...parsed, _storageVersion: this.version },
        migrated,
      };
    } catch (error) {
      console.warn(`Unable to parse persisted state for ${this.key}`, error);
      return { value: fallback, migrated: false };
    }
  }

  save(value: T): void {
    this.storage.setItem(
      this.key,
      JSON.stringify({ ...value, _storageVersion: this.version }),
    );
  }

  clear(): void {
    this.storage.removeItem(this.key);
  }
}
