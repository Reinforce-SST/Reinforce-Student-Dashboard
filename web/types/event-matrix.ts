/**
 * Event Matrix TypeScript types.
 * Strictly mirrors the backend Pydantic schemas in server/app/schemas/events.py.
 */

export type MatrixColumnType = "text" | "number" | "object";

export interface CustomFieldSchema {
  field_id: string;
  label: string;
  field_type: "text" | "select" | "boolean" | "url";
  options?: string[] | null;
  required: boolean;
  applies_to: "individual" | "team";
  sync_to_matrix: boolean;
}

export interface EventTrackSchema {
  track_id: string;
  name: string;
  description?: string | null;
  max_teams?: number | null;
}

export interface TeamSettingsSchema {
  allow_team_creation: boolean;
  require_join_approval: boolean;
  allow_solo_pool: boolean;
  lock_rosters_at?: string | null;
  auto_convert_to_spg: boolean;
}

export interface TimelineItemSchema {
  id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time?: string | null;
  location_or_link?: string | null;
  is_submission_deadline: boolean;
  status_override?: "upcoming" | "live" | "completed" | null;
}

export interface EventSubmissionPayload {
  repo_url?: string | null;
  slides_url?: string | null;
  demo_url?: string | null;
  paper_link?: string | null;
  notes?: string | null;
}

export type MatrixSchemaType =
  | "submission"
  | "role_assignment"
  | "feedback"
  | "contribution_assignment"
  | "spg_assignment"
  | "idea_jar_assignment";

export interface MatrixColumnDef {
  column_id: string;
  title: string;
  column_type: MatrixColumnType;
  object_schema_type?: MatrixSchemaType | null;
}

export interface SubmissionObject {
  schema_type: "submission";
  repo_url?: string | null;
  paper_link?: string | null;
  score?: number | null;
}

export interface RoleAssignmentObject {
  schema_type: "role_assignment";
  role_title: string;
  team_name?: string | null;
  is_lead?: boolean;
}

export interface FeedbackObject {
  schema_type: "feedback";
  rating: number; // 1 to 5
  notes?: string | null;
}

export interface ContributionAssignmentObject {
  schema_type: "contribution_assignment";
  category: string;
  track: string;
  points: number;
  title?: string | null;
  description?: string | null;
}

export interface SPGAssignmentObject {
  schema_type: "spg_assignment";
  spg_id?: string | null;
  spg_name: string;
  spg_status?: string | null;
  role?: string | null;
}

export interface IdeaJarAssignmentObject {
  schema_type: "idea_jar_assignment";
  idea_id?: string | null;
  idea_title: string;
  track?: string | null;
  spg_id?: string | null;
  spg_name?: string | null;
}

export type MatrixObjectPayload =
  | SubmissionObject
  | RoleAssignmentObject
  | FeedbackObject
  | ContributionAssignmentObject
  | SPGAssignmentObject
  | IdeaJarAssignmentObject;

export interface MatrixRowHydrated {
  user_id: string;
  user_name: string;
  email: string;
  avatar_url?: string | null;
  batch_year?: number | null;
  team_name?: string | null;
  rsvp_status: string;
  attendance: string;
  cells: Record<string, string | number | MatrixObjectPayload | null>;
}

export interface VolunteerProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
  batch_year?: number | null;
}

export interface EventMatrixResponse {
  event_id: string;
  event_title: string;
  is_admin: boolean;
  has_edit_access: boolean;
  matrix_is_public?: boolean;
  matrix_is_pinned?: boolean;
  volunteer_uids: string[];
  volunteer_profiles: VolunteerProfile[];
  event_spgs?: Array<{ id: string; name: string; status?: string; lead_id?: string; member_ids?: string[]; idea_id?: string }>;
  approved_ideas?: Array<{ id: string; title: string; track?: string; description?: string }>;
  columns: MatrixColumnDef[];
  rows: MatrixRowHydrated[];
}

export interface MatrixSettingsUpdatePayload {
  matrix_is_public?: boolean;
  matrix_is_pinned?: boolean;
}

export interface CreateMatrixColumnPayload {
  title: string;
  column_type: MatrixColumnType;
  object_schema_type?: MatrixSchemaType | null;
}

export interface UpdateMatrixCellPayload {
  user_id: string;
  column_id: string;
  value: string | number | MatrixObjectPayload | null;
}

export interface MatrixAttendanceUpdatePayload {
  user_id: string;
  status: string;
  attendance_note?: string | null;
  award_points?: boolean;
}

export interface BatchUpdateMatrixPayload {
  cells?: UpdateMatrixCellPayload[];
  attendance?: MatrixAttendanceUpdatePayload[];
}
