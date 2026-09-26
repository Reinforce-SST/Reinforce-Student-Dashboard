import type { Metadata } from "next";
import ProfileClient from "../../profile/ProfileClient";

export const metadata: Metadata = {
  title: "Member Profile · Reinforce SST",
  description: "Your Reinforce Student Profile, skills, links, and audited contribution ledger.",
};

export default function Page() {
  return <ProfileClient />;
}
