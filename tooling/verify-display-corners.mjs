#!/usr/bin/env node
// Who owns a corner: the display, or the era?
//
// The rule this tool measures is one line: A SURFACE THAT MEETS THE DISPLAY
// EDGE DOES NOT ROUND THAT EDGE ITSELF. There the display's own curve is the
// corner, so a surface that draws one draws a second, smaller radius inside the
// device's — Liquid Glass put a 16px arc inside a phone's ~55px corner, and the
// owner photographed it. Apple asks a full-bleed interface to "accommodate the
// corner radius, sensor housing, and features like Dynamic Island" (HIG,
// Layout › Phone) and describes its own masking as matching "the curvature of
// other rounded interface elements throughout the system and the bezel of the
// physical device itself" (HIG, App icons). The desk answers with one token,
// --edge-radius, which every surface that reaches an edge reads.
//
// A source contract can only check the surfaces somebody remembered. This
// drives the real app on the phone shapes, in every appearance, and asks the
// page which painted element still has a radius at a corner it shares with the
// display — so the next surface added at an edge is measured rather than
// trusted.
//
// Usage:
//   node tooling/verify-display-corners.mjs [--json <path>] [--theme <name>]
//
// Exit code 1 when any cell has a finding, so the tool can gate a change.

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";

const args = process.argv.slice(2);
const optionValue = (flag) => {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
};
if (args.includes("--help")) {
  console.log("Usage: node tooling/verify-display-corners.mjs [--json <path>] [--theme <name>]");
  process.exit(0);
}
const jsonPath = optionValue("--json");
const onlyTheme = optionValue("--theme");

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const APPEARANCES = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];

// Every shape this desk is asked to fill, with the insets the platform reports
// for each. Portrait and landscape report different sides: the notch moves to a
// side when a phone is turned, the home indicator keeps the bottom, and a watch
// reports nothing at all because its whole screen is a curve the system owns.
//
// The rule this measures is the same on each of them — a surface that meets the
// display edge does not round that edge — so a shape is only interesting here
// if something on it reaches an edge. That is what makes iPad, watch and Mac
// worth measuring rather than assuming: the phone flow runs on iPad upright and
// on a watch, the desk runs on iPad sideways and on a Mac, and only the second
// keeps its windows off the glass.
const SHAPES = [
  { name: "iphone-18pro-portrait", width: 402, height: 874, insets: { top: "59px", bottom: "34px", left: "0px", right: "0px" } },
  { name: "iphone-18pro-landscape", width: 874, height: 402, insets: { top: "0px", bottom: "21px", left: "59px", right: "59px" } },
  { name: "iphone-18promax-landscape", width: 956, height: 440, insets: { top: "0px", bottom: "21px", left: "59px", right: "59px" } },
  { name: "iphone-13mini-portrait", width: 375, height: 812, insets: { top: "50px", bottom: "34px", left: "0px", right: "0px" } },
  { name: "iphone-13mini-landscape", width: 812, height: 375, insets: { top: "0px", bottom: "21px", left: "50px", right: "50px" } },
  { name: "iphone-duo-outer-portrait", width: 466, height: 678, insets: { top: "47px", bottom: "0px", left: "0px", right: "83px" } },
  // A watch is the smallest glass this desk has ever been asked to fill, and it
  // reports no safe area: the display's curve is the whole margin. It runs the
  // one-page flow, so the same shells reach the same edges.
  { name: "watch-45mm", width: 396, height: 484, insets: {}, userAgent: "watch" },
  { name: "watch-41mm", width: 368, height: 448, insets: {}, userAgent: "watch" },
  { name: "watch-ultra", width: 410, height: 502, insets: {}, userAgent: "watch" },
  // iPad: upright it is inside the one-page band (820 < 860), so windows fill
  // the screen; sideways it runs the desk. Both are measured for that reason.
  { name: "ipad-11-portrait", width: 820, height: 1180, insets: {}, userAgent: "ipad" },
  { name: "ipad-11-landscape", width: 1180, height: 820, insets: {}, userAgent: "ipad" },
  // A Mac's windows never touch the glass — they float inside a desktop — so
  // the only corner at an edge is the menu bar's, and a square one is right.
  { name: "mac-13-inch", width: 1280, height: 800, insets: {}, userAgent: "mac" },
];

