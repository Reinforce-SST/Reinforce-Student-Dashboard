/**
 * Fixture records for the end-to-end suite.
 *
 * These mirror the shapes in lib/api.ts, lib/spgData.ts and
 * lib/contributionData.ts, which in turn mirror server/app/schemas. They exist
 * only at the network boundary: no production module imports this file.
 *
 * Dates are fixed so assertions about ordering and "upcoming" windows cannot
 * drift. `nowIso` is the clock the suite pins the browser to.
 */

export const NOW_ISO = "2026-10-01T09:00:00.000Z";
const day = 86_400_000;
const from = (offsetDays: number) => new Date(Date.parse(NOW_ISO) + offsetDays * day).toISOString();

export const MEMBER_TOKEN = "e2e-member-token";
export const REFRESHED_TOKEN = "e2e-member-token-refreshed";
export const LINK_TOKEN = "A".repeat(43);

export const memberProfile = {
  id: "member-1",
  email: "member@sst.scaler.com",
  full_name: "Review Member",
  avatar_url: null,
  discord_id: "123456789012345678",
  discord_link_version: 1,
  is_verified: true,
  is_admin: false,
  is_member: true,
  tier: "advanced" as const,
  role_label: "Member",
  batch_year: 2028,
  bio: "Works on retrieval evaluation.",
  points: { total: 240, kaggle: 80, product: 60, research: 100, misc: 0 },
  skills: ["Python", "PyTorch"],
  social_links: { github: "https://github.com/review-member" },
  created_at: from(-300),
  updated_at: from(-2),
  last_login: NOW_ISO,
};

export const adminProfile = {
  ...memberProfile,
  id: "admin-1",
  email: "core@sst.scaler.com",
  full_name: "Core Admin",
  is_admin: true,
  role_label: "Core",
};

export const ticket = {
  id: "ticket-1",
  category: "resource_request",
  title: "Compute access for our image-classification project",
  status: "in_progress",
  created_by: { discord_id: memberProfile.discord_id, username: "Review Member" },
  assigned_to: null,
  created_at: from(-8),
  updated_at: from(-1),
  thread_url: "https://discord.com/channels/123456/234567",
};

export const ticketDetail = {
  ...ticket,
  description: "Request submitted through Discord.",
  fields: { "Resources Requested": "A shared GPU session to test our model." },
};

/** The javascript: URL must never render as a link. */
export const ticketMessages = [
  {
    id: "message-1",
    sender_name: "Review Member",
    sender_role: "user",
    content: "The model is ready for a training run.",
    attachments: ["https://example.com/progress.png", "javascript:alert(1)"],
    timestamp: from(-1),
  },
  {
    id: "message-2",
    sender_name: "Core Admin",
    sender_role: "admin",
    content: "Approved. A shared session is reserved for you this week.",
    attachments: [],
    timestamp: from(-1),
  },
];

export const article = {
  id: "article-1",
  slug: "evaluating-retrieval",
  title: "Evaluating retrieval without a gold set",
  summary: "How we scored our retriever when nobody had labelled the corpus.",
  cover_image_url: null,
  tags: ["research", "evaluation"],
  reading_time_minutes: 7,
  published_at: from(-5),
  stats: { upvote_count: 12, comment_count: 3, view_count: 140 },
};

export const articleDetail = { ...article, content: "## Method\n\nWe bootstrapped a judgement set." };

export const idea = {
  id: "idea-1",
  title: "Course-feedback clustering",
  description: "Group free-text course feedback into themes the faculty can act on.",
  track: "research",
  difficulty: "intermediate",
  is_verified: true,
  stats: { upvote_count: 9, views_count: 60, claims_count: 1 },
  created_at: from(-12),
  approved_at: from(-10),
  status: "approved",
};

export const pendingIdea = {
  ...idea,
  id: "idea-2",
  title: "Mess-queue forecasting",
  description: "Predict peak mess hours from card-swipe logs.",
  is_verified: false,
  approved_at: null,
  status: "pending",
};

export const ideaDetail = {
  ...idea,
  prerequisites: ["Python", "scikit-learn"],
  rough_roadmap: ["Collect feedback export", "Cluster", "Review with faculty"],
  learning_outcomes: ["Topic modelling", "Qualitative validation"],
  updated_at: from(-10),
};

const schedule = (startOffset: number) => ({
  start_time: from(startOffset),
  end_time: from(startOffset + 0.1),
  duration_minutes: 120,
  registration_deadline: from(startOffset - 1),
});

