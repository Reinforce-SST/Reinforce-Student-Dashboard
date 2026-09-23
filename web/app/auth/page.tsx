import type { Metadata } from "next";
import AuthClient from "./AuthClient";
import styles from "./auth.module.css";

export const metadata: Metadata = {
  title: "Verify your account",
  description: "Sign in with your SST Google account to link Discord and access the member dashboard.",
  robots: { index: false, follow: false },
};

/**
 * IMPORTANT — this route is a deep-link target for the YUVI Discord bot.
 *
 * The bot builds `{FRONTEND_AUTH_URL}#link_token={one-time-token}` and sends it to members
 * as an ephemeral message. FRONTEND_AUTH_URL is an environment variable on
 * Render, in the bot's repository, and is not greppable from here.
 *
 * If this route is moved, renamed or gated, verification silently breaks for
 * every new member and nothing in this repository will error. Any change here
 * needs a coordinated change to the bot's environment. See AGENTS.md.
 */
export default function AuthPage() {
  return (
    <main className={styles.wrap}>
      <AuthClient />
    </main>
  );
}
