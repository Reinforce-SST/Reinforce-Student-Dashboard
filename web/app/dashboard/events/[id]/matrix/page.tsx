import type { Metadata } from "next";
import EventMatrixClient from "./EventMatrixClient";

export const metadata: Metadata = {
  title: "Event Matrix · Reinforce SST",
  description: "Dynamic operational matrix, live attendance roll-call, and custom evaluation records.",
};

export default async function EventMatrixPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventMatrixClient eventId={id} />;
}
