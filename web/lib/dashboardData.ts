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
