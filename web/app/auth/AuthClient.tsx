"use client";

import { signInWithPopup } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import Pill from "@/components/Pill";
import { api, ApiError } from "@/lib/api";
import { getFirebaseAuth, googleProvider, SST_DOMAIN } from "@/lib/firebase";
import { googleSignIn, readLink } from "@/lib/auth-flow";
import { useAuth } from "@/lib/useAuth";
import styles from "./auth.module.css";

type Phase = "idle" | "signing-in" | "linking" | "linked" | "error";

export default function AuthClient() {
  const { user, token, loading, configured, degraded, signOut } = useAuth();
  const [link, setLink] = useState<{ token: string | null; invalid: boolean } | null>(null);
  const capturedLink = useRef<ReturnType<typeof readLink> | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [botIssue, setBotIssue] = useState("");
  const [roleGranted, setRoleGranted] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Preserve the first fragment across Strict Mode's effect replay. Erasing
    // it from browser history must not erase the in-memory proof on replay.
    function capture(force = false) {
      if (force || !capturedLink.current) {
        capturedLink.current = readLink(window.location.hash, window.location.search);
      }
      const parsed = capturedLink.current;
      queueMicrotask(() => setLink(parsed));
      if (parsed.token) window.history.replaceState(null, "", window.location.pathname);
    }
    capture();
    const onHashChange = () => capture(true);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const signIn = useCallback(async () => {
    setPhase("signing-in");
    setError("");
    const result = await googleSignIn(() => signInWithPopup(getFirebaseAuth(), googleProvider()));
    if (result.phase !== "signing-in") {
      setPhase(result.phase);
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    if (!token || !link) return;
    let cancelled = false;
    async function sync() {
      setPhase("linking");
      setError("");
      setBotIssue("");
      setRoleGranted("");
      try {
        // Linking also creates the member record atomically. Avoid an unrelated
        // sync write racing with the linking transaction.
        if (link?.token) {
          const result = await api.verifyDiscord(token!, link.token);
          if (cancelled) return;
          if (result.bot_response?.status) {
            setBotIssue(result.bot_response.detail ?? "Your Discord role is pending. Run /auth again to retry.");
          } else {
            setRoleGranted(result.role_granted ?? "");
          }
        } else {
          await api.syncUser(token!);
        }
        if (!cancelled) setPhase("linked");
      } catch (err) {
        if (!cancelled) {
          setPhase("error");
          setError(err instanceof ApiError ? err.message : "Could not reach the club server. Try again.");
        }
      }
    }
    void sync();
    // Strict Mode can repeat this request. One-time consumption is idempotent
    // for the same authenticated member, and each effect owns its completion.
    return () => { cancelled = true; };
  }, [token, link, attempt]);

  if (!configured) return <section className={styles.card}><h1 className={`display ${styles.title}`}>Sign-in unavailable</h1><p className={styles.body}>Member sign-in has not been configured for this deployment. Please contact a club admin.</p></section>;
  if (loading || !link) return <section className={styles.card} aria-busy="true"><p className={styles.body}>Checking your session…</p></section>;

  const busy = phase === "signing-in" || phase === "linking";
  return <section className={styles.card}>
    <p className={`mono ${styles.kick}`}>{phase === "linked" ? "Account ready" : link.token ? "Discord verification" : "Member sign-in"}</p>
    <h1 className={`display ${styles.title}`}>{phase === "linked" ? <>You&rsquo;re <em>in.</em></> : link.token ? <>Link your <em>Discord.</em></> : <>Sign in to <em>Reinforce.</em></>}</h1>
    <p className={styles.body}>{user ? user.email : <>Use your college Google account (<strong>@{SST_DOMAIN}</strong>).</>}</p>
    {link.invalid && <p className={styles.warn}>This Discord link is no longer valid. Run <code>/auth</code> in Discord for a new private link. You can still sign in to your dashboard.</p>}
    {degraded && <p className={styles.warn}>We couldn&rsquo;t reach Google sign-in. Check your connection and try again.</p>}
    {phase === "linked" && link.token && <p className={styles.body}>Discord linked{roleGranted ? ` · ${roleGranted}` : ""}.</p>}
    {botIssue && <p className={styles.warn}>{botIssue}</p>}
    {phase === "error" && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      {phase === "linked" ? <Pill href="/dashboard" variant="filled">Go to your dashboard</Pill> : user ? <Pill variant="filled" disabled={busy} onClick={() => setAttempt(value => value + 1)}>{busy ? "Connecting your account…" : "Retry connection"}</Pill> : <Pill variant="filled" disabled={busy} onClick={signIn}>{busy ? "Signing in…" : "Sign in with Google"}</Pill>}
      {user && !busy && <Pill onClick={async () => { await signOut(); setPhase("idle"); setError(""); }}>Use another account</Pill>}
    </div>
    {!user && <p className={styles.body}>Google opens in a popup. If it is blocked, allow popups for this site and try again.</p>}
  </section>;
}
