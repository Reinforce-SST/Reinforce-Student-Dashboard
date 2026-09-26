import LeaderboardClient from "./LeaderboardClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard & Member Directory — Reinforce Club",
  description: "Explore top ranking members, track achievements across Research, Product, and Kaggle tracks, and browse member profiles.",
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}

