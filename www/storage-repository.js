(() => {
  'use strict';
  if (window.HTSStorage) return;

  const DEFAULT_VERSION = 2;
  const hasStorage = typeof window !== 'undefined' && !!window.localStorage;
  const backend = hasStorage ? window.localStorage : null;
  const listeners = new Map();
  let nativePatched = false;

  const isQuotaExceededError = (error) => {
    if (!(error instanceof DOMException)) return false;
    return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22 || error.code === 1014;
  };
  const notify = (key) => (listeners.get(key) || []).forEach((callback) => { try { callback(key); } catch (_) {} });
  const installNativeObserver = () => {
    if (!backend || nativePatched) return;
    nativePatched = true;
    const originalSetItem = backend.setItem.bind(backend);
    const originalRemoveItem = backend.removeItem.bind(backend);
    backend.setItem = (key, value) => { originalSetItem(key, value); notify(key); };
    backend.removeItem = (key) => { originalRemoveItem(key); notify(key); };
  };
  const parse = (raw, fallback) => {
    if (raw == null || raw === '') return fallback;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  };
  const read = (key, fallback = null) => backend ? parse(backend.getItem(key), fallback) : fallback;
  const write = (key, value) => {
    if (!backend) return;
    try {
      installNativeObserver();
      backend.setItem(key, JSON.stringify(value));
    } catch (error) {
      if (isQuotaExceededError(error)) {
        const wrapped = new Error(`Unable to persist ${key}: quota exceeded`);
        wrapped.name = 'StorageQuotaExceededError';
        throw wrapped;
      }
      throw error;
    }
  };
  const remove = (key) => { if (backend) { installNativeObserver(); backend.removeItem(key); } };
  const observe = (key, callback) => {
    if (typeof callback !== 'function') return () => {};
    installNativeObserver();
    const callbacks = listeners.get(key) || [];
    callbacks.push(callback);
    listeners.set(key, callbacks);
    return () => listeners.set(key, (listeners.get(key) || []).filter((item) => item !== callback));
  };
  const readObject = (key, defaults = {}) => {
    const value = read(key, defaults);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : { ...defaults };
  };
  const readArray = (key, defaults = []) => {
    const value = read(key, defaults);
    return Array.isArray(value) ? value : [...defaults];
  };
  const saveVersioned = (key, value, version = DEFAULT_VERSION) => {
    const persisted = value && typeof value === 'object' && !Array.isArray(value) ? { ...value, _storageVersion: version } : value;
    write(key, persisted);
    return persisted;
  };
  const loadVersioned = (key, defaults, version = DEFAULT_VERSION) => {
    const value = read(key, defaults);
    const isObject = value && typeof value === 'object' && !Array.isArray(value);
    const storedVersion = isObject ? Number(value._storageVersion || 0) : version;
    return {
      value: isObject && defaults && typeof defaults === 'object' && !Array.isArray(defaults) ? { ...defaults, ...value, _storageVersion: version } : value,
      migrated: isObject && storedVersion !== version,
      version: storedVersion,
    };
  };

  installNativeObserver();
  window.HTSStorage = Object.freeze({ version: DEFAULT_VERSION, available: hasStorage, read, write, remove, observe, readObject, readArray, saveVersioned, loadVersioned });
})();
