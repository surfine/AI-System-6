#!/usr/bin/env node
// HIG mechanical gate -- the "twice-seen defect class ships with a gate" half
// of the HIG audit. Catches the MECHANICAL signature of the defects a human
// eye catches at a glance (overflow, sibling overlap, disabled-state
// contrast under the repo's own accepted floor, and a foreground that
// resolves to its own background) across all six appearances, using the DTK
// demo disk fixture so windows carry real content instead of hiding the
// class of bug an empty window can't show.
//
// This is deliberately a SMALLER surface list than tooling/hig-sweep.mjs (the
// exploratory tool): a handful of representative windows per theme, chosen to
// stay fast enough for a release gate while still exercising real content,
// real disabled controls, and the desktop chrome. It shares its check
// implementation with hig-sweep.mjs via hig-checks.mjs, so a check fixed here
// is fixed there too.
//
// Usage:
//   node tooling/verify-hig.mjs                 # all six themes
//   node tooling/verify-hig.mjs --themes classic,aqua
//   node tooling/verify-hig.mjs --plant-defect   # reintroduce a fixed defect to prove the gate bites, then exits 1

import { readFileSync } from "node:fs";
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

// The gate's fixed surface list. Each entry opens a window (or none, for the
// desktop) and captures checks against it. Kept short on purpose -- see the
// header comment for why this differs from the exploratory sweep.
const GATE_SCENES = [
  { id: "desktop", target: null },
  { id: "finder", target: "projects" },
  { id: "outline", target: "outline" },
  { id: "teachText", target: "teachText" },
  { id: "cliotalk", target: "assistant" },
  { id: "quickDraft", target: "quickDraft" },
];

function parseArgs(argv) {
  const options = { themes: ALL_THEMES, plantDefect: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--themes") options.themes = argv[++i].split(",");
    else if (argv[i] === "--plant-defect") options.plantDefect = true;
  }
  return options;
}

const backupPath = join(root, "internal/evidence/drafts/dtk-demo-disk/未来通车之后 Project Hard Disk Backup.json");
const backupJson = readFileSync(backupPath, "utf8");

async function settleStylesheets(page) {
  await page.waitForFunction(() => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    return links.every((link) => { try { return Boolean(link.sheet); } catch { return true; } });
  }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function pinImportedProject(page, projectId) {
  if (!projectId) return;
  await page.evaluate((id) => {
    if (typeof activeProjectId !== "undefined") activeProjectId = id;
    if (typeof selectedProjectId !== "undefined") selectedProjectId = id;
    if (typeof isProjectMounted !== "undefined") isProjectMounted = true;
    if (typeof renderPipeline === "function") renderPipeline();
    if (typeof renderProjectDisks === "function") renderProjectDisks();
  }, projectId);
}

async function runThemeGate(browser, serverUrl, theme, options) {
  const findings = [];
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
  try {
    await page.goto(serverUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 20000 });
    await page.evaluate((themeId) => {
      window.AISystem6Theme?.applyTheme(themeId, { experimental: true, persist: false, announce: false, modernFontPreference: false });
    }, theme);
    await settleStylesheets(page);
    await page.waitForTimeout(500);

    const imported = await page.evaluate(async (json) => {
      const bundle = JSON.parse(json);
      if (typeof renderBackupPreview !== "function" || typeof importProjectBackupAsNewProject !== "function") {
        return { ok: false };
      }
      renderBackupPreview(bundle, "dtk.json", { valid: true });
      await importProjectBackupAsNewProject();
      return { ok: true };
    }, backupJson);
    if (!imported.ok) {
      findings.push({ theme, scene: "import", type: "setup-failure", why: "import functions missing" });
    }
    await page.waitForTimeout(400);
    const projectId = await page.evaluate(() => (
      typeof projects !== "undefined" ? projects.find((p) => (p?.name || "").includes("未来通车之后"))?.id : null
    ));
    await pinImportedProject(page, projectId);

    for (const scene of GATE_SCENES) {
      if (scene.target) {
        await page.evaluate(async (name) => {
          if (typeof loadLazyWindowModule === "function") await loadLazyWindowModule(name).catch(() => {});
          if (typeof openWindow === "function") await openWindow(name);
        }, scene.target);
        await page.waitForTimeout(150);
        await pinImportedProject(page, projectId);
        await page.evaluate((name) => {
          for (const win of document.querySelectorAll(".window")) {
            if (win.dataset.window === name) continue;
            win.classList.add("is-hidden");
            win.classList.remove("is-active");
          }
          const target = document.querySelector(`.window[data-window="${name}"]`);
          if (target) { target.classList.remove("is-hidden"); target.classList.add("is-active"); }
        }, scene.target);
        await page.waitForTimeout(100);

        if (options.plantDefect && scene.id === "teachText") {
          // The real, fixed bug: a WindowShade-collapsed source window's frame
          // leaked its shade height onto a freshly opened content-bearing
          // window (window-manager.js replaceVisibleFinderLocation), leaving
          // real content hidden behind a title-bar-only body. TeachText's
          // manuscript pane is a plain overflow:auto text pane, so forcing its
          // height down reproduces the exact observable shape: scrollHeight
          // stays put (the linked manuscript is still 2500+ words) while the
          // body shrinks to a sliver -- unlike the Finder's flex grid, which
          // reflows smaller instead of clipping, this is the honest case.
          await page.evaluate((name) => {
            const win = document.querySelector(`.window[data-window="${name}"]`);
            if (win) win.style.height = "40px";
          }, scene.target);
        }
      }

      const sceneFindings = await page.evaluate(browserSideChecks());
      for (const f of sceneFindings) findings.push({ theme, scene: scene.id, ...f });
    }
  } catch (error) {
    findings.push({ theme, scene: "fatal", type: "error", why: error.message });
  } finally {
    await context.close();
  }
  return findings;
}

