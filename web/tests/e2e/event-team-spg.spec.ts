import { test, expect, data } from "./fixtures/app";

/**
 * A team event should form a project group (SPG) for each registered team; an
 * individual event never should. The server has supported this since events
 * shipped, behind participation.requires_event_spg — but both admin event forms
 * hard-coded that flag to false, so no event could ever form a group, and
 * editing an event wiped the flag even if it had been set another way.
 */
test.beforeEach(async ({ app }) => {
  app.world.profile = { ...data.adminProfile };
});

const teamEvent = {
  ...data.upcomingEvent,
  participation: { mode: "team", min_team_size: 2, max_team_size: 4, max_participants: 40, requires_event_spg: true },
};

// Found by its options rather than its label, so the same locator works on the
// form before and after this change and the proof fails on the payload itself.
const modeSelect = (page: import("@playwright/test").Page) =>
  page.locator("select", { has: page.locator('option[value="team"]') }).first();

const lastWrite = (app: { world: { calls: { method: string; path: string; body?: unknown }[] } }, method: string) =>
  [...app.world.calls].reverse().find(call => call.method === method && call.path.startsWith("/events"))?.body as
    | { participation?: { mode?: string; requires_event_spg?: boolean } }
    | undefined;

test.describe("creating an event", () => {
  test("a team event offers groups, switched on by default", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=events");
    const groups = page.getByLabel(/Form a project group \(SPG\) for each registered team/);
    await expect(groups).toHaveCount(0);
    await modeSelect(page).selectOption("team");
    await expect(groups).toBeChecked();
    await modeSelect(page).selectOption("solo");
    await expect(groups).toHaveCount(0);
  });

  test("publishing a team event asks the server to form groups", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=events");
    await page.getByPlaceholder(/Multi-Agent Reinforcement Learning Masterclass/).fill("Team hack night");
    await page.getByPlaceholder(/Short 1-2 sentence overview/).fill("Build something in teams of three.");
    await page.getByPlaceholder(/Workshop, Hackathon, Meetup/).fill("Hackathon");
    await page.locator('input[type="datetime-local"]').first().fill("2030-01-01T18:00");
    await modeSelect(page).selectOption("team");
    await page.getByRole("button", { name: /Publish Full Club Event/ }).click();

    await expect.poll(() => lastWrite(app, "POST")).toBeTruthy();
    expect(lastWrite(app, "POST")?.participation).toMatchObject({ mode: "team", requires_event_spg: true });
  });

  test("an admin can opt a team event out of groups", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=events");
    await page.getByPlaceholder(/Multi-Agent Reinforcement Learning Masterclass/).fill("Team quiz");
    await page.getByPlaceholder(/Short 1-2 sentence overview/).fill("A quick quiz, no lasting teams.");
    await page.getByPlaceholder(/Workshop, Hackathon, Meetup/).fill("Hackathon");
    await page.locator('input[type="datetime-local"]').first().fill("2030-01-01T18:00");
    await modeSelect(page).selectOption("team");
    await page.getByLabel(/Form a project group/).uncheck();
    await page.getByRole("button", { name: /Publish Full Club Event/ }).click();

    await expect.poll(() => lastWrite(app, "POST")).toBeTruthy();
    expect(lastWrite(app, "POST")?.participation?.requires_event_spg).toBe(false);
  });

  test("a solo event never asks for groups", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=events");
    await page.getByPlaceholder(/Multi-Agent Reinforcement Learning Masterclass/).fill("Solo talk");
    await page.getByPlaceholder(/Short 1-2 sentence overview/).fill("A talk.");
    await page.getByPlaceholder(/Workshop, Hackathon, Meetup/).fill("Hackathon");
    await page.locator('input[type="datetime-local"]').first().fill("2030-01-01T18:00");
    await page.getByRole("button", { name: /Publish Full Club Event/ }).click();

    await expect.poll(() => lastWrite(app, "POST")).toBeTruthy();
    expect(lastWrite(app, "POST")?.participation).toMatchObject({ mode: "solo", requires_event_spg: false });
  });
});

test("the participation fields are labelled", async ({ page, app }) => {
  await app.enter("/dashboard/admin?tab=events");
  await expect(page.getByLabel("Participation Mode")).toBeVisible();
  await expect(page.getByLabel("Min Team Size")).toBeVisible();
  await expect(page.getByLabel("Max Team Size")).toBeVisible();
});

test.describe("editing an event", () => {
  test("saving a team event keeps its groups setting", async ({ page, app }) => {
    app.world.events = [teamEvent];
    await app.enter("/dashboard/admin?tab=events");
    await page.getByRole("button", { name: /Edit Existing Event/ }).click();
    await page.getByRole("button", { name: /Edit Event/ }).first().click();
    await expect(page.getByLabel(/Form a project group/)).toBeChecked();
    await page.getByRole("button", { name: /Save Event Changes/ }).click();

    await expect.poll(() => lastWrite(app, "PUT")).toBeTruthy();
    // This used to be hard-coded to false, silently switching groups off.
    expect(lastWrite(app, "PUT")?.participation?.requires_event_spg).toBe(true);
  });

  test("turning a solo event into a team event switches groups on", async ({ page, app }) => {
    app.world.events = [{ ...data.upcomingEvent, participation: { mode: "solo", max_participants: 40, requires_event_spg: false } }];
    await app.enter("/dashboard/admin?tab=events");
    await page.getByRole("button", { name: /Edit Existing Event/ }).click();
    await page.getByRole("button", { name: /Edit Event/ }).first().click();
    await modeSelect(page).selectOption("team");
    await expect(page.getByLabel(/Form a project group/)).toBeChecked();
  });
});

test("a member registers a team with a name and teammates", async ({ page, app }) => {
  app.world.profile = { ...data.memberProfile };
  app.world.events = [teamEvent];
  await app.enter(`/dashboard/events/${teamEvent.id}`);
  await page.getByLabel("Team name").fill("Gradient Descenders");
  await page.getByLabel("Teammate user IDs").fill("member-2");
  await page.getByRole("button", { name: /Register Team/ }).click();

  await expect.poll(() => app.world.calls.find(call => call.method === "POST" && call.path.endsWith("/register"))).toBeTruthy();
  const body = app.world.calls.find(call => call.method === "POST" && call.path.endsWith("/register"))?.body as Record<string, unknown>;
  expect(body).toMatchObject({ team_name: "Gradient Descenders", member_uids: ["member-2"] });
});
