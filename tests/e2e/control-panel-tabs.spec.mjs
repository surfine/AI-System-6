import { expect, test } from "@playwright/test";
import { bootApp, dismissGuide, enterWritingStudio, openWindow } from "./helpers.mjs";

// The Control Panel's section rail is a settings-navigation object, and an era
// clothes it as an OS 8 tab sheet, an Aqua toolbar or a glass capsule. Each tab
// is a box that clips its own name, so the rail has to keep the room those tabs
// need. The rail scrolls wherever it has to (Platinum clips its own strip, the
// portrait rule takes overflow-x), and a scroll container's automatic minimum
// size is zero — which left the panel's settings grid free to hand the rail
// whatever the open section left over. Platinum's General section is the
// tallest form in the panel, so it took the rail's share and the four section
// names were cut in half. These tests drive the real window and read real
// boxes: the rail's own box, then each tab's, then the name inside it.

const ERAS = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];

const READ_RAIL = `() => {
  const win = document.querySelector('[data-window="control"]');
  const pane = win.querySelector(".window-pane");
  const tabs = [...win.querySelectorAll("[data-control-tab]")];
  const rail = tabs[0].parentElement;
  const railBox = rail.getBoundingClientRect();
  const round = (n) => Math.round(n * 100) / 100;
  const cuts = [];
  for (const tab of tabs) {
    const label = tab.querySelector(".control-chooser-label");
    const name = label.textContent.trim();
    const tabBox = tab.getBoundingClientRect();
    const labelBox = label.getBoundingClientRect();
    const style = getComputedStyle(tab);
    const contentTop = tabBox.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
    const contentBottom = tabBox.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
    if (tabBox.top < railBox.top - 0.5 || tabBox.bottom > railBox.bottom + 0.5) {
      cuts.push(name + ": tab " + round(tabBox.top) + ".." + round(tabBox.bottom) + " outside rail " + round(railBox.top) + ".." + round(railBox.bottom));
    }
    if (labelBox.top < contentTop - 0.5 || labelBox.bottom > contentBottom + 0.5) {
      cuts.push(name + ": label " + round(labelBox.top) + ".." + round(labelBox.bottom) + " outside " + round(contentTop) + ".." + round(contentBottom));
    }
  }
  return {
    theme: document.body.dataset.theme,
    cuts,
    railHeight: round(railBox.height),
    railMinHeight: getComputedStyle(rail).minHeight,
    tabHeight: round(tabs[0].getBoundingClientRect().height),
    paneClient: pane.clientHeight,
    paneScroll: pane.scrollHeight,
  };
}`;

// The appearance field's native select is hidden behind the app's own
// system-select button, so the era comes in through the theme API the picker
// itself calls.
async function setEra(page, era) {
  await page.evaluate((name) => applyTheme(name), era);
  await page.waitForFunction((name) => document.body.dataset.theme === name, era, { timeout: 10_000 });
  await page.waitForTimeout(200);
}

async function setLanguage(page, code) {
  await page.evaluate((language) => {
    applySettings({ language });
    applyLanguage();
  }, code);
  await page.waitForTimeout(200);
}

test("Platinum's section names survive the tallest section in the panel", async ({ page }) => {
  // English is the width the writing desk's own 440px panel cannot hold: the
  // General form is taller than the pane, so something has to give.
  await page.setViewportSize({ width: 1280, height: 800 });
  await bootApp(page);
  await dismissGuide(page);
  await enterWritingStudio(page);
  await openWindow(page, "control");
  await setLanguage(page, "en");
  await setEra(page, "platinum");
  await page.click('[data-control-tab="general"]');
  await page.waitForTimeout(300);

  const rail = await page.evaluate(eval(`(${READ_RAIL})`));
  expect(rail.cuts).toEqual([]);
  // The panel pays for the tall form by scrolling, not by cutting the tabs.
  expect(rail.paneScroll).toBeGreaterThan(rail.paneClient);
  expect(rail.tabHeight).toBeLessThanOrEqual(rail.railHeight + 0.5);
});

test("every era keeps its section names in the narrow portrait sheet", async ({ page }) => {
  // Narrower than 860px and portrait: the Control Panel becomes the centered
  // sheet, and the rail becomes a horizontal scroller — so its automatic
  // minimum size is zero and the sheet's own height is the only thing left
  // standing between the tabs and the section that wants their space.
  await page.setViewportSize({ width: 430, height: 500 });
  await bootApp(page);
  await dismissGuide(page);
  await openWindow(page, "control");
  await setLanguage(page, "zh");
  for (const era of ERAS) {
    await setEra(page, era);
    await page.click('[data-control-tab="general"]');
    await page.waitForTimeout(250);
    const rail = await page.evaluate(eval(`(${READ_RAIL})`));
    expect(rail.cuts, `${era} cut its own section names`).toEqual([]);
    expect(rail.tabHeight, `${era} tabs`).toBeLessThanOrEqual(rail.railHeight + 0.5);
  }
});
