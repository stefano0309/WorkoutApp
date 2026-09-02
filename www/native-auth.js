(() => {
  'use strict';
  if (window.__HTS_NATIVE_AUTH_BOOT__) return;
  window.__HTS_NATIVE_AUTH_BOOT__ = true;

  const isNative = () => !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );
  if (!isNative()) return;

  const dispatch = (name, detail = {}) => {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  };

  const boot = async () => {
    try {
      const { FirebaseAuthentication } = window.Capacitor?.Plugins || {};
      if (!FirebaseAuthentication) {
        console.warn('[HTS Auth] FirebaseAuthentication plugin non disponibile.');
        dispatch('firebase-auth-error', { code: 'plugin-unavailable' });
        return;
      }

      const [{ getApps, getAuth, GoogleAuthProvider, signInWithCredential, signOut }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js'),
      ]);

      const getJsAuth = () => {
        const apps = getApps();
        return apps.length ? getAuth(apps[0]) : null;
      };

      const patch = () => {
        const fb = window.__fb;
        const auth = getJsAuth();
        if (!fb || !auth) return false;

        fb.signIn = async () => {
          dispatch('firebase-auth-started', { provider: 'google' });
          try {
            const result = await FirebaseAuthentication.signInWithGoogle({
              skipNativeAuth: true,
              useCredentialManager: true,
            });
            const idToken = result?.credential?.idToken;
            if (!idToken) throw new Error('google-credential-missing');

            const credential = GoogleAuthProvider.credential(
              idToken,
              result?.credential?.accessToken || undefined,
            );
            const signed = await signInWithCredential(auth, credential);
            dispatch('firebase-auth-success', {
              provider: 'google',
              uid: signed.user?.uid || null,
            });
            return signed.user;
          } catch (error) {
            console.error('[HTS Auth] Google Android sign-in failed', error);
            dispatch('firebase-auth-error', {
              code: error?.code || 'google-sign-in-failed',
              message: error?.message || String(error),
            });
            throw error;
          }
        };

        fb.signOutUser = async () => {
          try { await FirebaseAuthentication.signOut(); } catch (_) {}
          await signOut(auth);
          dispatch('firebase-auth-signed-out');
        };

        window.__HTS_NATIVE_AUTH_READY__ = true;
        dispatch('firebase-auth-ready', { provider: 'google', native: true });
        return true;
      };

      if (patch()) return;

      window.addEventListener('firebase-ready', patch, { once: true });
      const timer = setInterval(() => { if (patch()) clearInterval(timer); }, 100);
      setTimeout(() => clearInterval(timer), 15000);
    } catch (error) {
      console.error('[HTS Auth] bootstrap failed', error);
      dispatch('firebase-auth-error', {
        code: error?.code || 'native-auth-bootstrap-failed',
        message: error?.message || String(error),
      });
    }
  };

  boot();
})();
