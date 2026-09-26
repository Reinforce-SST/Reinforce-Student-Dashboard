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

export type TrackPoints = {
  total: number;
  kaggle: number;
  product: number;
  research: number;
  misc: number;
};

export type MemberTier = "beginner" | "advanced";

export type StudentProfile = {
  id?: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  discord_id?: string | null;
  is_verified: boolean;
  discord_link_version?: number | null;
  verified_at?: string | null;
  is_admin?: boolean;
  is_member?: boolean;
  tier?: MemberTier;
  batch_year?: number | null;
  bio?: string | null;
  points?: TrackPoints;
  skills: string[];
  social_links: SocialLinks;
  created_at?: string | null;
  updated_at?: string | null;
  last_login?: string | null;
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

  uploadAvatar: async (token: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE}/users/me/avatar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = `Avatar upload failed with status ${res.status}`;
        try {
          const body = await res.json();
          if (typeof body?.detail === "string") detail = body.detail;
        } catch {}
        throw new ApiError(detail, res.status);
      }

      return res.json() as Promise<{ message: string; avatar_url: string }>;
    } finally {
      clearTimeout(timer);
    }
  },

  unlinkDiscord: (token: string) =>
    request<{ success: boolean; message?: string; user: StudentProfile }>(
      "/users/unlink-discord",
      token,
      { method: "POST" },
    ),

  listSpgs: async (
    token: string,
    params?: {
      status?: string;
      type?: string;
      track?: string;
      recruiting?: boolean;
      limit?: number;
      cursor?: string;
    }
  ) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.type) query.set("type", params.type);
    if (params?.track && params.track !== "all") query.set("track", params.track);
    if (params?.recruiting !== undefined) query.set("recruiting", String(params.recruiting));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.cursor) query.set("cursor", params.cursor);

    const qs = query.toString();
    return request<{ items: any[]; next_cursor?: string | null }>(
      `/spgs${qs ? `?${qs}` : ""}`,
      token
    );
  },

  getSpg: (token: string, spgId: string) =>
    request<any>(`/spgs/${encodeURIComponent(spgId)}`, token),

  listSpgReports: (
    token: string,
    spgId: string,
    params?: { report_type?: string; limit?: number; cursor?: string }
  ) => {
    const query = new URLSearchParams();
    if (params?.report_type) query.set("report_type", params.report_type);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.cursor) query.set("cursor", params.cursor);

    const qs = query.toString();
    return request<{ items: any[]; next_cursor?: string | null }>(
      `/spgs/${encodeURIComponent(spgId)}/reports${qs ? `?${qs}` : ""}`,
      token
    );
  },

  submitFormReport: (
    token: string,
    spgId: string,
    submission: {
      heading: string;
      short_description: string;
      report_type?: "progress" | "final";
      summary: string;
      milestones?: string[];
      blockers?: string;
      next_steps?: string;
    }
  ) =>
    request<any>(`/spgs/${encodeURIComponent(spgId)}/reports/form`, token, {
      method: "POST",
      body: JSON.stringify(submission),
    }),

  submitPdfReport: async (
    token: string,
    spgId: string,
    formData: FormData
  ) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE}/spgs/${encodeURIComponent(spgId)}/reports/pdf`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = `Upload failed with status ${res.status}`;
        try {
          const body = await res.json();
          if (typeof body?.detail === "string") detail = body.detail;
        } catch {}
        throw new ApiError(detail, res.status);
      }

      return res.json();
    } finally {
      clearTimeout(timer);
    }
  },

  leaderboard: (token: string, track: string = "total", limit: number = 50) =>
    request<{ track: string; total: number; entries: any[] }>(
      `/users/leaderboard?track=${encodeURIComponent(track)}&limit=${limit}`,
      token
    ),

  browseUsers: async (
    token: string,
    params?: {
      search?: string;
      track?: string;
      tier?: string;
      is_member?: boolean;
      page?: number;
      page_size?: number;
    }
  ) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.track && params.track !== "all") query.set("track", params.track);
    if (params?.tier && params.tier !== "all") query.set("tier", params.tier);
    if (params?.is_member !== undefined) query.set("is_member", String(params.is_member));
    if (params?.page) query.set("page", String(params.page));
    if (params?.page_size) query.set("page_size", String(params.page_size));

    const qs = query.toString();
    return request<{ items: StudentProfile[]; total: number; page: number; page_size: number; has_more: boolean }>(
      `/users${qs ? `?${qs}` : ""}`,
      token
    );
  },

  getUserProfile: (token: string, idOrEmail: string) =>
    request<StudentProfile>(`/users/${encodeURIComponent(idOrEmail)}`, token),

  getMyContributions: (token: string, limit: number = 50, cursor?: string | null) => {
    const qs = new URLSearchParams();
    if (limit) qs.set("limit", String(limit));
    if (cursor) qs.set("cursor", cursor);
    const query = qs.toString();
    return request<{ items: any[]; next_cursor?: string | null }>(
      `/contributions/me${query ? `?${query}` : ""}`,
      token
    );
  },

  getUserContributions: (
    token: string,
    userId: string,
    limit: number = 50,
    cursor?: string | null,
    statusFilter: string = "approved"
  ) => {
    const qs = new URLSearchParams();
    if (limit) qs.set("limit", String(limit));
    if (cursor) qs.set("cursor", cursor);
    if (statusFilter) qs.set("status", statusFilter);
    const query = qs.toString();
    return request<{ items: any[]; next_cursor?: string | null }>(
      `/contributions/user/${encodeURIComponent(userId)}${query ? `?${query}` : ""}`,
      token
    );
  },

  getContribution: (token: string, recordId: string) =>
    request<any>(`/contributions/${encodeURIComponent(recordId)}`, token),

  getContributionLeaderboard: (token: string, limit: number = 50) =>
    request<{ user_id: string; points: number; contribution_count: number }[]>(
      `/contributions/leaderboard?limit=${limit}`,
      token
    ),
};

/**
 * The API replaces social_links wholesale rather than merging, so every key
 * must be sent every time — omitting one clears it.
 */
export type ProfileUpdate = {
  full_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
  batch_year?: number | null;
  skills?: string[];
  social_links?: SocialLinks;
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
