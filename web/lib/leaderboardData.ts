/**
 * Leaderboard & Member Directory data types adhering to server/app/schemas/users.py
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

export const fallbackMembers: StudentProfile[] = [];
