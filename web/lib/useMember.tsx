"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, type StudentProfile, type ProfileUpdate, type TicketListResponse } from "./api";
import { useAuth } from "./useAuth";
import MemberLoading from "@/components/dashboard/MemberLoading";
import styles from "@/components/dashboard/MemberContent.module.css";

type MemberState = { token: string; profile: StudentProfile; save: (update: ProfileUpdate) => Promise<void> };
const MemberContext = createContext<MemberState | null>(null);

export function MemberProvider({ children }: { children: ReactNode }) {
  const { token, user, signOut } = useAuth();
  const identity = user?.uid;
  const [state, setState] = useState<{ identity: string; profile?: StudentProfile; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [signOutError, setSignOutError] = useState("");
  useEffect(() => {
    if (!token || !identity) return;
    let active = true;
    api.me(token).then(profile => {
      if (active) setState({ identity, profile });
    }).catch(() => {
      if (active) setState(current => ({ ...(current?.identity === identity ? current : {}), identity, error: "Your profile could not be refreshed. Please try again." }));
    });
    return () => { active = false; };
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
    async save(update) {
      const result = await api.updateProfile(token, update);
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

export function useTickets() {
  const { token, profile } = useMember();
  const [state, setState] = useState<{ token: string; data?: TicketListResponse; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api.myTickets(token).then(tickets => {
      if (active) setState({ token, data: { linked: Boolean(profile.is_verified && profile.discord_id) || tickets.length > 0, tickets } });
    })
      .catch(() => { if (active) setState({ token, error: "Tickets could not be loaded. Try again in a moment." }); });
    return () => { active = false; };
  }, [token, profile.is_verified, profile.discord_id, attempt]);
  return { data: state?.token === token ? state.data : undefined, error: state?.token === token ? state.error : undefined,
    retry: () => { setState(null); setAttempt(value => value + 1); } };
}