export const upcomingEvent = {
  id: "event-1",
  slug: "paper-reading-week-10",
  title: "Paper reading: scaling laws",
  description: "We read and argue about one paper, together, in person.",
  event_type: "workshop",
  track: "research",
  format: "offline",
  schedule: schedule(3),
  venue_info: { venue_name: "SST Campus", room: "Seminar Hall 2", meeting_url: null },
  stats: { registered_count: 18, checked_in_count: 0, feedback_count: 0, average_rating: 0 },
  banner_url: null,
  status: "published",
};

export const pastEvent = {
  ...upcomingEvent,
  id: "event-2",
  slug: "kaggle-sprint",
  title: "Kaggle sprint debrief",
  schedule: schedule(-14),
  stats: { registered_count: 31, checked_in_count: 27, feedback_count: 9, average_rating: 4.4 },
  status: "completed",
};

export const eventDetail = {
  ...upcomingEvent,
  detailed_info: "Bring the paper annotated. We start on time.",
  eligibility: { access_scope: "members", is_mandatory: false },
  participation: { mode: "solo" as const, max_participants: 40 },
  points_reward: { attendance_points: 10, track: "research" },
  resources: { recording_url: null, slides_url: null, writeup_url: null },
  created_by: adminProfile.id,
  created_at: from(-20),
  updated_at: from(-2),
};

export const eventRegistration = {
  id: "registration-1",
  event_id: upcomingEvent.id,
  user_id: memberProfile.id,
  team_name: null,
  member_uids: [memberProfile.id],
  status: "registered" as const,
  registered_at: from(-1),
  user_profile: {
    id: memberProfile.id,
    full_name: memberProfile.full_name,
    email: memberProfile.email,
    batch_year: memberProfile.batch_year,
    tier: memberProfile.tier,
    points: memberProfile.points.total,
  },
};

export const spg = {
  id: "spg-1",
  name: "Retrieval evaluation group",
  description: "Building a judgement set for Indian-language retrieval.",
  type: "project" as const,
  track: "research" as const,
  visibility: "public" as const,
  status: "active" as const,
  lead_id: memberProfile.id,
  lead_name: memberProfile.full_name,
  member_ids: [memberProfile.id, "member-2"],
  member_names: { [memberProfile.id]: memberProfile.full_name, "member-2": "Second Member" },
  is_recruiting: true,
  recruiting_roles: ["Annotator"],
  created_at: from(-40),
  updated_at: from(-3),
  report_count: 2,
};

export const spgReport = {
  id: "report-1",
  spg_id: spg.id,
  report_type: "progress" as const,
  report_format: "form" as const,
  heading: "Week 9 progress",
  short_description: "Annotation guidelines finished.",
  sequence_number: 2,
  summary: "We finished the guidelines and annotated 200 queries.",
  milestones: ["Guidelines v1", "200 queries annotated"],
  blockers: "We need one more annotator.",
  next_steps: "Annotate the remaining 300 queries.",
  submitted_by: memberProfile.id,
  submitter_name: memberProfile.full_name,
  submitted_at: from(-3),
  status: "verified" as const,
  verified_by: adminProfile.id,
  verified_at: from(-2),
};

export const contribution = {
  id: "contribution-1",
  user_id: memberProfile.id,
  title: "Led the retrieval evaluation group",
  description: "Ran the group for a full term.",
  track: "research",
  points: 100,
  status: "approved",
  created_at: from(-30),
  reviewed_at: from(-28),
};

export const leaderboardRows = [
  { id: memberProfile.id, full_name: memberProfile.full_name, points: 240, track: "research", batch_year: 2028, rank: 1 },
  { id: "member-2", full_name: "Second Member", points: 180, track: "kaggle", batch_year: 2027, rank: 2 },
];

export const directoryRows = [
  { id: memberProfile.id, full_name: memberProfile.full_name, email: memberProfile.email, is_verified: true, is_member: true, is_admin: false, batch_year: 2028, tier: "advanced", points: memberProfile.points, skills: memberProfile.skills, social_links: {} },
  { id: "member-2", full_name: "Second Member", email: "second@sst.scaler.com", is_verified: true, is_member: true, is_admin: false, batch_year: 2027, tier: "beginner", points: { total: 180, kaggle: 180, product: 0, research: 0, misc: 0 }, skills: ["SQL"], social_links: {} },
];
