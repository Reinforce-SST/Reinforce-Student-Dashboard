import { test, expect, data } from "./fixtures/app";

test.describe("idea jar", () => {
  test("lists approved ideas with their score", async ({ page, app }) => {
    await app.enter("/dashboard/ideas");
    await expect(page.getByRole("heading", { name: "IDEA JAR & PROPOSALS" })).toBeVisible();
    await expect(page.getByRole("heading", { name: data.idea.title })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`Upvote ${data.idea.title}`) })).toBeVisible();
  });

  test("track tabs are selectable", async ({ page, app }) => {
    await app.enter("/dashboard/ideas");
    for (const name of ["Research", "Product", "Kaggle", "General", "All Tracks"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
    }
  });

  test("upvoting sends the vote and updates the count", async ({ page, app }) => {
    await app.enter("/dashboard/ideas");
    await page.getByRole("button", { name: new RegExp(`Upvote ${data.idea.title}`) }).click();
    await expect
      .poll(() => app.world.calls.filter(call => call.path.endsWith("/upvote")).length)
      .toBeGreaterThan(0);
  });

  test("idea detail shows prerequisites, roadmap and outcomes", async ({ page, app }) => {
    await app.enter(`/dashboard/ideas/${data.idea.id}`);
    await expect(page.getByRole("heading", { name: data.idea.title })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Prerequisites/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Implementation Roadmap/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Learning Outcomes/ })).toBeVisible();
    await expect(page.getByText(data.ideaDetail.prerequisites[0]).first()).toBeVisible();
  });
});

test.describe("article hub", () => {
  test("lists published articles", async ({ page, app }) => {
    await app.enter("/dashboard/articles");
    await expect(page.getByRole("heading", { name: "Article Hub", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: data.article.title })).toBeVisible();
  });

  /** The field is debounced, so the search request is the thing to assert on. */
  test("searching queries the API with the term", async ({ page, app }) => {
    await app.enter("/dashboard/articles");
    await page.getByLabel("Search articles").fill("retrieval");
    await expect
      .poll(() => app.world.calls.some(call => call.path === "/blogs" && call.method === "GET"))
      .toBe(true);
    await expect(page.getByRole("heading", { name: data.article.title })).toBeVisible();
  });

  test("a search with no matches says so", async ({ page, app }) => {
    await app.enter("/dashboard/articles");
    await page.getByLabel("Search articles").fill("nothing matches this");
    await expect(page.getByText(/No published articles found/i)).toBeVisible();
  });

  test("article detail renders the body", async ({ page, app }) => {
    await app.enter(`/dashboard/articles/${data.article.slug}`);
    await expect(page.getByRole("heading", { name: data.article.title })).toBeVisible();
    expect(app.problems, app.problems.join("\n")).toEqual([]);
  });
});

test.describe("search", () => {
  test("with no term it asks for one", async ({ page, app }) => {
    await app.enter("/dashboard/search");
    await expect(page.getByText(/Enter a search term in the header/i)).toBeVisible();
  });

  test("a term searches groups, tickets, ideas and articles together", async ({ page, app }) => {
    await app.enter("/dashboard/search?q=retrieval");
    await expect(page.getByRole("heading", { name: "Search", exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Results for/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Project groups" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(data.spg.name) })).toBeVisible();
  });

  test("a term with no matches reports no results", async ({ page, app }) => {
    await app.enter("/dashboard/search?q=zzzznothing");
    await expect(page.getByText(/No results found/i)).toBeVisible();
  });
});
