import { expect, test } from "@playwright/test";
import { createCanvas, loadImage } from "canvas";
import { bootApp, dismissGuide, openWindow } from "./helpers.mjs";

// Three controls in the Liquid Glass Control Panel, read off the real window:
// the pane's scroller, the appearance slider, and the section capsule.
//
// The appearance's own contract (docs/design/LIQUID-GLASS-CONTROLS.md) asks
// for scoped scrollbars, a slider whose thumb follows the pointer without
// changing size, and a segmented control that reads as one object. The sheet
// had drifted from all three: the pane reserved a Mac OS 8 scrollbar lane (a
// paper track with an inked left edge and an inked thumb, 16px wide), the tint
// slider was a 12px groove under a 22px glass lens that grew on hover and
// press, and the capsule hugged its contents against the leading edge of the
// pane instead of centring in it.

test.use({ deviceScaleFactor: 2 });

// A narrow portrait window is where the Control Panel is the centred sheet the
// screenshot came from, and where the pane is shortest against the General
// form. The desk profile is the one that owns that sheet.
async function openLiquidGlassPanel(page, { width = 430, height = 520 } = {}) {
  await page.setViewportSize({ width, height });
  await bootApp(page);
  await dismissGuide(page);
  await openWindow(page, "control");
  await page.evaluate(() => {
    applySettings({ language: "en" });
    applyLanguage();
    applyTheme("liquid-glass");
  });
  await page.waitForFunction(() => document.body.dataset.theme === "liquid-glass");
  // The tint row lives on the General tab, and that section is tall enough to
  // give the pane something to scroll. Clicked through the DOM: the tab is a
  // real button, and WebKit's actionability wait can sit through the theme's
  // own transition before it will press it.
  await page.evaluate(() => {
    document.querySelector('[data-control-tab="general"]').click();
  });
  await page.waitForFunction(() => !document.querySelector('[data-control-panel="general"]').hidden);
  await page.waitForTimeout(400);
}

async function readImage(path) {
  const image = await loadImage(path);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
}

const pixel = (image, x, y) => {
  const offset = (y * image.width + x) * 4;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2], image.data[offset + 3]];
};

test("the pane scrolls on the appearance's own bar, not on the Mac OS 8 lane", async ({ page }) => {
  await openLiquidGlassPanel(page);
  const pane = await page.evaluate(() => {
    const element = document.querySelector('[data-window="control"] .window-pane');
    const track = getComputedStyle(element, "::-webkit-scrollbar-track");
    const thumb = getComputedStyle(element, "::-webkit-scrollbar-thumb");
    const bar = getComputedStyle(element, "::-webkit-scrollbar");
    return {
      layoutLane: element.offsetWidth - element.clientWidth,
      scrollable: element.scrollHeight > element.clientHeight,
      barWidth: bar.width,
      trackBackground: track.backgroundColor,
      trackBorderLeft: `${track.borderLeftWidth} ${track.borderLeftStyle} ${track.borderLeftColor}`,
      thumbBorder: `${thumb.borderTopWidth} ${thumb.borderTopStyle}`,
      thumbBorderColor: thumb.borderTopColor,
      thumbBackground: thumb.backgroundColor,
      thumbRadius: thumb.borderRadius,
    };
  });

  expect(pane.scrollable).toBe(true);
  // An engine that paints the recipe reserves its lane (12px); one that forces
  // overlay bars reserves none (0). What must never come back is the Mac OS 8
  // lane's 16px — that is the bar the appearance was reported for.
  expect(pane.layoutLane).toBeLessThanOrEqual(12);
  // No ink anywhere in the recipe: the Mac OS 8 lane drew a 1px solid #101114
  // edge on the track and the same on the thumb.
  expect(pane.trackBorderLeft).toBe("0px none rgb(16, 17, 20)");
  expect(pane.thumbBorder).toBe("3px solid");
  expect(pane.thumbBorderColor).toBe("rgba(0, 0, 0, 0)");
  expect(pane.thumbRadius).toBe("999px");
  // Rest is 0.34 and hover is 0.5 — the same pill, one shade darker — so the
  // pointer's position cannot flake the check.
  expect(["rgba(16, 17, 20, 0.34)", "rgba(16, 17, 20, 0.5)"]).toContain(pane.thumbBackground);
  expect(pane.barWidth).toBe("12px");

  // …and it is the only surface that opts in. The appearance used to restyle
  // every scrollbar in the app from one `*` rule, which is what the control
  // contract forbids ("never restore a global scrollbar rule"): the root and
  // the body must be left on the platform's defaults.
  const global = await page.evaluate(() => ({
    root: `${getComputedStyle(document.documentElement).scrollbarWidth} ${getComputedStyle(document.documentElement).scrollbarColor}`.trim(),
    body: `${getComputedStyle(document.body).scrollbarWidth} ${getComputedStyle(document.body).scrollbarColor}`.trim(),
  }));
  expect(global.root).toBe("auto auto");
  expect(global.body).toBe("auto auto");
});

