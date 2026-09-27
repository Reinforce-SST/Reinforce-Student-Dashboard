import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../.test-build/lib/api.js";
import { loadAllSpgs, loadAllUpcomingEvents } from "../.test-build/lib/memberData.js";

test("project-group listing follows every cursor, including an empty visible page", async () => {
  const original = api.listSpgs;
  const calls = [];
  api.listSpgs = async (token, params) => {
    calls.push({ token, params });
    if (!params.cursor) return { items: [{ id: "spg-1" }], next_cursor: "spg-1" };
    if (params.cursor === "spg-1") return { items: [], next_cursor: "spg-2" };
    return { items: [{ id: "spg-3" }], next_cursor: null };
  };
  try {
    const groups = await loadAllSpgs("member-token", "research");
    assert.deepEqual(groups.map((group) => group.id), ["spg-1", "spg-3"]);
    assert.deepEqual(calls.map((call) => call.params.cursor), [undefined, "spg-1", "spg-2"]);
    assert.ok(calls.every((call) => call.token === "member-token" && call.params.limit === 100 && call.params.track === "research"));
  } finally { api.listSpgs = original; }
});

test("upcoming event listing loads later API pages", async () => {
  const original = api.listEvents;
  const pages = [];
  api.listEvents = async (_token, params) => {
    pages.push(params.page);
    return params.page === 1
      ? { events: [{ id: "event-1" }], total: 2 }
      : { events: [{ id: "event-2" }], total: 2 };
  };
  try {
    const events = await loadAllUpcomingEvents("member-token");
    assert.deepEqual(events.map((event) => event.id), ["event-1", "event-2"]);
    assert.deepEqual(pages, [1, 2]);
  } finally { api.listEvents = original; }
});
