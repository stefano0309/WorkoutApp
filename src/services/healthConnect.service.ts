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

type HealthEvent = CustomEvent<HealthSummary>;

export function nativeHealthBridge(): NativeHealthBridge | null {
  const bridge = (window as Window & { AndroidHealthBridge?: NativeHealthBridge }).AndroidHealthBridge;
  return bridge || null;
}

export async function importHealthSummary(timeoutMs = 30_000): Promise<HealthSummary | null> {
  const bridge = nativeHealthBridge();
  if (!bridge) return null;

  return new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const onSync = (event: Event) => finish((event as HealthEvent).detail || null);
    const onError = () => finish(readCachedSummary(bridge));

    const cleanup = () => {
      window.removeEventListener('health-connect-sync', onSync as EventListener);
      window.removeEventListener('health-connect-error', onError as EventListener);
      if (timeout) clearTimeout(timeout);
    };

    const finish = (value: HealthSummary | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    window.addEventListener('health-connect-sync', onSync as EventListener, { once: true });
    window.addEventListener('health-connect-error', onError as EventListener, { once: true });
    timeout = setTimeout(() => finish(readCachedSummary(bridge)), timeoutMs);
    bridge.syncHealthConnect?.();
  });
}

function readCachedSummary(bridge: NativeHealthBridge): HealthSummary | null {
  const cached = bridge.readHealthSummary?.();
  if (!cached) return null;
  try {
    return JSON.parse(cached) as HealthSummary;
  } catch {
    return null;
  }
}
