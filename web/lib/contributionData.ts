/**
 * Contribution schema types and category index adhering strictly to:
 * server/app/schemas/contributions.py
 */

import { type IconName } from "@/components/dashboard/MemberIcon";

export type ContributionCategory =
  | "achievement"
  | "project_work"
  | "teaching"
  | "mentorship"
  | "content"
  | "organizing"
  | "service"
  | "participation"
  | "other";

export type ContributionTrack = "kaggle" | "product" | "research" | "misc";

export type ContributionSourceType = "project" | "blog" | "trophy_item";

export type ContributionStatus = "pending" | "approved" | "rejected" | "revoked";

export interface ContributionSource {
  type: ContributionSourceType;
  id: string;
}

export interface ContributionRecord {
  id: string;
  schema_version?: number;
  user_id: string;
  spg_id?: string | null;
  track: ContributionTrack;
  category: ContributionCategory;
  title: string;
  description?: string | null;
  points: number;
  source?: ContributionSource | null;
  event_id?: string | null;
  occurred_at: string;
  status: ContributionStatus;
  recorded_by: string;
  created_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  revoked_by?: string | null;
  revoked_at?: string | null;
  status_reason?: string | null;
  deduplication_key?: string | null;
}

export interface ContributionPage {
  items: ContributionRecord[];
  next_cursor?: string | null;
}

export interface CategoryMetadata {
  category: ContributionCategory;
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: IconName;
  description: string;
}

/**
 * Category Color Index & Palette:
 * - Achievement: Reinforce-Gold/Yellow (#E5B731)
 * - Participation: Sky Blue (#38BDF8)
 * - Project Work: Emerald Mint (#34D399)
 * - Teaching: Warm Amber / Orange (#FB923C)
 * - Mentorship: Rose / Crimson (#F43F5E)
 * - Content: Lavender / Purple (#A78BFA)
 * - Organizing: Fuchsia / Violet (#E879F9)
 * - Service: Cyan / Teal (#2DD4BF)
 * - Other: Slate Grey (#94A3B8)
 */
export const CONTRIBUTION_CATEGORY_INDEX: Record<ContributionCategory, CategoryMetadata> = {
  achievement: {
    category: "achievement",
    label: "Achievement",
    color: "#E5B731",
    bg: "rgba(229, 183, 49, 0.14)",
    border: "rgba(229, 183, 49, 0.35)",
    icon: "award",
    description: "Competitions, hackathons, Kaggle medals, grants, and external accolades.",
  },
  participation: {
    category: "participation",
    label: "Participation",
    color: "#38BDF8",
    bg: "rgba(56, 189, 248, 0.14)",
    border: "rgba(56, 189, 248, 0.35)",
    icon: "flame",
    description: "Active attendance, workshops, reading groups, and hackathon participation.",
  },
  project_work: {
    category: "project_work",
    label: "Project Work",
    color: "#34D399",
    bg: "rgba(52, 211, 153, 0.14)",
    border: "rgba(52, 211, 153, 0.35)",
    icon: "rocket",
    description: "Shipping SPG features, open-source repositories, model checkpoints, and tools.",
  },
  teaching: {
    category: "teaching",
    label: "Teaching",
    color: "#FB923C",
    bg: "rgba(251, 146, 60, 0.14)",
    border: "rgba(251, 146, 60, 0.35)",
    icon: "lightning",
    description: "Conducting technical bootcamps, lecture series, and hands-on coding labs.",
  },
  mentorship: {
    category: "mentorship",
    label: "Mentorship",
    color: "#F43F5E",
    bg: "rgba(244, 63, 94, 0.14)",
    border: "rgba(244, 63, 94, 0.35)",
    icon: "users",
    description: "Guiding junior SPGs, architecture reviews, and 1-on-1 code debugging sessions.",
  },
  content: {
    category: "content",
    label: "Content",
    color: "#A78BFA",
    bg: "rgba(167, 139, 250, 0.14)",
    border: "rgba(167, 139, 250, 0.35)",
    icon: "articles",
    description: "Publishing research papers, technical deep-dives, benchmark reports, and blogs.",
  },
  organizing: {
    category: "organizing",
    label: "Organizing",
    color: "#E879F9",
    bg: "rgba(232, 121, 249, 0.14)",
    border: "rgba(232, 121, 249, 0.35)",
    icon: "shield",
    description: "Leading club initiatives, managing hackathon logistics, speaker outreach, and venues.",
  },
  service: {
    category: "service",
    label: "Service",
    color: "#2DD4BF",
    bg: "rgba(45, 212, 191, 0.14)",
    border: "rgba(45, 212, 191, 0.35)",
    icon: "check",
    description: "Infrastructure maintenance, GPU cluster administration, and Discord moderation.",
  },
  other: {
    category: "other",
    label: "Other",
    color: "#94A3B8",
    bg: "rgba(148, 163, 184, 0.14)",
    border: "rgba(148, 163, 184, 0.35)",
    icon: "filter",
    description: "General club support, ad-hoc contributions, and miscellaneous verified tasks.",
  },
};

