import type { Metadata } from "next";
import AdminSpgDetailClient from "./AdminSpgDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Admin SPG Audit (${id}) | Reinforce Club`,
    description: `Administrative audit and management console for SPG ${id}.`,
  };
}

export default async function AdminSpgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminSpgDetailClient spgId={id} />;
}
