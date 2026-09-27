import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../.test-build/lib/api.js";

test("events and details come from the authenticated API", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => url.includes("/events/event-real")
      ? { id: "event-real", title: "Actual event" }
      : { events: [{ id: "event-real", title: "Actual event" }], total: 1 } };
  };
  try {
    const list = await api.listEvents("member-token", { limit: 100 });
    const detail = await api.getEvent("event-real", "member-token");
    assert.equal(list.events[0].id, detail.id);
    assert.match(calls[0].url, /\/events\?limit=100$/);
    assert.match(calls[1].url, /\/events\/event-real$/);
    assert.ok(calls.every((call) => call.init.headers.Authorization === "Bearer member-token"));
  } finally { globalThis.fetch = originalFetch; }
});

test("registration and feedback use server mutations", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ status: "registered" }) };
  };
  try {
    await api.registerForEvent("member-token", "event-real", { team_name: "Test team", member_uids: ["uid-2"] });
    await api.submitEventFeedback("member-token", "event-real", {
      rating_content: 5, rating_organization: 4, rating_overall: 5, is_anonymous: false,
    });
    assert.equal(calls[0].init.method, "POST");
    assert.equal(JSON.parse(calls[0].init.body).team_name, "Test team");
    assert.match(calls[0].url, /\/events\/event-real\/register$/);
    assert.equal(JSON.parse(calls[1].init.body).rating_overall, 5);
    assert.match(calls[1].url, /\/events\/event-real\/feedback$/);
  } finally { globalThis.fetch = originalFetch; }
});

test("admin merit awards use the member ID and the contribution contract", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ id: "award-1" }) };
  };
  try {
    await api.adminAwardContribution("admin-token", "member-1", {
      track: "misc", category: "project_work", title: "Project milestone",
      points: 25, description: "Reviewed milestone", occurred_at: "2026-09-27T00:00:00.000Z",
    });
    assert.match(calls[0].url, /\/contributions\/award\/user\/member-1$/);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(JSON.parse(calls[0].init.body).category, "project_work");
  } finally { globalThis.fetch = originalFetch; }
});
