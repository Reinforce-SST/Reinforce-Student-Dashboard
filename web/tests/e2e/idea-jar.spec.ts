import { test, expect, data } from "./fixtures/app";

/**
 * The member side of the Idea Jar. The page promises members can "browse…,
 * upvote… and form project groups", and the server has always had a
 * /ideas/random endpoint for drawing from the jar — neither was reachable.
 */

test.describe("drawing from the jar", () => {
  test("draws an approved idea and links to it", async ({ page, app }) => {
    await app.enter("/dashboard/ideas");
    await page.getByRole("button", { name: /Draw from the jar/i }).click();
    const drawn = page.getByRole("region", { name: "Drawn idea" });
    await expect(drawn.getByRole("heading", { name: data.idea.title })).toBeVisible();
    await drawn.getByRole("link", { name: /Open this idea/i }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/ideas/${data.idea.id}$`));
  });

  /** The jar only holds approved ideas; a pending one must never be drawn. */
  test("never draws a pending idea", async ({ page, app }) => {
    await app.enter("/dashboard/ideas");
    const drawn = page.getByRole("region", { name: "Drawn idea" });
    for (let draw = 0; draw < 4; draw++) {
      await page.getByRole("button", { name: /Draw from the jar/i }).click();
      await expect(drawn.getByRole("heading", { level: 2 })).toBeVisible();
      await expect(drawn.getByRole("heading", { name: data.pendingIdea.title })).toHaveCount(0);
    }
  });

  test("drawing again picks the next idea", async ({ page, app }) => {
    const second = { ...data.idea, id: "idea-3", title: "Lecture-capture summariser" };
    app.world.ideas = [...app.world.ideas, second];
    await app.enter("/dashboard/ideas");
    await page.getByRole("button", { name: /Draw from the jar/i }).click();
    const drawn = page.getByRole("region", { name: "Drawn idea" });
    await expect(drawn.getByRole("heading", { name: data.idea.title })).toBeVisible();
    await drawn.getByRole("button", { name: /Draw another/i }).click();
    await expect(drawn.getByRole("heading", { name: second.title })).toBeVisible();
  });

  test("an empty jar says so instead of failing silently", async ({ page, app }) => {
    app.world.ideas = [{ ...data.pendingIdea }];
    await app.enter("/dashboard/ideas");
    await page.getByRole("button", { name: /Draw from the jar/i }).click();
    await expect(page.getByText(/jar is empty/i)).toBeVisible();
  });
});

test.describe("starting a group from an idea", () => {
  test("an approved idea offers to start a project group", async ({ page, app }) => {
    await app.enter(`/dashboard/ideas/${data.idea.id}`);
    const start = page.getByRole("link", { name: /Start a project group from this idea/i });
    await expect(start).toBeVisible();
    await start.click();
    await expect(page).toHaveURL(/category=spg_registration/);
    await expect(page).toHaveURL(new RegExp(`idea=${data.idea.id}`));
  });

  test("the registration form names the idea and prefills from it", async ({ page, app }) => {
    await app.enter(`/dashboard/tickets?category=spg_registration&idea=${data.idea.id}`);
    const form = page.getByRole("dialog");
    await expect(form.getByText(new RegExp(`Based on idea.*${data.idea.title}`))).toBeVisible();
    await expect(form.getByLabel("Title", { exact: true })).toHaveValue(data.idea.title);
    await expect(form.getByLabel("Summary & Goals")).toHaveValue(data.idea.description);
    // Idea tracks call it "misc"; SPG tracks call the same thing "general".
    await expect(form.getByLabel("Track", { exact: true })).toHaveValue("research");
  });

  test("submitting carries the idea id to the API", async ({ page, app }) => {
    await app.enter(`/dashboard/tickets?category=spg_registration&idea=${data.idea.id}`);
    const form = page.getByRole("dialog");
    await expect(form.getByText(/Based on idea/)).toBeVisible();
    await form.getByLabel(/Estimated Duration/).fill("60");
    await form.getByLabel(/Report Frequency/).fill("14");
    await form.getByRole("button", { name: /Submit Ticket/ }).click();

    await expect
      .poll(() => app.world.calls.find(call => call.method === "POST" && call.path === "/tickets"))
      .toBeTruthy();
    const posted = app.world.calls.find(call => call.method === "POST" && call.path === "/tickets");
    const fields = (posted?.body as { fields?: Record<string, unknown> })?.fields ?? {};
    expect(fields.idea_id).toBe(data.idea.id);
  });

  test("a registration without an idea is unchanged", async ({ page, app }) => {
    await app.enter("/dashboard/tickets?category=spg_registration");
    const form = page.getByRole("dialog");
    await expect(form.getByLabel("Title", { exact: true })).toHaveValue("");
    await expect(form.getByText(/Based on idea/)).toHaveCount(0);
  });
});

test("a group started from an idea links back to it", async ({ page, app }) => {
  app.world.spgs = [{ ...data.spg, idea_id: data.idea.id }];
  await app.enter(`/dashboard/spg/${data.spg.id}`);
  const back = page.getByRole("link", { name: /Started from an Idea Jar idea/ });
  await expect(back).toHaveAttribute("href", `/dashboard/ideas/${data.idea.id}`);
});

test("a group with no idea shows no idea link", async ({ page, app }) => {
  await app.enter(`/dashboard/spg/${data.spg.id}`);
  await expect(page.getByRole("heading", { name: data.spg.name })).toBeVisible();
  await expect(page.getByRole("link", { name: /Started from an Idea Jar idea/ })).toHaveCount(0);
});
