import type { Metadata } from "next";
import AdminClient from "../AdminClient";

export const metadata: Metadata = {
  title: "Ticket Console | Reinforce Club Admin",
  description: "Review member requests, bug reports, and SPG registrations.",
};

export default function AdminTicketsPage() {
  return <AdminClient initialTab="tickets" />;
}
