import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, type EventDocument } from "@/lib/api";
import EventDetailClient from "./EventDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const event = await api.getEvent(id);
    if (event) {
      return {
        title: `${event.title} · Reinforce SST`,
        description: event.description,
      };
    }
  } catch {}

  return {
    title: "Event Details · Reinforce SST",
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let event: EventDocument | null = null;
  try {
    event = await api.getEvent(id);
  } catch (err) {
    notFound();
  }

  if (!event) {
    notFound();
  }

  return <EventDetailClient event={event} />;
}
