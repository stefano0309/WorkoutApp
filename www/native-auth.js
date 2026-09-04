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

  const waitForFirebase = () => {
    if (window.__fb) return Promise.resolve(window.__fb);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (fn, value) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        clearTimeout(timeout);
        window.removeEventListener('firebase-ready', onReady);
        fn(value);
      };
      const onReady = () => window.__fb && finish(resolve, window.__fb);
      const timer = setInterval(onReady, 50);
      const timeout = setTimeout(() => finish(reject, new Error('firebase-api-timeout')), 15000);
      window.addEventListener('firebase-ready', onReady);
    });
  };

  const loadPlugin = async () => {
    if (pluginPromise) return pluginPromise;
    pluginPromise = (async () => {
      const existing = window.Capacitor?.Plugins?.FirebaseAuthentication;
      if (existing && typeof existing.signInWithGoogle === 'function') return existing;

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
      import('https://www.gstatic.com/firebase/12.18.0/firebase-app.js'),
      import('https://www.gstatic.com/firebase/12.18.0/firebase-auth.js'),
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

  const signIn = async () => {
    if (signInPromise) return signInPromise;
    signInPromise = (async () => {
      const [p, { auth, GoogleAuthProvider, signInWithCredential }] = await Promise.all([
        loadPlugin(),
        loadAuth(),
      ]);

      dispatch('firebase-auth-started', { provider: 'google', native: true });

      // The legacy Google sign-in implementation is more compatible with
      // older Samsung devices such as the Galaxy A20 than Credential Manager.
      const result = await p.signInWithGoogle({
        skipNativeAuth: true,
        useCredentialManager: false,
      });

      const idToken = result?.credential?.idToken;
      if (!idToken) throw new Error('google-id-token-missing');

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
      console.error('[HTS Auth] Google Android sign-in failed', error);
      dispatch('firebase-auth-error', {
        provider: 'google',
        native: true,
        code: error?.code || 'google-sign-in-failed',
        message: error?.message || String(error),
      });
      throw error;
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
  window.__HTS_NATIVE_AUTH_WAIT_FOR_FIREBASE__ = waitForFirebase;

  const boot = async () => {
    try {
      await loadPlugin();
      if (patch()) return;
      window.addEventListener('firebase-ready', patch);
      const timer = setInterval(() => {
        if (patch()) clearInterval(timer);
      }, 50);
      setTimeout(() => clearInterval(timer), 15000);
    } catch (error) {
      console.error('[HTS Auth] bootstrap failed', error);
      dispatch('firebase-auth-error', {
        provider: 'google',
        native: true,
        code: error?.code || 'native-auth-bootstrap-failed',
        message: error?.message || String(error),
      });
    }
  };

  boot();
})();
