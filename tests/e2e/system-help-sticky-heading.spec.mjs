import { test, expect } from "@playwright/test";
import { createCanvas, loadImage } from "canvas";
import { bootApp, dismissGuide, openWindow } from "./helpers.mjs";

// System Help's list groups its terms under sticky headings, and a sticky
// heading is a lid on the rows that scroll under it. In Liquid Glass the lid's
// fill was the appearance's reading surface — about 90% opaque — so the covered
// row's icon and label read through it, lined up under the heading's own text:
// the owner photographed the pair as overlapping labels.
//
// The measurement is the covered row's own text, taken to the right of where
// the heading's label ends so the heading cannot account for it: with the lid
// opaque the region is empty list surface, with a see-through lid it is the
// row's alias. (The list's scrollbar lives at the very edge of the pane and is
// excluded by the sampled columns.)

test.use({ deviceScaleFactor: 2 });

const SCROLL = `() => {
  const list = document.querySelector('[data-window="systemHelp"] .system-help-list');
  list.scrollTop = 220;
  return true;
}`;

const GEOMETRY = `() => {
  const list = document.querySelector('[data-window="systemHelp"] .system-help-list');
  const round = (n) => Math.round(n * 100) / 100;
  const lb = list.getBoundingClientRect();
  const heading = [...list.querySelectorAll(".system-help-group")]
    .find((el) => Math.abs(el.getBoundingClientRect().top - lb.top) < 12);
  const paint = heading ? getComputedStyle(heading) : null;
  return {
    list: { left: round(lb.left), top: round(lb.top), width: round(lb.width), height: round(lb.height) },
    heading: heading ? {
      text: heading.textContent.trim(),
      box: (() => { const r = heading.getBoundingClientRect(); return { left: round(r.left), top: round(r.top), right: round(r.right), bottom: round(r.bottom) }; })(),
      background: paint.backgroundColor,
      backgroundImage: paint.backgroundImage,
      zIndex: paint.zIndex,
    } : null,
  };
}`;

// The heading's own label is short; the sampled band starts well past it and
// stops short of the list's scrollbar lane.
const SAMPLE_START = 0.42;

async function readPixels(page, name) {
  const list = page.locator('[data-window="systemHelp"] .system-help-list');
  await list.screenshot({ path: `test-results/${name}.png` });
  const image = await loadImage(`test-results/${name}.png`);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
}

function bandStats(image, { top, bottom, xFrom, xTo }) {
  const luminance = [];
  for (let y = Math.max(0, top); y < Math.min(image.height, bottom); y += 1) {
    for (let x = xFrom; x < Math.min(image.width - 12, xTo); x += 1) {
      const offset = (y * image.width + x) * 4;
      luminance.push((image.data[offset] + image.data[offset + 1] + image.data[offset + 2]) / 3);
    }
  }
  luminance.sort((a, b) => a - b);
  return { min: Math.round(luminance[0]), p01: Math.round(luminance[Math.floor(luminance.length * 0.01)]) };
}

test("a sticky group heading covers the row it scrolls over", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 820 });
  await bootApp(page);
  await dismissGuide(page);
  await page.evaluate(() => {
    applyTheme("liquid-glass");
    applySettings({ language: "zh" });
    applyLanguage();
  });
  await openWindow(page, "systemHelp");
  await page.waitForTimeout(500);
  await page.evaluate(eval(`(${SCROLL})`));
  await page.waitForTimeout(400);

  const geometry = await page.evaluate(eval(`(${GEOMETRY})`));
  expect(geometry.heading).toBeTruthy();
  // The lid is a lid: an opaque fill over the rows it covers.
  expect(geometry.heading.background).toMatch(/^rgb\(/);
  expect(geometry.heading.backgroundImage).not.toMatch(/rgba/);

  // Sample the heading's own band, to the right of its label.
  const listBox = geometry.list;
  const headingBox = geometry.heading.box;
  const scale = 2;
  const image = await readPixels(page, "system-help-heading");
  const stats = bandStats(image, {
    top: Math.round((headingBox.top + 2 - listBox.top) * scale),
    bottom: Math.round((headingBox.bottom - 3 - listBox.top) * scale),
    xFrom: Math.round((headingBox.left - listBox.left + (headingBox.right - headingBox.left) * SAMPLE_START) * scale),
    xTo: Math.round((headingBox.right - listBox.left) * scale),
  });
  // 225 is well above the 0.9-opacity ghost (measured ~194) and well below the
  // list surface (~250).
  expect(stats.min, `covered row text under the heading (p01 ${stats.p01})`).toBeGreaterThan(225);
});

test("Classic's opaque heading needs nothing else", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 820 });
  await bootApp(page);
  await dismissGuide(page);
  await openWindow(page, "systemHelp");
  await page.waitForTimeout(500);
  await page.evaluate(eval(`(${SCROLL})`));
  await page.waitForTimeout(400);
  const geometry = await page.evaluate(eval(`(${GEOMETRY})`));
  expect(geometry.heading.background).toBe("rgb(255, 255, 255)");
  const listBox = geometry.list;
  const headingBox = geometry.heading.box;
  const image = await readPixels(page, "system-help-heading-classic");
  const stats = bandStats(image, {
    top: Math.round((headingBox.top + 2 - listBox.top) * 2),
    bottom: Math.round((headingBox.bottom - 3 - listBox.top) * 2),
    xFrom: Math.round((headingBox.left - listBox.left + (headingBox.right - headingBox.left) * SAMPLE_START) * 2),
    xTo: Math.round((headingBox.right - listBox.left) * 2),
  });
  expect(stats.min, `classic heading band (p01 ${stats.p01})`).toBeGreaterThan(225);
});
