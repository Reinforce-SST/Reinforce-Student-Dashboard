import { test, expect, data } from "./fixtures/app";

const teamEvent = {
  ...data.upcomingEvent,
  id: "evt-team-hackathon",
  title: "Reinforce AI Hackathon",
  participation: {
    mode: "team" as const,
    min_team_size: 2,
    max_team_size: 4,
    max_participants: 40,
    requires_event_spg: true,
  },
};

const teamRegistration = {
  ...data.eventRegistration,
  event_id: teamEvent.id,
  user_id: data.memberProfile.id,
  team_id: "team-titans",
  team_name: "Titans",
  is_team_leader: true,
  member_uids: [data.memberProfile.id, "member-2"],
  status: "registered" as const,
  roster_locked: false,
};

test.describe("Event Squad Roster Locking and Admin Editing", () => {
  test("a squad leader can lock their squad roster", async ({ page, app }) => {
    app.world.profile = { ...data.memberProfile };
    app.world.events = [teamEvent];
    app.world.registered = true;
    app.world.registrations = [{ ...teamRegistration }];

    await app.enter(`/dashboard/events/${teamEvent.id}`);

    // Click "Lock Squad Roster" button
    const lockBtn = page.getByRole("button", { name: /Lock Squad Roster|Confirm & Lock Squad Early/i }).first();
    await expect(lockBtn).toBeVisible();
    await lockBtn.click();

    // Confirm modal
    const confirmBtn = page.getByRole("button", { name: /Confirm & Lock Roster/i });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    await expect.poll(() => app.world.calls.find(c => c.method === "POST" && c.path.endsWith("/team/lock"))).toBeTruthy();
  });

  test("the attendees panel renders squad card with member count and locked badge", async ({ page, app }) => {
    app.world.profile = { ...data.memberProfile };
    app.world.events = [teamEvent];
    app.world.registrations = [
      {
        ...teamRegistration,
        roster_locked: true,
      },
    ];

    await app.enter(`/dashboard/events/${teamEvent.id}`);
    await page.getByRole("button", { name: /Registered Attendees & SPGs/ }).click();

    await expect(page.getByText("Titans")).toBeVisible();
    await expect(page.getByText(/Locked Roster/i)).toBeVisible();
  });

  test("an admin can open and edit squad roster via admin override modal", async ({ page, app }) => {
    app.world.profile = { ...data.adminProfile };
    app.world.events = [teamEvent];
    app.world.registrations = [
      {
        ...teamRegistration,
        roster_locked: true,
      },
    ];

    await app.enter(`/dashboard/events/${teamEvent.id}`);
    await page.getByRole("button", { name: /Registered Attendees & SPGs/ }).click();

    const editBtn = page.getByRole("button", { name: /Edit Squad Roster \(Admin\)/i });
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    await expect(page.getByText(/Edit Squad Roster \(Admin Override\)/i)).toBeVisible();
    await page.getByRole("button", { name: /Save Squad & Sync SPG/i }).click();

    await expect.poll(() => app.world.calls.find(c => c.method === "PATCH" && c.path.includes("/roster"))).toBeTruthy();
  });
});
