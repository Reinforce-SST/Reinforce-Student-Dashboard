import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../.test-build/lib/api.js';

test('public profile requests use the approved-only contribution route', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ items: [], next_cursor: null }) };
  };
  try {
    const page = await api.getPublicUserContributions('member-token', 'uid_other', 100);
    assert.deepEqual(page.items, []);
    assert.match(request.url, /\/contributions\/public\/user\/uid_other\?limit=100$/);
    assert.equal(request.init.headers.Authorization, 'Bearer member-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
