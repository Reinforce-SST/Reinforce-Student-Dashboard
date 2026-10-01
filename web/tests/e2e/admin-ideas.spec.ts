import { test, expect, data } from "./fixtures/app";

/**
 * The Idea Jar review console. A pending idea starts here and only becomes
 * visible to members once an admin approves it, so each action is checked
 * against the public jar as well as the console.
 */
test.beforeEach(async ({ app }) => {
  app.world.profile = { ...data.adminProfile };
});

const card = (page: import("@playwright/test").Page, title: string) =>
  page.locator("article", { has: page.getByRole("link", { name: title, exact: true }) });

test("lists approved and pending submissions together", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=ideas");
  await expect(card(page, data.idea.title)).toBeVisible();
  await expect(card(page, data.pendingIdea.title)).toBeVisible();
});

/**
 * The filters sit in role="tablist", so assistive technology announces a tab
 * list. Each control has to be a tab with a selected state, or the list is
 * announced as empty and the current filter is never read out.
 */
test("status filters are real tabs with a selected state", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=ideas");
  const tabs = page.getByRole("tablist").filter({ hasText: "Pending Review" }).getByRole("tab");
  await expect(tabs).toHaveCount(4);
  await expect(tabs.filter({ hasText: "All Submissions" })).toHaveAttribute("aria-selected", "true");

  await tabs.filter({ hasText: "Pending Review" }).click();
  await expect(tabs.filter({ hasText: "Pending Review" })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.filter({ hasText: "All Submissions" })).toHaveAttribute("aria-selected", "false");
});

test("the pending tab shows only pending ideas", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=ideas");
  await page.getByRole("tab", { name: /Pending Review/ }).click();
  await expect(card(page, data.pendingIdea.title)).toBeVisible();
  await expect(card(page, data.idea.title)).toHaveCount(0);
});

test("searching narrows the console", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=ideas");
  await page.getByPlaceholder(/Search ideas/).fill("mess-queue");
  await expect(card(page, data.pendingIdea.title)).toBeVisible();
  await expect(card(page, data.idea.title)).toHaveCount(0);
});

test("approving publishes the idea to the public jar", async ({ page, app }) => {
  await app.enter("/dashboard/ideas");
  await expect(page.getByRole("heading", { name: data.pendingIdea.title })).toHaveCount(0);

  await page.goto("/dashboard/admin?tab=ideas");
  await card(page, data.pendingIdea.title).getByRole("button", { name: /Approve & Publish/ }).click();
  await expect(page.getByText(/approved and published/i)).toBeVisible();
  await expect(card(page, data.pendingIdea.title).getByText("✓ Approved")).toBeVisible();

  await page.goto("/dashboard/ideas");
  await expect(page.getByRole("heading", { name: data.pendingIdea.title })).toBeVisible();
});

test("edit and approve keeps the admin's edits", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=ideas");
  await card(page, data.pendingIdea.title).getByRole("button", { name: /Edit Proposal/ }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Idea Proposal" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Idea Title/).fill("Mess-queue forecasting from swipe logs");
  await dialog.getByRole("button", { name: /Save & Approve/i }).click();

  await expect(dialog).toHaveCount(0);
  const saved = app.world.ideas.find(item => item.id === data.pendingIdea.id);
  expect(saved?.title).toBe("Mess-queue forecasting from swipe logs");
  expect(saved?.is_verified).toBe(true);
});

test("cancelling the reject confirmation keeps the idea", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=ideas");
  page.once("dialog", dialog => void dialog.dismiss());
  await card(page, data.pendingIdea.title).getByRole("button", { name: /Reject/ }).click();
  await expect(card(page, data.pendingIdea.title)).toBeVisible();
  expect(app.world.ideas.some(item => item.id === data.pendingIdea.id)).toBe(true);
});

test("confirming a rejection removes the idea", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=ideas");
  page.once("dialog", dialog => void dialog.accept());
  await card(page, data.pendingIdea.title).getByRole("button", { name: /Reject/ }).click();
  await expect(card(page, data.pendingIdea.title)).toHaveCount(0);
  expect(app.world.ideas.some(item => item.id === data.pendingIdea.id)).toBe(false);
});

test("the console survives an outage and recovers", async ({ page, app }) => {
  app.world.fail.add("/ideas/admin");
  await app.enter("/dashboard/admin?tab=ideas");
  // Next renders its own empty role="alert" route announcer, so a bare
  // getByRole("alert") is ambiguous. Match the panel's alert by its content.
  const outage = page.getByRole("alert").filter({ hasText: "unavailable" });
  await expect(outage).toBeVisible();
  app.world.fail.delete("/ideas/admin");
  await outage.getByRole("button", { name: "Retry" }).click();
  await expect(card(page, data.idea.title)).toBeVisible();
});

test("every field in the edit dialog is labelled", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=ideas");
  await card(page, data.pendingIdea.title).getByRole("button", { name: /Edit Proposal/ }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Idea Proposal" });
  await expect(dialog).toBeVisible();
  for (const label of [/Idea Title/, /Domain Track/, /Target Difficulty/, /Project Overview/, /Prerequisites/, /Implementation Roadmap/, /Learning Outcomes/]) {
    await expect(dialog.getByLabel(label)).toBeVisible();
  }
});

test("Escape closes the edit dialog and returns focus to Edit", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=ideas");
  const edit = card(page, data.pendingIdea.title).getByRole("button", { name: /Edit Proposal/ });
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit Idea Proposal" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
});

/**
 * showModal() makes the page behind the dialog inert. Tabbing past the last
 * field moves focus to the browser's own UI, which reads as <body> here — that
 * is expected. What must never happen is focus landing on a page control
 * outside the dialog, where a keyboard user would be editing blind.
 */
test("Tab never reaches the page behind the edit dialog", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=ideas");
  await card(page, data.pendingIdea.title).getByRole("button", { name: /Edit Proposal/ }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Idea Proposal" });
  await expect(dialog).toBeVisible();
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press("Tab");
    const escaped = await dialog.evaluate(node => {
      const active = document.activeElement;
      return Boolean(active && active !== document.body && !node.contains(active));
    });
    expect(escaped, `focus reached the page behind the dialog after ${step + 1} Tab presses`).toBe(false);
  }
});