export const ALL_CATEGORIES: ContributionCategory[] = [
  "achievement",
  "project_work",
  "teaching",
  "content",
  "organizing",
  "mentorship",
  "participation",
  "service",
  "other",
];

/**
 * Category Hierarchy ranked by weight, impact, and priority in Reinforce Club:
 * 1. Achievement (50-100+ pts) - External medals, grants, hackathon victories (Rank 1 - Gold)
 * 2. Project Work (30-60 pts) - Direct SPG code contributions, model hub releases (Rank 2 - Emerald)
 * 3. Teaching (25-45 pts) - Leading bootcamps, workshops, hands-on coding labs (Rank 3 - Warm Amber)
 * 4. Content (20-40 pts) - Peer-reviewed articles, research write-ups, study guides (Rank 4 - Lavender)
 * 5. Organizing (20-40 pts) - Club summits, hackathon coordination, guest speaker outreach (Rank 5 - Fuchsia)
 * 6. Mentorship (15-30 pts) - 1-on-1 architecture reviews, junior debugging assistance (Rank 6 - Rose)
 * 7. Participation (10-25 pts) - Active attendance, reading group discussion (Rank 7 - Sky Blue)
 * 8. Service (10-25 pts) - GPU cluster maintenance, infra DevOps, bot administration (Rank 8 - Cyan)
 * 9. Other (5-20 pts) - Ad-hoc verified club tasks & logistics (Rank 9 - Slate)
 */
export const CATEGORY_HIERARCHY: {
  category: ContributionCategory;
  rank: number;
  tier: "High Impact" | "Core Engineering" | "Knowledge & Leadership" | "Community & Service" | "Support";
  typicalPoints: string;
}[] = [
  { category: "achievement", rank: 1, tier: "High Impact", typicalPoints: "50–100+ pts" },
  { category: "project_work", rank: 2, tier: "Core Engineering", typicalPoints: "30–60 pts" },
  { category: "teaching", rank: 3, tier: "Knowledge & Leadership", typicalPoints: "25–45 pts" },
  { category: "content", rank: 4, tier: "Knowledge & Leadership", typicalPoints: "20–40 pts" },
  { category: "organizing", rank: 5, tier: "Knowledge & Leadership", typicalPoints: "20–40 pts" },
  { category: "mentorship", rank: 6, tier: "Knowledge & Leadership", typicalPoints: "15–30 pts" },
  { category: "participation", rank: 7, tier: "Community & Service", typicalPoints: "10–25 pts" },
  { category: "service", rank: 8, tier: "Community & Service", typicalPoints: "10–25 pts" },
  { category: "other", rank: 9, tier: "Support", typicalPoints: "5–20 pts" },
];

