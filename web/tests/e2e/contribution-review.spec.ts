import { test, expect, data } from "./fixtures/app";

/**
 * Actions that earn points record a pending contribution worth nothing. An
 * admin sets what it is worth in Merit Auditing, or rejects it with a reason.
 * Only an approved record reaches a member's profile.
 */
const pending = (id: string, userId: string, title: string, category = "content") => ({
  ...data.contribution,
  id,
  user_id: userId,
  title,
  category,
  points: 0,
  status: "pending",
  occurred_at: "2026-09-20T10:00:00Z",
});

const article = pending("pending-article", data.memberProfile.id, "Published an article: Evaluating retrieval");
const report = pending("pending-report", "member-2", "Progress report verified: Week 9 progress", "project_work");

test.beforeEach(async ({ app }) => {
  app.world.profile = { ...data.adminProfile };
  app.world.contributions = [{ ...data.contribution }, { ...article }, { ...report }];
});

const queue = (page: import("@playwright/test").Page) => page.getByRole("region", { name: /Waiting for review/ });

test("the queue lists pending requests with who and what", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=contributions");
  await expect(queue(page).getByRole("heading", { name: "Waiting for review (2)" })).toBeVisible();
  await expect(queue(page).getByRole("article", { name: `${data.memberProfile.full_name}: ${article.title}` })).toBeVisible();
  await expect(queue(page).getByRole("article", { name: `Second Member: ${report.title}` })).toBeVisible();
  // An already-approved record is not in the queue.
  await expect(queue(page).getByText(data.contribution.title)).toHaveCount(0);
});

test("approving records the points the admin chose", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=contributions");
  await queue(page).getByLabel(`Points for ${data.memberProfile.full_name}`).fill("25");
  await queue(page).getByRole("article", { name: new RegExp(article.title) }).getByRole("button", { name: "Approve" }).click();
  await expect(queue(page).getByText(`Approved 25 points for ${data.memberProfile.full_name}.`)).toBeVisible();
  await expect(queue(page).getByRole("article", { name: new RegExp(article.title) })).toHaveCount(0);
  expect(app.world.contributions.find(item => item.id === article.id)).toMatchObject({ status: "approved", points: 25 });
});

test("approving without points is refused before anything is sent", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=contributions");
  await queue(page).getByRole("article", { name: new RegExp(article.title) }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /whole number of points/ })).toBeVisible();
  expect(app.world.calls.some(call => call.path.endsWith("/review"))).toBe(false);
});

test("rejecting needs a reason and records it", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=contributions");
  const row = queue(page).getByRole("article", { name: new RegExp(report.title) });
  await row.getByRole("button", { name: /Reject/ }).click();
  await row.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Give a reason/ })).toBeVisible();

  await row.getByLabel("Reason for rejecting Second Member's request").fill("Report was for a different group.");
  await row.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(queue(page).getByText("Rejected the request for Second Member.")).toBeVisible();
  expect(app.world.contributions.find(item => item.id === report.id)).toMatchObject({
    status: "rejected", status_reason: "Report was for a different group.",
  });
});

test("an empty queue says so", async ({ page, app }) => {
  app.world.contributions = [{ ...data.contribution }];
  await app.enter("/dashboard/admin?tab=contributions");
  await expect(queue(page).getByText("Nothing is waiting for review.")).toBeVisible();
});

test("only an approved contribution reaches the member's profile", async ({ page, app }) => {
  app.world.profile = { ...data.memberProfile };
  await app.enter("/dashboard/profile");
  await expect(page.getByText(data.contribution.title).first()).toBeVisible();
  await expect(page.getByText(article.title)).toHaveCount(0);

  app.world.contributions = app.world.contributions.map(item =>
    item.id === article.id ? { ...item, status: "approved", points: 25 } : item,
  );
  await page.reload();
  await expect(page.getByText(article.title).first()).toBeVisible();
});
