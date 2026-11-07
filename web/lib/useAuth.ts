"use client";

import {
  onIdTokenChanged,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { getFirebaseAuth, isFirebaseConfigured } from "./firebase";

import { appCache } from "./cache";

export type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  configured: boolean;
  /** True when Firebase never answered and we gave up waiting. */
  degraded: boolean;
};

/**
 * How long to wait for Firebase to report auth state before giving up and
 * rendering the signed-out view. Without this the page can sit on a blank
 * loading card indefinitely when Firebase is unreachable — which, on campus
 * wifi, is not a hypothetical.
 */
const AUTH_TIMEOUT_MS = 15000;

/**
 * Subscribes to Firebase auth state and keeps a fresh ID token.
 *
 * `loading` starts true and goes false as soon as Firebase reports a session,
 * reports no session, errors, or fails to answer within AUTH_TIMEOUT_MS.
 * Rendering a signed-out state before that resolves is what makes the sign-in
 * page flash for already-authenticated members on every navigation; never
 * resolving at all is worse.
 *
 * Key invariant: we never settle as unauthenticated until authStateReady()
 * has resolved, because Firebase's onIdTokenChanged fires immediately with
 * null before it has read the persisted session from IndexedDB. Only after
 * authStateReady() can a null user be trusted.
 */
export function useAuth(): AuthState & { signOut: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: isFirebaseConfigured,
    configured: isFirebaseConfigured,
    degraded: false,
  });

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    let revision = 0;

    const auth = getFirebaseAuth();

    const watchdog = setTimeout(() => {
      if (cancelled) return;
      setState({ user: null, token: null, loading: false, configured: true, degraded: true });
    }, AUTH_TIMEOUT_MS);

    const settle = (next: Partial<AuthState>) => {
      if (cancelled) return;
      clearTimeout(watchdog);
      setState((prev) => ({ ...prev, loading: false, degraded: false, ...next }));
    };

    const publish = async (user: User | null) => {
      const currentRevision = ++revision;

      if (!user) {
        // Firebase fires onIdTokenChanged(null) immediately on page load, before
        // it has read the persisted session from IndexedDB. We must not settle as
        // unauthenticated until authStateReady() resolves — only then can we trust
        // that null truly means "no session".
        try {
          await auth.authStateReady();
        } catch {
          if (cancelled || currentRevision !== revision) return;
          settle({ user: null, token: null, degraded: true });
          return;
        }
        if (cancelled || currentRevision !== revision) return;
        // After persistence has resolved, re-check. If a user was restored from
        // IndexedDB, onIdTokenChanged will have fired again with the real user and
        // that call's publish() will win via the revision counter. If currentUser
        // is still null, allow a short grace window for any pending onIdTokenChanged
        // dispatch before settling as unauthenticated.
        if (!auth.currentUser) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          if (cancelled || currentRevision !== revision) return;
          if (!auth.currentUser) {
            settle({ user: null, token: null });
          }
        }
        return;
      }

      try {
        const token = await user.getIdToken();
        if (cancelled || currentRevision !== revision) return;
        settle({ user, token });
      } catch {
        // Signed in but the token could not be minted — treat as signed out
        // rather than leaving the caller with a user and no credential.
        if (cancelled || currentRevision !== revision) return;
        settle({ user: null, token: null, degraded: true });
      }
    };

    try {
      unsubscribe = onIdTokenChanged(auth, publish, () =>
        settle({ user: null, token: null, degraded: true }),
      );
    } catch {
      settle({ user: null, token: null, degraded: true });
    }

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      unsubscribe?.();
    };
  }, []);

  const signOut = useCallback(async () => {
    if (!isFirebaseConfigured) return;
    try {
      appCache.clear();
    } catch {
      // Ignore cache clearing errors
    }
    await fbSignOut(getFirebaseAuth());
  }, []);

  return { ...state, signOut };
}
