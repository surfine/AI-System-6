// The RCI instruments are readouts that live inside buttons, and both buttons
// invert on hover and press (the desk's reversal). A canvas drawn before the
// inversion keeps the ink it was painted with: the frame, the zero line, the
// +/- marks and the R/C/I letters stayed black on a black cell and the
// instrument vanished, leaving only the demand bars. Both places - the status
// bar's 32x20 bar and the palette's 72x44 panel - have to repaint with the ink
// of the state the pointer is in.

import { expect, test } from "@playwright/test";
import { bootApp, createProject, dismissGuide, openWindow } from "./helpers.mjs";

async function foundCity(page) {
  const hasSetup = await page.locator("[data-bonsai-map-setup]").isVisible().catch(() => false);
  if (!hasSetup) return;
  await page.fill("[data-bonsai-map-name]", "RCI Reversal");
  await page.click("[data-bonsai-map-create]");
  await page.waitForSelector("[data-bonsai-map-stack]", { timeout: 20_000 });
  await page.waitForTimeout(1000);
}

/** The two inks a gauge can be drawn in, counted off the canvas itself. */
const READ_CANVAS = `(selector) => {
  const canvas = document.querySelector(selector);
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let ink = 0;
  let paper = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 200) continue;
    const light = data[index] > 200 && data[index + 1] > 200 && data[index + 2] > 200;
    const dark = data[index] < 60 && data[index + 1] < 60 && data[index + 2] < 60;
    if (light) paper += 1;
    if (dark) ink += 1;
  }
  const button = canvas.closest("button");
  return {
    ink,
    paper,
    cellBackground: button ? getComputedStyle(button).backgroundColor : "",
  };
}`;

async function gaugeState(page, selector) {
  return page.evaluate(
    ({ source, target }) => eval(source)(target),
    { source: READ_CANVAS, target: selector }
  );
}

test("both RCI gauges repaint for the inverted button state", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "RCI Reversal");
  await openWindow(page, "bonsaiCity");
  await page.waitForTimeout(800);
  await foundCity(page);

  for (const [name, selector] of [
    ["status bar gauge", "[data-bonsai-rci-gauge]"],
    ["palette panel", "[data-bonsai-rci-panel]"],
  ]) {
    const resting = await gaugeState(page, selector);
    expect(resting.ink, `${name}: ink on paper at rest`).toBeGreaterThan(100);
    expect(resting.paper, `${name}: no inverted ink at rest`).toBe(0);

    await page.locator(selector).hover();
    await page.waitForTimeout(300);
    const inverted = await gaugeState(page, selector);
    // The cell is black under the pointer, so the instrument has to be drawn
    // in the paper colour: what was zero at rest.
    expect(inverted.cellBackground, `${name}: the cell inverts under the pointer`).toBe("rgb(0, 0, 0)");
    expect(inverted.paper, `${name}: the gauge repaints in the inverted ink`).toBeGreaterThan(100);

    // Leave the control the way a player does: onto the map, not out of the
    // window (the desktop is another surface with its own hover handling).
    const mapBox = await page.locator("[data-bonsai-map-stack]").boundingBox();
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await page.waitForTimeout(300);
    const back = await gaugeState(page, selector);
    expect(back.paper, `${name}: back to ink on paper once the pointer leaves`).toBe(0);
    expect(back.ink, `${name}: the frame is drawn again`).toBeGreaterThan(100);
  }
});