const WATCH_UA = "Mozilla/5.0 (Apple Watch; CPU watchOS 11_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const USER_AGENTS = { iphone: IPHONE_UA, ipad: IPAD_UA, watch: WATCH_UA, mac: undefined };

const findings = [];
const server = await startAppServer(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const browser = await chromium.launch();
try {
  for (const shape of SHAPES) {
    const context = await browser.newContext({
      viewport: { width: shape.width, height: shape.height },
      deviceScaleFactor: 2,
      isMobile: shape.userAgent !== "mac",
      hasTouch: shape.userAgent !== "mac",
      userAgent: USER_AGENTS[shape.userAgent || "iphone"],
      locale: "zh-CN",
    });
    await context.addInitScript((insets) => {
      document.addEventListener("DOMContentLoaded", () => {
        Object.entries(insets).forEach(([name, value]) => (
          document.documentElement.style.setProperty(`--safe-area-${name}`, value)
        ));
      });
    }, shape.insets);
    const page = await context.newPage();
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body?.dataset.appReady === "ready", undefined, { timeout: 60_000 });
    // A foreground application: the full-screen shell, its composer and the
    // chrome around them are the surfaces that reach an edge.
    await page.evaluate(() => { try { handleAction("open-assistant"); } catch {} });
    await page.waitForTimeout(1200);
    for (const theme of APPEARANCES.filter((name) => !onlyTheme || name === onlyTheme)) {
      await page.evaluate((name) => window.applyTheme(name, { persist: false, announce: false, saveDesk: false }), theme);
      await page.waitForTimeout(500);
      const cell = await page.evaluate(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const label = (element) => {
          const classes = typeof element.className === "string" && element.className.trim()
            ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}`
            : "";
          return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${classes}`;
        };
        const found = [];
        for (const element of document.querySelectorAll("body *")) {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
          const box = element.getBoundingClientRect();
          if (box.width < 8 || box.height < 8) continue;
          const corners = [
            ["top-left", box.left <= 1 && box.top <= 1, style.borderTopLeftRadius],
            ["top-right", box.right >= width - 1 && box.top <= 1, style.borderTopRightRadius],
            ["bottom-left", box.left <= 1 && box.bottom >= height - 1, style.borderBottomLeftRadius],
            ["bottom-right", box.right >= width - 1 && box.bottom >= height - 1, style.borderBottomRightRadius],
          ];
          for (const [corner, touches, radius] of corners) {
            if (!touches) continue;
            if ((Number.parseFloat(radius) || 0) <= 0.5) continue;
            found.push(`${label(element)} ${corner} ${radius}`);
          }
        }
        return found;
      });
      if (cell.length) findings.push({ shape: shape.name, theme, elements: cell });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await stopProcess(server.child);
}

if (jsonPath) await writeFile(jsonPath, `${JSON.stringify(findings, null, 2)}\n`);

if (findings.length) {
  console.error(`NO  display corners: ${findings.length} cell(s) round a corner the display owns.`);
  findings.slice(0, 6).forEach((finding) => {
    console.error(`    ${finding.shape} ${finding.theme}: ${finding.elements.slice(0, 3).join(", ")}`);
  });
  console.error("    A surface that meets an edge reads --edge-radius; the display's curve is the corner.");
  process.exit(1);
}
const cells = SHAPES.length * APPEARANCES.filter((name) => !onlyTheme || name === onlyTheme).length;
console.log(`OK  display corners: ${cells} cell(s) across ${SHAPES.length} shape(s) round only the corners the era owns.`);
process.exit(0);
