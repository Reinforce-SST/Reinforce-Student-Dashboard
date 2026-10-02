import { test, expect, data } from "./fixtures/app";

/**
 * Learning Resources: admins curate links, members browse them by track and
 * type. An admin can save an event's recording, slides and write-up into the
 * hub, and those entries link back to the event.
 */
const resourcesCall = (app: { world: { calls: { method: string; path: string }[] } }) =>
  app.world.calls.filter(call => call.method === "GET" && call.path === "/learning-resources");

test.describe("the hub", () => {
  test("lists published resources and never hidden ones", async ({ page, app }) => {
    await app.enter("/dashboard/resources");
    await expect(page.getByRole("heading", { name: "Practical Deep Learning for Coders" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tabular competition playbook" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Draft reading list" })).toHaveCount(0);
    // Asked without a token, so an admin browsing the hub sees what members see.
    expect(resourcesCall(app).every(call => !(call as { auth?: string }).auth)).toBe(true);
  });

  test("a track tab narrows the list", async ({ page, app }) => {
    await app.enter("/dashboard/resources");
    await page.getByRole("tab", { name: "Kaggle" }).click();
    await expect(page.getByRole("tab", { name: "Kaggle" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Tabular competition playbook" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Practical Deep Learning for Coders" })).toHaveCount(0);
  });

  test("the type filter and search go to the API", async ({ page, app }) => {
    await app.enter("/dashboard/resources");
    await page.getByLabel("Type").selectOption("course");
    await expect(page.getByRole("heading", { name: "Practical Deep Learning for Coders" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tabular competition playbook" })).toHaveCount(0);

    await page.getByLabel("Type").selectOption("");
    await page.getByLabel("Search resources").fill("tabular");
    await expect(page.getByRole("heading", { name: "Tabular competition playbook" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Practical Deep Learning for Coders" })).toHaveCount(0);
  });

  test("filters with no match say so", async ({ page, app }) => {
    await app.enter("/dashboard/resources");
    await page.getByRole("tab", { name: "Product" }).click();
    await expect(page.getByText("No resources match these filters.")).toBeVisible();
  });

  test("the phone header names the page", async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await app.enter("/dashboard/resources");
    await expect(page.getByRole("banner").getByText("Resources", { exact: true })).toBeVisible();
  });

  test("an empty hub says so", async ({ page, app }) => {
    app.world.resources = [];
    await app.enter("/dashboard/resources");
    await expect(page.getByText("No learning resources yet.")).toBeVisible();
  });

  test("a resource opens in a new tab, and one from an event links to it", async ({ page, app }) => {
    await app.enter("/dashboard/resources");
    const card = page.getByRole("article").filter({ hasText: "Tabular competition playbook" });
    const open = card.getByRole("link", { name: /Open resource/ });
    await expect(open).toHaveAttribute("href", "https://www.kaggle.com/learn");
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", /noopener/);
    await expect(card.getByText("Article · Kaggle")).toBeVisible();
    await card.getByRole("link", { name: data.pastEvent.title }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/events/${data.pastEvent.id}$`));
  });

  test("a link that is not a web address is never rendered", async ({ page, app }) => {
    app.world.resources = [{ ...data.learningResources[0], url: "javascript:alert(1)" }];
    await app.enter("/dashboard/resources");
    await expect(page.getByRole("heading", { name: "Practical Deep Learning for Coders" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open resource/ })).toHaveCount(0);
  });

  test("a failed load can be retried", async ({ page, app }) => {
    app.world.fail.add("/learning-resources");
    await app.enter("/dashboard/resources");
    await expect(page.getByRole("alert").filter({ hasText: "Learning resources could not be loaded." })).toBeVisible();
    app.world.fail.delete("/learning-resources");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("heading", { name: "Practical Deep Learning for Coders" })).toBeVisible();
  });
});

test.describe("the admin panel", () => {
  test.beforeEach(({ app }) => {
    app.world.profile = { ...data.adminProfile };
  });

  test("lists every resource, hidden ones included", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=resources");
    const list = page.getByRole("list", { name: "Learning resources" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list.getByRole("listitem").filter({ hasText: "Draft reading list" })).toContainText("hidden");
    // Event titles keep their own casing.
    await expect(list.getByRole("listitem").filter({ hasText: "Tabular competition playbook" }).locator("small")).toHaveCSS("text-transform", "none");
  });

  test("an admin adds a resource", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=resources");
    await page.getByLabel("Title").fill("The Illustrated Transformer");
    await page.getByLabel("Link").fill("https://jalammar.github.io/illustrated-transformer/");
    await page.getByLabel("Description (optional)").fill("Visual walk-through of attention.");
    await page.getByLabel("Track").selectOption("research");
    await page.getByRole("combobox", { name: /^Type/ }).selectOption("article");
    await page.getByLabel("Tags (comma-separated, up to 10)").fill("nlp, attention");
    await page.getByLabel("Related event (optional)").selectOption(data.pastEvent.id);
    await page.getByRole("button", { name: "Add resource" }).click();

    await expect(page.getByRole("status")).toHaveText("Added “The Illustrated Transformer”.");
    const post = app.world.calls.find(call => call.method === "POST" && call.path === "/learning-resources");
    expect(post?.body).toEqual({
      title: "The Illustrated Transformer",
      url: "https://jalammar.github.io/illustrated-transformer/",
      description: "Visual walk-through of attention.",
      track: "research",
      type: "article",
      tags: ["nlp", "attention"],
      event_id: data.pastEvent.id,
      status: "published",
    });
    await expect(page.getByRole("list", { name: "Learning resources" }).getByRole("listitem")).toHaveCount(4);
    await expect(page.getByLabel("Title")).toHaveValue("");
  });

  test("the browser refuses a link that is not a web address", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=resources");
    await page.getByLabel("Title").fill("Bad link");
    await page.getByLabel("Link").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Add resource" }).click();
    await expect(page.getByLabel("Link")).toHaveJSProperty("validity.valid", false);
    expect(app.world.calls.some(call => call.method === "POST" && call.path === "/learning-resources")).toBe(false);
  });

  test("an admin edits a resource", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=resources");
    await page.getByRole("button", { name: "Edit Practical Deep Learning for Coders" }).click();
    await expect(page.getByRole("heading", { name: "Edit resource" })).toBeVisible();
    await expect(page.getByLabel("Link")).toHaveValue("https://course.fast.ai");
    await page.getByLabel("Title").fill("fast.ai, part 1");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("status")).toHaveText("Saved “fast.ai, part 1”.");
    const put = app.world.calls.find(call => call.method === "PUT" && call.path === "/learning-resources/lr-fastai");
    expect(put?.body).toMatchObject({ title: "fast.ai, part 1", url: "https://course.fast.ai", track: "research", type: "course" });
    await expect(page.getByRole("heading", { name: "Add a resource" })).toBeVisible();
  });

  test("an admin hides and shows a resource", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=resources");
    await page.getByRole("button", { name: "Hide Practical Deep Learning for Coders" }).click();
    await expect(page.getByRole("status")).toHaveText("Hid “Practical Deep Learning for Coders” from members.");
    expect(app.world.calls.find(call => call.method === "PUT")?.body).toEqual({ status: "hidden" });
    await page.getByRole("button", { name: "Show Practical Deep Learning for Coders" }).click();
    await expect(page.getByRole("status")).toHaveText("“Practical Deep Learning for Coders” is visible to members again.");
  });

  test("an admin deletes a resource after confirming", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=resources");
    page.once("dialog", dialog => void dialog.dismiss());
    await page.getByRole("button", { name: "Delete Draft reading list" }).click();
    expect(app.world.calls.some(call => call.method === "DELETE")).toBe(false);

    page.once("dialog", dialog => void dialog.accept());
    await page.getByRole("button", { name: "Delete Draft reading list" }).click();
    await expect(page.getByRole("status")).toHaveText("Deleted “Draft reading list”.");
    await expect(page.getByRole("list", { name: "Learning resources" }).getByRole("listitem")).toHaveCount(2);
  });

  test("an admin saves an event's links, and saving again adds nothing", async ({ page, app }) => {
    app.world.events = app.world.events.map(event => event.id === data.pastEvent.id
      ? { ...event, resources: { recording_url: "https://youtu.be/sprint", slides_url: "https://slides.com/sprint", writeup_url: null } }
      : event);
    await app.enter("/dashboard/admin?tab=resources");
    await page.getByRole("combobox", { name: /^Event/ }).selectOption(data.pastEvent.id);
    await page.getByRole("button", { name: "Save to Learning Resources" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved 2 links (recording, slides).");
    const list = page.getByRole("list", { name: "Learning resources" });
    await expect(list.getByRole("listitem").filter({ hasText: `${data.pastEvent.title}: slides` })).toContainText(`from ${data.pastEvent.title}`);

    await page.getByRole("button", { name: "Save to Learning Resources" }).click();
    await expect(page.getByRole("status")).toHaveText("Already in the hub: recording, slides.");
    await expect(list.getByRole("listitem")).toHaveCount(5);
  });

  test("saving an event reports a bad link and an event with none", async ({ page, app }) => {
    app.world.events = app.world.events.map(event => event.id === data.pastEvent.id
      ? { ...event, resources: { recording_url: "javascript:alert(1)", slides_url: null, writeup_url: null } }
      : event);
    await app.enter("/dashboard/admin?tab=resources");
    await page.getByRole("combobox", { name: /^Event/ }).selectOption(data.pastEvent.id);
    await page.getByRole("button", { name: "Save to Learning Resources" }).click();
    await expect(page.getByRole("status")).toHaveText("Skipped recording: not a web address. Fix the link on the event and save again.");

    await page.getByRole("combobox", { name: /^Event/ }).selectOption(data.upcomingEvent.id);
    await page.getByRole("button", { name: "Save to Learning Resources" }).click();
    await expect(page.getByRole("status")).toHaveText("This event has no recording, slides or write-up links yet.");
  });
});
