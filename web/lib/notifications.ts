import type { ContributionRecord } from "./contributionData";
import type { EventSummaryItem, TicketSummary } from "./api";
import { getDashboardEvents } from "./dashboardData";

export type MemberNotification = {
  key: string;
  title: string;
  description: string;
  href: string;
  timestamp: string;
};

function validTime(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/** Recent changes to the member's own records, not invented notification data. */
export function memberUpdates(tickets: TicketSummary[], contributions: ContributionRecord[]): MemberNotification[] {
  const updates: MemberNotification[] = [];
  for (const ticket of tickets) {
    const updated = validTime(ticket.updated_at);
    const created = validTime(ticket.created_at);
    if (ticket.status === "open" && (updated === null || created === null || updated <= created)) continue;
    const timestamp = ticket.updated_at || ticket.created_at;
    if (validTime(timestamp) === null) continue;
    const status = ticket.status === "in_progress" ? "In progress" : ticket.status === "resolved" ? "Resolved" : ticket.status === "closed" ? "Closed" : "Open";
    updates.push({
      key: `ticket:${ticket.id}:${ticket.status}:${timestamp}`,
      title: "Ticket updated",
      description: `${ticket.title} · ${status}`,
      href: `/dashboard/tickets/${encodeURIComponent(ticket.id)}`,
      timestamp: timestamp!,
    });
  }
  for (const contribution of contributions) {
    if (contribution.status !== "approved" && contribution.status !== "rejected" && contribution.status !== "revoked") continue;
    const timestamp = contribution.status === "revoked" ? contribution.revoked_at : contribution.reviewed_at;
    if (validTime(timestamp) === null) continue;
    updates.push({
      key: `contribution:${contribution.id}:${contribution.status}:${timestamp}`,
      title: `Contribution ${contribution.status}`,
      description: contribution.title,
      href: "/profile#contribution-history",
      timestamp: timestamp!,
    });
  }
  return updates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);
}

export function upcomingEventNotices(events: EventSummaryItem[], now: Date): MemberNotification[] {
  const weekEnd = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  return getDashboardEvents(events, now).upcoming
    .filter(event => {
      const start = validTime(event.schedule.start_time);
      return start !== null && start >= now.getTime() && start <= weekEnd;
    })
    .slice(0, 5)
    .map(event => ({
      key: `event:${event.id}:${event.schedule.start_time}`,
      title: event.title,
      description: "Upcoming club event",
      href: `/dashboard/events/${encodeURIComponent(event.slug || event.id)}`,
      timestamp: event.schedule.start_time,
    }));
}
