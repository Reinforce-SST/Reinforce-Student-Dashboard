import type { Metadata } from "next";
import AdminClient from "../AdminClient";

export const metadata: Metadata = {
  title: "Idea Jar Review | Reinforce Club Admin",
  description: "Moderate student submitted ideas and approve them for club collaboration.",
};

export default function AdminIdeasPage() {
  return <AdminClient initialTab="ideas" />;
}
