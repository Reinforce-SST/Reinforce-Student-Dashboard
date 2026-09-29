import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../.test-build/lib/api.js";

test("discovery reads use the published endpoints without a member token", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return { ok: true, json: async () => ({ items: [], total: 0, has_more: false }) };
  };

  try {
    await api.listArticles("ml", 2);
    await api.listIdeas("agents", 1);
    assert.match(requests[0].url, /\/blogs\?page=2&page_size=20&search=ml$/);
    assert.match(requests[1].url, /\/ideas\?page=1&page_size=20&search=agents$/);
    assert.equal(requests[0].init.headers.Authorization, undefined);
    assert.equal(requests[1].init.headers.Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("idea submission and ticket status changes use member and admin authentication", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return { ok: true, json: async () => ({ id: "saved" }) };
  };

  try {
    await api.createIdea("member-token", { title: "A new project", description: "Build it", track: "research" });
    await api.adminUpdateTicketStatus("admin-token", "tkt_one", "in_progress");
    assert.match(requests[0].url, /\/ideas$/);
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.headers.Authorization, "Bearer member-token");
    assert.match(requests[1].url, /\/tickets\/tkt_one\/status$/);
    assert.equal(requests[1].init.method, "PATCH");
    assert.equal(requests[1].init.headers.Authorization, "Bearer admin-token");
    assert.deepEqual(JSON.parse(requests[1].init.body), { status: "in_progress" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
