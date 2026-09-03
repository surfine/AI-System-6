#!/usr/bin/env node
// HIG audit sweep — captures real, content-filled screens across all six
// appearances so a human (or the mechanical checks in hig-checks.mjs) can
// look for common-sense and HIG defects. Not a release gate: this is the
// exploratory tool behind the audit report. See tooling/verify-hig.mjs for
// the fast, permanent gate built on the same check module.
//
// Usage: node tooling/hig-sweep.mjs [--themes classic,aqua] [--out DIR]

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";
import { browserSideChecks } from "./hig-checks.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ALL_THEMES = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];
const BLUR_THEMES = new Set(["liquid-glass", "yosemite"]);

function parseArgs(argv) {
  const options = { themes: ALL_THEMES, out: join(root, "internal/evidence/drafts/hig-sweep") };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--themes") options.themes = argv[++i].split(",");
    else if (argv[i] === "--out") options.out = join(root, argv[++i]);
  }
  return options;
}

const backupPath = join(root, "internal/evidence/drafts/dtk-demo-disk/未来通车之后 Project Hard Disk Backup.json");
const backupJson = readFileSync(backupPath, "utf8");

async function importDemoDisk(page) {
  return page.evaluate(async (json) => {
    const bundle = JSON.parse(json);
    if (typeof renderBackupPreview !== "function" || typeof importProjectBackupAsNewProject !== "function") {
      return { ok: false, why: "import functions missing" };
    }
    renderBackupPreview(bundle, "dtk.json", { valid: true });
    await importProjectBackupAsNewProject();
    return { ok: true };
  }, backupJson);
}

