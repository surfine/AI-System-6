import { expect, test } from "@playwright/test";
import {
  bootApp,
  closeToEmptyDesk,
  expectModal,
  fulfillFromDisk,
  modalCancel,
  modalRetry,
  spyOnLazyScript,
} from "./helpers.mjs";

const DOCMAP = "app/features/docmap.js";

test.describe("lazy loader failure handling", () => {
  test("404 shows a retryable error, never runs the callback, and retry succeeds", async ({ page }) => {
    await bootApp(page);
    const spy = spyOnLazyScript(page, DOCMAP, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/javascript",
        body: "not found",
        headers: { "Cache-Control": "no-store" },
      });
    });

    const pending = page.evaluate(() => {
      window.__docmapCallbackRan = false;
      return window
        .withDocMap(() => { window.__docmapCallbackRan = true; })
        .catch((error) => ({ rejected: error && error.message }));
    });

    const { message } = await expectModal(page);
    expect(message).toContain("failed to load");
    expect(await page.evaluate(() => window.__docmapCallbackRan)).toBe(false);
    expect(await page.evaluate(() => !!document.querySelector('script[data-lazy-src="app/features/docmap.js"]'))).toBe(false);

    // Cancel: the original error is rethrown and the module stays unloaded.
    await modalCancel(page);
    const cancelled = await pending;
    expect(cancelled.rejected).toContain("Could not load");
    expect(await page.evaluate(() => window.AISystem6DocMapLoaded)).toBeFalsy();

    // Retry after the failure now succeeds because the promise cache and the
    // failed script node were cleared.
    await page.unroute(spy.pattern);
    const second = page.evaluate(() => {
      window.__docmapCallbackRan = false;
      return window
        .withDocMap(() => { window.__docmapCallbackRan = true; })
        .then(() => ({ ok: true }))
        .catch((error) => ({ rejected: error && error.message }));
    });
    await second;
    expect(await page.evaluate(() => window.__docmapCallbackRan)).toBe(true);
    expect(await page.evaluate(() => window.AISystem6DocMapLoaded)).toBe(true);
  });

  test("timeout shows an error, keeps the app ready, and allows retry", async ({ page }) => {
    await page.addInitScript(() => {
      window.AISystem6LazyScriptTimeoutMs = 800;
    });
    await bootApp(page);

    spyOnLazyScript(page, DOCMAP, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "window.__lateScript = true;",
      });
    });

    const pending = page.evaluate(() => {
      window.__docmapCallbackRan = false;
      return window
        .withDocMap(() => { window.__docmapCallbackRan = true; })
        .catch((error) => ({ rejected: error && error.message }));
    });

    const { message } = await expectModal(page);
    expect(message).toContain("Timed out");
    expect(await page.evaluate(() => window.__docmapCallbackRan)).toBe(false);
    expect(await page.evaluate(() => document.body.dataset.appReady)).toBe("ready");
    await modalCancel(page);
    const cancelled = await pending;
    expect(cancelled.rejected).toContain("Timed out");
  });

  test("script that loads without installing its flag is treated as a failure", async ({ page }) => {
    await bootApp(page);
    spyOnLazyScript(page, DOCMAP, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "window.__docmapScriptExecuted = true;",
      });
    });

    const pending = page.evaluate(() => {
      window.__docmapCallbackRan = false;
      return window
        .withDocMap(() => { window.__docmapCallbackRan = true; })
        .catch((error) => ({ rejected: error && error.message }));
    });

    const { message } = await expectModal(page);
    expect(message).toContain("did not install");
    expect(await page.evaluate(() => window.__docmapScriptExecuted)).toBe(true);
    expect(await page.evaluate(() => window.AISystem6DocMapLoaded)).toBeFalsy();
    expect(await page.evaluate(() => window.__docmapCallbackRan)).toBe(false);
    expect(
      await page.evaluate(() => !!document.querySelector('script[data-lazy-src="app/features/docmap.js"]'))
    ).toBe(false);
    await modalCancel(page);
    const cancelled = await pending;
    expect(cancelled.rejected).toContain("did not install");
  });

  test("concurrent callers share one network request", async ({ page }) => {
    await bootApp(page);
    const spy = spyOnLazyScript(page, DOCMAP, fulfillFromDisk(DOCMAP));
    const result = await page.evaluate(async () => {
      const [a, b, c] = await Promise.all([
        window.withDocMap(() => "a"),
        window.withDocMap(() => "b"),
        window.withDocMap(() => "c"),
      ]);
      return { a, b, c };
    });
    expect(result).toEqual({ a: "a", b: "b", c: "c" });
    expect(spy.count()).toBe(1);
    expect(await page.evaluate(() => window.AISystem6DocMapLoaded)).toBe(true);
  });

  test("Retry button in the modal re-runs the action after the failure clears", async ({ page }) => {
    await bootApp(page);
    let attempts = 0;
    spyOnLazyScript(page, DOCMAP, async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({
          status: 404,
          contentType: "application/javascript",
          body: "",
          headers: { "Cache-Control": "no-store" },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "window.AISystem6DocMapLoaded = true;",
      });
    });

    const pending = page.evaluate(() => {
      window.__docmapCallbackRan = false;
      return window
        .withDocMap(() => { window.__docmapCallbackRan = true; })
        .then(() => ({ ok: true }))
        .catch((error) => ({ rejected: error && error.message }));
    });

    await expectModal(page);
    await modalRetry(page);
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
    expect(await page.evaluate(() => window.__docmapCallbackRan)).toBe(true);
  });
});

