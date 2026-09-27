import type { Metadata } from "next";
import EventDetailLoader from "./EventDetailLoader";

export const metadata: Metadata = {
  title: "Event Details · Reinforce SST",
};

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventDetailLoader eventId={id} />;
}
