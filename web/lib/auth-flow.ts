/** Popup-only sign-in: redirect requires hosting support this deployment lacks. */
export async function googleSignIn(popup: () => Promise<unknown>) {
  try {
    await popup();
    return { phase: "signing-in" as const, error: "" };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      return { phase: "idle" as const, error: "" };
    }
    return {
      phase: "error" as const,
      error: code === "auth/popup-blocked"
        ? "Please allow popups for this site, then try Google sign-in again."
        : "Google sign-in could not finish. Check your connection and try again in a regular browser window.",
    };
  }
}

export function readLink(hash: string, search: string) {
  const query = new URLSearchParams(search);
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("link_token") ?? query.get("link_token");
  const token = value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  return { token, invalid: Boolean(value && !token) || query.has("discord_id") };
}
