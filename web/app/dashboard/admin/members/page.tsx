import type { Metadata } from "next";
import AdminClient from "../AdminClient";

export const metadata: Metadata = {
  title: "Member Directory | Reinforce Club Admin",
  description: "Directory of club members, roles, batches, and administrative privileges.",
};

export default function AdminMembersPage() {
  return <AdminClient initialTab="members" />;
}
