import type { Metadata } from "next";
import AdminClient from "../AdminClient";

export const metadata: Metadata = {
  title: "Dashboard Banners | Reinforce Club Admin",
  description: "Configure hero banners and announcements for the student dashboard.",
};

export default function AdminBannersPage() {
  return <AdminClient initialTab="banners" />;
}