test("the tint slider is a Mac slider: a 4px line under a 20px knob", async ({ page }) => {
  await openLiquidGlassPanel(page);
  const input = page.locator("#liquid-tint-level");
  await input.screenshot({ path: "test-results/liquid-glass-slider.png" });
  const image = await readImage("test-results/liquid-glass-slider.png");
  const scale = 2; // deviceScaleFactor above: the shot is 2 device px per CSS px.

  const midRow = Math.floor(image.height / 2);
  const isAccent = (x, y = midRow) => {
    const [r, , b] = pixel(image, x, y);
    return b > 170 && b - r > 60;
  };
  const isKnobWhite = (x) => {
    const [r, g, b] = pixel(image, x, midRow);
    return Math.min(r, g, b) >= 248;
  };

  // Track thickness: the accent run's height at the fill. The sheet's own
  // geometry for this is 4 CSS px (deviceScaleFactor doubles it).
  const trackThickness = 4 * scale;
  let accentRows = 0;
  for (let y = 0; y < image.height; y += 1) if (isAccent(2, y)) accentRows += 1;
  expect(accentRows).toBeGreaterThanOrEqual(trackThickness - 2);
  expect(accentRows).toBeLessThanOrEqual(trackThickness + 2);

  // Knob: the fill ends at the knob's leading edge and the well resumes at its
  // trailing edge, so the run between them is the knob's own width.
  let fillEnd = -1;
  let wellStart = -1;
  for (let x = 0; x < image.width; x += 1) if (isAccent(x)) fillEnd = x;
  for (let x = fillEnd + 1; x < image.width; x += 1) {
    const [r, g, b] = pixel(image, x, midRow);
    const inKnob = Math.min(r, g, b) >= 248;
    const inWell = r < 240 && Math.abs(r - b) < 6;
    if (!inKnob && inWell) { wellStart = x; break; }
  }
  expect(fillEnd).toBeGreaterThan(0);
  expect(wellStart).toBeGreaterThan(fillEnd);
  const knobWidth = (wellStart - fillEnd - 1) / scale;
  expect(knobWidth).toBeGreaterThanOrEqual(19);
  expect(knobWidth).toBeLessThanOrEqual(21);
  // The knob is opaque: no backdrop-filtered glass, no gradient showing the
  // pane through it.
  for (let x = fillEnd + 3; x < wellStart - 3; x += 1) expect(isKnobWhite(x)).toBe(true);

  // Value is still readable, and the states move material rather than size.
  await expect(page.locator("#liquid-tint-level-output")).toBeVisible();
  const scales = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return {
      hover: style.getPropertyValue("--glass-slider-hover-scale").trim(),
      press: style.getPropertyValue("--glass-slider-press-scale").trim(),
      filter: style.getPropertyValue("--glass-slider-lens-filter").trim(),
      thickness: style.getPropertyValue("--glass-slider-thickness").trim(),
      lens: style.getPropertyValue("--glass-slider-lens-size").trim(),
    };
  });
  expect(scales).toEqual({ hover: "1", press: "1", filter: "none", thickness: "4px", lens: "20px" });
});

test("the section capsule is centred in the pane", async ({ page }) => {
  await openLiquidGlassPanel(page);
  const geometry = await page.evaluate(() => {
    const pane = document.querySelector('[data-window="control"] .window-pane');
    const rail = document.querySelector('[data-window="control"] .control-chooser');
    const paneBox = pane.getBoundingClientRect();
    const railBox = rail.getBoundingClientRect();
    // The grid's content box: the border and any painted scrollbar lane are
    // outside clientWidth, and the shell's own padding is inside it. The
    // capsule centres in this box, not in the padding box.
    const style = getComputedStyle(pane);
    const contentLeft = paneBox.left + pane.clientLeft + parseFloat(style.paddingLeft);
    const contentRight = paneBox.left + pane.clientLeft + pane.clientWidth - parseFloat(style.paddingRight);
    return {
      railCenter: railBox.left + railBox.width / 2,
      contentCenter: (contentLeft + contentRight) / 2,
      railWidth: railBox.width,
      contentWidth: contentRight - contentLeft,
      justifySelf: getComputedStyle(rail).justifySelf,
    };
  });
  expect(geometry.justifySelf).toBe("center");
  // A capsule that hugs its contents sits centred; against the leading edge it
  // would be off by half the slack.
  expect(geometry.contentWidth - geometry.railWidth).toBeGreaterThan(4);
  expect(Math.abs(geometry.railCenter - geometry.contentCenter)).toBeLessThanOrEqual(1);
});
