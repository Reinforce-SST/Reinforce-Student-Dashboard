/**
 * Client for the Reinforce API.
 *
 * Member and admin calls use the caller's Firebase ID token. Public reads do
 * not require one. The browser never talks to Firestore directly.
 */

import type {
  SPGRecord,
  SPGReportRecord,
  SPGMilestone,
  SPGMilestoneCreate,
  SPGMilestoneUpdate,
  SPGSubmilestoneCreate,
} from "./spgData";
export type {
  SPGRecord,
  SPGReportRecord,
  SPGMilestone,
  SPGMilestoneCreate,
  SPGMilestoneUpdate,
  SPGSubmilestone,
  SPGSubmilestoneCreate,
} from "./spgData";
import type { ContributionPage, ContributionRecord, PublicContributionRecord } from "./contributionData";

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export type ArticleKind = "article" | "research_paper";
/** Present exactly when kind is "research_paper". paper_url is always http(s). */
export type PaperDetails = { authors: string[]; venue?: string | null; paper_url: string };
export type ArticleSummary = {
  id: string; slug: string; title: string; summary: string;
  cover_image_url?: string | null; tags: string[];
  reading_time_minutes: number; published_at?: string | null;
  stats: { upvote_count: number; comment_count: number; view_count: number };
  /** Older articles predate kinds; the API reads them as "article". */
  kind?: ArticleKind;
  paper?: PaperDetails | null;
};
export type ArticleDetail = ArticleSummary & { content: string };
export type IdeaSummary = {
  id: string; title: string; description: string;
  track: string; difficulty?: string | null; is_verified: boolean;
  is_featured?: boolean;
  spg_creation_type?: string | null;
  stats: { upvote_count: number; views_count: number; claims_count: number };
  created_at?: string | null;
  approved_at?: string | null;
  status?: string | null;
};
export type IdeaDetail = IdeaSummary & {
  prerequisites: string[]; rough_roadmap: string[]; learning_outcomes: string[];
  updated_at?: string | null;
};

export type ResourceTrack = "research" | "product" | "kaggle" | "general";
/** Slash-separated category path in the shared resource pool; null is its root. */
export type ResourceCategoryId = string;
export type ResourceType = "article" | "video" | "course" | "docs" | "repo" | "slides" | "recording" | "other";
export type ResourceStatus = "published" | "hidden";
/** An admin-curated link. url is always http(s); the API refuses anything else. */
export type LearningResource = {
  id: string; title: string; url: string; description: string;
  track: ResourceTrack; type: ResourceType; tags: string[];
  /** Nested folder path in the shared resource pool; null means the pool root. */
  category_id?: ResourceCategoryId | null;
  /** Set when the resource came from, or was linked to, an event. */
  event_id?: string | null; event_title?: string | null;
  status: ResourceStatus;
  created_by?: string | null; created_at?: string | null; updated_at?: string | null;
};
export type LearningResourceInput = {
  title: string; url: string; description?: string;
  track?: ResourceTrack; category_id?: ResourceCategoryId | null; type?: ResourceType; tags?: string[];
  event_id?: string | null; status?: ResourceStatus;
};
export type EventLearningResourceList = { resources: LearningResource[]; total: number };
export type LearningResourceFilters = {
  track?: ResourceTrack; type?: ResourceType; event_id?: string; q?: string; status?: ResourceStatus;
};
/** Per event link: created, already saved earlier, or skipped as not a web address. */
export type EventResourceImport = {
  created: LearningResource[]; already_saved: string[]; skipped: string[];
};

/** Nothing should hang the UI forever. Render cold starts are slow but finite. */
const TIMEOUT_MS = 20_000;

async function request<T>(path: string, token?: string | null, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    // If the token expired (401), automatically force-refresh it via Firebase and retry the request once
    if (res.status === 401 && typeof window !== "undefined") {
      try {
        const { getFirebaseAuth, isFirebaseConfigured } = await import("./firebase");
        if (isFirebaseConfigured) {
          const auth = getFirebaseAuth();
          if (auth.currentUser) {
            const freshToken = await auth.currentUser.getIdToken(true);
            if (freshToken) {
              const retryController = new AbortController();
              const retryTimer = setTimeout(() => retryController.abort(), TIMEOUT_MS);
              try {
                const retryRes = await fetch(`${BASE}${path}`, {
                  ...init,
                  headers: {
                    ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
                    Authorization: `Bearer ${freshToken}`,
                    ...init?.headers,
                  },
                  cache: "no-store",
                  signal: retryController.signal,
                });
                if (retryRes.ok) {
                  return retryRes.json() as Promise<T>;
                }
                res = retryRes;
              } finally {
                clearTimeout(retryTimer);
              }
            }
          }
        }
      } catch {
        // Fall through to error reporting
      }
    }

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

export type EventSummaryItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  event_type: string;
  track: string;
  format: string;
  schedule: {
    start_time: string;
    end_time?: string | null;
    duration_minutes?: number | null;
    registration_deadline?: string | null;
  };
  venue_info?: {
    venue_name?: string | null;
    room?: string | null;
    meeting_url?: string | null;
  };
  stats?: {
    registered_count: number;
    checked_in_count: number;
    feedback_count: number;
    average_rating: number;
  };
  banner_url?: string | null;
  banner_badge_text?: string | null;
  banner_cta_text?: string | null;
  banner_cta_url?: string | null;
  status: string;
};

