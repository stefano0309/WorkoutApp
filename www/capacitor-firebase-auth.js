// Registers the native Firebase Authentication Capacitor plugin for the
// no-bundler HTML app. The generated native project provides the Android
// implementation; this module only creates the JavaScript proxy.
import { registerPlugin } from "https://cdn.jsdelivr.net/npm/@capacitor/core@8.5.0/+esm";

export const FirebaseAuthentication = registerPlugin("FirebaseAuthentication");
