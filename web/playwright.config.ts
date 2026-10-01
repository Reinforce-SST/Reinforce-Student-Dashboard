import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * The suite runs against a production build on port 3107 so it exercises the
 * same output Vercel serves. Fixtures live only at the browser/network
 * boundary — never in production code — so the app under test is unmodified.
 *
 * PLAYWRIGHT_CHANNEL lets a developer reuse an installed Chrome instead of
 * downloading Playwright's Chromium. CI leaves it unset.
 */
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./.playwright/results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3107",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    ...(channel ? { channel } : {}),
  },
  projects: [{ name: "chromium" }],
  /**
   * The build is part of the server command on purpose. Next inlines every
   * NEXT_PUBLIC_* value into the client bundle at build time, so a server
   * started with different values than it was built with would still carry the
   * build's values. Building here keeps the two in step.
   *
   * The Firebase values are structurally valid and entirely fake. They only
   * have to make `isFirebaseConfigured` true; every Firebase network call is
   * intercepted in tests/e2e/fixtures/app.ts.
   */
  webServer: {
    command: "npm run e2e:build && npm run e2e:start",
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
    env: {
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:8080/api/v1",
      NEXT_PUBLIC_FIREBASE_API_KEY: "e2e-api-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "e2e.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "e2e-project",
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "e2e-project.appspot.com",
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
      NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:e2e",
    },
  },
});