/**
 * Activity Heatmap Intensity Levels Hierarchy:
 * - Level 4: 50+ pts (Peak Saturated Glow)
 * - Level 3: 30-49 pts (High Saturated Color)
 * - Level 2: 15-29 pts (Moderate Vibrant Color)
 * - Level 1: 1-14 pts (Subtle Soft Tint)
 * - Level 0: 0 pts (Inactive Charcoal)
 */
export const ACTIVITY_INTENSITY_LEVELS = [
  {
    level: 4,
    label: "Level 4 (Peak Activity)",
    points: "50+ pts",
    description: "Major competitive achievements, Kaggle medals, core releases & grant milestones.",
  },
  {
    level: 3,
    label: "Level 3 (High Activity)",
    points: "30–49 pts",
    description: "Technical workshops hosted, substantial SPG milestones, core architecture deliveries.",
  },
  {
    level: 2,
    label: "Level 2 (Moderate Activity)",
    points: "15–29 pts",
    description: "Mentorship sessions, milestone PR reviews, hackathon checkpoint completions.",
  },
  {
    level: 1,
    label: "Level 1 (Foundational Activity)",
    points: "1–14 pts",
    description: "Weekly reading group syncs, community discussions, cluster maintenance, minor bug fixes.",
  },
  {
    level: 0,
    label: "Level 0 (Inactive)",
    points: "0 pts",
    description: "No verified contributions recorded on this day.",
  },
] as const;

export const CATEGORY_RANK_MAP: Record<ContributionCategory, number> = {
  achievement: 1,  // Gold (#E5B731) - Rank 1 (Top Honor)
  project_work: 2, // Emerald (#34D399) - Rank 2 (Core Engineering)
  teaching: 3,     // Warm Amber (#FB923C) - Rank 3 (Knowledge Transfer)
  content: 4,      // Lavender (#A78BFA) - Rank 4 (Research & Writing)
  organizing: 5,   // Fuchsia (#E879F9) - Rank 5 (Leadership)
  mentorship: 6,   // Rose (#F43F5E) - Rank 6 (Guidance)
  participation: 7,// Sky Blue (#38BDF8) - Rank 7 (Engagement)
  service: 8,      // Cyan (#2DD4BF) - Rank 8 (Service & Maintenance, below Participation)
  other: 9,        // Slate (#94A3B8) - Rank 9 (Support)
};

/**
 * Returns the dominant category with the highest priority according to the club hierarchy.
 */
export function getDominantCategory(categories: ContributionCategory[]): ContributionCategory | null {
  if (!categories || categories.length === 0) return null;
  let highest = categories[0];
  let minRank = CATEGORY_RANK_MAP[highest] ?? 99;
  for (let i = 1; i < categories.length; i++) {
    const cat = categories[i];
    const rank = CATEGORY_RANK_MAP[cat] ?? 99;
    if (rank < minRank) {
      minRank = rank;
      highest = cat;
    }
  }
  return highest;
}

export function getCategoryConfig(category?: string | null): CategoryMetadata {
  if (category && category in CONTRIBUTION_CATEGORY_INDEX) {
    return CONTRIBUTION_CATEGORY_INDEX[category as ContributionCategory];
  }
  return CONTRIBUTION_CATEGORY_INDEX.other;
}

/**
 * Dynamic Heatmap Cell Styling based on the contribution category in the hierarchy and level intensity:
 * - Level 0: Inactive charcoal (#18181d)
 * - Level 1: Subtle alpha tint of category color
 * - Level 2: Moderate tint of category color
 * - Level 3: Strong vibrant category color with border
 * - Level 4: Full saturated category color with intense glowing shadow
 */
