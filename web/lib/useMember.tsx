"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type StudentProfile, type ProfileUpdate, type TicketListResponse } from "./api";
import { useAuth } from "./useAuth";

type MemberState = { token: string; profile: StudentProfile; save: (update: ProfileUpdate) => Promise<void> };
const MemberContext = createContext<MemberState | null>(null);

export function MemberProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const identity = user?.uid;
  const [state, setState] = useState<{ identity: string; profile?: StudentProfile; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token || !identity) return;
    let active = true;
    api.me(token).then(result => {
      if (active) setState({ identity, profile: result.user });
    }).catch(() => {
      if (active) setState(current => ({ ...(current?.identity === identity ? current : {}), identity, error: "Your profile could not be refreshed. Please try again." }));
    });
    return () => { active = false; };
  }, [token, identity, attempt]);

  if (!token || !identity || state?.identity !== identity) return <p role="status">Loading your member record…</p>;
  if (!state.profile) return <div role="alert"><p>{state.error}</p><button onClick={() => { setState(null); setAttempt(value => value + 1); }}>Retry</button></div>;
  const value: MemberState = {
    token,
    profile: state.profile,
    async save(update) {
      const result = await api.updateProfile(token, update);
      setState(current => current?.identity === identity ? { identity, profile: result.user } : current);
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
  const { token } = useMember();
  const [state, setState] = useState<{ token: string; data?: TicketListResponse; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api.myTickets(token).then(data => { if (active) setState({ token, data }); })
      .catch(() => { if (active) setState({ token, error: "Tickets could not be loaded. Try again in a moment." }); });
    return () => { active = false; };
  }, [token, attempt]);
  return { data: state?.token === token ? state.data : undefined, error: state?.token === token ? state.error : undefined,
    retry: () => { setState(null); setAttempt(value => value + 1); } };
}
