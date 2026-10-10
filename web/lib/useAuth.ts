"use client";

import {
  onIdTokenChanged,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { getFirebaseAuth, isFirebaseConfigured } from "./firebase";

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
const AUTH_TIMEOUT_MS = 6000;

/**
 * Subscribes to Firebase auth state and keeps a fresh ID token.
 *
 * `loading` starts true and goes false as soon as Firebase reports a session,
 * reports no session, errors, or fails to answer within AUTH_TIMEOUT_MS.
 * Rendering a signed-out state before that resolves is what makes the sign-in
 * page flash for already-authenticated members on every navigation; never
 * resolving at all is worse.
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
    let settled = false;
    let revision = 0;

    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      setState({ user: null, token: null, loading: false, configured: true, degraded: true });
    }, AUTH_TIMEOUT_MS);

    const settle = (next: Partial<AuthState>) => {
      if (cancelled) return;
      settled = true;
      clearTimeout(watchdog);
      setState((prev) => ({ ...prev, loading: false, degraded: false, ...next }));
    };

    const publish = async (user: User | null) => {
      const currentRevision = ++revision;
      if (!user) {
        settle({ user: null, token: null });
        return;
      }
      try {
        const token = await user.getIdToken();
        if (currentRevision === revision) settle({ user, token });
      } catch {
        // Signed in but the token could not be minted — treat as signed out
        // rather than leaving the caller with a user and no credential.
        if (currentRevision === revision) settle({ user: null, token: null, degraded: true });
      }
    };

    try {
      unsubscribe = onIdTokenChanged(getFirebaseAuth(), publish, () =>
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
    await fbSignOut(getFirebaseAuth());
  }, []);

  return { ...state, signOut };
}
