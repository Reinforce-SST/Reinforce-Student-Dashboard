"use client";

import { signInWithPopup, signInWithRedirect } from "firebase/auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Pill from "@/components/Pill";
import { api, ApiError } from "@/lib/api";
import { getFirebaseAuth, googleProvider, isFirebaseConfigured, SST_DOMAIN } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";
import styles from "./auth.module.css";

type Phase = "idle" | "signing-in" | "linking" | "linked" | "error";

export default function AuthClient() {
  const params = useSearchParams();
  const { user, token, loading, configured, degraded } = useAuth();

  // Only a numeric snowflake is ever accepted from the query string, so a
  // crafted link cannot push arbitrary text into the request body.
  const raw = params.get("discord_id");
  const discordId = raw && /^\d{5,25}$/.test(raw) ? raw : null;
  const malformed = Boolean(raw) && !discordId;

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>("");
  const [roleGranted, setRoleGranted] = useState<string>("");
  const [botIssue, setBotIssue] = useState<string>("");

  const signIn = useCallback(async () => {
    setError("");
    setPhase("signing-in");

    const auth = getFirebaseAuth();
    const openedAt = Date.now();

    try {
      await signInWithPopup(auth, googleProvider());
      // The rest is driven by useAuth's state change, then the effect below.
      return;
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      const message = (err as { message?: string })?.message ?? "";

      // Firefox, Safari, Brave, Opera and Zen block auth popups far more
      // aggressively than Chrome, and storage partitioning breaks the popup
      // flow outright in some of them. Fall back to a full-page redirect.
      //
      // popup-closed-by-user is ambiguous: it fires both when the browser
      // kills the popup instantly and when someone deliberately closes it.
      // A popup that dies in under 1.5s was blocked, not closed — redirecting
      // on a genuine cancel would be baffling.
      const dismissedFast = Date.now() - openedAt < 1500;
      const shouldRedirect =
        code === "auth/popup-blocked" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/operation-not-supported-in-this-environment" ||
        code === "auth/internal-error" ||
        (code === "auth/popup-closed-by-user" && dismissedFast) ||
        /popup|cross-origin/i.test(message);

      if (shouldRedirect) {
        try {
          await signInWithRedirect(auth, googleProvider());
          return; // page navigates away
        } catch (redirectErr) {
          setPhase("error");
          setError(
            redirectErr instanceof Error
              ? redirectErr.message
              : "Could not start Google sign-in.",
          );
          return;
        }
      }

      if (code === "auth/popup-closed-by-user") {
        setPhase("idle"); // deliberate cancel
        return;
      }

      setPhase("error");
      setError(err instanceof Error ? err.message : "Sign-in failed. Try again.");
    }
  }, []);

  // Once signed in, register the member and link Discord if the bot sent an id.
  //
  // `phase` must NOT be a dependency here. It used to be, and setPhase("linking")
  // inside the effect then changed it, which fired this effect's own cleanup,
  // set cancelled = true, and left every completion path short-circuited — the
  // request succeeded server-side but the button sat on "Linking..." forever.
  // A ref guards against running twice instead.
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const runKey = `${token}:${discordId ?? ""}`;
    if (startedFor.current === runKey) return;
    startedFor.current = runKey;

    let cancelled = false;
    (async () => {
      try {
        setPhase("linking");
        await api.syncUser(token);

        if (discordId) {
          const res = await api.verifyDiscord(token, discordId);
          if (cancelled) return;

          // The API answers 200 even when the bot could not grant the role —
          // member not in the server, bot offline, missing permissions. Report
          // what actually happened rather than claiming a role was granted.
          const botStatus = res.bot_response?.status;
          if (botStatus === "bot_warning" || botStatus === "bot_unreachable") {
            setBotIssue(res.bot_response?.detail ?? "the bot service could not be reached");
            setRoleGranted("");
          } else {
            setRoleGranted(res.role_granted ?? "Verified Member");
          }
        }
        if (!cancelled) setPhase("linked");
      } catch (err) {
        if (cancelled) return;
        startedFor.current = null; // allow a retry
        setPhase("error");
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not reach the club server. Try again in a moment.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, discordId]);

  /* ------------------------------------------------------------- states */

  if (!configured) {
    return (
      <section className={styles.card}>
        <h1 className={`display ${styles.title}`}>Not configured</h1>
        <p className={styles.body}>
          This deployment has no Firebase configuration. Copy <code>.env.example</code> to{" "}
          <code>.env.local</code> and fill in the <code>NEXT_PUBLIC_FIREBASE_*</code> values — a
          core member can give you them.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className={styles.card} aria-busy="true">
        <p className={`mono ${styles.kick}`}>Checking your session</p>
        <p className={styles.body}>One moment.</p>
      </section>
    );
  }

  if (phase === "linked") {
    return (
      <section className={styles.card}>
        <p className={`mono ${styles.kick}`}>Verified</p>
        <h1 className={`display ${styles.title}`}>
          You&rsquo;re <em>in.</em>
        </h1>
        <dl className={styles.facts}>
          <div>
            <dt className="mono">Account</dt>
            <dd>{user?.email}</dd>
          </div>
          {discordId ? (
            <>
              <div>
                <dt className="mono">Discord</dt>
                <dd>{botIssue ? "Saved, role pending" : "Linked"}</dd>
              </div>
              {roleGranted ? (
                <div>
                  <dt className="mono">Role</dt>
                  <dd>{roleGranted}</dd>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>

        {botIssue ? (
          <p className={styles.warn}>
            Your account is saved, but the Discord role was not granted: {botIssue}. If you
            are not in the club server yet, join it and run <code>/auth</code> again. If you
            already are, the bot service is down rather than your account, so tell a core
            member rather than re-linking.
          </p>
        ) : null}
        <div className={styles.actions}>
          <Pill href="/dashboard" variant="filled">Go to your dashboard</Pill>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <p className={`mono ${styles.kick}`}>
        {discordId ? "Discord verification" : "Member sign-in"}
      </p>

      <h1 className={`display ${styles.title}`}>
        {discordId ? (
          <>
            Link your <em>Discord.</em>
          </>
        ) : (
          <>
            Sign in to <em>Reinforce.</em>
          </>
        )}
      </h1>

      <p className={styles.body}>
        Use your college Google account (<strong>@{SST_DOMAIN}</strong>).
        {discordId
          ? " We'll connect it to the Discord account that sent you here and grant your member role."
          : " Members only — the club record is tied to your SST identity."}
      </p>

      {discordId ? (
        <p className={`mono ${styles.snowflake}`}>Discord ID · {discordId}</p>
      ) : null}

      {malformed ? (
        <p className={styles.warn}>
          The link you followed carried an invalid Discord ID, so it has been ignored. Signing in
          still works — run <code>/auth</code> in Discord again to link your account.
        </p>
      ) : null}

      {degraded ? (
        <p className={styles.warn}>
          We couldn&rsquo;t reach the sign-in service. Check your connection and try again — if it
          keeps failing, tell a core member.
        </p>
      ) : null}

      {phase === "error" ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : null}

      <div className={styles.actions}>
        <Pill
          variant="filled"
          onClick={signIn}
          disabled={phase === "signing-in" || phase === "linking" || !isFirebaseConfigured}
        >
          {phase === "signing-in"
            ? "Opening Google…"
            : phase === "linking"
              ? "Linking…"
              : "Continue with Google"}
        </Pill>
      </div>

      <p className={styles.fine}>
        We store your name, your college email and the links you choose to add. Nothing is ever
        posted on your behalf.
      </p>

      <Link className={styles.back} href="/">&larr; Back to the site</Link>
    </section>
  );
}
