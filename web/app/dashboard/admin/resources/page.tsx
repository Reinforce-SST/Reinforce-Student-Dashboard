import type { Metadata } from "next";
import AdminClient from "../AdminClient";

export const metadata: Metadata = {
  title: "Learning Resources | Reinforce Club Admin",
  description: "Curate learning roadmaps, tutorials, papers, and tracks.",
};

export default function AdminResourcesPage() {
  return <AdminClient initialTab="resources" />;
}
