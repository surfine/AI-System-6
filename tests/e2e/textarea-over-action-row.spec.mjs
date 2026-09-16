import { expect, test } from "@playwright/test";
import { bootApp, dismissGuide, openWindow } from "./helpers.mjs";

// Two-field Desk Accessories, read at the sizes a user actually drags them to.
// Both the Dictation Pad and the Translation Pad stack fields inside one flex
// box and put their action row after it. The box may shrink, but not below its
// own content: a box that shrinks further lets the last field spill over the
// action row — the row is placed after the box, not after the overflow — which
// is the overlap the owner photographed in Liquid Glass (field and buttons
// under one focus ring, buttons half-buried).

const OVERLAP = `(windowName) => {
  const win = document.querySelector('[data-window="' + windowName + '"]');
  const pane = win.querySelector(".window-pane");
  const fields = [...win.querySelectorAll("textarea")];
  const actions = win.querySelector(".dictation-bottom-actions, .translation-pad-actions");
  const round = (n) => Math.round(n * 100) / 100;
  const boxes = fields.map((field) => {
    const r = field.getBoundingClientRect();
    return { top: round(r.top), bottom: round(r.bottom), height: round(r.height) };
  });
  const row = actions.getBoundingClientRect();
  return {
    boxes,
    actions: { top: round(row.top), bottom: round(row.bottom) },
    worstOverlap: round(Math.max(...boxes.map((box) => box.bottom - row.top))),
    pane: { client: pane.clientHeight, scroll: pane.scrollHeight },
  };
}`;

async function sizeWindow(page, name, height) {
  await page.evaluate(({ name, height }) => {
    const win = document.querySelector(`[data-window="${name}"]`);
    win.style.height = `${height}px`;
    win.style.maxHeight = "none";
  }, { name, height });
  await page.waitForTimeout(250);
}

test("a short Dictation Pad scrolls its pane instead of burying the buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootApp(page);
  await dismissGuide(page);
  await page.evaluate(() => applyTheme("liquid-glass"));
  await openWindow(page, "dictation");
  await page.waitForTimeout(400);

  // Tall enough: the fields still take the window's spare height.
  await sizeWindow(page, "dictation", 620);
  const tall = await page.evaluate(eval(`(${OVERLAP})`), "dictation");
  expect(tall.worstOverlap).toBeLessThanOrEqual(0.5);
  expect(tall.boxes[0].height).toBeGreaterThan(100);

  // Short enough that the fields sit on their own floor: no overlap anywhere.
  for (const height of [420, 360, 300]) {
    await sizeWindow(page, "dictation", height);
    const short = await page.evaluate(eval(`(${OVERLAP})`), "dictation");
    expect(short.worstOverlap, `window ${height}px`).toBeLessThanOrEqual(0.5);
    expect(short.boxes[1].height, `fields keep their own minimum at ${height}px`).toBeGreaterThanOrEqual(80);
  }

  // Past the floor the pane pays for the shortfall by scrolling, and the
  // buttons the pane scrolled away are still reachable.
  await sizeWindow(page, "dictation", 300);
  const cramped = await page.evaluate(eval(`(${OVERLAP})`), "dictation");
  expect(cramped.pane.scroll).toBeGreaterThan(cramped.pane.client);

  await page.locator("#dictation-send").scrollIntoViewIfNeeded();
  await expect(page.locator("#dictation-send")).toBeVisible();
  await expect(page.locator("#dictation-clear")).toBeInViewport();
});

test("a short Translation Pad keeps the same separation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootApp(page);
  await dismissGuide(page);
  await page.evaluate(() => applyTheme("liquid-glass"));
  await openWindow(page, "translationPad");
  await page.waitForTimeout(400);
  for (const height of [420, 340]) {
    await sizeWindow(page, "translationPad", height);
    const report = await page.evaluate(eval(`(${OVERLAP})`), "translationPad");
    expect(report.worstOverlap, `window ${height}px`).toBeLessThanOrEqual(0.5);
    expect(report.pane.scroll).toBeGreaterThan(report.pane.client);
  }
});
