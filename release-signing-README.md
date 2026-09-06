# Android release signing — WorkoutApp v1.1

This file documents the required GitHub Actions secrets without containing any private signing material.

Required repository secrets:

- `ANDROID_KEYSTORE_BASE64` — Base64-encoded release `.jks` keystore.
- `ANDROID_KEYSTORE_PASSWORD` — keystore password.
- `ANDROID_KEY_ALIAS` — release key alias.
- `ANDROID_KEY_PASSWORD` — release key password.

Optional:

- `GOOGLE_SERVICES_JSON_BASE64` — Base64-encoded Firebase `google-services.json` if Firebase/Google services are required by the build.

The release workflow restores the keystore into the GitHub runner temporary directory and uses these values only during the release build. Never commit the `.jks`, passwords, or `google-services.json` to the repository.

## Generate a new release keystore

Run locally with a JDK installed:

```bash
keytool -genkeypair -v -keystore workoutapp-release.jks -alias workoutapp -keyalg RSA -keysize 4096 -validity 10000
```

Encode it for the GitHub secret:

```bash
base64 -w 0 workoutapp-release.jks > workoutapp-release.jks.base64
```

On macOS:

```bash
base64 workoutapp-release.jks | tr -d '\\n' > workoutapp-release.jks.base64
```

Copy the resulting single-line value into `ANDROID_KEYSTORE_BASE64`.