export type EventDocument = {
  id: string;
  slug: string;
  title: string;
  description: string;
  detailed_info?: string | null;
  event_type: string;
  track: string;
  format: string;
  venue_info?: {
    venue_name?: string | null;
    room?: string | null;
    meeting_url?: string | null;
  };
  schedule: {
    start_time: string;
    end_time?: string | null;
    duration_minutes?: number | null;
    registration_deadline?: string | null;
  };
  eligibility?: {
    access_scope?: string;
    allowed_years?: number[];
    allowed_tiers?: string[];
    allowed_tracks?: string[];
    custom_note?: string | null;
    is_mandatory?: boolean;
  };
  participation?: {
    mode?: "solo" | "team";
    min_team_size?: number;
    max_team_size?: number;
    max_participants?: number | null;
    requires_event_spg?: boolean;
    spg_auto_disband_days?: number;
  };
  points_reward?: {
    attendance_points?: number;
    track?: string;
  };
  resources?: {
    recording_url?: string | null;
    slides_url?: string | null;
    writeup_url?: string | null;
    discord_thread_id?: string | null;
    learning_resource_ids?: string[];
  };
  stats?: {
    registered_count: number;
    checked_in_count: number;
    feedback_count: number;
    average_rating: number;
  };
  banner_url?: string | null;
  banner_badge_text?: string | null;
  banner_cta_text?: string | null;
  banner_cta_url?: string | null;
  status: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
};

