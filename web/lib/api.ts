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
  | "compute_resource_request"
  | "learning_resource_request"
  | "support"
  | "idea_jar"
  | "feedback"
  | "report"
  | "misc";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type TicketSummary = {
  id: string;
  category: TicketCategory;
  title: string;
  status: TicketStatus;
  created_at?: string | null;
  updated_at?: string | null;
  thread_url?: string | null;
};

export type TicketListResponse = {
  /** Derived from the verified member profile, never from an empty ticket list. */
  linked: boolean;
  tickets: TicketSummary[];
};

type ApiTicketDetail = TicketSummary & {
  description?: string | null;
  fields?: Record<string, unknown>;
  close_reason?: string | null;
  closed_at?: string | null;
};

type ApiTicketMessage = {
  id: string;
  sender_uid?: string | null;
  sender_name?: string | null;
  sender_role: string;
  content: string;
  attachments: string[];
  timestamp?: string | null;
};

const FIELD_ORDER: Partial<Record<TicketCategory, string[]>> = {
  spg_registration: ["Project Name & Track", "Team Members", "Duration & Frequency", "Summary & Goals"],
  compute_resource_request: ["SPG Name", "Resources Requested", "Progress Proof", "Justification"],
  learning_resource_request: ["Topic / Subject Area", "Resource Format", "Target Audience / Track", "Description & Suggested Links"],
  resource_request: ["SPG Name", "Resources Requested", "Progress Proof", "Justification"],
  idea_jar: ["Idea Title", "Track", "Overview"],
  support: ["Subject", "Details"],
  feedback: ["Feedback Topic", "Comments"],
  misc: ["Subject", "Details"],
  report: ["Incident Summary", "Report Details"],
};

function ticketFields(category: TicketCategory, fields: Record<string, unknown>) {
  const order = FIELD_ORDER[category] ?? [];
  return Object.entries(fields)
    .sort(([left], [right]) => {
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      }
      return left.localeCompare(right);
    })
    .map(([label, value]) => ({ label, value: String(value) }));
}

/* --------------------------------------------------------------- requests */

export const api = {
  syncUser: (token: string) =>
    request<StudentProfile>("/users/sync", token, {
      method: "POST",
    }),

  me: (token: string) =>
    request<StudentProfile>("/users/me", token),

  verifyDiscord: (token: string, linkToken: string) =>
    request<VerifyDiscordResponse>("/users/verify-discord", token, {
      method: "POST",
      body: JSON.stringify({ link_token: linkToken }),
    }),

  ticket: async (token: string, id: string): Promise<TicketThread> => {
    const path = `/tickets/${encodeURIComponent(id)}`;
    const [detail, messages] = await Promise.all([
      request<ApiTicketDetail>(path, token),
      request<ApiTicketMessage[]>(`${path}/messages`, token),
    ]);
    return {
      ticket: {
        ...detail,
        description: detail.description ?? "",
        fields: ticketFields(detail.category, detail.fields ?? {}),
      },
      messages: messages.map(message => ({
        ...message,
        sender_name: message.sender_name?.trim() || (message.sender_role === "admin" || message.sender_role === "lead" ? "Club team" : "Member"),
      })),
    };
  },

  myTickets: async (token: string) => {
    const data = await request<{ total: number; items: TicketSummary[] }>("/tickets/my", token);
    return data.items.filter(ticket => ticket.category !== "report").slice(0, 100);
  },

  updateProfile: (token: string, body: ProfileUpdate) =>
    request<StudentProfile>(
      "/users/me",
      token,
      { method: "PATCH", body: JSON.stringify(body) },
    ),

  unlinkDiscord: (token: string) =>
    request<{ success: boolean; message?: string; user: StudentProfile }>(
      "/users/unlink-discord",
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
  compute_resource_request: "Compute resource request",
  learning_resource_request: "Learning resource request",
  resource_request: "Resource request",
  support: "Support",
  idea_jar: "Idea Jar",
  feedback: "Feedback",
  report: "Confidential report",
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
