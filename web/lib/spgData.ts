/**
 * SPG (Student Project Group) typed data models
 * strictly matching server/app/schemas/spgs.py and server/app/schemas/spg_reports.py
 */

export type SPGType = "learning" | "project" | "event" | "external_event" | "miscellaneous";
export type SPGTrack = "kaggle" | "product" | "research" | "general";
export type SPGVisibility = "public" | "private";
export type SPGStatus = "active" | "paused" | "completed" | "disbanded";

export interface SPGRecord {
  id: string;
  name: string;
  description?: string;
  type: SPGType;
  track: SPGTrack;
  visibility: SPGVisibility;
  status: SPGStatus;
  lead_id: string;
  lead_name?: string;
  member_ids: string[];
  member_names?: Record<string, string>;
  is_recruiting: boolean;
  recruiting_roles: string[];
  event_id?: string;
  is_event_derived?: boolean;
  idea_id?: string;
  is_idea_derived?: boolean;
  proposition_document_url?: string;
  source_ticket_id?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  report_count: number;
  milestone_ids?: string[];
  milestone_count?: number;
}

export type SPGReportType = "progress" | "final";
export type SPGReportFormat = "form" | "pdf";
export type SPGReportStatus = "pending" | "verified";

export interface SPGReportRecord {
  id: string;
  spg_id: string;
  report_type: SPGReportType;
  report_format: SPGReportFormat;
  heading: string;
  short_description: string;
  sequence_number: number;
  pdf_url?: string;
  summary?: string;
  milestones: string[];
  blockers?: string;
  next_steps?: string;
  submitted_by: string;
  submitter_name?: string;
  submitted_at: string;
  status: SPGReportStatus;
  verified_by?: string;
  verified_at?: string;
}

export interface SPGFormReportSubmission {
  heading: string;
  short_description: string;
  report_type: SPGReportType;
  summary: string;
  milestones: string[];
  blockers?: string;
  next_steps?: string;
}

export interface SPGSubmilestone {
  id: string;
  title: string;
  is_completed: boolean;
  completed_at?: string | null;
}

export interface SPGMilestone {
  id: string;
  spg_id: string;
  title: string;
  description?: string | null;
  is_completed: boolean;
  completed_at?: string | null;
  order: number;
  submilestones: SPGSubmilestone[];
  created_at?: string;
  updated_at?: string;
}

export interface SPGMilestoneCreate {
  title: string;
  description?: string;
  order?: number;
}

export interface SPGMilestoneUpdate {
  title?: string;
  description?: string;
  is_completed?: boolean;
  order?: number;
}

export interface SPGSubmilestoneCreate {
  title: string;
}
