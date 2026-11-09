"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, type StudentProfile, type ProfileUpdate } from "./api";
import { useAuth } from "./useAuth";
import { appCache } from "./cache";
import MemberLoading from "@/components/dashboard/MemberLoading";
import styles from "@/components/dashboard/MemberContent.module.css";

type MemberState = {
  token: string;
  profile: StudentProfile;
  save: (update: ProfileUpdate) => Promise<void>;
  signOut: () => Promise<void>;
};
const MemberContext = createContext<MemberState | null>(null);

export function MemberProvider({ children }: { children: ReactNode }) {
  const { token, user, signOut } = useAuth();
  const identity = user?.uid;
  const [state, setState] = useState<{ identity: string; profile?: StudentProfile; error?: string } | null>(() => {
    if (!token || !identity) return null;
    const cached = appCache.get<StudentProfile>(`member:me:${identity}`);
    return cached ? { identity, profile: cached.data } : null;
  });
  const [attempt, setAttempt] = useState(0);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    if (!token || !identity) return;
    let active = true;
    const cacheKey = `member:me:${identity}`;

    appCache
      .fetch(cacheKey, () => api.me(token), {
        ttl: 5 * 60 * 1000,
        tags: ["profile"],
        userScope: identity,
        force: attempt > 0,
      })
      .then((profile) => {
        if (active) setState({ identity, profile });
      })
      .catch(() => {
        if (active) {
          setState((current) => ({
            ...(current?.identity === identity ? current : {}),
            identity,
            error: "Your profile could not be refreshed. Please try again.",
          }));
        }
      });

    return () => {
      active = false;
    };
  }, [token, identity, attempt]);

  if (!token || !identity || state?.identity !== identity) return <MemberLoading message="Opening your dashboard…" />;
  if (!state.profile) return <main className={`${styles.page} ${styles.recovery}`}><section className={styles.card}>
    <h1 className={styles.title}>Your profile is unavailable</h1>
    <p role="alert" className={styles.muted}>{state.error}</p>
    <p className={styles.muted}>Try again, or sign out to use another college account.</p>
    <div className={styles.actions}>
      <button className={styles.button} onClick={() => { setState(null); setAttempt(value => value + 1); }}>Retry</button>
      <button className={`${styles.button} ${styles.secondary}`} onClick={async () => { try { await signOut(); } catch { setSignOutError("Could not sign out. Please try again."); } }}>Sign out</button>
      <Link className={`${styles.button} ${styles.secondary}`} href="/">Reinforce home</Link>
    </div>
    {signOutError && <p role="alert">{signOutError}</p>}
  </section></main>;
  const value: MemberState = {
    token,
    profile: state.profile,
    signOut,
    async save(update) {
      const result = await api.updateProfile(token, update);
      appCache.set(`member:me:${identity}`, result, { tags: ["profile"], userScope: identity });
      appCache.invalidateTags(["profile", "users", "leaderboard"]);
      setState(current => current?.identity === identity ? { identity, profile: result } : current);
    },
  };
  return <MemberContext.Provider value={value}>{state.error && <div role="alert"><p>{state.error}</p><button onClick={() => setAttempt(value => value + 1)}>Retry profile refresh</button></div>}{children}</MemberContext.Provider>;
}

export function useMember() {
  const value = useContext(MemberContext);
  if (!value) throw new Error("MemberProvider is required");
  return value;
}
