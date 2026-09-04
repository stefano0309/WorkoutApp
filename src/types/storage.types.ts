export type PersistedAccount = {
  uid: string | null;
  username: string | null;
  email: string | null;
  lastSyncAt: string | null;
};

export type PersistedState = {
  _storageVersion: number;
  profile: unknown | null;
  assessment: unknown | null;
  meso: Record<string, unknown>;
  sessions: Record<string, unknown>;
  log: unknown[];
  metrics: unknown[];
  photos: unknown[];
  statsView: Record<string, unknown>;
  timer: Record<string, unknown>;
  activePage: string;
  settings: Record<string, unknown>;
  zoneTest: unknown | null;
  lastSavedAt: string | null;
  account: PersistedAccount;
};
