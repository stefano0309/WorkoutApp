(() => {
  'use strict';

  if (window.HTSStorage) return;

  const DEFAULT_VERSION = 2;
  const hasStorage = typeof window !== 'undefined' && !!window.localStorage;

  const backend = hasStorage ? window.localStorage : null;

  const isQuotaExceededError = (error) => {
    if (!(error instanceof DOMException)) return false;
    return error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014;
  };

  const parse = (raw, fallback) => {
    if (raw == null || raw === '') return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  };

  const read = (key, fallback = null) => {
    if (!backend) return fallback;
    return parse(backend.getItem(key), fallback);
  };

  const write = (key, value) => {
    if (!backend) return;
    try {
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

  const remove = (key) => {
    if (!backend) return;
    backend.removeItem(key);
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
    const persisted = value && typeof value === 'object' && !Array.isArray(value)
      ? { ...value, _storageVersion: version }
      : value;
    write(key, persisted);
    return persisted;
  };

  const loadVersioned = (key, defaults, version = DEFAULT_VERSION) => {
    const value = read(key, defaults);
    const isObject = value && typeof value === 'object' && !Array.isArray(value);
    const storedVersion = isObject ? Number(value._storageVersion || 0) : version;
    return {
      value: isObject && defaults && typeof defaults === 'object' && !Array.isArray(defaults)
        ? { ...defaults, ...value, _storageVersion: version }
        : value,
      migrated: isObject && storedVersion !== version,
      version: storedVersion,
    };
  };

  window.HTSStorage = Object.freeze({
    version: DEFAULT_VERSION,
    available: hasStorage,
    read,
    write,
    remove,
    readObject,
    readArray,
    saveVersioned,
    loadVersioned,
  });
})();
