import { test, expect, data } from "./fixtures/app";

/**
 * The admin attendance console on an event's page: the roster, per-person
 * status, bulk roll-call and walk-ins. The server is the authority on who can
 * be checked in — only a registered (or already checked-in) registration — so
 * the console must report what the server actually did.
 */
const person = (id: string, name: string, status: string) => ({
  ...data.eventRegistration,
  id: `reg-${id}`,
  user_id: id,
  member_uids: [id],
  status,
  user_profile: { id, full_name: name, email: `${id}@sst.scaler.com`, batch_year: 2028 },
});

const roster = [
  person("alice", "Alice Rao", "registered"),
  person("bob", "Bob Iyer", "registered"),
  person("carol", "Carol Das", "waitlisted"),
  person("dave", "Dave Shah", "checked_in"),
];

test.beforeEach(async ({ app }) => {
  app.world.profile = { ...data.adminProfile };
  app.world.registrations = roster.map(item => ({ ...item }));
});

async function openConsole(page: import("@playwright/test").Page, app: { enter: (path?: string) => Promise<void> }) {
  await app.enter(`/dashboard/events/${data.upcomingEvent.id}`);
  await page.getByRole("button", { name: /Attendance Management/ }).click();
  await expect(page.getByRole("region", { name: "Attendance Console" })).toBeVisible();
}

test("the console is offered to admins only", async ({ page, app }) => {
  app.world.profile = { ...data.memberProfile };
  await app.enter(`/dashboard/events/${data.upcomingEvent.id}`);
  await expect(page.getByRole("heading", { name: data.upcomingEvent.title })).toBeVisible();
  await expect(page.getByRole("button", { name: /Attendance Management/ })).toHaveCount(0);
});

test("the roster lists every registration", async ({ page, app }) => {
  await openConsole(page, app);
  for (const entry of roster) {
    await expect(page.getByText(entry.user_profile.full_name, { exact: true }).first()).toBeVisible();
  }
});

/**
 * Each row's status control needs a name that says whose status it is. With a
 * bare select, a screen reader announces "combo box" once per student.
 */
test("each status control names the person it belongs to", async ({ page, app }) => {
  await openConsole(page, app);
  for (const entry of roster) {
    await expect(page.getByRole("combobox", { name: `Attendance status for ${entry.user_profile.full_name}` })).toBeVisible();
  }
});

test("changing one person's status saves it", async ({ page, app }) => {
  await openConsole(page, app);
  await page.getByRole("combobox", { name: "Attendance status for Bob Iyer" }).selectOption("absent");
  await expect.poll(() => app.world.registrations.find(item => item.id === "reg-bob")?.status).toBe("absent");
});

/**
 * Bulk check-in is for people who hold a place. A waitlisted person did not
 * get one, and the server refuses to check them in; the console used to send
 * them anyway and then report them as checked in.
 */
test("bulk check-in sends only people holding a place", async ({ page, app }) => {
  await openConsole(page, app);
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: /Check-in All Unmarked/ }).click();

  await expect.poll(() => app.world.calls.find(call => call.path.endsWith("/attendance/roll-call"))).toBeTruthy();
  const sent = (app.world.calls.find(call => call.path.endsWith("/attendance/roll-call"))?.body as { attendee_uids: string[] }).attendee_uids;
  expect(new Set(sent)).toEqual(new Set(["alice", "bob"]));
});

test("the bulk confirmation counts only people holding a place", async ({ page, app }) => {
  await openConsole(page, app);
  let message = "";
  page.once("dialog", dialog => { message = dialog.message(); void dialog.dismiss(); });
  await page.getByRole("button", { name: /Check-in All Unmarked/ }).click();
  await expect.poll(() => message).toMatch(/mark 2 attendee/);
});

test("the result reports what the server actually checked in", async ({ page, app }) => {
  await openConsole(page, app);
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: /Check-in All Unmarked/ }).click();
  await expect(page.getByText(/2 (people|attendees?) checked in/i)).toBeVisible();
  await expect(page.getByText(/3 registrations marked Present/)).toHaveCount(0);
});

test("a person the server refuses is reported, not hidden", async ({ page, app }) => {
  // Bob's place was taken back between loading the roster and the roll-call.
  await openConsole(page, app);
  app.world.registrations = app.world.registrations.map(item => item.id === "reg-bob" ? { ...item, status: "cancelled" } : item);
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: /Check-in All Unmarked/ }).click();
  await expect(page.getByText(/1 (person|attendee) checked in/i)).toBeVisible();
  await expect(page.getByText(/could not be checked in/i)).toBeVisible();
});

test("a walk-in can be added to the roster", async ({ page, app }) => {
  await openConsole(page, app);
  await page.getByRole("button", { name: /Add Student \/ Walk-in/ }).click();
  await page.getByPlaceholder(/Type student name/).fill("Second");
  await page.getByRole("button", { name: /Second Member/ }).click();
  await page.getByRole("button", { name: /Confirm & Add to Attendance/ }).click();
  await expect.poll(() => app.world.calls.some(call => call.path.endsWith("/registrations/manual"))).toBe(true);
  const added = app.world.calls.find(call => call.path.endsWith("/registrations/manual"))?.body as { user_id: string };
  expect(added.user_id).toBe(data.directoryRows[1].id);
});

test("the console survives a roster outage", async ({ page, app }) => {
  app.world.fail.add("/registrations");
  await app.enter(`/dashboard/events/${data.upcomingEvent.id}`);
  await page.getByRole("button", { name: /Attendance Management/ }).click();
  await expect(page.getByRole("region", { name: "Attendance Console" })).toBeVisible();
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});

test.describe("the member attendee list", () => {
  test.beforeEach(async ({ app }) => {
    app.world.profile = { ...data.memberProfile };
  });

  test("members see who is attending", async ({ page, app }) => {
    await app.enter(`/dashboard/events/${data.upcomingEvent.id}`);
    await page.getByRole("button", { name: /Registered Attendees & SPGs/ }).click();
    await expect(page.getByText("Alice Rao", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Bob Iyer", { exact: true }).first()).toBeVisible();
  });

  test("an event with no registrations says so", async ({ page, app }) => {
    app.world.registrations = [];
    await app.enter(`/dashboard/events/${data.upcomingEvent.id}`);
    await page.getByRole("button", { name: /Registered Attendees & SPGs/ }).click();
    await expect(page.getByText(/No students have registered for this event yet/)).toBeVisible();
  });
});
