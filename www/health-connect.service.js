(() => {
  'use strict';
  if (window.__HTS_HEALTH_CONNECT_V4__) return;
  window.__HTS_HEALTH_CONNECT_V4__ = true;

  const STATE_KEY = 'hybridTrainingSystem';
  const SYNC_TIMEOUT_MS = 30_000;
  const ensureStorage = () => {
    if (window.HTSStorage) return Promise.resolve(window.HTSStorage);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'storage-repository.js';
      script.async = false;
      script.dataset.htsStorageRepository = 'true';
      script.addEventListener('load', () => window.HTSStorage ? resolve(window.HTSStorage) : reject(new Error('storage-repository-unavailable')), { once: true });
      script.addEventListener('error', () => reject(new Error('storage-repository-load-failed')), { once: true });
      document.head.appendChild(script);
    });
  };
  const readState = () => window.HTSStorage?.readObject(STATE_KEY, {}) || {};
  const writeState = (state) => {
    try { state.lastSavedAt = new Date().toISOString(); window.HTSStorage?.write(STATE_KEY, state); } catch (_) {}
  };
  const normalizeState = (state) => {
    state.health = state.health || {};
    state.log = Array.isArray(state.log) ? state.log : [];
    state.metrics = Array.isArray(state.metrics) ? state.metrics : [];
    return state;
  };
  const mergeSummary = (summary) => {
    if (!summary || typeof summary !== 'object' || !window.HTSStorage) return;
    const state = normalizeState(readState());
    state.health = { ...state.health, ...summary, syncedAt: new Date().toISOString(), importedFromHealthConnect: true };
    if (Number.isFinite(Number(summary.weightKg)) && Number(summary.weightKg) > 0) {
      const date = new Date().toISOString().slice(0, 10);
      const existing = state.metrics.findIndex((m) => m.date === date);
      const metric = { id: existing >= 0 ? state.metrics[existing].id : 'hc-weight-' + date, date, weight: Number(summary.weightKg), bodyFat: state.metrics[existing]?.bodyFat ?? null, source: 'health_connect' };
      if (existing >= 0) state.metrics[existing] = metric; else state.metrics.push(metric);
    }
    const runs = Array.isArray(summary.runningSessions) ? summary.runningSessions : [];
    const existingHealthIds = new Set(state.log.filter((x) => x.healthConnectSessionId).map((x) => x.healthConnectSessionId));
    for (const run of runs) {
      const id = run.id || null;
      if (!id || existingHealthIds.has(id)) continue;
      const route = run.route || null;
      const distanceKm = Number(route?.distanceKm || 0);
      const elevationGainM = route?.elevationGainM ?? null;
      state.log.push({ type: 'run', source: 'health_connect', healthConnectSessionId: id, label: run.exerciseTypeName || 'running', date: String(run.start || '').slice(0, 10) || new Date().toISOString().slice(0, 10), at: run.start || new Date().toISOString(), meta: { durationMinutes: Number(run.durationMinutes || 0), distanceKm, elevationGainM, routeStatus: route ? 'available' : (run.routeStatus || (run.hasRoute ? 'consent_required' : 'not_available')) }, distanceKm });
      existingHealthIds.add(id);
    }
    writeState(state);
    window.dispatchEvent(new CustomEvent('health-connect-state-updated', { detail: summary }));
  };
  const readNativeSummary = () => {
    try { const raw = window.AndroidHealthBridge?.readHealthSummary?.(); if (!raw) return null; const summary = JSON.parse(raw); mergeSummary(summary); return summary; } catch (_) { return null; }
  };
  let activeSyncPromise = null;
  const sync = (days = 30) => {
    if (activeSyncPromise) return activeSyncPromise;
    activeSyncPromise = new Promise((resolve, reject) => {
      const rangeDays = Number(days) || 30;
      const hasHealthBridge = Boolean(window.AndroidHealthBridge);
      const hasHeartRateBridge = Boolean(window.AndroidHeartRateBridge);
      if (!hasHealthBridge && !hasHeartRateBridge) { activeSyncPromise = null; resolve({ requested: false, healthConnect: false, heartRate: false }); return; }
      let healthDone = !hasHealthBridge, heartRateDone = !hasHeartRateBridge, settled = false, finish;
      const timer = setTimeout(() => finish(new Error('health-connect-sync-timeout')), SYNC_TIMEOUT_MS);
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('health-connect-sync', onHealthSync); window.removeEventListener('health-connect-heart-rate', onHeartRateSync); window.removeEventListener('health-connect-error', onError); activeSyncPromise = null; };
      finish = (error) => { if (settled) return; settled = true; cleanup(); if (error) reject(error); else resolve({ requested: true, healthConnect: hasHealthBridge, heartRate: hasHeartRateBridge }); };
      const checkDone = () => { if (healthDone && heartRateDone) finish(); };
      const onHealthSync = (event) => { mergeSummary(event.detail); healthDone = true; checkDone(); };
      const onHeartRateSync = (event) => { mergeSummary(event.detail); heartRateDone = true; checkDone(); };
      const onError = (event) => finish(new Error(String(event.detail?.code || event.detail?.message || 'health-connect-sync-failed')));
      window.addEventListener('health-connect-sync', onHealthSync); window.addEventListener('health-connect-heart-rate', onHeartRateSync); window.addEventListener('health-connect-error', onError);
      try { if (hasHealthBridge) window.AndroidHealthBridge.syncHealthConnectDays(rangeDays); if (hasHeartRateBridge) window.AndroidHeartRateBridge.syncHeartRate(rangeDays); } catch (error) { finish(error); }
      checkDone();
    });
    return activeSyncPromise;
  };
  const requestPermissions = () => { try { window.AndroidHealthBridge?.requestHealthPermissions?.(); } catch (_) {} };
  const requestRoute = (sessionId) => { try { if (sessionId && window.AndroidHealthBridge) { window.AndroidHealthBridge.requestExerciseRoute(String(sessionId)); return true; } } catch (_) {} return false; };

  window.HealthConnectService = { read: readNativeSummary, sync, requestPermissions, requestRoute, mergeSummary };
  window.addEventListener('health-connect-sync', (event) => mergeSummary(event.detail));
  window.addEventListener('health-connect-heart-rate', (event) => mergeSummary(event.detail));
  window.addEventListener('health-connect-route', (event) => {
    const detail = event.detail || {};
    if (!window.HTSStorage) return;
    const state = normalizeState(readState());
    state.health.routes = Array.isArray(state.health.routes) ? state.health.routes : [];
    const id = detail.sessionId;
    const existing = state.health.routes.findIndex((r) => r.sessionId === id);
    const route = { ...detail, importedAt: new Date().toISOString() };
    if (existing >= 0) state.health.routes[existing] = route; else state.health.routes.push(route);
    const log = state.log.find((x) => x.healthConnectSessionId === id);
    if (log) { log.meta = { ...(log.meta || {}), routeStatus: 'available', distanceKm: Number(detail.distanceKm || 0), elevationGainM: detail.elevationGainM ?? null }; log.distanceKm = Number(detail.distanceKm || 0); }
    writeState(state);
    window.dispatchEvent(new CustomEvent('health-connect-state-updated', { detail: route }));
  });
  const boot = async () => { try { await ensureStorage(); readNativeSummary(); await sync(30).catch(() => {}); } catch (_) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
