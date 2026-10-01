import { test, expect, data, signIn, rotateToken } from "./fixtures/app";

/**
 * Discord linking is the security-critical flow in this app.
 *
 * The bot sends `{/auth}#link_token={43-char one-time proof}`. The old contract
 * took `?discord_id=`, which anyone could forge into someone else's account.
 * These tests pin the replacement: the proof travels in the fragment, it is
 * consumed exactly once, it never reaches browser history, and a forged
 * `discord_id` is refused rather than honoured.
 */
test("a private link token is sent to the API and kept out of history", async ({ page, app }) => {
  await page.goto("/");
  await signIn(page, app.world);
  await page.goto(`/auth#link_token=${data.LINK_TOKEN}`);

  await expect(page.getByText(/could not confirm your role/i)).toBeVisible();
  expect(app.world.links).toHaveLength(1);
  expect(app.world.links[0].link_token).toBe(data.LINK_TOKEN);
  expect(app.world.links[0].discord_id).toBeUndefined();
  expect(page.url()).not.toContain("link_token");
});

test("a pending Discord role is not reported as granted", async ({ page, app }) => {
  await page.goto("/");
  await signIn(page, app.world);
  await page.goto(`/auth#link_token=${data.LINK_TOKEN}`);
  await expect(page.getByText(/could not confirm your role/i)).toBeVisible();
  // The API answers 200 even when the bot failed, so a success message here
  // would be a lie to the member.
  await expect(page.getByText("Verified Member", { exact: true })).toHaveCount(0);
});

test("a refreshed credential does not replay a completed link", async ({ page, app }) => {
  await page.goto("/");
  await signIn(page, app.world);
  await page.goto(`/auth#link_token=${data.LINK_TOKEN}`);
  await expect(page.getByText(/could not confirm your role/i)).toBeVisible();
  const consumed = app.world.links.length;

  await rotateToken(page, app.world, data.REFRESHED_TOKEN);
  // Firebase polls IndexedDB for cross-tab changes roughly every 800ms.
  await page.waitForTimeout(2500);
  expect(app.world.links).toHaveLength(consumed);
});

test("a forged discord_id deep link is refused", async ({ page, app }) => {
  await page.goto("/");
  await signIn(page, app.world);
  await page.goto("/auth?discord_id=123456789012345678");
  // Nothing may be linked from a guessable identifier.
  expect(app.world.links).toHaveLength(0);
});

test("a malformed link token is refused", async ({ page, app }) => {
  await page.goto("/");
  await signIn(page, app.world);
  await page.goto("/auth#link_token=too-short");
  await page.waitForTimeout(1500);
  expect(app.world.links).toHaveLength(0);
});

test("plain sign-in continues into the dashboard", async ({ page, app }) => {
  await page.goto("/");
  await signIn(page, app.world);
  await page.goto("/auth");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Your club workspace" })).toBeVisible();
});

test("a failed session sync keeps the member on the sign-in page", async ({ page, app }) => {
  app.world.fail.add("/users/sync");
  await page.goto("/");
  await signIn(page, app.world);
  await page.goto("/auth");
  await expect(page.getByRole("alert")).toBeVisible();
  expect(page.url()).toContain("/auth");
});
