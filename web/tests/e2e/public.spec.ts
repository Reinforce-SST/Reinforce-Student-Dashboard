import { test, expect, expectNoHorizontalOverflow } from "./fixtures/app";

/**
 * The public surface must render for a visitor with no session. These pages are
 * statically generated, so a failure here is a build problem rather than a data
 * problem — which is exactly why they are worth asserting separately.
 */
test.describe("public site", () => {
  for (const path of ["/", "/projects", "/tracks"]) {
    test(`renders ${path} for a signed-out visitor`, async ({ page, app }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expectNoHorizontalOverflow(page);
      }
      expect(app.problems, app.problems.join("\n")).toEqual([]);
    });
  }

  test("an unknown path answers 404", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
  });

  test("the sign-in page offers Google and does not leak a dashboard", async ({ page, app }) => {
    await page.goto("/auth");
    await expect(page.getByRole("button", { name: /Sign in with Google/i })).toBeVisible();
    expect(app.problems, app.problems.join("\n")).toEqual([]);
  });
});
