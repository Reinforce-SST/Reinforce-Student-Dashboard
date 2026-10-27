import { test, expect } from "./fixtures/app";

/**
 * Regression test for a third-party security review: the frontend served no
 * Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, or
 * Referrer-Policy header at all. These come from next.config.ts, so any page
 * proves the fix; the home page is cheapest since nothing else needs it mocked.
 */
test("every response carries the hardening headers", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};

  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
});
