import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const source = await readFile(new URL('../../src/services/healthConnect.service.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'node22' });
const health = await import(`data:text/javascript,${encodeURIComponent(code)}`);

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

test('importHealthSummary resolves the native sync event', async () => {
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
