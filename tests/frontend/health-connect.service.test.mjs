import test from 'node:test';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';

const source = `export type HealthSummary = {
  weightKg: number | null;
  steps: number | null;
  sleepMinutes: number | null;
  lastRun: { id?: string; startTime?: string; endTime?: string; distanceKm?: number | null } | null;
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
  try { return JSON.parse(cached) as HealthSummary; } catch { return null; }
}`;

const compiled = transformSync(source, { loader: 'ts', format: 'esm', target: 'node22' }).code;
const moduleUrl = `data:text/javascript,${encodeURIComponent(compiled)}`;
const health = await import(moduleUrl);

function installWindow(bridge) {
  const previous = globalThis.window;
  globalThis.window = new EventTarget();
  globalThis.window.AndroidHealthBridge = bridge;
  return () => { globalThis.window = previous; };
}

test('nativeHealthBridge returns null when the native bridge is absent', () => {
  const restore = installWindow(undefined);
  try { assert.equal(health.nativeHealthBridge(), null); } finally { restore(); }
});

test('importHealthSummary resolves the native sync event and cleans up listeners', async () => {
  let syncCalls = 0;
  const restore = installWindow({ syncHealthConnect: () => { syncCalls += 1; } });
  try {
    const promise = health.importHealthSummary(1000);
    assert.equal(syncCalls, 1);
    const summary = { weightKg: 66, steps: 12000, sleepMinutes: 450, lastRun: null, importedAt: '2026-09-05T12:00:00Z' };
    window.dispatchEvent(new CustomEvent('health-connect-sync', { detail: summary }));
    assert.deepEqual(await promise, summary);
  } finally { restore(); }
});

test('importHealthSummary falls back to valid cached JSON on error', async () => {
  const cached = { weightKg: 65.5, steps: null, sleepMinutes: null, lastRun: null, importedAt: '2026-09-05T12:01:00Z' };
  const restore = installWindow({ syncHealthConnect() {}, readHealthSummary: () => JSON.stringify(cached) });
  try {
    const promise = health.importHealthSummary(1000);
    window.dispatchEvent(new Event('health-connect-error'));
    assert.deepEqual(await promise, cached);
  } finally { restore(); }
});

test('importHealthSummary returns null for invalid cached JSON after timeout', async () => {
  const restore = installWindow({ syncHealthConnect() {}, readHealthSummary: () => '{invalid' });
  try { assert.equal(await health.importHealthSummary(5), null); } finally { restore(); }
});
