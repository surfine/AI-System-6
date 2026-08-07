import { expect, test } from "@playwright/test";
import { bootApp, dismissGuide, enableMultiFinder, enterWritingStudio, openWindow } from "./helpers.mjs";

// Regression: the window frame-bar measure loop used to write classes on
// every call even when nothing changed. Each no-op class write can emit a
// MutationObserver record, which the window's own observer turned into an
// endless sync -> rAF -> measure cycle that froze the whole app after
// streaming previews rendered. Measure must only write when the state
// actually changes, so a settled window must stay quiet and responsive.
test("frame bars settle after the window opens (no observer loop)", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await enterWritingStudio(page);
  await enableMultiFinder(page);
  await page.evaluate(() => openQuestionSheetSurface());
  await openWindow(page, "outline");

  await page.evaluate(() => {
    window.__frameBarMutationCount = 0;
    const win = document.querySelector('[data-window="outline"]');
    new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "attributes" && record.attributeName === "class") {
          window.__frameBarMutationCount += 1;
        }
      });
    }).observe(win, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  });

  // Let the initial measure + any one-time render settle.
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => window.__frameBarMutationCount);
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => window.__frameBarMutationCount);
  const responsive = await Promise.race([
    page.evaluate(() => 1 + 1),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 1500)),
  ]);

  expect(responsive).toBe(2);
  expect(after - before).toBeLessThan(5);

  // The bars still work after the fix: the scroller is marked and the bar
  // exists, and a streaming preview render does not restart the loop.
  const surfaceMarked = await page.evaluate(() =>
    !!document.querySelector('[data-window="outline"] .window-frame-scroller.is-frame-scroll-surface')
  );
  expect(surfaceMarked).toBe(true);
  const barPresent = await page.evaluate(() =>
    !!document.querySelector('[data-window="outline"] .window-frame-bar')
  );
  expect(barPresent).toBe(true);

  await page.evaluate(async () => {
    await prepareStreamingMarkdownPreview();
    showStreamingSurfacePreview("outline", "## 背景\n内容。", { final: true });
  });
  const previewBefore = await page.evaluate(() => window.__frameBarMutationCount);
  await page.waitForTimeout(700);
  const previewAfter = await page.evaluate(() => window.__frameBarMutationCount);
  expect(previewAfter - previewBefore).toBeLessThan(5);
  expect(await Promise.race([
    page.evaluate(() => 2 + 2),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 1500)),
  ])).toBe(4);
});
