import type { Metadata } from "next";
import AdminClient from "../AdminClient";

export const metadata: Metadata = {
  title: "Merit Auditing | Reinforce Club Admin",
  description: "Review pending contributions and award merit points to club members.",
};

export default function AdminContributionsPage() {
  return <AdminClient initialTab="contributions" />;
}
