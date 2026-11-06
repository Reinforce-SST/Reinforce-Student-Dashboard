import { test, expect, data } from "./fixtures/app";

test.beforeEach(async ({ app }) => {
  app.world.profile = { ...data.adminProfile };
});

test.describe("Hero Banners Administration and Presentation", () => {
  test("an admin can create a new dashboard hero banner", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=banners");

    await page.getByPlaceholder(/Reinforce Hackathon 2026/).fill("Spring AI Summit");
    await page.getByPlaceholder(/Brief 1-2 sentence hook for students/).fill("Join talks by top researchers.");
    await page.getByPlaceholder(/Learn More →/).fill("Register Now →");
    await page.getByPlaceholder(/\/dashboard\/events\/... or https:\/\//).fill("/dashboard/events/paper-reading-week-10");

    await page.getByRole("button", { name: /Publish Dashboard Banner/ }).click();

    await expect.poll(() => app.world.calls.find(c => c.method === "POST" && c.path === "/banners")).toBeTruthy();
    const call = app.world.calls.find(c => c.method === "POST" && c.path === "/banners");
    expect((call?.body as Record<string, unknown>)?.title).toBe("Spring AI Summit");
  });

  test("an admin can view and select an existing banner to edit", async ({ page, app }) => {
    app.world.banners = [{ ...data.banner, title: "Editable Summit Banner" }];
    await app.enter("/dashboard/admin?tab=banners");

    await page.getByRole("button", { name: /Modify Existing Banners/ }).click();
    await expect(page.getByText("Editable Summit Banner")).toBeVisible();
    await page.getByRole("button", { name: /Edit/i }).first().click();

    await expect(page.getByRole("button", { name: /Save Banner Changes/ })).toBeVisible();
  });

  test("the dashboard renders active hero banner for members", async ({ page, app }) => {
    app.world.profile = { ...data.memberProfile };
    app.world.banners = [{
      ...data.banner,
      title: "Featured Innovation Showcase",
      description: "Discover breakthrough machine learning prototypes.",
      custom_url: "/dashboard/events/paper-reading-week-10",
      status: "active",
    }];

    await app.enter("/dashboard");

    await expect(page.getByText("Featured Innovation Showcase")).toBeVisible();
    await expect(page.getByText("Discover breakthrough machine learning prototypes.")).toBeVisible();
  });
});
