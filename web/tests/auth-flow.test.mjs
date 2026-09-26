import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleSignIn, readLink } from '../.test-build/auth-flow.js';

test('deliberately closing the popup stays on the page even when its message says popup', async () => {
  const result = await googleSignIn(async () => { throw { code: 'auth/popup-closed-by-user', message: 'Firebase: Error (auth/popup-closed-by-user).' }; });
  assert.deepEqual(result, { phase: 'idle', error: '' });
});
test('blocked popup gives an actionable error without starting another sign-in', async () => {
  let calls = 0;
  const result = await googleSignIn(async () => { calls++; throw { code: 'auth/popup-blocked' }; });
  assert.equal(calls, 1);
  assert.equal(result.phase, 'error');
  assert.match(result.error, /allow popups/i);
});
test('a private token is accepted from YUVI query links or older fragment links', () => {
  assert.deepEqual(readLink('#link_token=' + 'A'.repeat(43), ''), { token: 'A'.repeat(43), invalid: false });
  assert.deepEqual(readLink('', '?link_token=' + 'B'.repeat(43)), { token: 'B'.repeat(43), invalid: false });
  assert.deepEqual(readLink('', '?discord_id=123456'), { token: null, invalid: true });
  assert.deepEqual(readLink('', '?link_token=123'), { token: null, invalid: true });
  assert.deepEqual(readLink('#link_token=123', ''), { token: null, invalid: true });
});
