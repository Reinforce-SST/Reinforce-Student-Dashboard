import { test, expect, data } from "./fixtures/app";

test("the planner lists upcoming events and a calendar", async ({ page, app }) => {
  await app.enter("/dashboard/events");
  await expect(page.getByRole("heading", { name: "EVENTS CALENDAR" })).toBeVisible();
  await expect(page.getByRole("heading", { name: data.upcomingEvent.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "EVENT STATISTICS" })).toBeVisible();
});

test("event type tabs are selectable", async ({ page, app }) => {
  await app.enter("/dashboard/events");
  for (const name of ["WORKSHOPS", "HACKATHONS", "MEETUPS", "ALL EVENTS"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
  }
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});

test("event detail shows schedule, agenda and registration state", async ({ page, app }) => {
  await app.enter(`/dashboard/events/${data.upcomingEvent.id}`);
  await expect(page.getByRole("heading", { name: data.upcomingEvent.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schedule & Location" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registration Status" })).toBeVisible();
});

/**
 * RSVP is the one member write on this page. The button has to change state and
 * the change has to survive a reload, which is what separates a working
 * mutation from a button that only updates local state.
 */
test("RSVP registers the member and survives a reload", async ({ page, app }) => {
  await app.enter(`/dashboard/events/${data.upcomingEvent.id}`);
  const rsvp = page.getByRole("button", { name: /RSVP for Event/i });
  await expect(rsvp).toBeVisible();
  await rsvp.click();
  await expect(page.getByRole("button", { name: /Cancel RSVP/i })).toBeVisible();
  expect(app.world.registered).toBe(true);

  await page.reload();
  await expect(page.getByRole("button", { name: /Cancel RSVP/i })).toBeVisible();
});

test("a past event still opens", async ({ page, app }) => {
  await app.enter(`/dashboard/events/${data.pastEvent.id}`);
  await expect(page.getByRole("heading", { name: data.pastEvent.title })).toBeVisible();
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});

test("the planner survives an events outage", async ({ page, app }) => {
  app.world.fail.add("/events");
  await app.enter("/dashboard/events");
  await expect(page.getByRole("heading", { name: "EVENTS CALENDAR" })).toBeVisible();
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});