export type BannerDocument = {
  id: string;
  title: string;
  description: string;
  banner_url?: string | null;
  banner_badge_text?: string | null;
  banner_cta_text?: string | null;
  banner_cta_url?: string | null;
  schedule: {
    start_time: string;
    end_time?: string | null;
    duration_minutes?: number | null;
  };
  status: "published" | "draft" | "archived" | string;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AttendeeProfile = {
  id: string;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
  batch_year?: number | null;
  tier?: string;
  role_label?: string | null;
  bio?: string | null;
  points?: number;
};

export type EventRegistration = {
  id: string;
  event_id: string;
  user_id: string;
  team_name?: string | null;
  member_uids: string[];
  spg_id?: string | null;
  spg_status?: string | null;
  status: "registered" | "waitlisted" | "checked_in" | "absent" | "disqualified" | "excused" | "cancelled";
  checked_in_at?: string | null;
  checked_in_by?: string | null;
  attendance_note?: string | null;
  registered_at: string;
  user_profile?: AttendeeProfile | null;
  member_profiles?: AttendeeProfile[] | null;
};
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
  id: string;
  email?: string;
  full_name: string;
  avatar_url?: string | null;
  discord_id?: string | null;
  is_verified: boolean;
  discord_link_version?: number | null;
  verified_at?: string | null;
  is_admin?: boolean;
  is_member?: boolean;
  tier?: MemberTier;
  role_label?: string | null;
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

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type AdminTicketFilters = {
  category?: TicketCategory;
  status?: TicketStatus;
  priority?: TicketPriority;
  /** A lead's UID. The server has no "unassigned" filter. */
  assignedTo?: string;
};

export type TicketSummary = {
  id: string;
  category: TicketCategory;
  title: string;
  status: TicketStatus;
  priority?: TicketPriority;
  created_by_uid?: string;
  assigned_to_uid?: string | null;
  spg_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  thread_url?: string | null;
  created_by_name?: string | null;
  assigned_to_name?: string | null;
};

export type TicketListResponse = {
  /** Derived from the verified member profile, never from an empty ticket list. */
  linked: boolean;
  tickets: TicketSummary[];
};

export type ApiTicketDetail = TicketSummary & {
  description?: string | null;
  fields?: Record<string, unknown>;
  close_reason?: string | null;
  closed_at?: string | null;
  discord_meta?: {
    thread_url?: string | null;
    guild_id?: string | null;
    channel_id?: string | null;
    thread_id?: string | null;
  } | null;
  created_by_email?: string | null;
  created_by_avatar?: string | null;
  assigned_to_email?: string | null;
  assigned_to_avatar?: string | null;
};

export type TicketCreateRequest = {
  category: TicketCategory;
  title: string;
  description?: string;
  fields: Record<string, unknown>;
  spg_id?: string;
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
  spg_registration: [
    "Project Name",
    "Group Type",
    "Based on Idea",
    "Track",
    "Team Leader",
    "Team Members",
    "Duration (Days)",
    "Report Frequency (Days)",
    "Summary & Goals",
    "Vision",
    "First Steps",
    "Initial Milestones",
    "Proposal Document URL",
    "Duration & Frequency",
    "Project Name & Track",
  ],
  compute_resource_request: ["SPG Name", "Resources Requested", "Progress Proof", "Justification"],
  learning_resource_request: ["Topic / Subject Area", "Resource Format", "Target Audience / Track", "Description & Suggested Links"],
  resource_request: ["SPG Name", "Resources Requested", "Progress Proof", "Justification"],
  idea_jar: [
    "Idea Title",
    "Track",
    "Difficulty",
    "Overview",
    "Prerequisites",
    "Rough Roadmap",
    "Learning Outcomes",
    "Track & Difficulty",
    "Roadmap & Outcomes",
  ],
  support: ["Subject", "Details"],
  feedback: ["Feedback Topic", "Feedback Details", "Comments", "Topic"],
  misc: ["Subject", "Details"],
  report: ["Incident Summary", "Report Details"],
};

export type FormattedTicketField = { label: string; value: string };

export function ticketFields(category: TicketCategory, fields: Record<string, unknown>): FormattedTicketField[] {
  const order = FIELD_ORDER[category] ?? [];

  const hasGroupType = fields["Group Type"] !== undefined && String(fields["Group Type"]).trim() !== "";
  const hasTeamLeader = fields["Team Leader"] !== undefined && String(fields["Team Leader"]).trim() !== "";
  const hasTeamMembers = fields["Team Members"] !== undefined && String(fields["Team Members"]).trim() !== "";
  const hasTrack = fields["Track"] !== undefined && String(fields["Track"]).trim() !== "";
  const hasDuration = fields["Duration (Days)"] !== undefined && String(fields["Duration (Days)"]).trim() !== "";
  const hasFrequency = fields["Report Frequency (Days)"] !== undefined && String(fields["Report Frequency (Days)"]).trim() !== "";
  const hasProjectName = fields["Project Name"] !== undefined && String(fields["Project Name"]).trim() !== "";
  const hasIdeaTitle = fields["Idea Title"] !== undefined && String(fields["Idea Title"]).trim() !== "";
  const hasDifficulty = fields["Difficulty"] !== undefined && String(fields["Difficulty"]).trim() !== "";
  const hasOverview = fields["Overview"] !== undefined && String(fields["Overview"]).trim() !== "";
  const hasPrerequisites = fields["Prerequisites"] !== undefined && String(fields["Prerequisites"]).trim() !== "";
  const hasRoadmap = (fields["Rough Roadmap"] !== undefined && String(fields["Rough Roadmap"]).trim() !== "") ||
    (fields["Roadmap"] !== undefined && String(fields["Roadmap"]).trim() !== "");
  const hasOutcomes = fields["Learning Outcomes"] !== undefined && String(fields["Learning Outcomes"]).trim() !== "";
  const hasProposalDoc = fields["Proposal Document URL"] !== undefined && String(fields["Proposal Document URL"]).trim() !== "";

  const rawEntries: [string, string][] = [];

  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined || val === null) continue;
    let strVal = typeof val === "object" && Array.isArray(val) ? val.join(", ") : String(val).trim();
    if (!strVal || strVal === "None specified" || strVal === "None") continue;

    // Never display raw idea_id (Based on Idea holds the title)
    if (key === "idea_id") continue;

    // Redundant alias suppression
    if (hasGroupType && key === "spg_type") continue;
    if (hasProposalDoc && key === "proposal_document_url") continue;
    if (hasTeamLeader && (key === "leader_uid" || key === "Team Leader UID")) continue;
    if (hasTeamMembers && (key === "member_uids" || key === "Team Member UIDs")) continue;
    if (hasTrack && key === "track") continue;
    if (hasDuration && (key === "duration_days" || key === "Duration & Frequency")) continue;
    if (hasFrequency && (key === "frequency_days" || key === "Duration & Frequency")) continue;
    if (hasProjectName && key === "Project Name & Track") continue;
    if (hasIdeaTitle && (key === "title" || key === "Idea Title & Track")) continue;
    if (hasDifficulty && (key === "difficulty" || key === "Track & Difficulty")) continue;
    if (hasOverview && (key === "description" || key === "Details")) continue;
    if (hasPrerequisites && key === "prerequisites") continue;
    if (hasRoadmap && (key === "rough_roadmap" || key === "roadmap" || key === "Roadmap & Outcomes")) continue;
    if (hasOutcomes && (key === "learning_outcomes" || key === "Roadmap & Outcomes")) continue;

    // Fallback normalization when display key was not provided
    let label = key;
    if (!hasGroupType && key === "spg_type") {
      label = "Group Type";
      strVal = strVal === "project" ? "Project SPG" : "Learning SPG";
    } else if (!hasProposalDoc && key === "proposal_document_url") {
      label = "Proposal Document URL";
    } else if (!hasTeamLeader && (key === "leader_uid" || key === "Team Leader UID")) label = "Team Leader";
    else if (!hasTeamMembers && (key === "member_uids" || key === "Team Member UIDs")) label = "Team Members";
    else if (!hasTrack && key === "track") {
      label = "Track";
      strVal = `${strVal[0].toUpperCase()}${strVal.slice(1)} Track`;
    } else if (!hasDuration && key === "duration_days") label = "Duration (Days)";
    else if (!hasFrequency && key === "frequency_days") label = "Report Frequency (Days)";
    else if (!hasIdeaTitle && key === "title") label = "Idea Title";
    else if (!hasDifficulty && key === "difficulty") label = "Difficulty";
    else if (!hasOverview && (key === "description" || key === "Details")) label = "Overview";

    rawEntries.push([label, strVal]);
  }

  // Sort according to preferred order
  rawEntries.sort(([left], [right]) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }
    return left.localeCompare(right);
  });

  // Deduplicate synonym labels or duplicate values
  const seenValues = new Map<string, string>();
  const seenLabels = new Set<string>();
  const deduped: { label: string; value: string }[] = [];

  for (const [label, strVal] of rawEntries) {
    if (seenLabels.has(label)) continue;

    // Synonym mapping:
    // Suggestion Topic <-> Feedback Topic
    // Feedback Details <-> Comments
    if (label === "Suggestion Topic" && fields["Feedback Topic"] !== undefined && String(fields["Feedback Topic"]).trim() === strVal) {
      continue;
    }
    if (label === "Comments" && fields["Feedback Details"] !== undefined && String(fields["Feedback Details"]).trim() === strVal) {
      continue;
    }
    if (label === "Feedback Topic" && fields["Suggestion Topic"] !== undefined && String(fields["Suggestion Topic"]).trim() === strVal && deduped.some((d) => d.label === "Suggestion Topic")) {
      continue;
    }

    if (seenValues.has(strVal)) {
      const prevLabel = seenValues.get(strVal)!;
      if (
        (prevLabel.includes("Topic") && label.includes("Topic")) ||
        (prevLabel.includes("Comment") && label.includes("Detail")) ||
        (prevLabel.includes("Detail") && label.includes("Comment")) ||
        prevLabel.toLowerCase() === label.toLowerCase()
      ) {
        continue;
      }
    }

    seenLabels.add(label);
    seenValues.set(strVal, label);
    deduped.push({ label, value: strVal });
  }

  return deduped;
}

