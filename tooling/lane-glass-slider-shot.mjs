// Lane-local evidence shooter for the Liquid Glass tint slider.
//
// The shared appearance snapshot photographs windows, not one control, and it
// does not open the Control Panel at all. This tool opens the Control Panel in
// the Liquid Glass appearance, moves the tint slider through three values, and
// saves the slider row plus its neighbouring controls at desktop and phone
// widths in the light and dark host schemes.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const label = process.argv.includes("--label")
  ? process.argv[process.argv.indexOf("--label") + 1]
  : "shot";
const outDir = join(root, "internal/evidence/drafts/liquid-glass-slider", label);
mkdirSync(outDir, { recursive: true });

const CELLS = [
  { id: "desktop-light", width: 1440, height: 900, colorScheme: "light" },
  { id: "desktop-dark", width: 1440, height: 900, colorScheme: "dark" },
  { id: "phone-light", width: 375, height: 812, colorScheme: "light" },
];

const server = await startAppServer(root);
const browser = await chromium.launch();

for (const cell of CELLS) {
  const context = await browser.newContext({
    viewport: { width: cell.width, height: cell.height },
    deviceScaleFactor: 2,
    colorScheme: cell.colorScheme,
    hasTouch: cell.width < 768,
    isMobile: cell.width < 768,
  });
  await context.route(/https?:\/\/(?:127\.0\.0\.1|localhost):(?:1234|11434)\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: [] }) })
  );
  await context.addInitScript(() => {
    localStorage.setItem("ai-system-6-theme", "liquid-glass");
    localStorage.removeItem("ai-system-6-liquid-glass");
  });
  const page = await context.newPage();
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 30000 });
  await page.evaluate(() => {
    window.AISystem6Theme?.applyTheme("liquid-glass", {
      experimental: true, persist: false, announce: false, modernFontPreference: false,
    });
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
  });
  await page.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
    .every((link) => { try { return Boolean(link.sheet); } catch { return true; } }), null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => { if (typeof openWindow === "function") openWindow("control"); });
  await page.waitForTimeout(900);
  // The tint field lives on the General tab, and the panel opens on Cloud
  // Model. Click the tab through the app's own control, then unhide the field:
  // it is hidden until the Liquid Glass appearance is selected.
  await page.click("#control-tab-general");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const field = document.querySelector(".liquid-tint-field");
    if (field) field.hidden = false;
    const win = document.querySelector('.window[data-window="control"]');
    if (win) { win.classList.remove("is-hidden"); win.classList.add("is-active"); }
    for (const other of document.querySelectorAll(".window")) {
      if (other !== win) { other.classList.add("is-hidden"); other.classList.remove("is-active"); }
    }
    document.querySelector(".liquid-tint-field")?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(500);

  for (const value of ["0", "0.5", "1"]) {
    await page.evaluate((next) => {
      const slider = document.getElementById("liquid-tint-level");
      if (!slider) return;
      slider.value = next;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await page.waitForTimeout(400);
    // A tight crop of the control alone: the material is judged at the edge
    // of the well and the rim of the lens, and neither survives a page shot.
    const slider = await page.locator("#liquid-tint-level").boundingBox();
    if (slider) {
      await page.screenshot({
        path: join(outDir, `${cell.id}-detail-${value.replace(".", "")}.png`),
        clip: {
          x: Math.max(0, slider.x - 6), y: Math.max(0, slider.y - 6),
          width: Math.min(cell.width - Math.max(0, slider.x - 6), slider.width + 12),
          height: Math.min(cell.height - Math.max(0, slider.y - 6), slider.height + 12),
        },
      });
    }
    const row = page.locator(".liquid-tint-field");
    const box = await row.boundingBox();
    if (box) {
      await page.screenshot({
        path: join(outDir, `${cell.id}-tint-${value.replace(".", "")}.png`),
        clip: {
          x: Math.max(0, box.x - 14),
          y: Math.max(0, box.y - 60),
          width: Math.min(cell.width - Math.max(0, box.x - 14), box.width + 28),
          height: Math.min(cell.height - Math.max(0, box.y - 60), box.height + 210),
        },
      });
    }
  }
  const win = page.locator('.window[data-window="control"]');
  const winBox = await win.boundingBox();
  if (winBox) {
    await page.screenshot({
      path: join(outDir, `${cell.id}-control-panel.png`),
      clip: {
        x: Math.max(0, winBox.x), y: Math.max(0, winBox.y),
        width: Math.min(cell.width - Math.max(0, winBox.x), winBox.width),
        height: Math.min(cell.height - Math.max(0, winBox.y), winBox.height),
      },
    });
  }
  await context.close();
  console.log(`shot ${cell.id}`);
}

await browser.close();
await stopProcess(server.child);
console.log(`saved to ${outDir}`);
