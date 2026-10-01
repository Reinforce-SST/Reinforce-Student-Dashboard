import { test, expect, data } from "./fixtures/app";

/**
 * The admin ticket console. The server has always accepted category, status,
 * priority and assignee filters; the console used to send none of them, so an
 * admin looking for the urgent open tickets had to page through everything.
 */
const ticketsFor = (adminId: string) => [
  { ...data.ticket, id: "t-open-urgent", title: "GPU quota exhausted before the deadline", status: "open", priority: "urgent", category: "compute_resource_request", assigned_to_uid: adminId },
  { ...data.ticket, id: "t-open-low", title: "Typo on the tracks page", status: "open", priority: "low", category: "feedback", assigned_to_uid: null },
  { ...data.ticket, id: "t-resolved", title: "Discord role missing after verification", status: "resolved", priority: "medium", category: "support", assigned_to_uid: "someone-else" },
];

test.beforeEach(async ({ app }) => {
  app.world.profile = { ...data.adminProfile };
  app.world.tickets = ticketsFor(data.adminProfile.id);
});

// Located by heading so this works on the code before and after the change —
// the proof has to fail on the missing filters, not on a locator.
const queue = (page: import("@playwright/test").Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: "Member tickets", exact: true }) });
const lastListCall = (app: { world: { calls: { method: string; path: string }[] } }) =>
  app.world.calls.filter(call => call.method === "GET" && call.path === "/tickets").length;

test("the console lists every ticket before any filter is set", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=tickets");
  for (const ticket of app.world.tickets) {
    await expect(queue(page).getByRole("link", { name: String(ticket.title) })).toBeVisible();
  }
});

test("filtering by status narrows the list through the API", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=tickets");
  await expect(queue(page).getByRole("link", { name: "Typo on the tracks page" })).toBeVisible();

  const before = lastListCall(app);
  await page.getByLabel("Filter by status").selectOption("resolved");
  await expect.poll(() => lastListCall(app)).toBeGreaterThan(before);

  await expect(queue(page).getByRole("link", { name: "Discord role missing after verification" })).toBeVisible();
  await expect(queue(page).getByRole("link", { name: "Typo on the tracks page" })).toHaveCount(0);
  await expect(queue(page).getByRole("link", { name: "GPU quota exhausted before the deadline" })).toHaveCount(0);
});

test("status and priority combine, and each row shows its priority", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=tickets");
  await page.getByLabel("Filter by status").selectOption("open");
  await page.getByLabel("Filter by priority").selectOption("urgent");
  await expect(queue(page).getByRole("link", { name: "GPU quota exhausted before the deadline" })).toBeVisible();
  await expect(queue(page).getByRole("link", { name: "Typo on the tracks page" })).toHaveCount(0);
  // Filtering by a field the list does not display leaves the admin guessing.
  await expect(queue(page).getByText(/urgent priority/i)).toBeVisible();
});

test("category filter sends the category", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=tickets");
  await page.getByLabel("Filter by category").selectOption("feedback");
  await expect(queue(page).getByRole("link", { name: "Typo on the tracks page" })).toBeVisible();
  await expect(queue(page).getByRole("link", { name: "Discord role missing after verification" })).toHaveCount(0);
});

test("assigned to me sends the admin's own id", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=tickets");
  await page.getByLabel("Assigned to me").check();
  await expect(queue(page).getByRole("link", { name: "GPU quota exhausted before the deadline" })).toBeVisible();
  await expect(queue(page).getByRole("link", { name: "Typo on the tracks page" })).toHaveCount(0);
});

test("clearing filters restores the full list", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=tickets");
  await page.getByLabel("Filter by status").selectOption("resolved");
  await expect(queue(page).getByRole("link", { name: "Typo on the tracks page" })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(queue(page).getByRole("link", { name: "Typo on the tracks page" })).toBeVisible();
  await expect(page.getByLabel("Filter by status")).toHaveValue("");
});

test("a filter with no matches says so", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=tickets");
  await page.getByLabel("Filter by status").selectOption("closed");
  await expect(queue(page).getByText(/No tickets match these filters/i)).toBeVisible();
});

/**
 * Changing a filter while on a later page must go back to page one. Otherwise
 * an admin on page 2 who narrows to a single page of results sees an empty list
 * and concludes nothing matched.
 */
test("changing a filter returns to the first page", async ({ page, app }) => {
  app.world.tickets = Array.from({ length: 25 }, (_, index) => ({
    ...data.ticket,
    id: `bulk-${index}`,
    title: `Bulk ticket ${String(index).padStart(2, "0")}`,
    status: index === 0 ? "resolved" : "open",
    priority: "medium",
    category: "support",
    assigned_to_uid: null,
  }));
  await app.enter("/dashboard/admin?tab=tickets");
  await page.getByRole("button", { name: "Go to next page" }).click();
  await expect.poll(() => app.world.calls.some(call => call.path === "/tickets")).toBe(true);

  await page.getByLabel("Filter by status").selectOption("resolved");
  await expect(queue(page).getByRole("link", { name: "Bulk ticket 00" })).toBeVisible();
});

test("the SPG request view keeps its fixed category and shows no filters", async ({ page, app }) => {
  app.world.tickets = [{ ...data.ticket, id: "spg-req", title: "Register our retrieval group", category: "spg_registration", status: "open", priority: "medium" }];
  await app.enter("/dashboard/admin?tab=spg");
  await expect(page.getByLabel("Filter by status")).toHaveCount(0);
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});
