"use client";

import { useEffect, useState } from "react";
import { api, type EventDocument } from "@/lib/api";
import { useMember } from "@/lib/useMember";
import EventDetailClient from "./EventDetailClient";

export default function EventDetailLoader({ eventId }: { eventId: string }) {
  const { token } = useMember();
  const [event, setEvent] = useState<EventDocument | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    api.getEvent(eventId, token).then((result) => {
      if (active) { setEvent(result); setError(""); }
    }).catch(() => { if (active) setError("Event details could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, eventId, retry]);

  if (loading) return <main>Loading event…</main>;
  if (error || !event) return <main role="alert">{error || "Event not found."} <button type="button" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>Retry</button></main>;
  return <EventDetailClient event={event} />;
}
