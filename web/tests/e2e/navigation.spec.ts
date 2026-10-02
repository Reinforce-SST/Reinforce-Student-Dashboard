import { test, expect, expectNoHorizontalOverflow } from "./fixtures/app";

/**
 * The header title comes from a lookup in components/dashboard/Header.tsx that
 * falls back to "Dashboard Overview". A missing entry is therefore silent: the
 * page works, it just tells the member they are somewhere else. Every
 * dashboard destination is listed here so a new route cannot be added without
 * its title.
 */
const titled: [path: string, title: string][] = [
  ["/dashboard", "Dashboard Overview"],
  ["/dashboard/spg", "SPG Management"],
  ["/dashboard/tickets", "Ticket System"],
  ["/dashboard/events", "Events Planner"],
  ["/dashboard/articles", "Article Hub"],
  ["/dashboard/ideas", "Idea Jar"],
  ["/dashboard/resources", "Learning Resources"],
  ["/dashboard/leaderboard", "Club Leaderboard"],
  ["/dashboard/search", "Search"],
  ["/dashboard/profile", "Member Profile"],
  ["/profile", "Member Profile"],
];

for (const [path, title] of titled) {
  test(`header names the section on ${path}`, async ({ page, app }) => {
    await app.enter(path);
    await expect(page.getByRole("banner").getByText(title, { exact: true }).first()).toBeVisible();
  });
}

test("sidebar walks every dashboard section", async ({ page, app }) => {
  await app.enter("/dashboard");
  const main = page.getByRole("navigation", { name: "Main Navigation" });
  const resources = page.getByRole("navigation", { name: "Resources Navigation" });
  for (const [nav, label, heading] of [
    [main, "SPG Management", "PROJECT CLUSTERS (SPG)"],
    [main, "Ticket System", "TICKET SYSTEM & DISPATCH"],
    [main, "Events Planner", "EVENTS CALENDAR"],
    [resources, "Idea Jar", "IDEA JAR & PROPOSALS"],
    [resources, "Learning Resources", "Learning Resources"],
    [resources, "Leaderboard", "LEADERBOARD & DIRECTORY"],
  ] as const) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    // The header also renders the section title as a heading; check the page's own.
    await expect(page.locator("#member-content").getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

test("layout never scrolls sideways, phone to desktop", async ({ page, app }) => {
  await app.enter("/dashboard");
  for (const path of ["/dashboard", "/dashboard/tickets", "/dashboard/events", "/dashboard/spg", "/dashboard/profile", "/dashboard/resources"]) {
    await page.goto(path);
    await expect(page.getByRole("banner")).toBeVisible();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
    }
  }
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});

/**
 * Two different controls open the drawer. The header hamburger is hidden below
 * the tablet breakpoint, where a bottom bar takes over, so a single locator
 * cannot cover both and a test that assumes one silently covers neither.
 */
test("tablet hamburger opens the drawer, Escape closes it and restores focus", async ({ page, app }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await app.enter("/dashboard");
  const drawer = page.locator("dialog#member-drawer");
  const open = page.getByRole("banner").getByRole("button", { name: "Open navigation" });
  await expect(open).toBeVisible();
  await open.click();
  await expect(drawer).toHaveJSProperty("open", true);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveJSProperty("open", false);
  await expect(open).toBeFocused();
});

test("phone bottom bar opens the drawer", async ({ page, app }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.enter("/dashboard");
  const drawer = page.locator("dialog#member-drawer");
  const more = page.getByRole("button", { name: "More dashboard sections" });
  await expect(more).toBeVisible();
  // The header hamburger is deliberately not the phone control.
  await expect(page.getByRole("banner").getByRole("button", { name: "Open navigation" })).toBeHidden();
  await more.click();
  await expect(drawer).toHaveJSProperty("open", true);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveJSProperty("open", false);
});

test("navigating from the drawer closes it", async ({ page, app }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.enter("/dashboard");
  const drawer = page.locator("dialog#member-drawer");
  await page.getByRole("button", { name: "More dashboard sections" }).click();
  await expect(drawer).toHaveJSProperty("open", true);
  await drawer.getByRole("link", { name: "Ticket System", exact: true }).click();
  await expect(page.getByRole("heading", { name: "TICKET SYSTEM & DISPATCH" })).toBeVisible();
  await expect(drawer).toHaveJSProperty("open", false);
});
