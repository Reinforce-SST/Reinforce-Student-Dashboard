import { test, expect, data } from "./fixtures/app";

/**
 * Article bodies are Markdown. Members write articles, so the body is
 * untrusted: raw HTML must stay text and unsafe links must not survive.
 */
async function openWith(page: import("@playwright/test").Page, app: { world: { articles: Record<string, unknown>[] }; enter: (path: string) => Promise<void> }, content: string) {
  app.world.articles = [{ ...data.article, content }];
  await app.enter(`/dashboard/articles/${data.article.slug}`);
  return page.getByRole("main");
}

test("Markdown is formatted, not shown as symbols", async ({ page, app }) => {
  const main = await openWith(page, app, [
    "# Method",
    "We **bootstrapped** a judgement set with _care_.",
    "",
    "- first point",
    "- second point",
    "",
    "1. step one",
    "2. step two",
    "",
    "> Quoted insight.",
    "",
    "Run `pytest -q` to check, then read [the paper](https://arxiv.org/abs/1234.5678).",
    "",
    "```python",
    "print('hi')",
    "```",
    "",
    "| Model | Score |",
    "| --- | --- |",
    "| BM25 | 0.61 |",
  ].join("\n"));

  // The page title is the only h1; a Markdown h1 becomes an h2.
  await expect(main.getByRole("heading", { level: 2, name: "Method" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(main.locator("strong", { hasText: "bootstrapped" })).toBeVisible();
  await expect(main.locator("em", { hasText: "care" })).toBeVisible();
  await expect(main.getByRole("list").first().getByRole("listitem")).toHaveText(["first point", "second point"]);
  await expect(main.locator("ol li")).toHaveText(["step one", "step two"]);
  await expect(main.locator("blockquote")).toHaveText("Quoted insight.");
  await expect(main.locator("p code", { hasText: "pytest -q" })).toBeVisible();
  await expect(main.locator("pre code")).toHaveText("print('hi')");
  await expect(main.getByRole("table").getByRole("cell", { name: "0.61" })).toBeVisible();

  const link = main.getByRole("link", { name: "the paper" });
  await expect(link).toHaveAttribute("href", "https://arxiv.org/abs/1234.5678");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(main.getByText("**bootstrapped**")).toHaveCount(0);
});

test("raw HTML in an article stays text and never runs", async ({ page, app }) => {
  const errors: string[] = [];
  page.on("dialog", dialog => { errors.push(dialog.message()); void dialog.dismiss(); });
  const main = await openWith(page, app, [
    "Before",
    "",
    "<script>alert('script')</script>",
    "",
    "<img src=x onerror=\"alert('img')\">",
    "",
    "<a href=\"javascript:alert('a')\">html link</a>",
    "",
    "After",
  ].join("\n"));
  await expect(main.getByText("After")).toBeVisible();
  await expect(main.locator("article script, main script")).toHaveCount(0);
  await expect(main.locator("img[onerror]")).toHaveCount(0);
  await expect(main.getByRole("link", { name: "html link" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a Markdown link to javascript: or data: is not a working link", async ({ page, app }) => {
  const main = await openWith(page, app, "[click me](javascript:alert(1)) and [data](data:text/html,<script>alert(1)</script>) and [safe](https://example.com)");
  // Wait for the body first; checking before it loads would pass on nothing.
  await expect(main.getByRole("link", { name: "safe" })).toBeVisible();
  const hrefs = await main.locator("a").evaluateAll(links => links.map(link => link.getAttribute("href") ?? ""));
  expect(hrefs).toContain("https://example.com");
  expect(hrefs.filter(href => /^\s*(javascript|data):/i.test(href))).toEqual([]);
});

test("a wide table scrolls inside the article instead of the page", async ({ page, app }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const header = `| ${Array.from({ length: 12 }, (_, i) => `Column ${i + 1}`).join(" | ")} |`;
  const rule = `| ${Array.from({ length: 12 }, () => "---").join(" | ")} |`;
  const row = `| ${Array.from({ length: 12 }, (_, i) => `value-${i + 1}`).join(" | ")} |`;
  const main = await openWith(page, app, [header, rule, row].join("\n"));
  await expect(main.getByRole("table")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
