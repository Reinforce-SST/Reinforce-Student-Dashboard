/**
 * Event data types and repositories strictly adhering to server/app/schemas/events.py
 */

export type EventTrack = "research" | "product" | "kaggle" | "misc" | "all";
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

export const allEvents: EventDocument[] = [
  {
    id: "evt_hacksprint_v3",
    slug: "reinforce-hacksprint-v3",
    title: "Reinforce HackSprint v3.0",
    description: "48-Hour flagship club sprint targeting autonomous agents, distributed ML pipelines, and multimodal products.",
    detailed_info: `
### Overview
Reinforce HackSprint v3.0 is the club's premier autumn sprint. Build end-to-end prototypes, fine-tune models, or formulate research propositions across Research, Product, and Kaggle tracks.

### Track Challenges
1. **Research Track (Red)**: Novel multi-agent reinforcement learning architectures, sample-efficient policy exploration, or fast inference kernels.
2. **Product Track (Green)**: Developer tools, decentralized compute agents, or LLM-native workflow applications.
3. **Kaggle Track (Blue)**: Multimodal video temporal grounding benchmark solutions.

### Schedule & Checkpoints
- **Day 1 (18:00 IST)**: Problem statement reveal & team check-in at Guild Main Lab.
- **Day 2 (12:00 IST)**: Mid-sprint architecture reviews with executive leads.
- **Day 3 (18:00 IST)**: Final project demonstrations & ledger merit award ceremony.
    `.trim(),
    event_type: "Hackathon",
    track: "all",
    format: "hybrid",
    venue_info: {
      venue_name: "Guild Main Lab",
      room: "Building C, Floor 3 & Discord Stage",
      meeting_url: "https://discord.gg/reinforce-sst",
    },
    schedule: {
      start_time: "2025-09-10T18:00:00+05:30",
      end_time: "2025-09-12T18:00:00+05:30",
      duration_minutes: 2880,
      registration_deadline: "2025-09-09T23:59:00+05:30",
    },
    eligibility: {
      access_scope: "open_to_all",
      allowed_years: [1, 2, 3, 4],
      allowed_tiers: ["beginner", "advanced", "all"],
      allowed_tracks: ["research", "product", "kaggle", "all"],
      custom_note: "Teams must have 2 to 4 members. Inter-batch collaboration encouraged.",
      is_mandatory: false,
    },
    participation: {
      mode: "team",
      min_team_size: 2,
      max_team_size: 4,
      max_participants: 120,
      requires_event_spg: true,
      spg_auto_disband_days: 7,
    },
    points_reward: {
      attendance_points: 50,
      track: "all",
    },
    resources: {
      slides_url: "https://reinforce-sst.org/resources/hacksprint-v3-brief.pdf",
      discord_thread_id: "thread_hacksprint_v3",
      writeup_url: "https://github.com/reinforce-sst/hacksprint-templates",
    },
    stats: {
      registered_count: 88,
      checked_in_count: 76,
      feedback_count: 34,
      average_rating: 4.9,
    },
    banner_url: "/banners/orientation-2026.png",
    status: "published",
    created_by: "admin_julian",
    created_at: "2025-08-20T10:00:00Z",
    updated_at: "2025-09-01T12:00:00Z",
  },
  {
    id: "evt_multi_agent_rl",
    slug: "multi-agent-rl-advanced-deep-dive",
    title: "Multi-Agent RL Advanced Deep Dive",
    description: "Hands-on architectural masterclass on value-factorization, MAPPO, and decentralized swarm control.",
    detailed_info: `
### What You Will Learn
- Centralized Training with Decentralized Execution (CTDE) frameworks.
- Deep dive into MAPPO (Multi-Agent PPO) and QMIX architectures.
- Simulating 100+ agent environments in Isaac Gym and PettingZoo.
- Benchmarking inference latency on RTX 4090 clusters.
    `.trim(),
    event_type: "Workshop",
    track: "research",
    format: "online",
    venue_info: {
      venue_name: "Virtual Discord Stage",
      meeting_url: "https://discord.gg/reinforce-sst",
    },
    schedule: {
      start_time: "2025-09-12T10:30:00+05:30",
      end_time: "2025-09-12T13:00:00+05:30",
      duration_minutes: 150,
      registration_deadline: "2025-09-12T09:00:00+05:30",
    },
    eligibility: {
      access_scope: "open_to_all",
      allowed_years: [1, 2, 3, 4],
      allowed_tiers: ["beginner", "advanced", "all"],
      allowed_tracks: ["research", "all"],
      is_mandatory: false,
    },
    participation: {
      mode: "solo",
      min_team_size: 1,
      max_team_size: 1,
      max_participants: 60,
      requires_event_spg: false,
      spg_auto_disband_days: 1,
    },
    points_reward: {
      attendance_points: 30,
      track: "research",
    },
    resources: {
      slides_url: "https://reinforce-sst.org/slides/marl-masterclass.pdf",
      discord_thread_id: "thread_marl_deepdive",
      writeup_url: "https://github.com/reinforce-sst/marl-tutorial-notebooks",
    },
    stats: {
      registered_count: 48,
      checked_in_count: 42,
      feedback_count: 28,
      average_rating: 4.95,
    },
    banner_url: "/banners/night-club.jpg",
    status: "published",
    created_by: "lead_research",
    created_at: "2025-08-25T10:00:00Z",
    updated_at: "2025-09-02T12:00:00Z",
  },
  {
    id: "evt_founders_office_hours",
    slug: "founders-weekly-office-hours",
    title: "Founders Weekly Office Hours",
    description: "Open product critique, technical roadmap discussions, and SPG incubation clinic with core leads.",
    detailed_info: `
### Agenda
- Pitch new SPG project concepts or request mentorship.
- Get unblocked on GPU infrastructure, API credits, and cluster allocations.
- Direct feedback from executive leads and alumni advisors.
    `.trim(),
    event_type: "Meetup",
    track: "product",
    format: "offline",
    venue_info: {
      venue_name: "Building C",
      room: "Room 402 (Founders Studio)",
    },
    schedule: {
      start_time: "2025-09-15T16:00:00+05:30",
      end_time: "2025-09-15T17:30:00+05:30",
      duration_minutes: 90,
    },
    eligibility: {
      access_scope: "members_only",
      allowed_years: [1, 2, 3, 4],
      allowed_tiers: ["beginner", "advanced", "all"],
      allowed_tracks: ["all"],
      is_mandatory: false,
    },
    participation: {
      mode: "solo",
      min_team_size: 1,
      max_team_size: 1,
      max_participants: 30,
      requires_event_spg: false,
      spg_auto_disband_days: 1,
    },
    points_reward: {
      attendance_points: 15,
      track: "product",
    },
    resources: {},
    stats: {
      registered_count: 18,
      checked_in_count: 18,
      feedback_count: 12,
      average_rating: 4.8,
    },
    banner_url: "/banners/8198583.jpg",
    status: "published",
    created_by: "lead_product",
    created_at: "2025-08-28T10:00:00Z",
    updated_at: "2025-09-03T12:00:00Z",
  },
  {
    id: "evt_kaggle_fireside",
    slug: "kaggle-grandmaster-fireside-chat",
    title: "Kaggle Grandmaster Fireside Chat",
    description: "Special session with top competition winners on ensembling strategies, CV folds, and feature engineering.",
    detailed_info: `
### Guest Speakers & Topics
- Competition winning playbooks from Kaggle Grandmasters.
- Handling massive multimodal video datasets without out-of-memory errors.
- Live Q&A and SPG team strategy breakdown.
    `.trim(),
    event_type: "Fireside Chat",
    track: "kaggle",
    format: "online",
    venue_info: {
      venue_name: "Discord Stage Live",
      meeting_url: "https://discord.gg/reinforce-sst",
    },
    schedule: {
      start_time: "2025-09-18T20:00:00+05:30",
      end_time: "2025-09-18T21:30:00+05:30",
      duration_minutes: 90,
    },
    eligibility: {
      access_scope: "open_to_all",
      allowed_years: [1, 2, 3, 4],
      allowed_tiers: ["beginner", "advanced", "all"],
      allowed_tracks: ["kaggle", "all"],
      is_mandatory: false,
    },
    participation: {
      mode: "solo",
      min_team_size: 1,
      max_team_size: 1,
      max_participants: 150,
      requires_event_spg: false,
      spg_auto_disband_days: 1,
    },
    points_reward: {
      attendance_points: 25,
      track: "kaggle",
    },
    resources: {
      discord_thread_id: "thread_kaggle_fireside",
    },
    stats: {
      registered_count: 114,
      checked_in_count: 98,
      feedback_count: 45,
      average_rating: 4.98,
    },
    banner_url: "/banners/night-club.jpg",
    status: "published",
    created_by: "lead_kaggle",
    created_at: "2025-08-30T10:00:00Z",
    updated_at: "2025-09-04T12:00:00Z",
  },
  {
    id: "evt_deploying_llms",
    slug: "deploying-llms-with-vllm-triton",
    title: "Deploying LLMs with vLLM & Triton",
    description: "Production deep-dive into PagedAttention, continuous batching, and writing custom Triton kernel operators.",
    detailed_info: `
### Workshop Modules
1. Memory overhead of autoregressive decoding & KV-cache bottlenecks.
2. Implementing custom Triton kernels for FlashAttention v2.
3. Setting up high-throughput vLLM inference server behind FastAPI.
    `.trim(),
    event_type: "Workshop",
    track: "research",
    format: "offline",
    venue_info: {
      venue_name: "Guild Lab A",
      room: "Room 102",
    },
    schedule: {
      start_time: "2025-09-21T09:00:00+05:30",
      end_time: "2025-09-21T12:00:00+05:30",
      duration_minutes: 180,
    },
    eligibility: {
      access_scope: "members_only",
      allowed_years: [2, 3, 4],
      allowed_tiers: ["advanced"],
      allowed_tracks: ["research", "product"],
      is_mandatory: false,
    },
    participation: {
      mode: "solo",
      min_team_size: 1,
      max_team_size: 1,
      max_participants: 40,
      requires_event_spg: false,
      spg_auto_disband_days: 1,
    },
    points_reward: {
      attendance_points: 35,
      track: "research",
    },
    resources: {
      slides_url: "https://reinforce-sst.org/slides/vllm-triton-workshop.pdf",
      writeup_url: "https://github.com/reinforce-sst/triton-vllm-guide",
    },
    stats: {
      registered_count: 40,
      checked_in_count: 40,
      feedback_count: 31,
      average_rating: 4.96,
    },
    banner_url: "/banners/orientation-2026.png",
    status: "published",
    created_by: "lead_research",
    created_at: "2025-09-01T10:00:00Z",
    updated_at: "2025-09-05T12:00:00Z",
  },
];
