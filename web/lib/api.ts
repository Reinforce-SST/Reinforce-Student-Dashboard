/**
 * Client for the Reinforce API.
 *
 * Every call is authenticated with the caller's Firebase ID token. The browser
 * never talks to Firestore directly — the Admin SDK is server-side only.
 */

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

/** Nothing should hang the UI forever. Render cold starts are slow but finite. */
const TIMEOUT_MS = 20_000;

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("The club server took too long to respond. Try again.", 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // Non-JSON error body. Keep the status-based message.
    }
    throw new ApiError(detail, res.status);
  }

  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ types */
/* These mirror server/app/schemas/. See docs/DATA_CONTRACT.md. */

export type SocialLinks = {
  github?: string | null;
  kaggle?: string | null;
  discord?: string | null;
  linkedin?: string | null;
};

export type StudentProfile = {
  email: string;
  full_name: string;
  avatar_url?: string | null;
  discord_id?: string | null;
  is_verified: boolean;
  discord_link_version?: number | null;
  verified_at?: string | null;
  skills: string[];
  social_links: SocialLinks;
};

/**
 * The API answers 200 even when the bot could not grant the role — the member
 * is not in the Discord server, the bot is offline, or it lacks permission.
 * `bot_response.status` is how you tell a real success from a partial one.
 */
export type VerifyDiscordResponse = {
  success: boolean;
  role_granted?: string;
  user: StudentProfile;
  bot_response?: {
    status?: "bot_warning" | "bot_unreachable" | string;
    /** Set when the bot service answered with an HTTP error. */
    status_code?: number;
    detail?: string;
    role_granted?: string;
  };
};

export type TicketCategory =
  | "spg_registration"
  | "resource_request"
  | "support"
  | "idea_jar"
  | "misc";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type TicketAuthor = {
  discord_id?: string | null;
  username: string;
  avatar_url?: string | null;
};

export type TicketSummary = {
  id: string;
  category: TicketCategory;
  title: string;
  status: TicketStatus;
  created_by?: TicketAuthor | null;
  assigned_to?: TicketAuthor | null;
  created_at?: string | null;
  updated_at?: string | null;
  thread_url?: string | null;
};

export type TicketListResponse = {
  /** False when the member has not linked Discord — an empty list by definition, not by accident. */
  linked: boolean;
  tickets: TicketSummary[];
};

/* --------------------------------------------------------------- requests */

export const api = {
  syncUser: (token: string) =>
    request<{ success: boolean; user: StudentProfile }>("/auth/sync-user", token, {
      method: "POST",
    }),

  me: (token: string) =>
    request<{ success: boolean; user: StudentProfile }>("/auth/me", token),

  verifyDiscord: (token: string, linkToken: string) =>
    request<VerifyDiscordResponse>("/auth/verify-discord", token, {
      method: "POST",
      body: JSON.stringify({ link_token: linkToken }),
    }),

  ticket: (token: string, id: string) => request<TicketThread>(`/tickets/${encodeURIComponent(id)}`, token),

  myTickets: (token: string) => request<TicketListResponse>("/tickets", token),

  updateProfile: (token: string, body: ProfileUpdate) =>
    request<{ success: boolean; message?: string; user: StudentProfile }>(
      "/auth/profile",
      token,
      { method: "PUT", body: JSON.stringify(body) },
    ),

  unlinkDiscord: (token: string) =>
    request<{ success: boolean; message?: string; user: StudentProfile }>(
      "/auth/unlink-discord",
      token,
      { method: "POST" },
    ),
};

/**
 * The API replaces social_links wholesale rather than merging, so every key
 * must be sent every time — omitting one clears it.
 */
export type ProfileUpdate = {
  skills?: string[];
  social_links?: SocialLinks;
  full_name?: string;
};

/* ---------------------------------------------------------------- display */

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  spg_registration: "Project group",
  resource_request: "Resource request",
  support: "Support",
  idea_jar: "Idea Jar",
  misc: "General",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export type TicketThread = {
  ticket: TicketSummary & { description: string; fields: { label: string; value: string }[]; close_reason?: string | null; closed_at?: string | null };
  messages: { id: string; sender_name: string; sender_role: string; content: string; attachments: string[]; timestamp?: string | null }[];
};
