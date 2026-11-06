import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../.test-build/lib/api.js";

test("listing banners constructs proper status and limit query parameters", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, json: async () => ({ banners: [{ id: "b1", title: "Banner 1" }], total: 1 }) };
  };
  try {
    const res = await api.listBanners("sample-token", { status: "active", limit: 10 });
    assert.equal(res.total, 1);
    assert.equal(res.banners[0].id, "b1");
    assert.match(calls[0].url, /\/banners\?status=active&limit=10$/);
    assert.equal(calls[0].init.headers.Authorization, "Bearer sample-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin banner CRUD operations hit corresponding endpoints with proper auth and payload", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, json: async () => ({ id: "banner-100", title: "Created Banner" }) };
  };
  try {
    // Create
    await api.adminCreateBanner("admin-token", {
      title: "Hackathon Banner",
      target_event_id: "evt-hackathon",
      custom_url: "/dashboard/events/evt-hackathon",
      status: "active",
    });

    // Update (PUT)
    await api.adminUpdateBanner("admin-token", "banner-100", {
      title: "Updated Hackathon Banner",
      custom_url: "/dashboard/events/evt-hackathon-v2",
    });

    // Delete
    await api.adminDeleteBanner("admin-token", "banner-100");

    assert.match(calls[0].url, /\/banners$/);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.Authorization, "Bearer admin-token");
    assert.equal(JSON.parse(calls[0].init.body).title, "Hackathon Banner");

    assert.match(calls[1].url, /\/banners\/banner-100$/);
    assert.equal(calls[1].init.method, "PUT");
    assert.equal(JSON.parse(calls[1].init.body).title, "Updated Hackathon Banner");

    assert.match(calls[2].url, /\/banners\/banner-100$/);
    assert.equal(calls[2].init.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
