// The Translation Pad in a real browser: the second pilot uses the same
// instance interfaces as the first - one mount binds the controls, a real
// destroy releases them, and the next mount binds again.

import { expect, test } from "@playwright/test";
import { bootApp, dismissGuide, openWindow } from "./helpers.mjs";

test("translation pad: mounting binds once, dispose releases, the next mount binds again", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await openWindow(page, "translationPad");
  await page.waitForSelector('[data-window="translationPad"]:not(.is-hidden)', { timeout: 15_000 });

  const lifecycle = await page.evaluate(() => {
    const api = window.AISystem6TranslationPad;
    api.mount();
    api.mount();
    const bound = api.resourceCount();
    const first = api.dispose();
    const second = api.dispose();
    const released = api.resourceCount();
    api.mount();
    return { bound, first: first.disposed, second: second.disposed, released, rebound: api.resourceCount() };
  });
  expect(lifecycle.bound).toBeGreaterThan(0);
  expect(lifecycle.first).toBe(true);
  expect(lifecycle.second).toBe(false);
  expect(lifecycle.released).toBe(0);
  expect(lifecycle.rebound).toBe(lifecycle.bound);

  // Clear really clears, through the listener the mount installed.
  await page.fill("#translation-pad-source", "A sentence the writer typed.");
  // Through the listener, not a pointer hit: a system modal can cover the desk
  // in one browser, and this test is about the binding.
  await page.evaluate(() => {
    document.querySelector("#translation-pad-clear").dispatchEvent(new Event("click", { bubbles: true }));
  });
  expect(await page.inputValue("#translation-pad-source")).toBe("");
});
