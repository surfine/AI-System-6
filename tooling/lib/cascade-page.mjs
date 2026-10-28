// Page driver shared by the tools that read the live cascade
// (measure-layer-flips.mjs, cascade-ledger.mjs).
//
// Both boot the real app once per appearance through the saved-appearance path
// appearance-snapshot.mjs uses, turn MultiFinder on, open every registered
// window the way census:controls does, show them all, open the menu bar's
// menus and wait for stylesheets and fonts. The result is the widest state of
// the desk one page can hold, so a rule that styles any window or menu has an
// element to land on. This module owns that sequence; the tools own what they
// do with the page afterwards.

import { createRequire } from "node:module";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { desktopRoot } from "./paths.mjs";
import { stubLocalModels } from "./stub-local-models.mjs";
import { enableMultiFinder } from "../../tests/e2e/helpers.mjs";

export { stubLocalModels, enableMultiFinder };

const require = createRequire(import.meta.url);

// Windows that start a network session, a game loop or a model call on open
// are still opened: their chrome is the measured surface, and a failure to
// open is recorded as coverage, never skipped silently.
export const WINDOW_OPEN_TIMEOUT = 20000;

/** Parse "1440x960" into { width, height, phone }. A phone viewport is touch + mobile. */
export function parseViewport(text) {
  const [width, height] = String(text || "1440x960").split("x").map(Number);
  if (!(width > 0) || !(height > 0)) throw new Error(`--viewport must look like 1440x960, got ${text}`);
  return { width, height, phone: width < 768 };
}

/** Every appearance id the theme registry declares. */
export function registeredThemeIds() {
  const registryWindow = {};
  vm.runInNewContext(readFileSync(join(desktopRoot, "app/core/theme-registry.js"), "utf8"), { window: registryWindow });
  return registryWindow.AISystem6Theme.themes.map(({ id }) => id);
}

export async function launchChromium() {
  const { chromium } = require("playwright");
  return chromium.launch({ headless: true, args: ["--no-sandbox", "--force-color-profile=srgb", "--disable-gpu"] });
}

/**
 * A new context and page booted into one appearance, MultiFinder on, ready for
 * the window walk. The caller closes the context.
 */
export async function bootThemedPage(browser, serverUrl, theme, viewport, { deterministic = false } = {}) {
  const phone = Boolean(viewport.phone ?? viewport.width < 768);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    hasTouch: phone,
    isMobile: phone,
    ...(deterministic ? { serviceWorkers: "block" } : {}),
  });
  if (deterministic) {
    // The ledger measures the CSS cascade, not what the network happened to
    // deliver. A remote pack or API that arrives during one run and not the
    // next changes window content, placement and how long a window takes to
    // open, which then shows up as derived cells in unrelated windows. Keep
    // local assets, let the model stubs below answer their own endpoints, and
    // refuse everything else before it can reach a desktop window.
    await context.route("**/*", (route) => {
      const target = new URL(route.request().url());
      return target.hostname === "127.0.0.1" || target.hostname === "localhost" || target.hostname === "[::1]"
        ? route.continue()
        : route.abort();
    });
  }
  // The saved-appearance boot appearance-snapshot.mjs uses; local model
  // probes answered offline so no window waits on developer software.
  await stubLocalModels(context);
  await context.addInitScript((id) => {
    localStorage.setItem("ai-system-6-theme", id);
    localStorage.removeItem("ai-system-6-liquid-glass");
  }, theme);
  if (deterministic) {
    // Same desk on every run: the shuffled Puzzle board and any other
    // Math.random consumer draw from one fixed stream, and the wall clock reads
    // one fixed moment (timers still run, so windows open as usual).
    await context.addInitScript(() => {
      let seed = 0x5eed5eed;
      // openEveryWindow reseeds before each window from its name, so a window
      // that shuffles on open (Puzzle, Memory Cards) draws the same stream
      // however many draws lazy modules made before it.
      window.__cascadeReseed = (key) => {
        let h = 0x5eed5eed;
        for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
        seed = h | 0;
      };
      Math.random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    });
    await context.clock.setFixedTime(new Date("2026-03-14T09:26:00"));
  }
  const page = await context.newPage();
  context.on("page", (popup) => { if (popup !== page) popup.close().catch(() => {}); });
  page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(serverUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => ["ready", "error"].includes(document.body.dataset.appReady), null, { timeout: 60000, polling: 100 });
  await page.evaluate(async (id) => {
    await window.AISystem6Theme.applyTheme(id, { experimental: true, persist: false, announce: false, modernFontPreference: false });
    if (typeof activateWorkspaceProfile === "function") await activateWorkspaceProfile("writing", { persist: false, announce: false });
  }, theme);
  // MultiFinder, as census:controls runs it: under the single-application
  // Finder, opening an application quits the one before, and its windows go.
  await enableMultiFinder(page);
  return { context, page, pageErrors };
}