export function getHeatmapCellStyle(
  category?: ContributionCategory | null,
  level: number = 0
): { background: string; border: string; boxShadow?: string } {
  if (level === 0 || !category) {
    return {
      background: "#18181d",
      border: "1px solid #202026",
    };
  }

  const config = getCategoryConfig(category);
  const color = config.color;

  switch (level) {
    case 4:
      return {
        background: color,
        border: `1px solid ${color}`,
        boxShadow: `0 0 10px ${color}88`,
      };
    case 3:
      return {
        background: `${color}cc`,
        border: `1px solid ${color}`,
        boxShadow: `0 0 5px ${color}40`,
      };
    case 2:
      return {
        background: `${color}80`,
        border: `1px solid ${color}b3`,
      };
    case 1:
    default:
      return {
        background: `${color}40`,
        border: `1px solid ${color}66`,
      };
  }
}

export function getTrackColor(track?: string | null): { color: string; bg: string; label: string } {
  switch (track) {
    case "research":
      return { color: "#F87171", bg: "rgba(248, 113, 113, 0.12)", label: "RESEARCH" };
    case "product":
      return { color: "#4ADE80", bg: "rgba(74, 222, 128, 0.12)", label: "PRODUCT" };
    case "kaggle":
      return { color: "#38BDF8", bg: "rgba(56, 189, 248, 0.12)", label: "KAGGLE" };
    case "misc":
    default:
      return { color: "#E5B731", bg: "rgba(229, 183, 49, 0.12)", label: "COMMUNITY" };
  }
}

/**
 * Realistic Demo Contributions dataset covering all 9 Categories
 * to showcase the contribution workflow, color index, and badge layout.
 */
