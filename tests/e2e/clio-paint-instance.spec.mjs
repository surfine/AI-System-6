// ClioPaint in a real browser: the window builds itself from the shared shell,
// its controls answer, hiding it keeps the picture, and a dispose/attach cycle
// leaves it working without piling up listeners.

import { expect, test } from "@playwright/test";
import { bootApp, dismissGuide, openWindow } from "./helpers.mjs";

test("clio paint: the window binds once, keeps its work when hidden, and rebinds after a destroy", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await page.evaluate(() => handleAction("open-clio-paint"));
  await page.waitForSelector('[data-window="clioPaint"]:not(.is-hidden)', { timeout: 15_000 });

  const afterAttach = await page.evaluate(async () => {
    const api = window.AISystem6ClioPaint;
    await api.attach();
    await api.attach();
    return { resources: api.resourceCount(), tool: api.state().tool };
  });
  expect(afterAttach.resources).toBeGreaterThan(0);

  // The toolbar answers, and the choice survives a hide (hiding is not
  // destroying: the picture, undo stack and unsaved edits stay).
  await clickTool(page, "rect");
  expect(await page.evaluate(() => window.AISystem6ClioPaint.state().tool)).toBe("rect");
  await page.evaluate(() => {
    document.querySelector('[data-window="clioPaint"]').classList.add("is-hidden");
  });
  await page.evaluate(() => openWindow("clioPaint"));
  expect(await page.evaluate(() => window.AISystem6ClioPaint.state().tool)).toBe("rect");

  // A real destroy releases everything, twice is a no-op, and the next attach
  // binds again with the window still usable.
  const afterDispose = await page.evaluate(async () => {
    const api = window.AISystem6ClioPaint;
    const first = api.dispose();
    const second = api.dispose();
    const released = api.resourceCount();
    await api.attach();
    const rebound = api.resourceCount();
    return { first: first.disposed, second: second.disposed, released, rebound };
  });
  expect(afterDispose).toEqual({ first: true, second: false, released: 0, rebound: expect.any(Number) });
  expect(afterDispose.rebound).toBeGreaterThan(0);
  await clickTool(page, "pencil");
  expect(await page.evaluate(() => window.AISystem6ClioPaint.state().tool)).toBe("pencil");
  expect(await page.locator('[data-window="clioPaint"] #clio-paint-canvas').count()).toBe(1);
});

/**
 * Press a toolbar button through its own listener. A system modal (a first-run
 * note, a lease notice) can cover the desk in one browser and swallow a
 * pointer click; that is a different subject from "does the bound listener
 * answer", which is what this test is about.
 */
async function clickTool(page, tool) {
  await page.evaluate((name) => {
    const button = document.querySelector(`[data-window="clioPaint"] [data-clio-paint-tool="${name}"]`);
    button.dispatchEvent(new Event("click", { bubbles: true }));
  }, tool);
}

