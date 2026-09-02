export type HealthSummary = {
  weightKg: number | null;
  steps: number | null;
  sleepMinutes: number | null;
  lastRun: {
    id?: string;
    startTime?: string;
    endTime?: string;
    distanceKm?: number | null;
  } | null;
  importedAt: string;
};

export const HEALTH_PERMISSIONS = {
  weight: 'android.permission.health.READ_WEIGHT',
  steps: 'android.permission.health.READ_STEPS',
  sleep: 'android.permission.health.READ_SLEEP',
  exercise: 'android.permission.health.READ_EXERCISE',
  exerciseRoutes: 'android.permission.health.READ_EXERCISE_ROUTES',
  heartRate: 'android.permission.health.READ_HEART_RATE',
};

type NativeHealthBridge = {
  requestHealthPermissions?: () => void;
  syncHealthConnect?: () => void;
  readHealthSummary?: () => string | null;
};

export function nativeHealthBridge(): NativeHealthBridge | null {
  const bridge = (window as Window & { AndroidHealthBridge?: NativeHealthBridge }).AndroidHealthBridge;
  return bridge || null;
}

export async function importHealthSummary(): Promise<HealthSummary | null> {
  const bridge = nativeHealthBridge();
  if (!bridge) return null;
  bridge.syncHealthConnect?.();
  const raw = bridge.readHealthSummary?.();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HealthSummary;
  } catch {
    return null;
  }
}
