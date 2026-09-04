(() => {
  'use strict';
  if (window.__HTS_HEALTH_CONNECT_V3__) return;
  window.__HTS_HEALTH_CONNECT_V3__ = true;

  const STATE_KEY = 'hybridTrainingSystem';
  const readState = () => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch (_) { return {}; }
  };
  const writeState = (state) => {
    try {
      state.lastSavedAt = new Date().toISOString();
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (_) {}
  };

  const normalizeState = (state) => {
    state.health = state.health || {};
    state.log = Array.isArray(state.log) ? state.log : [];
    state.metrics = Array.isArray(state.metrics) ? state.metrics : [];
    return state;
  };

  const mergeSummary = (summary) => {
    if (!summary || typeof summary !== 'object') return;
    const state = normalizeState(readState());
    state.health = {
      ...state.health,
      ...summary,
      syncedAt: new Date().toISOString(),
      importedFromHealthConnect: true,
    };

    if (Number.isFinite(Number(summary.weightKg)) && Number(summary.weightKg) > 0) {
      const date = new Date().toISOString().slice(0, 10);
      const existing = state.metrics.findIndex((m) => m.date === date);
      const metric = {
        id: existing >= 0 ? state.metrics[existing].id : 'hc-weight-' + date,
        date,
        weight: Number(summary.weightKg),
        bodyFat: state.metrics[existing]?.bodyFat ?? null,
        source: 'health_connect',
      };
      if (existing >= 0) state.metrics[existing] = metric;
      else state.metrics.push(metric);
    }

    const runs = Array.isArray(summary.runningSessions) ? summary.runningSessions : [];
    const existingHealthIds = new Set(
      state.log.filter((x) => x.healthConnectSessionId).map((x) => x.healthConnectSessionId),
    );
    for (const run of runs) {
      const id = run.id || null;
      if (!id || existingHealthIds.has(id)) continue;
      const route = run.route || null;
      const distanceKm = Number(route?.distanceKm || 0);
      state.log.push({
        type: 'run',
        source: 'health_connect',
        healthConnectSessionId: id,
        label: run.exerciseTypeName || 'running',
        date: String(run.start || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        at: run.start || new Date().toISOString(),
        meta: {
          durationMinutes: Number(run.durationMinutes || 0),
          distanceKm,
          elevationGainM: Number(route?.elevationGainM || 0),
          routeStatus: route ? 'available' : (run.routeStatus || (run.hasRoute ? 'consent_required' : 'not_available')),
        },
        distanceKm,
      });
      existingHealthIds.add(id);
    }

    writeState(state);
    window.dispatchEvent(new CustomEvent('health-connect-state-updated', { detail: summary }));
  };

  const readNativeSummary = () => {
    try {
      const raw = window.AndroidHealthBridge?.readHealthSummary?.();
      if (!raw) return null;
      const summary = JSON.parse(raw);
      mergeSummary(summary);
      return summary;
    } catch (_) { return null; }
  };

  const sync = (days = 30) => {
    try {
      const rangeDays = Number(days) || 30;
      let requested = false;
      if (window.AndroidHealthBridge) {
        window.AndroidHealthBridge.syncHealthConnectDays(rangeDays);
        requested = true;
      }
      if (window.AndroidHeartRateBridge) {
        window.AndroidHeartRateBridge.syncHeartRate(rangeDays);
        requested = true;
      }
      return requested;
    } catch (_) {}
    return false;
  };

  const requestPermissions = () => {
    try { window.AndroidHealthBridge?.requestHealthPermissions?.(); } catch (_) {}
  };

  const requestRoute = (sessionId) => {
    try {
      if (sessionId && window.AndroidHealthBridge) {
        window.AndroidHealthBridge.requestExerciseRoute(String(sessionId));
        return true;
      }
    } catch (_) {}
    return false;
  };

  window.HealthConnectService = {
    read: readNativeSummary,
    sync,
    requestPermissions,
    requestRoute,
    mergeSummary,
  };

  window.addEventListener('health-connect-sync', (event) => mergeSummary(event.detail));
  window.addEventListener('health-connect-heart-rate', (event) => mergeSummary(event.detail));
  window.addEventListener('health-connect-route', (event) => {
    const detail = event.detail || {};
    const state = normalizeState(readState());
    state.health.routes = Array.isArray(state.health.routes) ? state.health.routes : [];
    const id = detail.sessionId;
    const existing = state.health.routes.findIndex((r) => r.sessionId === id);
    const route = { ...detail, importedAt: new Date().toISOString() };
    if (existing >= 0) state.health.routes[existing] = route;
    else state.health.routes.push(route);

    const log = state.log.find((x) => x.healthConnectSessionId === id);
    if (log) {
      log.meta = {
        ...(log.meta || {}),
        routeStatus: 'available',
        distanceKm: Number(detail.distanceKm || 0),
        elevationGainM: Number(detail.elevationGainM || 0),
      };
      log.distanceKm = Number(detail.distanceKm || 0);
    }
    writeState(state);
    window.dispatchEvent(new CustomEvent('health-connect-state-updated', { detail: route }));
  });

  const boot = () => {
    readNativeSummary();
    setTimeout(() => sync(30), 600);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