// The drawing loop itself, in a real canvas: a stroke that undoes and redoes, a
// Shift-drag that comes out square, and a selection that travels with its
// pixels. None of this can be checked in the headless harness — its canvas
// draws nothing and records nothing — so a real browser is the only place
// these claims can be read back off pixels.
test("clio paint: a stroke undoes and redoes, Shift draws a square, and a selection moves its pixels", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await openWindow(page, "clioPaint");
  await page.waitForSelector('[data-window="clioPaint"]:not(.is-hidden)', { timeout: 15_000 });
  await dismissAnyModal(page);

  const canvas = await page.evaluate(() => {
    const element = document.querySelector('[data-window="clioPaint"] #clio-paint-canvas');
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, pixelsWide: element.width, pixelsHigh: element.height };
  });
  expect(canvas.width).toBeGreaterThan(100);
  const at = (x, y) => ({
    x: canvas.x + ((x + 0.5) * canvas.width) / canvas.pixelsWide,
    y: canvas.y + ((y + 0.5) * canvas.height) / canvas.pixelsHigh,
  });
  const drag = async (from, to, { shift = false } = {}) => {
    const start = at(from[0], from[1]);
    const end = at(to[0], to[1]);
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    if (shift) await page.keyboard.up("Shift");
  };
  const ink = () => page.evaluate(() => {
    const element = document.querySelector('[data-window="clioPaint"] #clio-paint-canvas');
    const { data } = element.getContext("2d").getImageData(0, 0, element.width, element.height);
    let count = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < element.height; y += 1) {
      for (let x = 0; x < element.width; x += 1) {
        if (data[(y * element.width + x) * 4] >= 128) continue;
        count += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return count ? { count, minX, minY, maxX, maxY } : { count };
  });
  // The desk's one status line (#status) is where receipts land, whichever
  // window is hosting it. The window's own line is the other one, and it says
  // "Unsaved changes." instead.
  const status = () => page.textContent("#status");

  // The key belongs to the picture as soon as the window is the one in front,
  // before anything has been drawn on it: an empty history says "Nothing to
  // undo yet", which is the paint window answering, not the desk's text undo
  // saying there is nothing to edit.
  await page.keyboard.press("Meta+z");
  await expect.poll(status).toContain("Nothing to undo");

  // A pencil stroke across the top of the paper.
  await clickTool(page, "pencil");
  await drag([20, 20], [120, 20]);
  const stroke = await ink();
  expect(stroke.count).toBeGreaterThan(90);
  expect(stroke.minY).toBe(20);
  expect(stroke.maxY).toBe(20);

  // ⌘Z belongs to the picture here, not to the desk's text undo: the stroke
  // goes, and the receipt is the paint window's own, not "there is nothing to
  // edit here" from the field-oriented command.
  await page.keyboard.press("Meta+z");
  await expect.poll(async () => (await ink()).count).toBe(0);
  await expect.poll(status).toContain("Undid");
  expect(await status()).not.toContain("nothing to edit");

  await page.keyboard.press("Meta+Shift+z");
  await expect.poll(async () => (await ink()).count).toBe(stroke.count);

  // New clears the picture and the history with it, and the two history
  // buttons say there is nothing behind them instead of looking live.
  const historyButtons = () => page.evaluate(() => {
    const toolbar = document.querySelector('[data-window="clioPaint"] #clio-paint-toolbar');
    const undo = toolbar.querySelector('[data-action="clio-paint-undo"]');
    const redo = toolbar.querySelector('[data-action="clio-paint-redo"]');
    return { undo: undo.disabled, redo: redo.disabled, undoTitle: undo.title };
  });
  await page.evaluate(() => window.AISystem6ClioPaint.newPicture({ skipConfirm: true }));
  await expect.poll(async () => (await ink()).count).toBe(0);
  expect(await historyButtons()).toMatchObject({ undo: true, redo: true });
  expect((await historyButtons()).undoTitle).toContain("Nothing to undo");

  // Shift while dragging out a rectangle: the box comes out square, and both
  // sides take the longer of the two drag distances.
  await clickTool(page, "rect");
  await drag([60, 60], [180, 110], { shift: true });
  const square = await ink();
  expect(square.maxX - square.minX).toBe(square.maxY - square.minY);
  expect(square.maxX - square.minX).toBe(120);
  expect((await historyButtons()).undo).toBe(false);

  // Select it, then drag from inside the marquee: the pixels travel with it.
  await clickTool(page, "marquee");
  await drag([55, 55], [185, 185]);
  await drag([100, 100], [200, 180]);
  const moved = await ink();
  expect(moved.count).toBe(square.count);
  expect(moved.minX).toBe(square.minX + 100);
  expect(moved.minY).toBe(square.minY + 80);

  // The whole move is one step: one undo puts the pixels back where they were
  // dragged from, not one pixel along the way.
  await page.keyboard.press("Meta+z");
  await expect.poll(async () => (await ink()).minX).toBe(square.minX);
  const restored = await ink();
  expect(restored.minY).toBe(square.minY);
  expect(restored.count).toBe(square.count);
  await expect.poll(status).toContain("Move");

  // Escape while a shape is still under the pointer is "put it back": the box
  // never lands, and it leaves no step behind — the next undo removes the
  // square, not a box that was never drawn.
  await clickTool(page, "rect");
  const beforeCancel = await ink();
  const from = at(300, 40);
  const to = at(400, 140);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await ink()).toEqual(beforeCancel);
  await page.keyboard.press("Meta+z");
  await expect.poll(async () => (await ink()).count).toBe(0);
});

/**
 * A system modal is a top-layer dialog: while one is open, a real mouse event
 * never reaches the canvas. Answering it is the way past, and what it says is
 * not this test's subject.
 */
async function dismissAnyModal(page) {
  const open = await page.evaluate(() => document.querySelector("#system-modal")?.hasAttribute("open") === true);
  if (!open) return;
  await page.evaluate(() => {
    const button = document.querySelector("#system-modal-cancel") || document.querySelector("#system-modal-yes");
    button?.click();
  });
  await page.waitForFunction(
    () => document.querySelector("#system-modal")?.hasAttribute("open") !== true,
    undefined,
    { timeout: 10_000 }
  );
}
