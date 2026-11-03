/**
 * Event data types and repositories strictly adhering to server/app/schemas/events.py
 */

export type EventTrack = "research" | "product" | "kaggle" | "misc" | "all";

export function getEventGraduationBatches(now = new Date()): number[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const firstBatch = year + (month >= 7 ? 1 : 0);
  return Array.from({ length: 4 }, (_, index) => firstBatch + index);
}

export function formatEventDuration(durationMinutes: number | null | undefined): string {
  if (
    durationMinutes === null ||
    durationMinutes === undefined ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return "Not specified";
  }

  const totalMinutes = Math.round(durationMinutes);
  const days = Math.floor(totalMinutes / 1440);

  if (days >= 1) {
    return `${days} ${days === 1 ? "day" : "days"}`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  if (hours > 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/**
 * Safely parses any date string into a Date object.
 * If the string lacks an explicit timezone offset (like "2026-11-02T17:30"),
 * it is explicitly assumed to be in Indian Standard Time (IST, UTC+05:30).
 */
export function parseDateOrIST(str?: string | null): Date | null {
  if (!str) return null;
  const trimmed = str.trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)
    ? (trimmed.length === 16 ? `${trimmed}:00+05:30` : `${trimmed}+05:30`)
    : trimmed;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Converts a UTC ISO string (or any valid timestamp) into "YYYY-MM-DDTHH:mm"
 * formatted in Indian Standard Time (IST, UTC+05:30) for <input type="datetime-local">.
 */
export function toISTInputString(isoOrDateStr?: string | null): string {
  if (!isoOrDateStr) return "";
  const trimmed = isoOrDateStr.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const d = parseDateOrIST(trimmed);
  if (!d) return "";
  const istDate = new Date(d.getTime() + 19800000);
  return istDate.toISOString().slice(0, 16);
}

/**
 * Converts a "YYYY-MM-DDTHH:mm" string from <input type="datetime-local">
 * into a UTC ISO string ("YYYY-MM-DDTHH:mm:ss.sssZ"), explicitly interpreting
 * the input value as Indian Standard Time (IST, UTC+05:30).
 */
export function fromISTInputString(inputStr?: string | null): string {
  if (!inputStr) return "";
  const trimmed = inputStr.trim();
  if (!trimmed) return "";
  if (trimmed.endsWith("Z") || trimmed.includes("+")) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }
  const withTz = trimmed.length === 16 ? `${trimmed}:00+05:30` : `${trimmed}+05:30`;
  const d = new Date(withTz);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * Formats a timestamp into a human-readable banner date in Indian Standard Time.
 */
export function formatBannerDate(startStr?: string | null): string {
  if (!startStr) return "Upcoming Event";
  const start = parseDateOrIST(startStr);
  return start && Number.isFinite(start.getTime())
    ? start.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date not set";
}

/**
 * Formats a timestamp into a human-readable banner time in Indian Standard Time (e.g. "5:30 PM").
 */
export function formatBannerTime(startStr?: string | null): string {
  if (!startStr) return "";
  const start = parseDateOrIST(startStr);
  return start && Number.isFinite(start.getTime())
    ? start.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "";
}

/**
 * Formats a timestamp for event cards/lists in Indian Standard Time.
 */
export function formatEventDisplayDate(startStr?: string | null): string {
  if (!startStr) return "Date TBD";
  const d = parseDateOrIST(startStr);
  if (!d || Number.isNaN(d.getTime())) return startStr;
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export type EventFormat = "online" | "offline" | "hybrid";
export type EventStatus =
  | "draft"
  | "published"
  | "registration_closed"
  | "ongoing"
  | "completed"
  | "archived";

export type ParticipationMode = "solo" | "team";
export type AccessScope = "open_to_all" | "members_only";

export interface VenueInfo {
  venue_name?: string;
  room?: string;
  meeting_url?: string;
}

export interface EventSchedule {
  start_time: string;
  end_time?: string;
  duration_minutes?: number;
  registration_deadline?: string;
}

export interface EventEligibility {
  access_scope: AccessScope;
  allowed_years: number[];
  allowed_tiers: string[];
  allowed_tracks: string[];
  custom_note?: string;
  is_mandatory: boolean;
}

export interface EventParticipationConfig {
  mode: ParticipationMode;
  min_team_size: number;
  max_team_size: number;
  max_participants?: number;
  requires_event_spg: boolean;
  spg_auto_disband_days: number;
}

export interface PointsRewardConfig {
  attendance_points: number;
  track: string;
}

export interface EventResources {
  recording_url?: string;
  slides_url?: string;
  writeup_url?: string;
  discord_thread_id?: string;
}

export interface EventStats {
  registered_count: number;
  checked_in_count: number;
  feedback_count: number;
  average_rating: number;
}

export interface EventWinner {
  placement: string;
  title: string;
  user_ids: string[];
  spg_id?: string;
  project_url?: string;
  notes?: string;
}

export interface EventDocument {
  id: string;
  slug: string;
  title: string;
  description: string;
  detailed_info?: string;
  event_type: string;
  track: EventTrack;
  format: EventFormat;
  venue_info: VenueInfo;
  schedule: EventSchedule;
  eligibility: EventEligibility;
  participation: EventParticipationConfig;
  points_reward: PointsRewardConfig;
  resources: EventResources;
  stats: EventStats;
  banner_url?: string;
  submission_config?: import("@/types/event-matrix").SubmissionConfigSchema;
  winners?: EventWinner[];
  status: EventStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type EventSummary = Pick<EventDocument,
  "id" | "slug" | "title" | "description" | "event_type" | "track" |
  "format" | "schedule" | "venue_info" | "stats" | "banner_url" | "status"
>;
