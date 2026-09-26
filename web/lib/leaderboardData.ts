/**
 * Leaderboard & Member Directory data types and fallback repository
 * adhering to server/app/schemas/users.py
 */

import { type StudentProfile, type TrackPoints, type MemberTier } from "./api";

export interface LeaderboardEntry {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  is_member: boolean;
  tier: MemberTier;
  points: TrackPoints;
  rank: number;
}

export interface LeaderboardResponse {
  track: string;
  total: number;
  entries: LeaderboardEntry[];
}

export interface UserListResponse {
  items: StudentProfile[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export const fallbackMembers: StudentProfile[] = [
  {
    id: "usr_julian_chen",
    email: "julian.chen@sst.scaler.com",
    full_name: "Julian Chen",
    avatar_url: null,
    discord_id: "982347102938471203",
    is_verified: true,
    discord_link_version: 1,
    verified_at: "2025-08-01T12:00:00Z",
    is_admin: true,
    is_member: true,
    tier: "advanced",
    batch_year: 2023,
    bio: "Lead RL Researcher & SPG Founder. Specializing in Multi-Agent PPO and continuous batching kernels.",
    points: {
      total: 1850,
      research: 1100,
      product: 450,
      kaggle: 200,
      misc: 100,
    },
    skills: ["PyTorch", "Multi-Agent RL", "CUDA", "FastAPI", "Distributed Training"],
    social_links: {
      github: "https://github.com/julianchen-ai",
      kaggle: "https://kaggle.com/julianchen",
      discord: "julian_rl",
      linkedin: "https://linkedin.com/in/julianchen",
    },
    created_at: "2025-06-15T10:00:00Z",
  },
  {
    id: "usr_ananya_kumar",
    email: "ananya.kumar@sst.scaler.com",
    full_name: "Ananya Kumar",
    avatar_url: null,
    discord_id: "873910293847102938",
    is_verified: true,
    discord_link_version: 1,
    verified_at: "2025-08-05T14:30:00Z",
    is_admin: false,
    is_member: true,
    tier: "advanced",
    batch_year: 2023,
    bio: "Kaggle Grandmaster candidate & LLM Benchmarking lead. Optimized Triton kernels for FlashAttention v2.",
    points: {
      total: 1620,
      research: 320,
      product: 200,
      kaggle: 1050,
      misc: 50,
    },
    skills: ["Kaggle Competitions", "Triton Kernels", "vLLM", "Pandas", "Ensemble Modeling"],
    social_links: {
      github: "https://github.com/ananyak-ai",
      kaggle: "https://kaggle.com/ananyakumar",
      discord: "ananya_ml",
      linkedin: "https://linkedin.com/in/ananyakumar",
    },
    created_at: "2025-06-20T11:00:00Z",
  },
  {
    id: "usr_maya_sen",
    email: "maya.sen@sst.scaler.com",
    full_name: "Maya Sen",
    avatar_url: null,
    discord_id: "761928374650192837",
    is_verified: true,
    discord_link_version: 1,
    verified_at: "2025-08-10T09:00:00Z",
    is_admin: false,
    is_member: true,
    tier: "advanced",
    batch_year: 2024,
    bio: "Product Lead for P2P GPU Brokerage. Building decentralized infrastructure for autonomous agent clusters.",
    points: {
      total: 1480,
      research: 280,
      product: 980,
      kaggle: 120,
      misc: 100,
    },
    skills: ["Rust", "WASM", "P2P Networking", "TypeScript", "Next.js", "Solidity"],
    social_links: {
      github: "https://github.com/mayasen-dev",
      kaggle: "https://kaggle.com/mayasen",
      discord: "maya_product",
      linkedin: "https://linkedin.com/in/mayasen",
    },
    created_at: "2025-07-01T10:00:00Z",
  },
  {
    id: "usr_rohan_das",
    email: "rohan.das@sst.scaler.com",
    full_name: "Rohan Das",
    avatar_url: null,
    discord_id: "650192837461928374",
    is_verified: true,
    discord_link_version: 1,
    verified_at: "2025-08-12T16:00:00Z",
    is_admin: false,
    is_member: true,
    tier: "beginner",
    batch_year: 2024,
    bio: "Hardware-in-the-loop and Quantum simulations enthusiast. Micro-ROS firmware engineer for SwarmRL.",
    points: {
      total: 1150,
      research: 720,
      product: 280,
      kaggle: 100,
      misc: 50,
    },
    skills: ["C++", "Micro-ROS", "STM32", "Embedded Systems", "Qiskit"],
    social_links: {
      github: "https://github.com/rohandas-hw",
      discord: "rohan_das",
    },
    created_at: "2025-07-10T14:00:00Z",
  },
  {
    id: "usr_tanya_levine",
    email: "tanya.levine@sst.scaler.com",
    full_name: "Tanya Levine",
    avatar_url: null,
    discord_id: "549102938471029384",
    is_verified: true,
    discord_link_version: 1,
    verified_at: "2025-08-15T18:00:00Z",
    is_admin: false,
    is_member: true,
    tier: "advanced",
    batch_year: 2023,
    bio: "Computer Vision & Temporal Grounding Specialist. Winner of the Autumn Kaggle Sprint v2.",
    points: {
      total: 980,
      research: 240,
      product: 140,
      kaggle: 550,
      misc: 50,
    },
    skills: ["PyTorch Video", "YOLOv10", "CLIP", "HuggingFace", "OpenCV"],
    social_links: {
      github: "https://github.com/tanyalevine-cv",
      kaggle: "https://kaggle.com/tanyalevine",
      discord: "tanya_cv",
    },
    created_at: "2025-07-15T12:00:00Z",
  },
  {
    id: "usr_karthik_v",
    email: "karthik.v@sst.scaler.com",
    full_name: "Karthik Verma",
    avatar_url: null,
    discord_id: "438291029384710293",
    is_verified: true,
    discord_link_version: 1,
    verified_at: "2025-08-20T10:00:00Z",
    is_admin: false,
    is_member: true,
    tier: "beginner",
    batch_year: 2025,
    bio: "First-year AI enthusiast experimenting with LoRA fine-tuning and retrieval-augmented generation.",
    points: {
      total: 720,
      research: 180,
      product: 360,
      kaggle: 140,
      misc: 40,
    },
    skills: ["Python", "LangChain", "FastAPI", "Vector Databases", "Docker"],
    social_links: {
      github: "https://github.com/karthik-verma",
      discord: "karthik_v",
    },
    created_at: "2025-08-01T09:00:00Z",
  },
];
