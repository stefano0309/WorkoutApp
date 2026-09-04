(() => {
  'use strict';
  if (window.__HTS_OFFLINE_SYNC_V2__) return;
  window.__HTS_OFFLINE_SYNC_V2__ = true;

  const STATE_KEY = 'hybridTrainingSystem';
  const META_KEY = 'hts.offlineSync.meta.v1';
  const QUEUE_KEY = 'hts.offlineSync.queue.v1';
  const DEVICE_KEY = 'hts.deviceId.v1';
  const DEBOUNCE_MS = 1800;

  const getDeviceId = () => {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || ('device-' + Date.now() + '-' + Math.random().toString(36).slice(2))).toString();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  };
  const readJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
  };
  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const readState = () => readJson(STATE_KEY, null);
  const getUid = () => readState()?.account?.uid || null;
  const stamp = (state) => {
    const copy = JSON.parse(JSON.stringify(state || {}));
    copy._storageVersion = Number(copy._storageVersion || 2);
    copy.lastSavedAt = copy.lastSavedAt || new Date().toISOString();
    return copy;
  };
  const meta = () => readJson(META_KEY, { deviceId: getDeviceId(), lastRemoteAt: null, lastLocalAt: null });
  const setMeta = (patch) => writeJson(META_KEY, { ...meta(), ...patch, deviceId: getDeviceId() });
  const queue = () => readJson(QUEUE_KEY, null);
  const clearQueue = () => localStorage.removeItem(QUEUE_KEY);
  const enqueue = (state) => {
    const item = { version: 1, deviceId: getDeviceId(), updatedAt: state.lastSavedAt || new Date().toISOString(), state: stamp(state) };
    writeJson(QUEUE_KEY, item);
    return item;
  };
  const time = (value) => { const n = Date.parse(value || ''); return Number.isFinite(n) ? n : 0; };

  const collectionKey = (item, fallbackIndex) => {
    if (!item || typeof item !== 'object') return `index:${fallbackIndex}`;
    return item.id || item.healthConnectSessionId || item.sessionId || item.date || `${JSON.stringify(item)}:${fallbackIndex}`;
  };

  const mergeCollection = (localItems, remoteItems) => {
    const merged = new Map();
    for (const [index, item] of localItems.entries()) merged.set(collectionKey(item, index), item);
    for (const [index, item] of remoteItems.entries()) {
      const key = collectionKey(item, index);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, item);
        continue;
      }
      const existingAt = time(existing?.updatedAt || existing?.timestamp || existing?.at || existing?.date);
      const remoteAt = time(item?.updatedAt || item?.timestamp || item?.at || item?.date);
      merged.set(key, remoteAt >= existingAt ? item : existing);
    }
    return Array.from(merged.values());
  };

  const mergeState = (localState, remoteState) => {
    const local = stamp(localState || {});
    const remote = stamp(remoteState || {});
    const localAt = time(local.lastSavedAt);
    const remoteAt = time(remote.lastSavedAt);
    const newest = remoteAt >= localAt ? remote : local;

    const merged = {
      ...local,
      ...remote,
      ...newest,
      account: { ...(local.account || {}), ...(remote.account || {}) },
      health: { ...(local.health || {}), ...(remote.health || {}) },
      settings: { ...(local.settings || {}), ...(remote.settings || {}) },
      profile: { ...(local.profile || {}), ...(remote.profile || {}) },
      assessment: { ...(local.assessment || {}), ...(remote.assessment || {}) },
      metrics: mergeCollection(
        Array.isArray(local.metrics) ? local.metrics : [],
        Array.isArray(remote.metrics) ? remote.metrics : [],
      ),
      log: mergeCollection(
        Array.isArray(local.log) ? local.log : [],
        Array.isArray(remote.log) ? remote.log : [],
      ),
      _storageVersion: Math.max(Number(local._storageVersion || 2), Number(remote._storageVersion || 2)),
      lastSavedAt: newest.lastSavedAt || new Date().toISOString(),
    };

    merged.health.routes = mergeCollection(
      Array.isArray(local.health?.routes) ? local.health.routes : [],
      Array.isArray(remote.health?.routes) ? remote.health.routes : [],
    );

    return merged;
  };

  let firebaseApi = null;
  let timer = null;
  let busy = false;

  async function ensureFirebaseApi() {
    if (firebaseApi) return firebaseApi;
    const [{ getApp }, { getAuth }, { getDatabase, ref, get, update }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js'),
    ]);
    firebaseApi = { getApp, getAuth, getDatabase, ref, get, update };
    return firebaseApi;
  }

  async function remoteRead(uid) {
    const api = await ensureFirebaseApi();
    const auth = api.getAuth(api.getApp());
    if (!auth.currentUser || auth.currentUser.uid !== uid) throw new Error('firebase-auth-required');
    const db = api.getDatabase(api.getApp());
    const snap = await api.get(api.ref(db, 'users/' + uid + '/offlineStateV1'));
    return snap.exists() ? snap.val() : null;
  }

  async function remoteWrite(uid, envelope) {
    const api = await ensureFirebaseApi();
    const auth = api.getAuth(api.getApp());
    if (!auth.currentUser || auth.currentUser.uid !== uid) throw new Error('firebase-auth-required');
    const db = api.getDatabase(api.getApp());
    return api.update(api.ref(db, 'users/' + uid), { offlineStateV1: envelope });
  }

  function applyRemote(remoteState) {
    if (!remoteState) return false;
    const local = readState() || {};
    const next = mergeState(local, remoteState);
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    setMeta({ lastRemoteAt: next.lastSavedAt || new Date().toISOString() });
    window.dispatchEvent(new CustomEvent('offline-sync-applied', { detail: next }));
    return true;
  }

  async function reconcile() {
    if (busy || !navigator.onLine) return;
    const uid = getUid();
    if (!uid) return;
    busy = true;
    try {
      const local = stamp(readState() || {});
      const pending = queue();
      const remote = await remoteRead(uid);
      const remoteState = remote?.state || null;

      if (!remoteState) {
        const source = pending?.state ? stamp(pending.state) : local;
        const envelope = { schema: 2, deviceId: getDeviceId(), updatedAt: source.lastSavedAt || new Date().toISOString(), state: source };
        await remoteWrite(uid, envelope);
        clearQueue();
        setMeta({ lastRemoteAt: envelope.updatedAt, lastLocalAt: envelope.updatedAt });
      } else {
        const merged = mergeState(local, remoteState);
        const envelope = { schema: 2, deviceId: getDeviceId(), updatedAt: merged.lastSavedAt || new Date().toISOString(), state: merged };
        applyRemote(remoteState);
        await remoteWrite(uid, envelope);
        clearQueue();
        setMeta({ lastRemoteAt: envelope.updatedAt, lastLocalAt: envelope.updatedAt });
      }
      window.dispatchEvent(new CustomEvent('offline-sync-status', { detail: { online: true, synced: true, pending: false } }));
    } catch (error) {
      const local = readState();
      if (local) enqueue(local);
      window.dispatchEvent(new CustomEvent('offline-sync-status', { detail: { online: navigator.onLine, synced: false, pending: true, error: String(error) } }));
    } finally {
      busy = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    const state = readState();
    if (state?.account?.uid) enqueue(state);
    timer = setTimeout(reconcile, DEBOUNCE_MS);
  }

  function patchStorage() {
    const original = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key, value) => {
      original(key, value);
      if (key === STATE_KEY && !busy) schedule();
    };
  }

  function unifyLegacyCloudSync() {
    const cloudSync = window.CloudSync;
    if (!cloudSync || cloudSync.__offlineFirstUnified) return;

    cloudSync.__offlineFirstUnified = true;
    const legacyUpload = cloudSync.upload;
    const legacyScheduleUpload = cloudSync.scheduleUpload;

    cloudSync.scheduleUpload = () => {
      schedule();
    };
    cloudSync.upload = () => reconcile();

    if (typeof cloudSync.download === 'function') cloudSync.download = () => reconcile();
    if (typeof cloudSync.startWatch === 'function') cloudSync.startWatch = () => {};

    if (legacyUpload && legacyScheduleUpload) {
      window.dispatchEvent(new CustomEvent('offline-sync-legacy-disabled', {
        detail: { upload: true, scheduleUpload: true },
      }));
    }
  }

  async function boot() {
    patchStorage();
    unifyLegacyCloudSync();
    window.addEventListener('online', reconcile);
    window.addEventListener('offline', () => {
      const state = readState();
      if (state?.account?.uid) enqueue(state);
      window.dispatchEvent(new CustomEvent('offline-sync-status', { detail: { online: false, synced: false, pending: true } }));
    });
    window.addEventListener('offline-sync-request', reconcile);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reconcile();
    });
    window.addEventListener('pageshow', reconcile);
    if (getUid()) reconcile();
    window.OfflineFirstSync = {
      sync: reconcile,
      schedule,
      pending: () => !!queue(),
      deviceId: getDeviceId,
      merge: mergeState,
      status: () => ({ online: navigator.onLine, pending: !!queue(), uid: getUid(), meta: meta() }),
    };
    unifyLegacyCloudSync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