/** Every registered window, as census:controls opens them. */
export async function openEveryWindow(page, { settleMs = 0 } = {}) {
  const windowNames = await page.evaluate(() => Object.keys(typeof windowRegistry === "object" ? windowRegistry : {}));
  const opened = [];
  const failed = [];
  for (const name of windowNames) {
    let result = null;
    // One lazy module occasionally loses a race with the teardown of the
    // window before it and misses the 20s deadline. Retrying in the same
    // session keeps the measured window set stable instead of turning a
    // transient miss into "appeared/disappeared" cells in unrelated windows.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await page.evaluate((windowName) => window.__cascadeReseed?.(windowName), name);
        await Promise.race([
          page.evaluate((windowName) => openWindow(windowName), name),
          new Promise((_, reject) => setTimeout(() => reject(new Error("open timeout")), WINDOW_OPEN_TIMEOUT)),
        ]);
        const shown = await page.evaluate((windowName) => {
          const win = document.querySelector(`[data-window="${windowName}"]`);
          return Boolean(win && !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden"));
        }, name);
        result = shown ? { shown: true } : { shown: false, error: "not shown after openWindow" };
      } catch (error) {
        result = { shown: false, error: String(error?.message || error).split("\n")[0] };
      }
      if (result.shown) break;
      if (attempt === 1) await page.waitForTimeout(500);
    }
    if (result.shown) opened.push(name);
    else failed.push({ window: name, error: result.error });
    // A window places itself against the rectangles of the windows already
    // open, and those still change while their content loads; a pause before
    // the next open makes the placements the same from run to run.
    if (settleMs) await page.waitForTimeout(settleMs);
  }
  return { windowNames, opened, failed };
}

/**
 * MultiFinder hides the windows of every application but the front one
 * (is-app-hidden), so after the walk only the last application would be on
 * screen. Every window that opened is shown again for the measurement -- a
 * combined state no single click reaches, but each window keeps its own DOM
 * and classes. Then close anything modal an open left behind and open every
 * menu of the menu bar at once: their popovers are the other large surface.
 * Returns how many windows were revealed.
 */
export async function revealAndSettle(page, opened) {
  const revealed = await page.evaluate((names) => {
    let count = 0;
    for (const name of names) {
      const win = document.querySelector(`[data-window="${name}"]`);
      if (win?.classList.contains("is-app-hidden")) { win.classList.remove("is-app-hidden"); count += 1; }
    }
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    for (const menu of document.querySelectorAll(".menu-bar .menu")) menu.classList.add("is-open");
    return count;
  }, opened);
  await page.evaluate(() => window.AISystem6Theme.whenReady());
  await page.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')].every((link) => {
    try { return Boolean(link.sheet); } catch { return true; }
  }), null, { timeout: 20000, polling: 100 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready);
  return revealed;
}

/**
 * Wait until the desk stops moving: finite animations and transitions have
 * ended and every window and canvas holds the same rectangle for several
 * polls. A ledger captured while a window is still sliding into place would
 * record the slide.
 */
export async function settleLayout(page, { quietPolls = 3, intervalMs = 400, timeoutMs = 20000 } = {}) {
  return page.evaluate(async ({ quietPolls: quiet, intervalMs: interval, timeoutMs: timeout }) => {
    // Finite animations and transitions jump to their end state, the one they
    // would reach on their own; infinite ones (spinners) are left running.
    const finish = () => {
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getComputedTiming().iterations !== Infinity && animation.playState === "running") {
          try { animation.finish(); } catch { /* an animation that cannot finish is left to run */ }
        }
      }
    };
    const rects = () => [...document.querySelectorAll(".window")]
      .map((element) => { const r = element.getBoundingClientRect(); return `${Math.round(r.left * 10)},${Math.round(r.top * 10)},${Math.round(r.width * 10)},${Math.round(r.height * 10)}`; })
      .join("|");
    const started = performance.now();
    let last = "";
    let steady = 0;
    while (performance.now() - started < timeout && steady < quiet) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      finish();
      const now = rects();
      steady = now === last ? steady + 1 : 0;
      last = now;
    }
    finish();
    return { settled: steady >= quiet, ms: Math.round(performance.now() - started) };
  }, { quietPolls, intervalMs, timeoutMs });
}
