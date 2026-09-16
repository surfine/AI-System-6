import { test, expect } from "@playwright/test";
import { bootApp, dismissGuide, openWindow } from "./helpers.mjs";

// The Bureaucracy Meme Generator's source note is a popover that hangs out of
// the status bar and over the composer below it. The status
// bar is a stacking context of its own, so the note's z-index only ordered it
// within the bar: the composer (a later sibling of the bar in the window) still
// painted over it, and the note read as buried under the controls — which is
// what the owner photographed, in a narrow window where the two overlap.
//
// The fix lifts the *bar* onto the window-local popover layer while the note is
// open, so the note's own layer order can reach the pane. The check is the
// browser's own hit-test order (which follows paint order), not a screenshot:
// with the pointer over the note's text the note must come first.

test.use({ deviceScaleFactor: 2 });

const ORDER = `() => {
  const win = document.querySelector('[data-window="bureaucracyMeme"]');
  const note = win.querySelector(".bureaucracy-safety p");
  const input = win.querySelector("#bureaucracy-topic-input");
  const nb = note.getBoundingClientRect();
  const ib = input.getBoundingClientRect();
  const x = Math.round(ib.left + 40);
  const y = Math.round(ib.top + ib.height / 2);
  const stack = document.elementsFromPoint(x, y);
  const nameOf = (el) => el ? el.tagName + "." + String(el.className).split(" ")[0] + "#" + el.id : null;
  return {
    overlap: Math.round(Math.min(nb.bottom, ib.bottom) - Math.max(nb.top, ib.top)),
    stack: stack.slice(0, 4).map(nameOf),
    noteIndex: stack.indexOf(note),
    inputIndex: stack.indexOf(input),
    barZ: getComputedStyle(win.querySelector(".details-bar")).zIndex,
    noteZ: getComputedStyle(note).zIndex,
  };
}`;

async function openNarrowMemeWindow(page, { open }) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await bootApp(page);
  await dismissGuide(page);
  await page.evaluate(() => {
    applySettings({ language: "zh" });
    applyLanguage();
  });
  await openWindow(page, "bureaucracyMeme");
  await page.evaluate((shouldOpen) => {
    const win = document.querySelector('[data-window="bureaucracyMeme"]');
    win.style.width = "415px";
    win.style.height = "520px";
    win.style.maxWidth = "none";
    win.style.maxHeight = "none";
    win.querySelector(".bureaucracy-safety").open = shouldOpen;
  }, open);
  await page.waitForTimeout(500);
}

test("the open source note floats above the composer it overlaps", async ({ page }) => {
  await openNarrowMemeWindow(page, { open: true });
  const order = await page.evaluate(eval(`(${ORDER})`));
  // The two really do overlap in this window: that is what makes the layer a
  // visible defect rather than a theory.
  expect(order.overlap).toBeGreaterThan(20);
  expect(order.noteIndex, `paint order at the note's text: ${JSON.stringify(order.stack)}`).toBeGreaterThanOrEqual(0);
  expect(order.inputIndex, `paint order at the note's text: ${JSON.stringify(order.stack)}`).toBeGreaterThan(order.noteIndex);
  expect(Number(order.barZ)).toBeGreaterThan(0);
  expect(Number(order.noteZ)).toBeGreaterThan(0);
});

test("a closed note leaves the status bar in the flow", async ({ page }) => {
  await openNarrowMemeWindow(page, { open: false });
  const bar = await page.evaluate(() => {
    const el = document.querySelector('[data-window="bureaucracyMeme"] .details-bar');
    const style = getComputedStyle(el);
    return { z: style.zIndex, position: style.position };
  });
  expect(bar.z).toBe("auto");
});
