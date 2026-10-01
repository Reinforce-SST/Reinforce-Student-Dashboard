import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../.test-build/lib/api.js";

test("creating a ticket sends it to the authenticated API", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ id: "tkt_real", category: "support", title: "Help", status: "open" }) };
  };
  try {
    const created = await api.createTicket("member-token", {
      category: "support", title: "Help", fields: { Subject: "Help" },
    });
    assert.equal(created.id, "tkt_real");
    assert.match(request.url, /\/tickets$/);
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.headers.Authorization, "Bearer member-token");
    assert.equal(JSON.parse(request.init.body).title, "Help");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ticket detail is fetched from the API with its real fields", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ id: "tkt_real", category: "support", title: "Help", status: "open", fields: { Subject: "Help" } }),
  });
  try {
    const ticket = await api.ticketDetail("member-token", "tkt_real");
    assert.deepEqual(ticket.fields, { Subject: "Help" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin ticket filters map to the server's query parameters", async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(new URL(url));
    return { ok: true, json: async () => ({ total: 0, items: [] }) };
  };
  try {
    await api.adminGetAllTickets("admin-token", 2, {
      category: "support", status: "open", priority: "urgent", assignedTo: "admin-1",
    });
    await api.adminGetAllTickets("admin-token");
    const [filtered, unfiltered] = urls;
    assert.equal(filtered.searchParams.get("page"), "2");
    assert.equal(filtered.searchParams.get("category"), "support");
    assert.equal(filtered.searchParams.get("status"), "open");
    assert.equal(filtered.searchParams.get("priority"), "urgent");
    // The server names this assigned_to_uid, not assignedTo.
    assert.equal(filtered.searchParams.get("assigned_to_uid"), "admin-1");
    assert.deepEqual([...unfiltered.searchParams.keys()].sort(), ["page", "page_size"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
