import type { Metadata } from "next";
import AdminClient from "../AdminClient";

export const metadata: Metadata = {
  title: "Club Events | Reinforce Club Admin",
  description: "Create, publish, and edit Reinforce Club events and competitions.",
};

export default function AdminEventsPage() {
  return <AdminClient initialTab="events" />;
}
