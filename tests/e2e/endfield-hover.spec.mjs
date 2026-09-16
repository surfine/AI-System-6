import { test, expect } from "@playwright/test";
import { createCanvas, loadImage } from "canvas";
import { bootApp, dismissGuide, openWindow } from "./helpers.mjs";

// The Endfield Terminal's rows sit on the app's blueprint pane, and its hover
// used to borrow --quiet-panel — a *surface* colour. On paper that made the
// hover a whisper; over the blueprint it was a white wash that left the
// contour lines showing through the row it was meant to mark. The owner
// reported it as a broken hover, and guessed it was in every appearance: the
// token was, and now the state is one too — an ink tint that deepens the pane
// rather than hiding it, matching the appearance's own row-hover value and
// sitting far below the selected row's ink.

test.use({ deviceScaleFactor: 2 });

const ROW = `() => {
  const win = document.querySelector('[data-window="endfieldTerminal"]');
  const row = win.querySelectorAll(".endfield-recent-item")[1];
  const r = row.getBoundingClientRect();
  const quote = win.querySelector(".endfield-quote");
  return {
    row: { x: r.left, y: r.top, width: r.width, height: r.height },
    rowBackground: getComputedStyle(row).backgroundColor,
    quoteBackground: quote ? getComputedStyle(quote).backgroundColor : null,
  };
}`;

async function rowLuminance(page, name) {
  const box = await page.evaluate(() => {
    const win = document.querySelector('[data-window="endfieldTerminal"]');
    const r = win.querySelectorAll(".endfield-recent-item")[1].getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  await page.screenshot({ path: `test-results/${name}.png`, clip: box });
  const image = await loadImage(`test-results/${name}.png`);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, image.width, image.height).data;
  let total = 0;
  let count = 0;
  for (let y = 0; y < image.height; y += 2) {
    for (let x = 0; x < image.width; x += 2) {
      const offset = (y * image.width + x) * 4;
      total += (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
      count += 1;
    }
  }
  return total / count;
}

const THEMES = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];

test("the Endfield hover reads as a state in every appearance", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await bootApp(page);
  await dismissGuide(page);
  await page.evaluate(() => {
    applySettings({ language: "zh" });
    applyLanguage();
  });
  await openWindow(page, "endfieldTerminal");
  await page.waitForTimeout(800);

  for (const theme of THEMES) {
    await page.evaluate((name) => applyTheme(name), theme);
    await page.waitForTimeout(350);
    const geometry = await page.evaluate(eval(`(${ROW})`));
    const token = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--endfield-hover-bg").trim());
    expect(token.replace(/\s+/g, ""), `${theme} hover token`).toBe("rgba(16,17,20,0.08)");

    // Pointer away: the row at rest.
    await page.mouse.move(geometry.row.x - 80, geometry.row.y - 80);
    await page.waitForTimeout(250);
    const rest = await rowLuminance(page, `endfield-rest-${theme}`);
    // Pointer on the row: the hover.
    await page.mouse.move(geometry.row.x + 24, geometry.row.y + geometry.row.height / 2);
    await page.waitForTimeout(250);
    const hovered = await rowLuminance(page, `endfield-hover-${theme}`);
    const delta = hovered - rest;
    // Darker, and clearly so: the old surface-coloured fill came out lighter
    // on the dark panes and only ~7 darker on paper.
    expect(delta, `${theme} hover delta (${delta.toFixed(1)})`).toBeLessThanOrEqual(-8);
  }
});

test("the quiet inset behind code and quotes keeps its own value", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await bootApp(page);
  await dismissGuide(page);
  await page.evaluate(() => {
    applyTheme("liquid-glass");
    applySettings({ language: "zh" });
    applyLanguage();
  });
  await openWindow(page, "endfieldTerminal");
  await page.waitForTimeout(700);
  // The same sheet paints inline code and quotes with the quiet inset; the
  // hover left that slot, so the inset keeps the appearance's translucent
  // white instead of turning into a hover-sized ink tint.
  const inset = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--endfield-quiet-bg").trim());
  expect(inset.replace(/\s+/g, "")).toBe("rgba(255,255,255,0.46)");
});