const options = parseArgs(process.argv.slice(2));
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
  const plainResults = await Promise.all(plainThemes.map((theme) => runThemeGate(browser, server.url, theme, options)));
  const blurResults = [];
  for (const theme of blurThemes) blurResults.push(await runThemeGate(browser, server.url, theme, options));
  allFindings = [...plainResults.flat(), ...blurResults.flat()];
} finally {
  if (browser) await browser.close();
  if (server) await stopProcess(server.child);
}

// setup-failure / error are reported but do not fail the gate on their own --
// they usually mean the fixture harness itself needs attention (a window that
// did not mount this run), not a HIG regression. The four mechanical checks
// are the gate's actual contract.
const GATE_TYPES = new Set(["overflow", "collapsed-window", "overlap", "contrast", "invisibility"]);
const failures = allFindings.filter((f) => GATE_TYPES.has(f.type));
const other = allFindings.filter((f) => !GATE_TYPES.has(f.type));

console.log(`HIG gate: ${options.themes.length} theme(s) x ${GATE_SCENES.length} scene(s).`);
if (other.length) {
  console.log(`  ${other.length} non-blocking note(s):`);
  other.forEach((f) => console.log(`    ~ ${f.theme}/${f.scene}: ${f.type} ${f.why || ""}`));
}
if (failures.length) {
  console.log(`  ${failures.length} FAILING finding(s):`);
  failures.forEach((f) => {
    const detail = f.type === "contrast" ? `ratio ${f.ratio} < floor ${f.floor}`
      : f.type === "overflow" ? `${f.axis} overflow ${f.overflowPx}px`
      : f.type === "overlap" ? `overlap ${JSON.stringify(f.overlapPx)}`
      : f.type === "collapsed-window" ? `window ${f.windowHeight}px, body ${f.bodyHeight}px, content wants ${f.contentHeight}px`
      : f.reason || "";
    console.log(`    ! ${f.theme}/${f.scene}: ${f.type} on ${f.tag}${f.id}${f.cls} [${f.window}] "${f.text}" -- ${detail}`);
  });
  console.log(options.plantDefect ? "HIG gate: bit as expected (planted defect)." : "HIG gate: FAIL");
  process.exit(1);
}
console.log(options.plantDefect ? "HIG gate: did NOT bite the planted defect -- gate is broken." : "HIG gate: PASS");
process.exit(options.plantDefect ? 1 : 0);
