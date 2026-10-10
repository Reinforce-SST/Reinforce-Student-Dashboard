import type { Metadata } from "next";
import AdminClient from "../AdminClient";

export const metadata: Metadata = {
  title: "Article Publisher | Reinforce Club Admin",
  description: "Publish club articles, research digests, and tech blogs.",
};

export default function AdminArticlesPage() {
  return <AdminClient initialTab="articles" />;
}
