import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

/**
 * Firebase client. Values are NEXT_PUBLIC_* because the browser needs them —
 * these are publishable config, not secrets. The service account key is
 * server-side only and lives nowhere near this file.
 */
const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True when the deployment has been given its Firebase config. */
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

export const SST_DOMAIN = "sst.scaler.com";

export function getFirebaseAuth(): Auth {
  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase is not configured. Copy .env.example to .env.local and fill in NEXT_PUBLIC_FIREBASE_*.",
    );
  }
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    // Pre-selects the school domain in the Google chooser. This is a hint to
    // the user, NOT a security control — the domain is enforced server-side in
    // app/api/security.py, which is the only check that counts.
    hd: SST_DOMAIN,
    prompt: "select_account",
  });
  return provider;
}