async function settleStylesheets(page) {
  await page.waitForFunction(() => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    return links.every((link) => { try { return Boolean(link.sheet); } catch { return true; } });
  }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

// Defensive pin: a background desk-save / derived-index retry storm after
// import can revert the in-memory activeProjectId to the pre-import default
// project between setup and screenshot (reported separately as a persistence
// finding). This sweep only needs the RIGHT content on screen for its
// screenshots, so it re-asserts the imported project and re-runs the direct
// (non-scheduler) render entry points right before every capture rather than
// trusting whatever state survived the background noise.
async function pinImportedProject(page, projectId) {
  if (!projectId) return;
  await page.evaluate((id) => {
    if (typeof activeProjectId !== "undefined") activeProjectId = id;
    if (typeof selectedProjectId !== "undefined") selectedProjectId = id;
    if (typeof isProjectMounted !== "undefined") isProjectMounted = true;
    if (typeof renderPipeline === "function") renderPipeline();
    if (typeof renderProjectDisks === "function") renderProjectDisks();
    if (typeof renderProjectCd === "function") renderProjectCd();
    if (typeof renderStyleCheckSections === "function") renderStyleCheckSections();
    if (typeof renderClaimCheckSections === "function") renderClaimCheckSections();
  }, projectId);
}

async function openRouteWindow(page, id, projectId) {
  await page.evaluate(async (name) => {
    if (typeof loadLazyWindowModule === "function") await loadLazyWindowModule(name).catch(() => {});
    if (typeof openWindow === "function") await openWindow(name);
  }, id);
  await pinImportedProject(page, projectId);
  await page.waitForFunction((name) => {
    const win = document.querySelector(`.window[data-window="${name}"]`);
    if (!win) return false;
    const r = win.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }, id, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(150);
}

async function isolateWindow(page, id) {
  await page.evaluate((name) => {
    for (const win of document.querySelectorAll(".window")) {
      if (win.dataset.window === name) continue;
      win.classList.add("is-hidden");
      win.classList.remove("is-active");
    }
    const target = document.querySelector(`.window[data-window="${name}"]`);
    if (target) { target.classList.remove("is-hidden"); target.classList.add("is-active"); }
  }, id);
  await page.waitForTimeout(80);
}

async function runChecks(page) {
  return page.evaluate(browserSideChecks());
}

async function shootFull(page, dir, name) {
  await page.screenshot({ path: join(dir, `${name}.png`), animations: "disabled", timeout: 30000 });
}

async function shootWindow(page, dir, name, windowId) {
  const sel = `.window[data-window="${windowId}"]`;
  try {
    await page.locator(sel).screenshot({ path: join(dir, `${name}.png`), animations: "disabled", timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

async function sweepTheme(browser, serverUrl, theme, outRoot) {
  const dir = join(outRoot, theme);
  mkdirSync(dir, { recursive: true });
  const findings = [];
  const record = (scene, list) => {
    for (const f of list) findings.push({ theme, scene, ...f });
  };

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await context.route(/https?:\/\/(?:127\.0\.0\.1|localhost):(?:1234|11434)\//, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: [] }) });
  });
  await context.addInitScript((themeId) => {
    localStorage.setItem("ai-system-6-theme", themeId);
    localStorage.removeItem("ai-system-6-liquid-glass");
  }, theme);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  try {
    await page.goto(serverUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 20000 });
    await page.evaluate((themeId) => {
      window.AISystem6Theme?.applyTheme(themeId, { experimental: true, persist: false, announce: false, modernFontPreference: false });
    }, theme);
    await settleStylesheets(page);
    await page.waitForTimeout(600);

    const imported = await importDemoDisk(page);
    if (!imported.ok) {
      findings.push({ theme, scene: "import", type: "setup-failure", why: imported.why });
    }
    await page.waitForTimeout(400);
    const projectId = await page.evaluate(() => (
      typeof projects !== "undefined" ? projects.find((p) => (p?.name || "").includes("未来通车之后"))?.id : null
    ));
    if (!projectId) findings.push({ theme, scene: "import", type: "setup-failure", why: "imported project not found in memory" });
    await pinImportedProject(page, projectId);

    // Freeze motion for clean captures.
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";
      document.head.append(style);
    });

    // ---- 1. Desktop with a menu open --------------------------------------
    await page.evaluate(() => {
      document.querySelector('[data-workspace-capability="studio"]')?.classList.add("is-hidden");
    });
    const fileMenu = page.locator(".menu-bar .menu-title, .app-menu-bar .menu-title, [data-menu-title]").first();
    await fileMenu.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(200);
    await shootFull(page, dir, "01-desktop-menu-open");
    record("desktop-menu-open", await runChecks(page));
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(100);

    // ---- 2/3. Finder icon + list view (Project Hard Disk) -----------------
    await openRouteWindow(page, "projects", projectId);
    await isolateWindow(page, "projects");
    await page.waitForTimeout(150);
    await shootWindow(page, dir, "02-finder-icon", "projects");
    record("finder-icon", await runChecks(page));
    await page.click('.window[data-window="projects"] .view-btn[data-view="list"]', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(150);
    await shootWindow(page, dir, "03-finder-list", "projects");
    record("finder-list", await runChecks(page));

    // ---- 4. ClioTalk --------------------------------------------------------
    await openRouteWindow(page, "assistant", projectId);
    await isolateWindow(page, "assistant");
    await shootWindow(page, dir, "04-cliotalk", "assistant");
    record("cliotalk", await runChecks(page));

    // ---- 5-11. Route stops --------------------------------------------------
    const routeWindows = [
      ["rag", "05-file-floppy"],
      ["questionSheet", "06-question-sheet"],
      ["outline", "07-outline"],
      ["sectionDrafts", "08-section-drafts"],
      ["teachText", "09-teachtext"],
      ["reviewDesk", "10-review-desk"],
      ["projectCd", "11-project-cd"],
    ];
    for (const [id, label] of routeWindows) {
      await openRouteWindow(page, id, projectId);
      await isolateWindow(page, id);
      await pinImportedProject(page, projectId);
      const ok = await shootWindow(page, dir, label, id);
      if (ok) record(label, await runChecks(page));
      else findings.push({ theme, scene: label, type: "setup-failure", why: "window did not mount" });
    }

    // ---- 12-14. Lightroom / darkroom, three views --------------------------
    await openRouteWindow(page, "quickDraft", projectId);
    await isolateWindow(page, "quickDraft");
    await page.evaluate(() => { window.AISystem6QuickDraft?.enterLightroom?.(); }).catch(() => {});
    await page.waitForTimeout(200);
    await shootWindow(page, dir, "12-lightroom-body", "quickDraft");
    record("lightroom-body", await runChecks(page));
    for (const [mode, label] of [["grain", "13-lightroom-grain"], ["read", "14-lightroom-read"]]) {
      await page.evaluate((m) => { window.AISystem6QuickDraft?.setDisplayMode?.(m); }, mode).catch(() => {});
      await page.waitForTimeout(200);
      const ok = await shootWindow(page, dir, label, "quickDraft");
      if (ok) record(label, await runChecks(page));
    }

    // ---- 15. Desk Accessory (Calculator) ------------------------------------
    await openRouteWindow(page, "calculator");
    await shootWindow(page, dir, "15-calculator", "calculator");
    record("calculator", await runChecks(page));
    await page.evaluate(() => { if (typeof closeWindow === "function") closeWindow("calculator"); });

    // ---- 16. Notification Center -------------------------------------------
    await openRouteWindow(page, "notificationCenter");
    await shootWindow(page, dir, "16-notification-center", "notificationCenter");
    record("notification-center", await runChecks(page));
    await page.evaluate(() => { if (typeof closeWindow === "function") closeWindow("notificationCenter"); });

    // ---- 17. Modal dialog (Empty Trash) -------------------------------------
    await page.evaluate(() => {
      document.querySelector('[data-action="empty-trash"]')?.click();
    }).catch(() => {});
    await page.waitForTimeout(200);
    const dialogOpen = await page.evaluate(() => !!document.querySelector("dialog[open], .finder-operation-modal:not(.is-hidden)"));
    if (dialogOpen) {
      await shootFull(page, dir, "17-modal");
      record("modal", await runChecks(page));
      await page.keyboard.press("Escape").catch(() => {});
    } else {
      findings.push({ theme, scene: "modal", type: "setup-failure", why: "empty-trash did not open a dialog" });
    }
    await page.waitForTimeout(150);

    // ---- 18. Menu popover: checked + disabled item -------------------------
    await isolateWindow(page, "projects");
    await page.click('.window[data-window="projects"] .view-btn[data-view="icon"]', { timeout: 3000 }).catch(() => {});
    const viewMenu = page.locator('.menu-bar .menu-title:has-text("View"), .app-menu-bar .menu-title:has-text("View")').first();
    await viewMenu.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(200);
    const popoverOpen = await page.evaluate(() => !!document.querySelector(".menu-popover:not(.is-hidden)"));
    if (popoverOpen) {
      await shootFull(page, dir, "18-menu-popover");
      record("menu-popover", await runChecks(page));
    } else {
      findings.push({ theme, scene: "menu-popover", type: "setup-failure", why: "View menu did not open" });
    }
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(100);

    // ---- 19. Inactive window behind an active one ---------------------------
    await openRouteWindow(page, "outline", projectId);
    await page.evaluate((id) => {
      for (const win of document.querySelectorAll(".window")) {
        if (win.dataset.window === id) continue;
        win.classList.add("is-hidden");
        win.classList.remove("is-active");
      }
    }, "outline");
    await openRouteWindow(page, "sectionDrafts", projectId);
    // sectionDrafts now active on top; outline should sit visible-but-inactive behind if the app cascades siblings.
    await page.evaluate(() => {
      const outline = document.querySelector('.window[data-window="outline"]');
      if (outline) { outline.classList.remove("is-hidden"); outline.classList.remove("is-active"); }
    });
    await pinImportedProject(page, projectId);
    await page.waitForTimeout(150);
    await shootFull(page, dir, "19-inactive-window");
    record("inactive-window", await runChecks(page));

    // ---- 20. WindowShade-collapsed window -----------------------------------
    await openRouteWindow(page, "calculator", projectId);
    await isolateWindow(page, "calculator");
    await page.click('.window[data-window="calculator"] .shade-box', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
    await shootWindow(page, dir, "20-windowshade", "calculator");
    record("windowshade", await runChecks(page));

    // ---- 21/22. Narrow and wide viewport (desktop) --------------------------
    await page.evaluate(() => { for (const w of document.querySelectorAll(".window")) { w.classList.add("is-hidden"); w.classList.remove("is-active"); } });
    await page.setViewportSize({ width: 860, height: 900 });
    await page.waitForTimeout(300);
    await shootFull(page, dir, "21-narrow-860");
    record("narrow-860", await runChecks(page));
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(300);
    await shootFull(page, dir, "22-wide-1600");
    record("wide-1600", await runChecks(page));
  } catch (error) {
    findings.push({ theme, scene: "fatal", type: "error", why: error.message });
  } finally {
    if (pageErrors.length) findings.push({ theme, scene: "page-errors", type: "js-error", errors: pageErrors.slice(0, 10) });
    await context.close();
  }
  return findings;
}

const options = parseArgs(process.argv.slice(2));
mkdirSync(options.out, { recursive: true });

let server, browser;
let allFindings = [];
try {
  server = await startAppServer(root);
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none"],
  });
  const blurThemes = options.themes.filter((t) => BLUR_THEMES.has(t));
  const plainThemes = options.themes.filter((t) => !BLUR_THEMES.has(t));
  const plainResults = await Promise.all(plainThemes.map((theme) => sweepTheme(browser, server.url, theme, options.out)));
  const blurResults = [];
  for (const theme of blurThemes) blurResults.push(await sweepTheme(browser, server.url, theme, options.out));
  allFindings = [...plainResults.flat(), ...blurResults.flat()];
} finally {
  if (browser) await browser.close();
  if (server) await stopProcess(server.child);
}

writeFileSync(join(options.out, "findings.json"), `${JSON.stringify(allFindings, null, 2)}\n`);
const byType = {};
for (const f of allFindings) byType[f.type] = (byType[f.type] || 0) + 1;
console.log(`Sweep complete. ${allFindings.length} findings across ${options.themes.length} themes.`);
console.log(byType);
console.log(`Output: ${options.out}`);