test.describe("module-specific failure and retry", () => {
  test("Finder Objects: 404 shows modal, retry succeeds", async ({ page }) => {
    await bootApp(page);
    let attempts = 0;
    spyOnLazyScript(page, "app/features/finder-objects.js", async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({
          status: 404,
          contentType: "application/javascript",
          body: "",
          headers: { "Cache-Control": "no-store" },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "window.AISystem6FinderObjectsLoaded = true;",
      });
    });

    const pending = page.evaluate(() => {
      window.__foCallbackRan = false;
      return window
        .withFinderObjects(() => { window.__foCallbackRan = true; })
        .then(() => ({ ok: true }))
        .catch((error) => ({ rejected: error && error.message }));
    });

    const { message } = await expectModal(page);
    expect(message).toContain("Finder Objects");
    expect(await page.evaluate(() => window.__foCallbackRan)).toBe(false);
    await modalRetry(page);
    expect((await pending).ok).toBe(true);
    expect(attempts).toBe(2);
    expect(await page.evaluate(() => window.__foCallbackRan)).toBe(true);
  });

  test("Control Strip: user toggle failure shows modal, retry enables", async ({ page }) => {
    await bootApp(page);
    let attempts = 0;
    spyOnLazyScript(page, "app/features/control-strip.js", async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({
          status: 404,
          contentType: "application/javascript",
          body: "",
          headers: { "Cache-Control": "no-store" },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "window.AISystem6ControlStripLoaded = true; window.AISystem6ControlStrip = { enable(){ window.__controlStripEnabled = true; }, disable(){} };",
      });
    });

    const pending = page.evaluate(() => {
      document.querySelector("#control-strip").checked = true;
      return window
        .applyControlStripState()
        .catch((error) => ({ rejected: error && error.message }));
    });

    const { message } = await expectModal(page);
    expect(message).toContain("failed to load");
    await modalRetry(page);
    await pending;
    expect(attempts).toBe(2);
    expect(await page.evaluate(() => window.__controlStripEnabled)).toBe(true);
  });

  test("Writing Flow: user action failure shows modal, retry loads the module", async ({ page }) => {
    await bootApp(page);
    // First launch eagerly loads Writing Flow with the guide. Close the desk
    // down so a reload boots with the module unloaded.
    await closeToEmptyDesk(page);
    expect(await page.evaluate(() => !!window.AISystem6WritingFlowLoaded)).toBe(false);

    let attempts = 0;
    spyOnLazyScript(page, "app/features/writing-flow.js", async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({
          status: 404,
          contentType: "application/javascript",
          body: "",
          headers: { "Cache-Control": "no-store" },
        });
        return;
      }
      await route.continue();
    });

    const pending = page.evaluate(() => {
      return window
        .openQuestionSheetSurface()
        .then(() => ({ ok: true }))
        .catch((error) => ({ rejected: error && error.message }));
    });

    const { message } = await expectModal(page);
    expect(message).toContain("Writing Flow");
    await modalRetry(page);
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
    expect(await page.evaluate(() => window.AISystem6WritingFlowLoaded)).toBe(true);
  });

  test("passive render stubs degrade silently without loading the module", async ({ page }) => {
    await bootApp(page);
    const result = await page.evaluate(async () => ({
      value: await window.renderFlowProgress(),
      loaded: !!window.AISystem6WritingFlowLoaded,
      ready: document.body.dataset.appReady,
    }));
    expect(result.value).toBeUndefined();
    expect(result.loaded).toBe(false);
    expect(result.ready).toBe("ready");
  });
});
