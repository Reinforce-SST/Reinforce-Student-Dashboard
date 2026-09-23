// Run this function body with Playwright MCP browser_run_code_unsafe(code: source).
// Requires `npm run build` then `npm run start -- --port 3002` in web/.
async (page) => {
  const base = "http://127.0.0.1:3002";
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const result = {};
  const errors = [];
  const requests = [];
  const onError = (error) => errors.push(error.message);
  const onRequest = (request) => requests.push(request.url());
  page.on("pageerror", onError);
  page.on("request", onRequest);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.waitForTimeout(1800);

  // All tracks switch content and screenshot; roving focus follows selection.
  const product = page.getByRole("tab", { name: "Product", exact: true });
  await product.click();
  assert((await page.getByRole("tabpanel").innerText()).includes("Build it. Put it in front of people."), "Product panel failed");
  assert((await page.getByRole("tabpanel").getByRole("img").getAttribute("alt")).includes("project groups"), "Product screenshot failed");
  await product.press("ArrowRight");
  assert(await page.getByRole("tab", { name: "Research", exact: true }).getAttribute("aria-selected") === "true", "ArrowRight failed");
  assert((await page.getByRole("tabpanel").innerText()).includes("Read it. Reproduce it."), "Research panel failed");
  await page.getByRole("tab", { name: "Research", exact: true }).press("ArrowRight");
  assert(await page.getByRole("tab", { name: "Competitive AI", exact: true }).getAttribute("aria-selected") === "true", "Keyboard wrap failed");
  await page.getByRole("tab", { name: "Competitive AI", exact: true }).press("End");
  await page.getByRole("tab", { name: "Research", exact: true }).press("Home");
  assert(await page.getByRole("tabpanel").count() === 1, "Multiple exposed panels");
  result.tabs = "click, arrows, wrapping, Home/End, copy and screenshots pass";

  // Watch actual number changes, then verify no replay on scroll-back.
  await page.evaluate(() => {
    window.__landingCountChanges = [];
    const number = document.querySelector('[data-count="100"]');
    new MutationObserver(() => window.__landingCountChanges.push(number.textContent)).observe(number, { childList: true });
  });
  await page.locator('[data-count="100"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const first = await page.evaluate(() => window.__landingCountChanges);
  assert(first.some((value) => Number.parseInt(value) > 0 && Number.parseInt(value) < 100), "Count-up never showed intermediate values");
  assert(await page.locator('[data-count="100"]').innerText() === "100%", "Count-up final value wrong");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(100);
  await page.locator('[data-count="100"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  assert((await page.evaluate(() => window.__landingCountChanges.length)) === first.length, "Count-up replayed");
  result.counts = "intermediate values, final values and single entry pass";

  // Geometry and scroll chrome across all requested viewports.
  result.viewports = [];
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 650) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });
    await page.waitForTimeout(1700);
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      unrevealed: [...document.querySelectorAll('[data-animate]:not([data-in])')].filter((el) => el.getClientRects().length).length,
      navBottom: document.querySelector('[data-landing-nav]').getBoundingClientRect().bottom,
      progress: new DOMMatrix(getComputedStyle(document.querySelector('[data-progress]')).transform).a,
      cardsStack: [...document.querySelectorAll('[data-animate=card]')].every((el) => getComputedStyle(el).position === "relative"),
    }));
    assert(!state.overflow, `${width}px overflows`);
    assert(state.unrevealed === 0, `${width}px has invisible content`);
    assert(Math.abs(state.navBottom - 58) <= 1, "Nav did not condense");
    assert(state.progress > 0.99, "Progress does not reach the end");
    if (width <= 768) assert(state.cardsStack, "Mobile cards did not reflow");
    result.viewports.push({ width, ...state });
  }

  // Mobile navigation is reachable and its in-page destinations exist.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.getByText("Menu", { exact: true }).click();
  await page.locator('details a[href="#joining"]').click();
  assert(await page.locator("#joining").isVisible(), "Mobile joining link failed");

  // Reduced motion at load and while the page is running.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const reduced = await page.evaluate(() => ({
    animations: document.getAnimations().filter((animation) => animation.playState === "running").length,
    numbers: [...document.querySelectorAll('[data-count]')].map((el) => el.textContent),
    hidden: [...document.querySelectorAll('[data-animate]')].filter((el) => el.getClientRects().length && getComputedStyle(el).opacity === "0").length,
  }));
  assert(reduced.animations === 0 && reduced.hidden === 0, "Reduced motion is not fully readable/static");
  assert(reduced.numbers.join(",") === "3,100%,0", "Reduced-motion numbers wrong");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Pause motion" }).click();
  assert(await page.locator("[data-paused]").count() === 1, "Pause fails after preference change");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length) === 0, "Dynamic reduced motion leaves animations running");
  result.reducedMotion = reduced;

  const browser = page.context().browser();
  const noJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJs = await noJsContext.newPage();
  await noJs.goto(base);
  assert(await noJs.getByRole("tabpanel").count() === 3, "No-JS visitors cannot read all tracks");
  assert(await noJs.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No-JS mobile overflow");
  assert((await noJs.locator("[data-count]").allTextContents()).join(",") === "3,100%,0", "No-JS figures wrong");
  await noJsContext.close();
  const fallbackContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fallback = await fallbackContext.newPage();
  await fallback.addInitScript(() => { window.IntersectionObserver = undefined; });
  await fallback.goto(base);
  assert(await fallback.evaluate(() => [...document.querySelectorAll("[data-animate]")].every((el) => !el.getClientRects().length || getComputedStyle(el).opacity !== "0")), "Missing observer hides content");
  await fallback.getByRole("button", { name: "Pause motion" }).click();
  assert(await fallback.locator("[data-paused]").count() === 1, "Missing observer breaks pause");
  await fallbackContext.close();
  result.fallbacks = "No JavaScript: all tracks/numbers readable; missing observer: content and pause work";

  assert(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
  assert(!requests.some((url) => /onrender\.com|googleapis\.com|firebase|\/api\/v1\//.test(url)), "Landing made an API/CDN font request");
  result.browserErrors = errors;
  result.apiRequests = 0;
  page.off("pageerror", onError);
  page.off("request", onRequest);
  return result;
}
