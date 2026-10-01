import type { Metadata } from "next";
import IdeaJarClient from "./IdeaJarClient";

export const metadata: Metadata = {
  title: "Idea Jar & Proposals · Reinforce SST",
  description: "Browse high-impact project concepts, upvote community proposals, and form project groups.",
};

export default function Page() {
  return <IdeaJarClient />;
}
