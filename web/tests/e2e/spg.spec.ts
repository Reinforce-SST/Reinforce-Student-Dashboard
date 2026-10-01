import { test, expect, data } from "./fixtures/app";

test("the SPG list shows the member's groups", async ({ page, app }) => {
  await app.enter("/dashboard/spg");
  await expect(page.getByRole("heading", { name: "PROJECT CLUSTERS (SPG)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: data.spg.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Propose New SPG" })).toBeVisible();
});

test("my-groups and all-public tabs both list the group", async ({ page, app }) => {
  await app.enter("/dashboard/spg");
  for (const name of [/ALL PUBLIC SPGS/, /MY SPGS/]) {
    await page.getByRole("tab", { name }).click();
    await expect(page.getByRole("heading", { name: data.spg.name })).toBeVisible();
  }
});

test("status filters are selectable", async ({ page, app }) => {
  await app.enter("/dashboard/spg");
  for (const name of ["ACTIVE", "COMPLETED", "ARCHIVED", "ALL"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
  }
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});

test("group detail shows roster, reports and open positions", async ({ page, app }) => {
  await app.enter(`/dashboard/spg/${data.spg.id}`);
  await expect(page.getByRole("heading", { name: data.spg.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Progress Reports/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Team Roster/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open Positions" })).toBeVisible();
  await expect(page.getByText(data.spgReport.heading)).toBeVisible();
});

test("the report form opens from group detail", async ({ page, app }) => {
  await app.enter(`/dashboard/spg/${data.spg.id}`);
  await page.getByRole("button", { name: "Submit Progress Report" }).click();
  await expect(page.getByRole("heading", { name: /Progress Reports/ })).toBeVisible();
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});

test("group detail survives a reports outage", async ({ page, app }) => {
  app.world.fail.add("/reports");
  await app.enter(`/dashboard/spg/${data.spg.id}`);
  await expect(page.getByRole("heading", { name: data.spg.name })).toBeVisible();
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});
