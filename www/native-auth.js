(() => {
  'use strict';
  if (window.__HTS_NATIVE_AUTH_BOOT__) return;
  window.__HTS_NATIVE_AUTH_BOOT__ = true;

  const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isNative()) return;

  const boot = async () => {
    try {
      const { FirebaseAuthentication } = window.Capacitor?.Plugins || {};
      if (!FirebaseAuthentication) {
        console.warn('[HTS Auth] FirebaseAuthentication plugin non disponibile.');
        return;
      }

      const [{ getAuth, GoogleAuthProvider, signInWithCredential, signOut }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js'),
      ]);

      const patch = () => {
        const fb = window.__fb;
        if (!fb) return false;
        const auth = getAuth();

        fb.signIn = async () => {
          const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
          const idToken = result?.credential?.idToken;
          if (!idToken) throw new Error('google-credential-missing');
          const credential = GoogleAuthProvider.credential(idToken, result?.credential?.accessToken || undefined);
          const signed = await signInWithCredential(auth, credential);
          return signed.user;
        };

        fb.signOutUser = async () => {
          try { await FirebaseAuthentication.signOut(); } catch (_) {}
          return signOut(auth);
        };
        return true;
      };

      if (!patch()) {
        window.addEventListener('firebase-ready', patch, { once: true });
        const timer = setInterval(() => { if (patch()) clearInterval(timer); }, 100);
        setTimeout(() => clearInterval(timer), 15000);
      }
    } catch (e) {
      console.error('[HTS Auth] bootstrap failed', e);
    }
  };

  boot();
})();
