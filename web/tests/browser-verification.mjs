/** Run with Playwright MCP against the local dev server documented in verification.md.
 * Fixtures live only at the browser/network boundary, never in production code.
 */
export default async function verify(page) {
  const base = 'http://127.0.0.1:3107';
  const screenshots = '/home/laterabhi/reinforce-member-fixes/docs/screenshots';
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  await page.unrouteAll({ behavior: 'wait' });
  let profile = { email: 'review@sst.scaler.com', full_name: 'Review Member', discord_id: '123456789012345678', discord_link_version: 1, is_verified: true, skills: ['Python'], social_links: {} };
  let mode = 'ready';
  let saveFails = false;
  const linking = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const ticket = { id: 'review-ticket', category: 'resource_request', title: 'Compute access for our image-classification project', status: 'in_progress', created_by: { discord_id: profile.discord_id, username: 'Review Member' }, assigned_to: null, created_at: '2026-09-23T12:00:00Z', updated_at: '2026-09-24T12:00:00Z', thread_url: 'https://discord.com/channels/123456/234567' };
  await page.route('https://identitytoolkit.googleapis.com/**', route => route.fulfill({ json: { users: [{ localId: 'review-member', email: profile.email, emailVerified: true, displayName: 'Review Member', providerUserInfo: [{ providerId: 'google.com', rawId: 'review-member', email: profile.email }] }] } }));
  await page.route('http://localhost:8080/api/v1/**', async route => {
    const req = route.request();
    const path = req.url().split('?')[0];
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': base, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS' } });
    check(['Bearer local-review-token', 'Bearer local-review-token-refreshed'].includes(req.headers().authorization), 'API request lost Firebase credential');
    if (path.endsWith('/profile') && req.method() === 'PUT') {
      if (saveFails) return route.fulfill({ status: 503, json: { detail: 'Save temporarily unavailable' } });
      profile = { ...profile, ...req.postDataJSON() };
    }
    if (path.endsWith('/verify-discord')) {
      const body = req.postDataJSON();
      check(body.link_token === 'A'.repeat(43) && !body.discord_id, 'Linking did not use the private proof');
      linking.push(body);
      return route.fulfill({ json: { success: true, user: profile, bot_response: { status: 'bot_unreachable', detail: 'The bot could not confirm your role. Run /auth in Discord again to retry.' } } });
    }
    if (path.endsWith('/tickets')) {
      if (mode === 'error') return route.fulfill({ status: 503, json: { detail: 'Unavailable' } });
      return route.fulfill({ json: { linked: mode !== 'unlinked', tickets: mode === 'ready' ? [ticket] : [] } });
    }
    if (path.endsWith('/tickets/review-ticket')) return route.fulfill({ json: { ticket: { ...ticket, description: 'Request submitted through Discord.', fields: [{ label: 'Resources Requested', value: 'A shared GPU session to test our model.' }] }, messages: [{ id: 'message-1', sender_name: 'Review Member', sender_role: 'user', content: 'The model is ready for a training run.', attachments: ['https://example.com/progress.png', 'javascript:alert(1)'], timestamp: '2026-09-24T12:00:00Z' }] } });
    return route.fulfill({ json: { success: true, user: profile } });
  });
  await page.goto(base + '/auth');
  const now = Date.now();
  const user = { uid: 'review-member', email: profile.email, emailVerified: true, displayName: 'Review Member', isAnonymous: false, providerData: [{ providerId: 'google.com', uid: 'review-member', displayName: 'Review Member', email: profile.email, photoURL: null, phoneNumber: null }], stsTokenManager: { refreshToken: 'local-review-refresh', accessToken: 'local-review-token', expirationTime: now + 3600000 }, createdAt: String(now), lastLoginAt: String(now), apiKey: 'demo-member-review', appName: '[DEFAULT]' };
  await page.evaluate(async user => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('firebaseLocalStorageDb', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('firebaseLocalStorage', 'readwrite');
        tx.objectStore('firebaseLocalStorage').put({ fbase_key: 'firebase:authUser:demo-member-review:[DEFAULT]', value: user });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, user);
  const noOverflow = async () => check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
  const shot = async name => { await page.locator('img:visible').evaluateAll(images => Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; })))); await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' }); await page.screenshot({ path: `${screenshots}/${name}.png`, fullPage: true }); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/dashboard');
  await page.getByRole('heading', { name: 'Welcome, Review Member.' }).waitFor();
  await page.getByText(ticket.title).waitFor();
  await noOverflow();
  await shot('member-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow();
  await shot('member-mobile');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  check(await page.locator('dialog').evaluate(el => el.open), 'Drawer did not open');
  await shot('member-mobile-menu');
  await page.keyboard.press('Escape');
  check(!await page.locator('dialog').evaluate(el => el.open), 'Escape did not close drawer');
  check(await page.getByRole('button', { name: 'Open navigation' }).evaluate(el => el === document.activeElement), 'Focus did not return to Menu');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Your tickets', exact: true }).click();
  await page.getByRole('heading', { name: 'Your tickets', exact: true }).waitFor();
  check(!await page.locator('dialog').evaluate(el => el.open), 'Navigation left drawer open');
  await page.getByRole('link', { name: new RegExp(ticket.title) }).click();
  await page.getByRole('heading', { name: 'Conversation' }).waitFor();
  check(await page.getByRole('link', { name: /^Attachment/ }).count() === 1, 'Unsafe attachment was rendered');
  await noOverflow();
  await shot('ticket-mobile');
  await page.goto(base + '/profile');
  await page.getByLabel('Full name').fill('Draft awaiting token refresh');
  const refreshed = page.waitForResponse(response => response.url().endsWith('/auth/me') && response.request().headers().authorization === 'Bearer local-review-token-refreshed');
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('firebaseLocalStorageDb', 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('firebaseLocalStorage', 'readwrite');
        const store = tx.objectStore('firebaseLocalStorage');
        const item = store.get('firebase:authUser:demo-member-review:[DEFAULT]');
        item.onsuccess = () => {
          item.result.value.stsTokenManager.accessToken = 'local-review-token-refreshed';
          item.result.value.stsTokenManager.expirationTime = Date.now() + 3600000;
          store.put(item.result);
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  await refreshed;
  await page.getByLabel('Full name').waitFor();
  check(await page.getByLabel('Full name').inputValue() === 'Draft awaiting token refresh', 'Credential refresh discarded unsaved profile edits');
  await page.getByLabel('Full name').fill('Updated Member');
  await page.getByLabel('Skills, separated by commas').fill('Python, TypeScript');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByText('Profile saved.', { exact: true }).waitFor();
  check(profile.full_name === 'Updated Member' && profile.skills[1] === 'TypeScript', 'Profile was not persisted through API');
  await page.reload();
  await page.getByLabel('Full name').waitFor();
  check(await page.getByLabel('Full name').inputValue() === 'Updated Member', 'Profile did not survive reload');
  saveFails = true;
  await page.getByLabel('Full name').fill('Unsaved Member');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByRole('alert').filter({ hasText: 'Save temporarily unavailable' }).waitFor();
  check(profile.full_name === 'Updated Member', 'Failed save changed profile');
  await noOverflow();
  for (const value of ['empty', 'unlinked', 'error']) {
    mode = value;
    await page.goto(base + '/dashboard/tickets');
    const text = value === 'empty' ? 'No tickets yet' : value === 'unlinked' ? 'Verify your Discord account' : 'Tickets could not be loaded.';
    await page.getByText(text, { exact: value !== 'error' }).waitFor();
    await noOverflow();
  }
  mode = 'ready';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByText(ticket.title).waitFor();
  await page.goto(base + '/dashboard/events');
  await page.getByText('This area is not available on the website yet.', { exact: false }).waitFor();
  await page.goto(base + '/auth#link_token=' + 'A'.repeat(43));
  await page.getByText('The bot could not confirm your role.', { exact: false }).waitFor();
  check(linking.length > 0, 'Private link was lost during effect replay');
  check(!page.url().includes('link_token'), 'Private token stayed in browser history');
  check(!await page.getByText('Verified Member', { exact: true }).count(), 'Pending role falsely reported granted');
  await page.goto(base + '/dashboard');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(base + '/auth');
  await page.getByRole('button', { name: 'Sign in with Google' }).waitFor();
  check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  return { passed: ['desktop/mobile layout', 'drawer Escape/focus/navigation', 'ticket detail/attachment safety', 'profile save/reload/error/token refresh', 'empty/unlinked/error/retry', 'unsupported route', 'private link effect replay', 'pending role', 'sign out'], screenshots, errors };
}