/* --------------------------------------------------------------- requests */

export const api = {
  listArticles: (search = "", page = 1, kind?: ArticleKind) => {
    const query = new URLSearchParams({ page: String(page), page_size: "20" });
    if (search.trim()) query.set("search", search.trim());
    if (kind) query.set("kind", kind);
    return request<{ items: ArticleSummary[]; has_more: boolean; total: number }>(`/blogs?${query}`);
  },
  getArticle: (slug: string) => request<ArticleDetail>(`/blogs/${encodeURIComponent(slug)}`),
  publishArticle: (
    token: string,
    body: { title: string; summary: string; content: string; tags: string[]; kind?: ArticleKind; paper?: PaperDetails | null },
  ) =>
    request<ArticleDetail>("/blogs", token, { method: "POST", body: JSON.stringify({ ...body, status: "published" }) }),
  upvoteArticle: (token: string, id: string) =>
    request<{ upvoted: boolean; upvote_count: number }>(`/blogs/${encodeURIComponent(id)}/upvote`, token, { method: "POST" }),
  listIdeas: (
    search = "",
    page = 1,
    pageSize = 20,
    track?: string,
    difficulty?: string,
    sortBy?: string
  ) => {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search.trim()) query.set("search", search.trim());
    if (track && track !== "all") query.set("track", track);
    if (difficulty && difficulty !== "all") query.set("difficulty", difficulty);
    if (sortBy) query.set("sort_by", sortBy);
    return request<{ items: IdeaSummary[]; has_more: boolean; total: number; page: number; page_size: number }>(`/ideas?${query}`);
  },
  getIdea: (id: string, token?: string) => request<IdeaDetail>(`/ideas/${encodeURIComponent(id)}`, token),
  myIdeas: (token: string) => request<{ items: IdeaSummary[] }>("/ideas/my", token),
  /** One approved idea, chosen by the server. 404 when the jar is empty. */
  randomIdea: (token?: string | null) => request<IdeaDetail>("/ideas/random", token),
  createIdea: (token: string, body: { title: string; description: string; track: string }) =>
    request<IdeaDetail>("/ideas", token, { method: "POST", body: JSON.stringify(body) }),
  upvoteIdea: (token: string, id: string) =>
    request<{ upvoted: boolean; upvote_count: number }>(`/ideas/${encodeURIComponent(id)}/upvote`, token, { method: "POST" }),
  pendingIdeas: (token: string) => request<{ items: IdeaSummary[] }>("/ideas/pending", token),
  adminListIdeas: (
    token: string,
    options?: {
      status?: string;
      search?: string;
      track?: string;
      difficulty?: string;
      page?: number;
      pageSize?: number;
    }
  ) => {
    const query = new URLSearchParams();
    if (options?.status && options.status !== "all") query.set("status", options.status);
    if (options?.search) query.set("search", options.search);
    if (options?.track && options.track !== "all") query.set("track", options.track);
    if (options?.difficulty && options.difficulty !== "all") query.set("difficulty", options.difficulty);
    if (options?.page) query.set("page", String(options.page));
    if (options?.pageSize) query.set("page_size", String(options.pageSize));
    return request<{ items: IdeaSummary[]; has_more: boolean; total: number; page: number; page_size: number }>(
      `/ideas/admin?${query}`,
      token
    );
  },
  updateIdea: (
    token: string,
    id: string,
    body: Partial<{
      title: string;
      description: string;
      track: string;
      difficulty: string;
      prerequisites: string[];
      rough_roadmap: string[];
      learning_outcomes: string[];
    }>
  ) =>
    request<IdeaDetail>(`/ideas/${encodeURIComponent(id)}`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  approveIdea: (token: string, id: string) =>
    request<IdeaDetail>(`/ideas/${encodeURIComponent(id)}/approve`, token, { method: "POST" }),
  rejectIdea: (token: string, id: string) =>
    request<{ message: string; id: string }>(`/ideas/${encodeURIComponent(id)}`, token, { method: "DELETE" }),
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

  createTicket: (token: string, body: TicketCreateRequest) =>
    request<ApiTicketDetail>("/tickets", token, { method: "POST", body: JSON.stringify(body) }),

  ticketDetail: (token: string, id: string) =>
    request<ApiTicketDetail>(`/tickets/${encodeURIComponent(id)}`, token),

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
        created_by_name: detail.created_by_name ?? null,
        created_by_email: detail.created_by_email ?? null,
        created_by_avatar: detail.created_by_avatar ?? null,
        assigned_to_name: detail.assigned_to_name ?? null,
        assigned_to_email: detail.assigned_to_email ?? null,
        assigned_to_avatar: detail.assigned_to_avatar ?? null,
      },
      messages: messages.map((message) => ({
        ...message,
        sender_name:
          message.sender_name?.trim() ||
          (message.sender_role === "admin" || message.sender_role === "lead" ? "Club team" : "Member"),
      })),
    };
  },

  myTickets: async (token: string) => {
    const data = await request<{ total: number; items: TicketSummary[] }>("/tickets/my", token);
    return data.items.slice(0, 100);
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

  listSpgs: async <T = SPGRecord>(
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
    return request<{ items: T[]; next_cursor?: string | null }>(
      `/spgs${qs ? `?${qs}` : ""}`,
      token
    );
  },

  getSpg: <T = SPGRecord>(token: string, spgId: string) =>
    request<T>(`/spgs/${encodeURIComponent(spgId)}`, token),

  updateSpg: <T = SPGRecord>(token: string, spgId: string, payload: Partial<SPGRecord> & Record<string, unknown>) =>
    request<T>(`/spgs/${encodeURIComponent(spgId)}`, token, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  adminPauseSpg: <T = SPGRecord>(token: string, spgId: string) =>
    request<T>(`/spgs/${encodeURIComponent(spgId)}/pause`, token, {
      method: "POST",
    }),

  adminResumeSpg: <T = SPGRecord>(token: string, spgId: string) =>
    request<T>(`/spgs/${encodeURIComponent(spgId)}/resume`, token, {
      method: "POST",
    }),

  adminDisbandSpg: <T = SPGRecord>(token: string, spgId: string) =>
    request<T>(`/spgs/${encodeURIComponent(spgId)}/disband`, token, {
      method: "POST",
    }),

  verifySpgReport: <T = SPGReportRecord>(token: string, reportId: string) =>
    request<T>(`/spgs/reports/${encodeURIComponent(reportId)}/verify`, token, {
      method: "POST",
    }),

  addSpgMember: <T = SPGRecord>(token: string, spgId: string, userId: string) =>
    request<T>(`/spgs/${encodeURIComponent(spgId)}/members/${encodeURIComponent(userId)}`, token, {
      method: "POST",
    }),

  removeSpgMember: <T = SPGRecord>(token: string, spgId: string, userId: string) =>
    request<T>(`/spgs/${encodeURIComponent(spgId)}/members/${encodeURIComponent(userId)}`, token, {
      method: "DELETE",
    }),

  changeSpgLead: <T = SPGRecord>(token: string, spgId: string, newLeadId: string) =>
    request<T>(`/spgs/${encodeURIComponent(spgId)}/lead`, token, {
      method: "PATCH",
      body: JSON.stringify({ new_lead_id: newLeadId }),
    }),

  listMilestones: (token: string, spgId: string) =>
    request<SPGMilestone[]>(`/spgs/${encodeURIComponent(spgId)}/milestones`, token),

  createMilestone: (token: string, spgId: string, payload: SPGMilestoneCreate) =>
    request<SPGMilestone>(`/spgs/${encodeURIComponent(spgId)}/milestones`, token, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateMilestone: (token: string, spgId: string, milestoneId: string, payload: SPGMilestoneUpdate) =>
    request<SPGMilestone>(`/spgs/${encodeURIComponent(spgId)}/milestones/${encodeURIComponent(milestoneId)}`, token, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteMilestone: (token: string, spgId: string, milestoneId: string) =>
    request<void>(`/spgs/${encodeURIComponent(spgId)}/milestones/${encodeURIComponent(milestoneId)}`, token, {
      method: "DELETE",
    }),

  addSubmilestone: (token: string, spgId: string, milestoneId: string, payload: SPGSubmilestoneCreate) =>
    request<SPGMilestone>(`/spgs/${encodeURIComponent(spgId)}/milestones/${encodeURIComponent(milestoneId)}/submilestones`, token, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  toggleSubmilestone: (token: string, spgId: string, milestoneId: string, subId: string, isCompleted: boolean) =>
    request<SPGMilestone>(
      `/spgs/${encodeURIComponent(spgId)}/milestones/${encodeURIComponent(milestoneId)}/submilestones/${encodeURIComponent(subId)}`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({ is_completed: isCompleted }),
      }
    ),

  deleteSubmilestone: (token: string, spgId: string, milestoneId: string, subId: string) =>
    request<SPGMilestone>(
      `/spgs/${encodeURIComponent(spgId)}/milestones/${encodeURIComponent(milestoneId)}/submilestones/${encodeURIComponent(subId)}`,
      token,
      {
        method: "DELETE",
      }
    ),

  listSpgReports: <T = SPGReportRecord>(
    token: string,
    spgId: string,
    params?: { report_type?: string; limit?: number; cursor?: string }
  ) => {
    const query = new URLSearchParams();
    if (params?.report_type) query.set("report_type", params.report_type);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.cursor) query.set("cursor", params.cursor);

    const qs = query.toString();
    return request<{ items: T[]; next_cursor?: string | null }>(
      `/spgs/${encodeURIComponent(spgId)}/reports${qs ? `?${qs}` : ""}`,
      token
    );
  },

  submitFormReport: <T = SPGReportRecord>(
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
    request<T>(`/spgs/${encodeURIComponent(spgId)}/reports/form`, token, {
      method: "POST",
      body: JSON.stringify(submission),
    }),

  submitPdfReport: async <T = SPGReportRecord>(
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

      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  },

  leaderboard: (token: string, track: string = "total", limit: number = 50) =>
    request<{ track: string; total: number; entries: Record<string, unknown>[] }>(
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
    if (params?.page_size) query.set("page_size", String(Math.min(params.page_size, 50)));

    const qs = query.toString();
    return request<{ items: StudentProfile[]; total: number; page: number; page_size: number; has_more: boolean }>(
      `/users${qs ? `?${qs}` : ""}`,
      token
    );
  },

  getUserProfile: (token: string, idOrEmail: string) =>
    request<StudentProfile>(`/users/${encodeURIComponent(idOrEmail)}`, token),

  getMyContributions: <T = ContributionRecord>(token: string, limit: number = 50, cursor?: string | null) => {
    const qs = new URLSearchParams();
    if (limit) qs.set("limit", String(limit));
    if (cursor) qs.set("cursor", cursor);
    const query = qs.toString();
    return request<{ items: T[]; next_cursor?: string | null }>(
      `/contributions/me${query ? `?${query}` : ""}`,
      token
    );
  },

  getUserContributions: <T = ContributionRecord>(
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
    return request<{ items: T[]; next_cursor?: string | null }>(
      `/contributions/user/${encodeURIComponent(userId)}${query ? `?${query}` : ""}`,
      token
    );
  },

  getPublicUserContributions: (token: string, userId: string, limit: number = 50, cursor?: string | null) => {
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    if (cursor) qs.set("cursor", cursor);
    return request<{ items: PublicContributionRecord[]; next_cursor?: string | null }>(
      `/contributions/public/user/${encodeURIComponent(userId)}?${qs}`,
      token
    );
  },

  getContribution: <T = ContributionRecord>(token: string, recordId: string) =>
    request<T>(`/contributions/${encodeURIComponent(recordId)}`, token),

  getContributionLeaderboard: (token: string, limit: number = 50) =>
    request<{ user_id: string; points: number; contribution_count: number }[]>(
      `/contributions/leaderboard?limit=${limit}`,
      token
    ),

  listEvents: (
    token?: string | null,
    params?: {
      status?: string;
      track?: string;
      event_type?: string;
      timeline?: "upcoming" | "past";
      search?: string;
      page?: number;
      limit?: number;
    }
  ) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.track) qs.set("track", params.track);
    if (params?.event_type) qs.set("event_type", params.event_type);
    if (params?.timeline) qs.set("timeline", params.timeline);
    if (params?.search) qs.set("search", params.search);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request<{ events: EventSummaryItem[]; total: number }>(
      `/events${query ? `?${query}` : ""}`,
      token || undefined
    );
  },

  getEvent: (idOrSlug: string, token?: string | null) =>
    request<EventDocument>(`/events/${encodeURIComponent(idOrSlug)}`, token || undefined),

  myEventRegistration: (token: string, id: string) =>
    request<{ is_registered: boolean; registration: { status: string } | null }>(
      `/events/${encodeURIComponent(id)}/my-registration`, token),

  registerForEvent: (token: string, id: string, payload: { team_name?: string; member_uids?: string[] }) =>
    request<{ status: string }>(`/events/${encodeURIComponent(id)}/register`, token, {
      method: "POST", body: JSON.stringify(payload),
    }),

  cancelEventRegistration: (token: string, id: string) =>
    request<unknown>(`/events/${encodeURIComponent(id)}/register`, token, { method: "DELETE" }),

  submitEventFeedback: (token: string, id: string, payload: {
    rating_content: number; rating_organization: number; rating_overall: number;
    takeaways?: string; improvements?: string; is_anonymous: boolean;
  }) => request<unknown>(`/events/${encodeURIComponent(id)}/feedback`, token, {
    method: "POST", body: JSON.stringify(payload),
  }),

  /* ----------------------------------------------------------- Banner APIs */
  listBanners: (token?: string | null, params?: { status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request<{ banners: BannerDocument[]; total: number }>(
      `/banners${query ? `?${query}` : ""}`,
      token || undefined
    );
  },

  getBanner: (id: string, token?: string | null) =>
    request<BannerDocument>(`/banners/${encodeURIComponent(id)}`, token || undefined),

  adminCreateBanner: (token: string, payload: Record<string, unknown>) =>
    request<BannerDocument>("/banners", token, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  adminUpdateBanner: (token: string, bannerId: string, payload: Record<string, unknown>) =>
    request<BannerDocument>(`/banners/${encodeURIComponent(bannerId)}`, token, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  adminDeleteBanner: (token: string, bannerId: string) =>
    request<{ message: string }>(`/banners/${encodeURIComponent(bannerId)}`, token, {
      method: "DELETE",
    }),

  adminUploadBannerMedia: async (token: string, file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${BASE}/banners/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(typeof body?.detail === "string" ? body.detail : `Image upload failed (${response.status}).`, response.status);
      }
      return response.json() as Promise<{ url: string }>;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("Image upload timed out. Try again.", 504);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  },

  /* ----------------------------------------------------------- Admin APIs */
  adminUploadEventMedia: async (token: string, file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${BASE}/events/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(typeof body?.detail === "string" ? body.detail : `Image upload failed (${response.status}).`, response.status);
      }
      return response.json() as Promise<{ url: string }>;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("Image upload timed out. Try again.", 504);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  },

  adminCreateEvent: (token: string, payload: Record<string, unknown>) =>
    request<EventSummaryItem>("/events", token, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  adminUpdateEvent: (token: string, eventId: string, payload: Record<string, unknown>) =>
    request<EventSummaryItem>(`/events/${encodeURIComponent(eventId)}`, token, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  adminUpdateEventStatus: (token: string, eventId: string, status: string) =>
    request<EventSummaryItem>(`/events/${encodeURIComponent(eventId)}/status`, token, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  getEventRegistrations: (token: string, eventId: string) =>
    request<EventRegistration[]>(`/events/${encodeURIComponent(eventId)}/registrations`, token),

  adminGetEventRegistrations: (token: string, eventId: string) =>
    request<EventRegistration[]>(`/events/${encodeURIComponent(eventId)}/registrations`, token),

  adminUpdateRegistrationAttendance: (
    token: string,
    eventId: string,
    registrationId: string,
    payload: {
      status: "checked_in" | "absent" | "disqualified" | "excused" | "registered" | "waitlisted" | "cancelled";
      attendance_note?: string | null;
      award_points?: boolean;
      category?: string;
    }
  ) =>
    request<EventRegistration>(
      `/events/${encodeURIComponent(eventId)}/registrations/${encodeURIComponent(registrationId)}/attendance`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    ),

  adminAddManualRegistration: (
    token: string,
    eventId: string,
    payload: {
      user_id: string;
      status: "checked_in" | "absent" | "disqualified" | "excused" | "registered" | "waitlisted" | "cancelled";
      attendance_note?: string | null;
      award_points?: boolean;
      category?: string;
    }
  ) =>
    request<EventRegistration>(
      `/events/${encodeURIComponent(eventId)}/registrations/manual`,
      token,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  /** Only registered or already checked-in attendees can be checked in; the rest come back in failed_uids. */
  adminRollCall: (token: string, eventId: string, attendeeUids: string[], awardPoints: boolean = true, category: string = "participation") =>
    request<{
      event_id: string;
      checked_in_count: number;
      points_awarded_per_user: number;
      awarded_uids: string[];
      failed_uids: string[];
    }>(`/events/${encodeURIComponent(eventId)}/attendance/roll-call`, token, {
      method: "POST",
      body: JSON.stringify({ attendee_uids: attendeeUids, award_points: awardPoints, category }),
    }),

  adminUpdateUserStatus: (
    token: string,
    userId: string,
    payload: { is_admin?: boolean; is_member?: boolean; tier?: MemberTier; role_label?: string | null }
  ) =>
    request<StudentProfile>(`/users/${encodeURIComponent(userId)}/status`, token, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  adminDirectory: async (token: string, params: { search?: string; page?: number; page_size?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.page) query.set("page", String(params.page));
    if (params.page_size) query.set("page_size", String(params.page_size));
    try {
      return await request<{ items: StudentProfile[]; total: number; page: number; page_size: number; has_more: boolean }>(
        `/users/admin-directory?${query.toString()}`,
        token
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return api.browseUsers(token, params);
      }
      throw err;
    }
  },

  adminAwardContribution: (token: string, userId: string, payload: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/contributions/award/user/${encodeURIComponent(userId)}`, token, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  adminRecalculateUserPoints: (token: string, userId: string) =>
    request<Record<string, unknown>>(`/contributions/recalculate/${encodeURIComponent(userId)}`, token, { method: "POST" }),

  /** The admin ledger. `status: "pending"` is the review queue that actions fill. */
  adminListContributions: (
    token: string,
    params: {
      status?: string;
      user_id?: string;
      track?: string;
      category?: string;
      spg_id?: string;
      event_id?: string;
      limit?: number;
      cursor?: string;
    } = {}
  ) => {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.user_id) query.set("user_id", params.user_id);
    if (params.track && params.track !== "all") query.set("track", params.track);
    if (params.category && params.category !== "all") query.set("category", params.category);
    if (params.spg_id) query.set("spg_id", params.spg_id);
    if (params.event_id) query.set("event_id", params.event_id);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.cursor) query.set("cursor", params.cursor);
    const qs = query.toString();
    return request<ContributionPage>(`/contributions${qs ? `?${qs}` : ""}`, token);
  },

  adminUpdateContribution: (
    token: string,
    recordId: string,
    payload: {
      points?: number;
      title?: string;
      description?: string | null;
      category?: string;
      track?: string;
      occurred_at?: string;
    }
  ) =>
    request<ContributionRecord>(`/contributions/${encodeURIComponent(recordId)}`, token, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  adminBatchUpdateContributions: (
    token: string,
    updates: Array<{
      record_id: string;
      update_data: {
        points?: number;
        title?: string;
        description?: string | null;
        category?: string;
        track?: string;
        occurred_at?: string;
      };
    }>
  ) =>
    request<ContributionRecord[]>("/contributions/batch-update", token, {
      method: "POST",
      body: JSON.stringify({ updates }),
    }),

  adminRevokeContribution: (
    token: string,
    recordId: string,
    reason: string
  ) =>
    request<ContributionRecord>(`/contributions/${encodeURIComponent(recordId)}/revoke`, token, {
      method: "PATCH",
      body: JSON.stringify({ status_reason: reason }),
    }),

  /**
   * Settle a pending contribution. Approving sets the points the admin chose;
   * rejecting needs a reason. An approved record is corrected by revocation.
   */
  adminReviewContribution: (
    token: string,
    contribId: string,
    review: { action: "approve"; points: number } | { action: "reject"; reason: string },
  ) =>
    request<ContributionRecord>(`/contributions/${encodeURIComponent(contribId)}/review`, token, {
      method: "PATCH",
      body: JSON.stringify(review),
    }),

  /** Every filter maps to an equality filter in list_all_tickets. Unset means "any". */
  adminGetAllTickets: (token: string, page = 1, filters: AdminTicketFilters = {}) => {
    const query = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.category) query.set("category", filters.category);
    if (filters.status) query.set("status", filters.status);
    if (filters.priority) query.set("priority", filters.priority);
    if (filters.assignedTo) query.set("assigned_to_uid", filters.assignedTo);
    return request<{ total: number; items: TicketSummary[] }>(`/tickets?${query}`, token);
  },
  adminUpdateTicketStatus: (token: string, ticketId: string, nextStatus: TicketStatus, closeReason?: string) =>
    request<TicketSummary>(`/tickets/${encodeURIComponent(ticketId)}/status`, token, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus, ...(closeReason ? { close_reason: closeReason } : {}) }),
    }),
  adminApproveSpgTicket: (token: string, ticketId: string, approval: { type: string; track: string; visibility: string; proposition?: File | null }) => {
    const body = new FormData();
    body.set("spg_type", approval.type);
    body.set("track", approval.track);
    body.set("visibility", approval.visibility);
    if (approval.proposition) body.set("proposition", approval.proposition);
    return request<ApiTicketDetail>(`/tickets/${encodeURIComponent(ticketId)}/approve-spg`, token, { method: "POST", body });
  },
  postTicketMessage: (token: string, ticketId: string, content: string, attachments: string[] = []) =>
    request<ApiTicketMessage>(`/tickets/${encodeURIComponent(ticketId)}/messages`, token, {
      method: "POST",
      body: JSON.stringify({ content, attachments }),
    }),
  adminAssignTicket: (token: string, ticketId: string, assignedToUid: string) =>
    request<ApiTicketDetail>(`/tickets/${encodeURIComponent(ticketId)}/assign`, token, {
      method: "PATCH",
      body: JSON.stringify({ assigned_to_uid: assignedToUid }),
    }),
  closeTicket: (token: string, ticketId: string, closeReason?: string) =>
    request<ApiTicketDetail>(`/tickets/${encodeURIComponent(ticketId)}/close`, token, {
      method: "POST",
      body: JSON.stringify({ close_reason: closeReason || null }),
    }),

  /* ------------------------------------------------ Learning Resources APIs */
  listLearningResources: (filters: LearningResourceFilters = {}, token?: string | null) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) qs.set(key, value);
    }
    const query = qs.toString();
    return request<{ resources: LearningResource[]; total: number }>(
      `/learning-resources${query ? `?${query}` : ""}`,
      token || undefined,
    );
  },
  adminCreateLearningResource: (token: string, payload: LearningResourceInput) =>
    request<LearningResource>("/learning-resources", token, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getEventLearningResources: (eventId: string, token?: string | null) =>
    request<EventLearningResourceList>(`/learning-resources/for-event/${encodeURIComponent(eventId)}`, token),
  adminUpdateLearningResource: (token: string, resourceId: string, payload: Partial<LearningResourceInput>) =>
    request<LearningResource>(`/learning-resources/${encodeURIComponent(resourceId)}`, token, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  adminDeleteLearningResource: (token: string, resourceId: string) =>
    request<{ message: string }>(`/learning-resources/${encodeURIComponent(resourceId)}`, token, {
      method: "DELETE",
    }),
  /** Save an event's recording, slides and write-up links as resources. Safe to repeat. */
  adminSaveEventResources: (token: string, eventId: string) =>
    request<EventResourceImport>(`/learning-resources/from-event/${encodeURIComponent(eventId)}`, token, {
      method: "POST",
    }),
};

/**
 * The API replaces social_links wholesale rather than merging, so every key
 * must be sent every time — omitting one clears it.
 */
export type ProfileUpdate = {
  full_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
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
  idea_jar: "Idea Jar Proposal",
  feedback: "Suggestions & Feedback",
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
  ticket: TicketSummary & {
    description: string;
    fields: { label: string; value: string }[];
    close_reason?: string | null;
    closed_at?: string | null;
    created_by_name?: string | null;
    created_by_email?: string | null;
    created_by_avatar?: string | null;
    assigned_to_name?: string | null;
    assigned_to_email?: string | null;
    assigned_to_avatar?: string | null;
    discord_meta?: ApiTicketDetail["discord_meta"];
  };
  messages: {
    id: string;
    sender_name: string;
    sender_role: string;
    content: string;
    attachments: string[];
    timestamp?: string | null;
    source?: string;
  }[];
};
