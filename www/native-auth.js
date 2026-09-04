(() => {
  'use strict';
  if (window.__HTS_NATIVE_AUTH_BOOT__) return;
  window.__HTS_NATIVE_AUTH_BOOT__ = true;

  const isNative = () => Boolean(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform()
  );
  if (!isNative()) return;

  const dispatch = (name, detail = {}) => {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  };

  let authApi = null;
  let pluginPromise = null;
  let signInPromise = null;

  const loadPlugin = async () => {
    if (pluginPromise) return pluginPromise;
    pluginPromise = (async () => {
      // Capacitor normally exposes registered native plugins here. Prefer this
      // instance so the proxy is guaranteed to use the app's native bridge.
      const globalPlugin = window.Capacitor?.Plugins?.FirebaseAuthentication;
      if (globalPlugin && typeof globalPlugin.signInWithGoogle === 'function') return globalPlugin;

      // Fallback for the no-bundler web shell: register the official proxy
      // against the same Capacitor runtime exposed by the app.
      const module = await import('./capacitor-firebase-auth.js');
      const plugin = module.FirebaseAuthentication;
      if (!plugin || typeof plugin.signInWithGoogle !== 'function') {
        throw new Error('firebase-authentication-plugin-unavailable');
      }
      return plugin;
    })();
    try {
      return await pluginPromise;
    } catch (error) {
      pluginPromise = null;
      throw error;
    }
  };

  const loadAuth = async () => {
    if (authApi) return authApi;
    const [{ getApps }, authModule] = await Promise.all([
      import('./firebase-runtime.bundle.js'),
      import('./firebase-runtime.bundle.js'),
    ]);
    const { getAuth, GoogleAuthProvider, signInWithCredential, signOut } = authModule;
    const apps = getApps();
    if (!apps.length) throw new Error('firebase-app-not-initialized');
    authApi = {
      auth: getAuth(apps[0]),
      GoogleAuthProvider,
      signInWithCredential,
      signOut,
    };
    return authApi;
  };

  const normalizeError = (error) => {
    const code = error?.code || 'google-sign-in-failed';
    const message = error?.message || String(error);
    return { code, message };
  };

  const signIn = async () => {
    if (signInPromise) return signInPromise;
    signInPromise = (async () => {
      dispatch('firebase-auth-started', { provider: 'google', native: true });
      const [p, { auth, GoogleAuthProvider, signInWithCredential }] = await Promise.all([
        loadPlugin(),
        loadAuth(),
      ]);

      const result = await p.signInWithGoogle({
        skipNativeAuth: true,
        useCredentialManager: false,
      });

      const idToken = result?.credential?.idToken;
      if (!idToken) {
        const nativeUser = result?.user;
        if (nativeUser?.uid && !result?.credential) {
          throw Object.assign(new Error('google-id-token-missing'), {
            code: 'google-id-token-missing',
          });
        }
        throw Object.assign(new Error('google-id-token-missing'), {
          code: 'google-id-token-missing',
        });
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const firebaseResult = await signInWithCredential(auth, credential);
      const user = firebaseResult?.user;
      if (!user?.uid) throw new Error('firebase-user-missing');

      dispatch('firebase-auth-success', {
        provider: 'google',
        native: true,
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
      });
      return user;
    })();

    try {
      return await signInPromise;
    } catch (error) {
      const normalized = normalizeError(error);
      console.error('[HTS Auth] Google Android sign-in failed', error);
      dispatch('firebase-auth-error', {
        provider: 'google',
        native: true,
        code: normalized.code,
        message: normalized.message,
      });
      throw Object.assign(new Error(normalized.message), { code: normalized.code });
    } finally {
      signInPromise = null;
    }
  };

  const signOutUser = async () => {
    const p = await loadPlugin();
    const { auth, signOut: firebaseSignOut } = await loadAuth();
    try {
      if (p && typeof p.signOut === 'function') await p.signOut();
    } finally {
      await firebaseSignOut(auth);
    }
    dispatch('firebase-auth-signed-out', { native: true });
  };

  const patch = () => {
    const fb = window.__fb;
    if (!fb) return false;
    fb.signIn = signIn;
    fb.signOutUser = signOutUser;
    fb.__nativeGoogleAuthManaged = true;
    window.__HTS_NATIVE_AUTH_READY__ = true;
    dispatch('firebase-auth-ready', { provider: 'google', native: true });
    return true;
  };

  window.__HTS_NATIVE_GOOGLE_SIGN_IN__ = signIn;
  window.__HTS_NATIVE_GOOGLE_SIGN_OUT__ = signOutUser;

  const boot = async () => {
    try {
      await loadPlugin();
      if (patch()) return;
      const timer = setInterval(() => {
        if (patch()) clearInterval(timer);
      }, 25);
      window.addEventListener('firebase-ready', patch);
      setTimeout(() => clearInterval(timer), 20000);
    } catch (error) {
      const normalized = normalizeError(error);
      console.error('[HTS Auth] bootstrap failed', error);
      dispatch('firebase-auth-error', {
        provider: 'google',
        native: true,
        code: normalized.code,
        message: normalized.message,
      });
    }
  };

  // Start immediately; this script is injected by the Android host before
  // the other native integrations so the login method gets patched early.
  boot();
})();
