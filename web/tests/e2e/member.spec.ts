import { test, expect, data } from "./fixtures/app";

test("the overview shows every workspace section", async ({ page, app }) => {
  await app.enter("/dashboard");
  for (const name of ["Your club workspace", "Current projects (SPG)", "Upcoming Events", "Your contributions"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});

test("the overview greets the signed-in member", async ({ page, app }) => {
  await app.enter("/dashboard");
  await expect(page.getByRole("banner").getByText(data.memberProfile.full_name).first()).toBeVisible();
});

test("the profile page shows the ledger and track tabs", async ({ page, app }) => {
  await app.enter("/dashboard/profile");
  await expect(page.getByRole("heading", { name: data.memberProfile.full_name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Auditable Contribution Ledger" })).toBeVisible();
  await expect(page.getByText(data.contribution.title).first()).toBeVisible();
  for (const name of ["RESEARCH", "PRODUCT", "KAGGLE", "ALL TRACKS"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
  }
});

test("the leaderboard lists rankings and a member directory", async ({ page, app }) => {
  await app.enter("/dashboard/leaderboard");
  await expect(page.getByRole("heading", { name: "LEADERBOARD & DIRECTORY" })).toBeVisible();
  await page.getByRole("tab", { name: "BROWSE MEMBERS", exact: true }).click();
  await expect(page.getByText(data.directoryRows[1].full_name).first()).toBeVisible();
  await page.getByRole("tab", { name: "RANKINGS", exact: true }).click();
  await expect(page.getByRole("tab", { name: "RANKINGS", exact: true })).toHaveAttribute("aria-selected", "true");
});

/**
 * A profile outage must not trap the member on a dead page: the recovery card
 * has to offer both a retry and a way out.
 */
test("a profile outage offers retry and sign-out, then recovers", async ({ page, app }) => {
  app.world.fail.add("/users/me");
  await app.enter("/dashboard");
  await expect(page.getByRole("alert").filter({ hasText: /profile could not be refreshed/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();

  app.world.fail.delete("/users/me");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your club workspace" })).toBeVisible();
});

test("signing out returns the member to the sign-in page", async ({ page, app }) => {
  await app.enter("/dashboard/profile");
  await page.getByRole("button", { name: "Sign out of your account" }).click();
  await expect(page.getByRole("button", { name: /Sign in with Google/i })).toBeVisible();
});

test("the admin console is closed to a member", async ({ page, app }) => {
  await app.enter("/dashboard/admin");
  await expect(page.getByRole("heading", { name: "Restricted Access Area" })).toBeVisible();
});

test("the admin console opens for an admin", async ({ page, app }) => {
  app.world.profile = { ...data.adminProfile };
  await app.enter("/dashboard/admin");
  await expect(page.getByRole("heading", { name: "Restricted Access Area" })).toHaveCount(0);
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});
