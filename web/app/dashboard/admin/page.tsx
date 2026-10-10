import type { Metadata } from "next";
import AdminClient from "./AdminClient";

export const metadata: Metadata = {
  title: "Admin Console | Reinforce Club",
  description: "Administrative console for managing events, banners, SPGs, tickets, and student club operations.",
};

export default function AdminPage() {
  return <AdminClient />;
}
