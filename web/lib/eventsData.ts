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
