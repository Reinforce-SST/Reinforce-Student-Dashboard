import type { EventSummaryItem } from "./api";

const visibleStatuses = new Set(["published", "registration_closed", "ongoing"]);

export function getDashboardEvents(events: EventSummaryItem[], now: Date) {
  const visible = events.filter((event) => {
    if (!visibleStatuses.has(event.status)) return false;
    const start = new Date(event.schedule.start_time).getTime();
    if (!Number.isFinite(start)) return false;
    if (start >= now.getTime()) return true;
    if (event.status !== "ongoing") return false;
    const end = event.schedule.end_time ? new Date(event.schedule.end_time).getTime() : null;
    return end === null || (Number.isFinite(end) && end >= now.getTime());
  }).sort((a, b) => new Date(a.schedule.start_time).getTime() - new Date(b.schedule.start_time).getTime());

  return {
    banners: visible.filter((event) => event.event_type.toLowerCase().includes("banner")),
    upcoming: visible.filter((event) => !event.event_type.toLowerCase().includes("banner")),
  };
}

export function isBannerDestination(value: string): boolean {
  if (!value || value.length > 2048 || /[\s\\]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (!value.startsWith("https://") || value.startsWith("https:///")) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function getBannerPresentation(event: Pick<EventSummaryItem,
  "id" | "slug" | "event_type" | "banner_badge_text" | "banner_cta_text" | "banner_cta_url">) {
  const destination = event.banner_cta_url?.trim();
  return {
    badge: event.banner_badge_text?.trim() || event.event_type.toUpperCase(),
    ctaText: event.banner_cta_text?.trim() || "Explore Event →",
    ctaLink: destination && isBannerDestination(destination)
      ? destination
      : `/dashboard/events/${event.slug || event.id}`,
  };
}

export function indiaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function indiaDateKey(date: Date) {
  const { year, month, day } = indiaDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
