// The minimap is a control, not a picture: it shows the tiles the camera is
// looking at and a click on it moves the view there, the way Red Alert's map
// works. The reading is taken off the map itself - whatever tile sits under the
// middle of the playfield after the click is the tile that was clicked.

import { expect, test } from "@playwright/test";
import { bootApp, createProject, dismissGuide, openWindow } from "./helpers.mjs";

async function foundCity(page) {
  const hasSetup = await page.locator("[data-bonsai-map-setup]").isVisible().catch(() => false);
  if (!hasSetup) return;
  await page.fill("[data-bonsai-map-name]", "MiniMap Nav");
  await page.click("[data-bonsai-map-create]");
  await page.waitForSelector("[data-bonsai-map-stack]", { timeout: 20_000 });
  await page.waitForTimeout(1000);
}

/** The tile under the middle of the playfield, asked of the renderer. */
async function centerTile(page) {
  return page.evaluate(() => {
    const stack = document.querySelector("[data-bonsai-map-stack]");
    const rect = stack.getBoundingClientRect();
    return window.AISystem6BonsaiCanvasRenderer.pickTile(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      rect
    );
  });
}

test("clicking the minimap moves the view to that place", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "MiniMap Nav");
  await openWindow(page, "bonsaiCity");
  await page.waitForTimeout(800);
  await foundCity(page);

  const size = await page.evaluate(() => window.AISystem6BonsaiCity.debugState().hashInputSummary.size);
  expect(size).toBeGreaterThan(8);

  const minimap = page.locator("[data-bonsai-minimap]");
  await expect(minimap).toBeVisible();
  const box = await minimap.boundingBox();
  const before = await minimap.screenshot();

  // The upper-left fifth of the map, in minimap pixels.
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.waitForTimeout(300);

  const center = await centerTile(page);
  const expected = { x: Math.floor(size * 0.2), y: Math.floor(size * 0.2) };
  expect(Math.abs(center.x - expected.x), `centred on x (${center.x} vs ${expected.x})`).toBeLessThanOrEqual(2);
  expect(Math.abs(center.y - expected.y), `centred on y (${center.y} vs ${expected.y})`).toBeLessThanOrEqual(2);

  // The viewport rectangle on the map followed the view.
  const after = await minimap.screenshot();
  expect(Buffer.compare(before, after)).not.toBe(0);

  // Clicking the same place again is a no-op for the camera and the map.
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.waitForTimeout(300);
  const again = await centerTile(page);
  expect(again).toEqual(center);
  const settled = await minimap.screenshot();
  expect(Buffer.compare(after, settled)).toBe(0);

  // The keyboard reaches the same control.
  await minimap.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  const stepped = await centerTile(page);
  expect(stepped.x).toBeGreaterThan(center.x);
});
