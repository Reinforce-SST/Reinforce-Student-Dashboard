import { test, expect, data } from "./fixtures/app";

/**
 * Registering a team used to mean typing teammates' raw account IDs, which
 * members cannot know. Now they search the member directory by name and pick
 * teammates; the registration still sends account IDs.
 */
const teamEvent = (min = 2, max = 4) => ({
  ...data.upcomingEvent,
  participation: { mode: "team", min_team_size: min, max_team_size: max, max_participants: 40, requires_event_spg: true },
});

const registerBody = (app: { world: { calls: { method: string; path: string; body?: unknown }[] } }) =>
  app.world.calls.find(call => call.method === "POST" && call.path.endsWith("/register"))?.body as Record<string, unknown> | undefined;

async function open(page: import("@playwright/test").Page, app: { world: { events: Record<string, unknown>[] }; enter: (path: string) => Promise<void> }, event = teamEvent()) {
  app.world.events = [event];
  await app.enter(`/dashboard/events/${event.id}`);
  await page.getByLabel("Team name").fill("Gradient Descenders");
  return page.getByRole("combobox", { name: "Teammates" });
}

test("a member finds teammates by name and registers them", async ({ page, app }) => {
  const search = await open(page, app);
  await search.fill("third");
  await page.getByRole("option", { name: "Third Member" }).click();
  await search.fill("fourth");
  await page.getByRole("option", { name: "Fourth Member" }).click();

  const chips = page.getByRole("list", { name: "Selected teammates" });
  await expect(chips.getByRole("listitem")).toHaveText(["Third Member×", "Fourth Member×"]);
  await expect(search).toHaveValue("");
  await page.getByRole("button", { name: /Register Team/ }).click();

  await expect.poll(() => registerBody(app)).toBeTruthy();
  expect(registerBody(app)).toEqual({ team_name: "Gradient Descenders", member_uids: ["member-3", "member-4"] });
});

test("the keyboard moves through results, Enter picks and Escape closes", async ({ page, app }) => {
  const search = await open(page, app);
  await search.fill("member");
  const list = page.getByRole("listbox", { name: "Matching members" });
  await expect(list).toBeVisible();
  await expect(search).toHaveAttribute("aria-expanded", "true");

  await search.press("ArrowDown");
  await search.press("ArrowDown");
  const second = list.getByRole("option").nth(1);
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(search).toHaveAttribute("aria-activedescendant", (await second.getAttribute("id"))!);
  const name = await second.textContent();
  await search.press("Enter");
  await expect(page.getByRole("list", { name: "Selected teammates" })).toContainText(name!);

  await search.fill("member");
  await expect(list).toBeVisible();
  await search.press("Escape");
  await expect(list).toBeHidden();
});

test("you, and teammates already picked, are not offered", async ({ page, app }) => {
  const search = await open(page, app);
  await search.fill("member");
  const options = page.getByRole("listbox", { name: "Matching members" }).getByRole("option");
  await expect(options.filter({ hasText: data.memberProfile.full_name })).toHaveCount(0);
  await options.filter({ hasText: "Second Member" }).click();

  await search.fill("member");
  await expect(options.filter({ hasText: "Second Member" })).toHaveCount(0);
  await expect(options).toHaveCount(3);
});

test("a picked teammate can be removed", async ({ page, app }) => {
  const search = await open(page, app);
  await search.fill("second");
  await page.getByRole("option", { name: "Second Member" }).click();
  await page.getByRole("button", { name: "Remove Second Member" }).click();
  await expect(page.getByRole("list", { name: "Selected teammates" })).toHaveCount(0);
  await expect(search).toBeFocused();
});

test("the picker stops at the team's size", async ({ page, app }) => {
  const search = await open(page, app, teamEvent(2, 3));
  await expect(page.getByText("You are included automatically. Teams have 2–3 members.")).toBeVisible();
  for (const name of ["Second", "Third"]) {
    await search.fill(name);
    await page.getByRole("option", { name: `${name} Member` }).click();
  }
  await expect(search).toBeDisabled();
  await expect(page.getByText("Team is full (2 teammates).")).toBeVisible();
});

test("a team that is too small is stopped before it is sent", async ({ page, app }) => {
  const search = await open(page, app, teamEvent(3, 4));
  await search.fill("second");
  await page.getByRole("option", { name: "Second Member" }).click();
  await page.getByRole("button", { name: /Register Team/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This event needs teams of at least 3. Add 1 more teammate." })).toBeVisible();
  expect(registerBody(app)).toBeUndefined();
});

test("a server refusal names the teammate, not their account ID", async ({ page, app }) => {
  app.world.registerError = { status: 409, detail: "User member-2 is already registered for this event" };
  const search = await open(page, app);
  await search.fill("second");
  await page.getByRole("option", { name: "Second Member" }).click();
  await page.getByRole("button", { name: /Register Team/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "User Second Member is already registered for this event" })).toBeVisible();
});

test("a search with no match says so", async ({ page, app }) => {
  const search = await open(page, app);
  await search.fill("zzqx");
  await expect(page.getByText("No members match that name.")).toBeVisible();
});

test("a one-person team event shows no teammate search", async ({ page, app }) => {
  app.world.events = [teamEvent(1, 1)];
  await app.enter(`/dashboard/events/${data.upcomingEvent.id}`);
  await expect(page.getByLabel("Team name")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Teammates" })).toHaveCount(0);
  await expect(page.getByText("Teams have exactly 1 member.")).toBeVisible();
});
