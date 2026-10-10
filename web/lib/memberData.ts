import { api, type EventSummaryItem } from "./api";
import type { SPGRecord } from "./spgData";

export type SpgQueryFilters = {
  track?: string;
  status?: string;
  type?: string;
  event_id?: string;
};

export async function loadAllSpgs(
  token: string,
  filterOrTrack?: string | SpgQueryFilters
): Promise<SPGRecord[]> {
  const params: SpgQueryFilters =
    typeof filterOrTrack === "string" ? { track: filterOrTrack } : filterOrTrack || {};
  const items: SPGRecord[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await api.listSpgs(token, { ...params, limit: 100, cursor });
    items.push(...page.items);
    if (!page.next_cursor) break;
    if (cursors.has(page.next_cursor)) throw new Error("Project group pagination did not advance.");
    cursor = page.next_cursor;
    cursors.add(cursor);
  } while (cursor);
  return items;
}

export async function loadAllUpcomingEvents(token: string): Promise<EventSummaryItem[]> {
  const first = await api.listEvents(token, { timeline: "upcoming", limit: 100, page: 1 });
  const events = [...first.events];
  for (let page = 2; events.length < first.total; page += 1) {
    const next = await api.listEvents(token, { timeline: "upcoming", limit: 100, page });
    if (next.events.length === 0) break;
    events.push(...next.events);
  }
  return events;
}

export async function loadAllEvents(token: string): Promise<EventSummaryItem[]> {
  const first = await api.listEvents(token, { limit: 100, page: 1 });
  const events = [...first.events];
  for (let page = 2; events.length < first.total; page += 1) {
    const next = await api.listEvents(token, { limit: 100, page });
    if (next.events.length === 0) break;
    events.push(...next.events);
  }
  return events;
}
