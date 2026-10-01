import { test, expect, data } from "./fixtures/app";

/**
 * A research paper is an article with kind "research_paper" and paper details.
 * The Article Hub lists both, a tab narrows to one, and a paper's page shows
 * its authors, venue and a link to the paper.
 */
const paper = {
  ...data.article,
  id: "paper-1",
  slug: "scaling-laws-revisited",
  title: "Scaling laws revisited",
  summary: "Our reading-group write-up of a scaling-laws paper.",
  kind: "research_paper",
  paper: { authors: ["Ada Rao", "Vik Iyer"], venue: "NeurIPS 2025 Workshop", paper_url: "https://arxiv.org/abs/2509.01234" },
};

test.beforeEach(async ({ app }) => {
  app.world.articles = [{ ...data.article }, { ...paper }];
});

test("the hub lists articles and papers together", async ({ page, app }) => {
  await app.enter("/dashboard/articles");
  await expect(page.getByRole("heading", { name: data.article.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: paper.title })).toBeVisible();
  await expect(page.getByText("Ada Rao, Vik Iyer · NeurIPS 2025 Workshop")).toBeVisible();
});

test("the research papers tab shows only papers", async ({ page, app }) => {
  await app.enter("/dashboard/articles");
  await page.getByRole("tab", { name: "Research papers" }).click();
  await expect(page.getByRole("tab", { name: "Research papers" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: paper.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: data.article.title })).toHaveCount(0);
  expect(app.world.calls.some(call => call.path === "/blogs" && call.method === "GET")).toBe(true);
});

test("the articles tab hides papers, and counts older articles as articles", async ({ page, app }) => {
  await app.enter("/dashboard/articles");
  await page.getByRole("tab", { name: "Articles", exact: true }).click();
  await expect(page.getByRole("heading", { name: data.article.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: paper.title })).toHaveCount(0);
});

test("an empty papers tab says so", async ({ page, app }) => {
  app.world.articles = [{ ...data.article }];
  await app.enter("/dashboard/articles");
  await page.getByRole("tab", { name: "Research papers" }).click();
  await expect(page.getByText("No research papers found.")).toBeVisible();
});

test("a paper's page shows its authors, venue and a safe link", async ({ page, app }) => {
  await app.enter(`/dashboard/articles/${paper.slug}`);
  const details = page.getByRole("region", { name: "Paper details" });
  await expect(details.getByText("Ada Rao, Vik Iyer")).toBeVisible();
  await expect(details.getByText("NeurIPS 2025 Workshop")).toBeVisible();
  const link = details.getByRole("link", { name: /Read the paper/ });
  await expect(link).toHaveAttribute("href", paper.paper.paper_url);
  await expect(link).toHaveAttribute("rel", /noopener/);
});

test("a paper link that is not a web address is never rendered", async ({ page, app }) => {
  app.world.articles = [{ ...paper, paper: { ...paper.paper, paper_url: "javascript:alert(1)" } }];
  await app.enter(`/dashboard/articles/${paper.slug}`);
  await expect(page.getByRole("region", { name: "Paper details" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Read the paper/ })).toHaveCount(0);
});

test("a member can upvote an article", async ({ page, app }) => {
  await app.enter(`/dashboard/articles/${data.article.slug}`);
  const vote = page.getByRole("button", { name: /Upvote/ });
  await vote.click();
  await expect(vote).toHaveAttribute("aria-pressed", "true");
  await expect(vote).toHaveText(/13/);
});

test("an admin can publish a research paper", async ({ page, app }) => {
  app.world.profile = { ...data.adminProfile };
  await app.enter("/dashboard/admin?tab=articles");
  await page.getByLabel("Kind").selectOption("research_paper");
  await page.getByLabel("Authors (comma-separated)").fill("Ada Rao, Vik Iyer");
  await page.getByLabel("Link to the paper").fill("https://arxiv.org/abs/2509.01234");
  await page.getByLabel("Title").fill("Scaling laws revisited");
  await page.getByLabel("Summary").fill("Our reading-group write-up.");
  await page.getByLabel("Article content (plain text)").fill("What we found.");
  await page.getByRole("button", { name: /Publish article/ }).click();

  await expect.poll(() => app.world.calls.find(call => call.method === "POST" && call.path === "/blogs")).toBeTruthy();
  const body = app.world.calls.find(call => call.method === "POST" && call.path === "/blogs")?.body as Record<string, unknown>;
  expect(body).toMatchObject({ kind: "research_paper", paper: { authors: ["Ada Rao", "Vik Iyer"], paper_url: "https://arxiv.org/abs/2509.01234" } });
});
