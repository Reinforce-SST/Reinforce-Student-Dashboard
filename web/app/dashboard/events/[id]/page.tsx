import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allEvents } from "@/lib/eventsData";
import EventDetailClient from "./EventDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = allEvents.find((e) => e.id === id || e.slug === id);

  if (!event) {
    return {
      title: "Event Details · Reinforce SST",
    };
  }

  return {
    title: `${event.title} · Reinforce SST`,
    description: event.description,
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = allEvents.find((e) => e.id === id || e.slug === id) || allEvents[0];

  if (!event) {
    notFound();
  }

  return <EventDetailClient event={event} />;
}
