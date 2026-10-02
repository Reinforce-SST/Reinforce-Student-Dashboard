import { test, expect, data, expectNoHorizontalOverflow } from "./fixtures/app";

/**
 * Learning Resources: admins curate links in a nested folder tree; members
 * browse folders and filter their links by type and search.
 */
const resourcesCall = (app: { world: { calls: { method: string; path: string }[] } }) =>
  app.world.calls.filter(call => call.method === "GET" && call.path === "/learning-resources");

test.describe("the hub", () => {
  test("lists published resources and never hidden ones", async ({ page, app }) => {
    await app.enter("/dashboard/resources");
    await page.getByRole("button", { name: "Theory folder" }).click();
    await page.getByRole("button", { name: "CML folder" }).click();
    await expect(page.getByRole("heading", { name: "Practical Deep Learning for Coders" })).toBeVisible();
    await page.getByRole("button", { name: "All resources" }).click();
    await page.getByRole("button", { name: "Kaggle folder" }).click();
    await expect(page.getByRole("heading", { name: "Tabular competition playbook" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Draft reading list" })).toHaveCount(0);
    // Asked without a token, so an admin browsing the hub sees what members see.
    expect(resourcesCall(app).every(call => !(call as { auth?: string }).auth)).toBe(true);
  });

  test("members navigate the starter folders like a file manager", async ({ page, app }) => {
    app.world.resources.push({
      ...data.learningResources[0],
      id: "lr-cml-second",
      title: "Another CML course",
      category_id: "theory/cml",
      url: "https://example.com/another-cml-course",
    });
    await app.enter("/dashboard/resources");
    await expect(page.getByRole("button", { name: "Theory folder" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kaggle folder" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Product folder" })).toBeVisible();
    await expect(page.getByText("No resources in this folder.")).toHaveCount(0);

    await page.getByRole("button", { name: "Theory folder" }).click();
    await expect(page.getByRole("button", { name: "CML folder" })).toBeVisible();
    await expect(page.getByRole("button", { name: "DML folder" })).toBeVisible();
    await expect(page.getByRole("button", { name: "RL folder" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Theory");

    await page.getByRole("button", { name: "CML folder" }).click();
    await expect(page.getByRole("heading", { name: "Practical Deep Learning for Coders" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Another CML course" })).toBeVisible();
    await page.getByRole("button", { name: "All resources" }).click();
    await page.getByRole("button", { name: "Kaggle folder" }).click();
    await expect(page.getByRole("heading", { name: "Tabular competition playbook" })).toBeVisible();
  });

  test("the pool supports nested event folders with links beside subfolders", async ({ page, app }) => {
    app.world.resources.push(
      {
        ...data.learningResources[0],
        id: "lr-sandbox-overview",
        title: "Sandbox 1 overview",
        category_id: "events/sandbox-1",
        url: "https://example.com/sandbox-overview",
      },
      {
        ...data.learningResources[0],
        id: "lr-sandbox-mnist",
        title: "MNIST CNN walkthrough",
        category_id: "events/sandbox-1/cnn/mnist",
        url: "https://example.com/mnist-cnn",
      },
    );
    await app.enter("/dashboard/resources");
    await page.getByRole("button", { name: "Events folder" }).click();
    await page.getByRole("button", { name: "Sandbox 1 folder" }).click();
    await expect(page.getByRole("heading", { name: "Sandbox 1 overview" })).toBeVisible();
    await page.getByRole("button", { name: "CNN folder" }).click();
    await page.getByRole("button", { name: "MNIST folder" }).click();
    await expect(page.getByRole("heading", { name: "MNIST CNN walkthrough" })).toBeVisible();
  });

  test("the type filter and search go to the API", async ({ page, app }) => {
    await app.enter("/dashboard/resources");
    await page.getByRole("button", { name: "Theory folder" }).click();
    await page.getByRole("button", { name: "CML folder" }).click();
    await page.getByLabel("Type").selectOption("course");
    await expect(page.getByRole("heading", { name: "Practical Deep Learning for Coders" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tabular competition playbook" })).toHaveCount(0);

    await page.getByLabel("Type").selectOption("");
    await page.getByRole("button", { name: "All resources" }).click();
    await page.getByLabel("Search resources").fill("tabular");
    await expect(page.getByRole("heading", { name: "Tabular competition playbook" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Practical Deep Learning for Coders" })).toHaveCount(0);
  });

  test("filters with no match say so", async ({ page, app }) => {
    await app.enter("/dashboard/resources");
    await page.getByLabel("Search resources").fill("no such resource");
    await expect(page.getByText("No resources match these filters.")).toBeVisible();
  });

  test("the phone header names the page", async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await app.enter("/dashboard/resources");
    await expect(page.getByRole("banner").getByText("Resources", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Theory folder" })).toBeVisible();
    await page.getByRole("button", { name: "Theory folder" }).click();
    await expect(page.getByRole("button", { name: "CML folder" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("an empty hub says so", async ({ page, app }) => {
    app.world.resources = [];
    await app.enter("/dashboard/resources");
    await expect(page.getByText("No learning resources yet.")).toBeVisible();
  });

  test("a resource opens in a new tab, and one from an event links to it", async ({ page, app }) => {
    await app.enter("/dashboard/resources");
    await page.getByRole("button", { name: "Kaggle folder" }).click();
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
    app.world.resources = [{ ...data.learningResources[0], category_id: null, url: "javascript:alert(1)" }];
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
    await expect(page.getByRole("button", { name: "Theory folder" })).toBeVisible();
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
    await page.getByLabel("Link", { exact: true }).fill("https://jalammar.github.io/illustrated-transformer/");
    await page.getByLabel("Description (optional)").fill("Visual walk-through of attention.");
    await page.getByLabel("Category path").fill("Theory / CML / Transformer Models");
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
      category_id: "theory/cml/transformer-models",
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
    await page.getByLabel("Link", { exact: true }).fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Add resource" }).click();
    await expect(page.getByLabel("Link", { exact: true })).toHaveJSProperty("validity.valid", false);
    expect(app.world.calls.some(call => call.method === "POST" && call.path === "/learning-resources")).toBe(false);
  });

  test("an admin edits a resource", async ({ page, app }) => {
    await app.enter("/dashboard/admin?tab=resources");
    await page.getByRole("button", { name: "Edit Practical Deep Learning for Coders" }).click();
    await expect(page.getByRole("heading", { name: "Edit resource" })).toBeVisible();
    await expect(page.getByLabel("Link", { exact: true })).toHaveValue("https://course.fast.ai");
    await page.getByLabel("Title").fill("fast.ai, part 1");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("status")).toHaveText("Saved “fast.ai, part 1”.");
    const put = app.world.calls.find(call => call.method === "PUT" && call.path === "/learning-resources/lr-fastai");
    expect(put?.body).toMatchObject({ title: "fast.ai, part 1", url: "https://course.fast.ai", category_id: "theory/cml", track: "research", type: "course" });
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

test.describe("event links from the shared pool", () => {
  test("an admin can attach several pooled links and add a new link from the event editor", async ({ page, app }) => {
    app.world.profile = { ...data.adminProfile };
    app.world.events = [{ ...data.upcomingEvent, resources: { slides_url: null, learning_resource_ids: [] } }];
    await app.enter("/dashboard/admin?tab=events");
    await page.getByRole("button", { name: /Edit Existing Event/ }).click();
    await page.getByRole("button", { name: /Edit Event/ }).first().click();

    await expect(page.getByLabel("Show Practical Deep Learning for Coders on this event")).toBeVisible();
    await page.getByLabel("Show Practical Deep Learning for Coders on this event").check();
    await page.getByLabel("Show Tabular competition playbook on this event").check();
    await page.getByLabel("Link title").fill("Workshop notebook");
    await page.getByLabel("Web link").fill("https://example.com/workshop-notebook");
    await expect(page.getByLabel("Category path")).toHaveValue("Events / Paper Reading Week 10");
    await page.getByRole("button", { name: "Add to shared pool" }).click();

    await expect(page.getByLabel("Show Workshop notebook on this event")).toBeChecked();
    await page.getByRole("button", { name: /Save Event Changes/ }).click();
    await expect.poll(() => app.world.calls.some(call => call.method === "PUT" && call.path === `/events/${data.upcomingEvent.id}`)).toBe(true);
    const createdLink = app.world.calls.find(call => call.method === "POST" && call.path === "/learning-resources");
    expect(createdLink?.body).toMatchObject({
      category_id: "events/paper-reading-week-10",
      track: "general",
    });
    const update = [...app.world.calls].reverse().find(call => call.method === "PUT" && call.path === `/events/${data.upcomingEvent.id}`)?.body as {
      resources?: { learning_resource_ids?: string[] };
    };
    expect(update?.resources?.learning_resource_ids).toHaveLength(3);
    expect(update?.resources?.learning_resource_ids).toContain("lr-fastai");
    expect(update?.resources?.learning_resource_ids).toContain("lr-kaggle");
    expect(update?.resources?.learning_resource_ids).toContain("lr-4");
  });

  test("event pages show attached published links from the pool", async ({ page, app }) => {
    app.world.events = [{
      ...data.upcomingEvent,
      resources: { learning_resource_ids: ["lr-fastai", "lr-kaggle", "lr-hidden"] },
    }];
    await app.enter(`/dashboard/events/${data.upcomingEvent.id}`);
    await expect(page.getByRole("link", { name: /Practical Deep Learning for Coders/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tabular competition playbook/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Draft reading list/ })).toHaveCount(0);
    expect(app.world.calls.some(call => call.method === "GET" && call.path === `/learning-resources/for-event/${data.upcomingEvent.id}`)).toBe(true);
  });
});
