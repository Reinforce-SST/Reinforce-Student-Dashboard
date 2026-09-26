"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import MemberLoading from "./MemberLoading";
import styles from "./DashboardShell.module.css";

/**
 * Gate for every route rendered inside the dashboard shell.
 *
 * Fails closed: anything other than a confirmed signed-in user sends the
 * visitor to /auth. That covers a missing session, a Firebase project that is
 * not configured, and the degraded case where Firebase never answered — in the
 * last one we cannot tell a member from a stranger, so we must not guess.
 *
 * Children are not rendered while the answer is unknown. Rendering them first
 * and hiding them later would still ship the data to the browser.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const allowed = Boolean(user);

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace("/auth");
    }
  }, [loading, allowed, router]);

  if (loading) {
    return <MemberLoading message="Checking your session…" />;
  }

  if (!allowed) {
    return (
      <div className={styles.authGate}>
        <p>
          You need to be signed in to view this. Taking you to{" "}
          <a href="/auth">sign in</a>.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
