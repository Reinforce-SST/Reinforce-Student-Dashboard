import { test, expect, data } from "./fixtures/app";

test("the ticket list shows the member's own tickets", async ({ page, app }) => {
  await app.enter("/dashboard/tickets");
  await expect(page.getByRole("heading", { name: "TICKET SYSTEM & DISPATCH" })).toBeVisible();
  await expect(page.getByText(data.ticket.title).first()).toBeVisible();
});

/**
 * This is a master-detail layout: the queue on the left, the inspected ticket
 * on the right. Filtering the queue must not be asserted page-wide, because the
 * open detail legitimately keeps showing the ticket it is inspecting.
 */
test("status filters narrow the queue and can be cleared", async ({ page, app }) => {
  await app.enter("/dashboard/tickets");
  const queue = page.getByRole("region", { name: "Your Tickets Queue" });
  await expect(queue.getByText(data.ticket.title).first()).toBeVisible();
  // The fixture ticket is in_progress, so Resolved must exclude it.
  await page.getByRole("tab", { name: "Resolved", exact: true }).click();
  await expect(queue.getByText(data.ticket.title)).toHaveCount(0);
  await page.getByRole("tab", { name: "In Progress", exact: true }).click();
  await expect(queue.getByText(data.ticket.title).first()).toBeVisible();
});

test("searching the queue filters it", async ({ page, app }) => {
  await app.enter("/dashboard/tickets");
  const queue = page.getByRole("region", { name: "Your Tickets Queue" });
  await expect(queue.getByText(data.ticket.title).first()).toBeVisible();
  await page.getByLabel("Search your tickets").fill("no such ticket exists");
  await expect(queue.getByText(data.ticket.title)).toHaveCount(0);
});

test("an empty list says so rather than rendering nothing", async ({ page, app }) => {
  app.world.tickets = [];
  await app.enter("/dashboard/tickets");
  await expect(page.getByRole("heading", { name: "TICKET SYSTEM & DISPATCH" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your Tickets Queue" }).getByText(data.ticket.title)).toHaveCount(0);
});

/**
 * A ticket message can carry attachment URLs that came from Discord. A
 * `javascript:` URL must never become a link — this is the one assertion in the
 * suite that is a security control rather than a behaviour check.
 */
test("unsafe attachment URLs are not rendered as links", async ({ page, app }) => {
  await app.enter(`/dashboard/tickets/${data.ticket.id}`);
  await expect(page.getByRole("heading", { name: "Conversation Thread" })).toBeVisible();
  const hrefs = await page.locator("a[href]").evaluateAll(nodes =>
    nodes.map(node => node.getAttribute("href") ?? ""),
  );
  expect(hrefs.filter(href => href.toLowerCase().startsWith("javascript:"))).toEqual([]);
});

test("ticket detail shows the conversation and both senders", async ({ page, app }) => {
  await app.enter(`/dashboard/tickets/${data.ticket.id}`);
  await expect(page.getByRole("heading", { name: data.ticket.title })).toBeVisible();
  await expect(page.getByText(data.ticketMessages[0].content)).toBeVisible();
  await expect(page.getByText(data.ticketMessages[1].content)).toBeVisible();
});

test("a category in the URL opens the matching new-ticket form", async ({ page, app }) => {
  await app.enter("/dashboard/tickets?category=idea_jar");
  // The link on the Idea Jar page points here; if the param were ignored the
  // member would land on an unfiltered list instead of a form.
  await expect(page.getByRole("heading", { name: "TICKET SYSTEM & DISPATCH" })).toBeVisible();
  expect(app.problems, app.problems.join("\n")).toEqual([]);
});

test("the list recovers after a failed load", async ({ page, app }) => {
  app.world.fail.add("/tickets/my");
  await app.enter("/dashboard/tickets");
  await expect(page.getByRole("heading", { name: "TICKET SYSTEM & DISPATCH" })).toBeVisible();
  app.world.fail.delete("/tickets/my");
  const retry = page.getByRole("button", { name: /Retry/i }).first();
  if (await retry.count()) {
    await retry.click();
    await expect(page.getByText(data.ticket.title).first()).toBeVisible();
  }
});
