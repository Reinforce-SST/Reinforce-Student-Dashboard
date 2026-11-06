import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../.test-build/lib/api.js";

test("invitation queries and responses call expected invitation endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, json: async () => [{ id: "inv-1", status: "pending" }] };
  };
  try {
    const myInvs = await api.listMyInvitations("user-token", "pending", "event_team");
    assert.equal(myInvs.length, 1);
    assert.match(calls[0].url, /\/invitations\/me\?status=pending&type=event_team$/);
    assert.equal(calls[0].init.headers.Authorization, "Bearer user-token");

    await api.listTargetInvitations("user-token", "spg-123", "pending");
    assert.match(calls[1].url, /\/invitations\/target\/spg-123\?status=pending$/);

    await api.acceptInvitation("user-token", "inv-1");
    assert.match(calls[2].url, /\/invitations\/inv-1\/accept$/);
    assert.equal(calls[2].init.method, "POST");

    await api.declineInvitation("user-token", "inv-1");
    assert.match(calls[3].url, /\/invitations\/inv-1\/decline$/);
    assert.equal(calls[3].init.method, "POST");

    await api.cancelInvitation("user-token", "inv-1");
    assert.match(calls[4].url, /\/invitations\/inv-1$/);
    assert.equal(calls[4].init.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