export const demoContributions: ContributionRecord[] = [
  {
    id: "cnt_achieve_01",
    user_id: "usr_demo",
    track: "kaggle",
    category: "achievement",
    title: "Kaggle Multimodal Video Grounding Silver Medal (Top 2%)",
    description: "Achieved silver medal rank among 1,400+ international teams with a custom temporal cross-attention vision-language transformer.",
    points: 75,
    source: { type: "trophy_item", id: "trophy_kaggle_silver_2025" },
    occurred_at: "2025-09-20T14:30:00Z",
    status: "approved",
    recorded_by: "admin_yuvi_bot",
    created_at: "2025-09-20T14:35:00Z",
    reviewed_by: "admin_lead",
    reviewed_at: "2025-09-20T15:00:00Z",
  },
  {
    id: "cnt_project_02",
    user_id: "usr_demo",
    spg_id: "SP-1 Autonomous Drone Swarms",
    track: "research",
    category: "project_work",
    title: "Shipped Distributed Multi-Agent RL Collision Avoidance Policy v2.1",
    description: "Implemented asynchronous PPO gradient sync on 4x A100 GPUs and published benchmark checkpoints to the club model hub.",
    points: 50,
    source: { type: "project", id: "spg_drone_swarms" },
    occurred_at: "2025-09-14T18:00:00Z",
    status: "approved",
    recorded_by: "admin_lead",
    created_at: "2025-09-14T18:10:00Z",
    reviewed_by: "admin_lead",
    reviewed_at: "2025-09-14T18:30:00Z",
  },
  {
    id: "cnt_participate_03",
    user_id: "usr_demo",
    track: "misc",
    category: "participation",
    title: "Active Participation: SST GenAI HackSprint 48-Hour Challenge",
    description: "Built and pitched a real-time retrieval agent pipeline; completed all 4 checkpoint milestones during the club hackathon.",
    points: 25,
    event_id: "evt_hacksprint_2025",
    occurred_at: "2025-09-08T20:00:00Z",
    status: "approved",
    recorded_by: "admin_lead",
    created_at: "2025-09-08T20:15:00Z",
    reviewed_by: "admin_lead",
    reviewed_at: "2025-09-08T21:00:00Z",
  },
  {
    id: "cnt_teaching_04",
    user_id: "usr_demo",
    track: "research",
    category: "teaching",
    title: "Conducted Workshop: PyTorch Distributed Data Parallel (DDP) & FSDP",
    description: "Led an intensive 3-hour live coding lab for 50+ students on multi-GPU tensor sharding, gradient communication, and torchrun.",
    points: 40,
    event_id: "evt_ddp_workshop_2025",
    occurred_at: "2025-08-28T16:00:00Z",
    status: "approved",
    recorded_by: "admin_lead",
    created_at: "2025-08-28T16:20:00Z",
    reviewed_by: "admin_lead",
    reviewed_at: "2025-08-28T17:00:00Z",
  },
  {
    id: "cnt_mentorship_05",
    user_id: "usr_demo",
    spg_id: "SP-3 Embedded Edge AI",
    track: "product",
    category: "mentorship",
    title: "1-on-1 Architecture Mentorship for Freshman SPG Team",
    description: "Reviewed ONNX quantization pipelines, TensorRT optimization profiles, and memory bottlenecks across 4 weekly review sessions.",
    points: 30,
    occurred_at: "2025-08-18T11:00:00Z",
    status: "approved",
    recorded_by: "admin_lead",
    created_at: "2025-08-18T11:30:00Z",
    reviewed_by: "admin_lead",
    reviewed_at: "2025-08-18T12:00:00Z",
  },
  {
    id: "cnt_content_06",
    user_id: "usr_demo",
    track: "research",
    category: "content",
    title: "Technical Article: Custom Triton Kernels for FlashAttention-2 Tuning",
    description: "Published a peer-reviewed technical deep dive on GPU memory hierarchy, block-level tiling, and fused kernel optimization.",
    points: 35,
    source: { type: "blog", id: "art_triton_kernels_2025" },
    occurred_at: "2025-08-05T10:00:00Z",
    status: "approved",
    recorded_by: "admin_lead",
    created_at: "2025-08-05T10:15:00Z",
    reviewed_by: "admin_lead",
    reviewed_at: "2025-08-05T11:00:00Z",
  },
  {
    id: "cnt_organizing_07",
    user_id: "usr_demo",
    track: "misc",
    category: "organizing",
    title: "Coordinated Reinforce AI Summit Keynote & Industry Guest Panel",
    description: "Managed speaker coordination, technical track scheduling, and live stream infrastructure for 200+ campus attendees.",
    points: 35,
    event_id: "evt_ai_summit_2025",
    occurred_at: "2025-07-22T19:00:00Z",
    status: "approved",
    recorded_by: "admin_lead",
    created_at: "2025-07-22T19:30:00Z",
    reviewed_by: "admin_lead",
    reviewed_at: "2025-07-22T20:00:00Z",
  },
  {
    id: "cnt_service_08",
    user_id: "usr_demo",
    track: "product",
    category: "service",
    title: "Cluster Sysadmin: Deployed Slurm Workload Queue & GPU Metrics Daemon",
    description: "Configured automated GPU node telemetry, user fair-share job scheduler, and Discord webhook alerting for the lab cluster.",
    points: 45,
    occurred_at: "2025-07-10T15:00:00Z",
    status: "approved",
    recorded_by: "admin_lead",
    created_at: "2025-07-10T15:20:00Z",
    reviewed_by: "admin_lead",
    reviewed_at: "2025-07-10T16:00:00Z",
  },
  {
    id: "cnt_other_09",
    user_id: "usr_demo",
    track: "misc",
    category: "other",
    title: "Curated Open-Source Reinforcement Learning Reading List & Benchmarks",
    description: "Assembled benchmark baseline comparisons, reproduction notebooks, and paper summaries for new club inductees.",
    points: 20,
    occurred_at: "2025-06-28T12:00:00Z",
    status: "approved",
    recorded_by: "admin_lead",
    created_at: "2025-06-28T12:15:00Z",
    reviewed_by: "admin_lead",
    reviewed_at: "2025-06-28T13:00:00Z",
  },
];
