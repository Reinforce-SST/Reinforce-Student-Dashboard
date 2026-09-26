import type { Metadata } from "next";
import SpgDetailClient from "./SpgDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `SPG Cluster · Reinforce SST`,
    description: `Special Project Group ${id} workspace and reports timeline.`,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SpgDetailClient spgId={id} />;
}
