#!/usr/bin/env node
// Appearance snapshot — a pixel net over the promised part of the matrix.
//
// tests/visual-snapshot.mjs checks computed token values in 2 themes at 1
// viewport. That catches token drift and nothing else: the two appearance
// defects found by eye on 2026-08-21 (Aqua's pop-up button drawn as a 4px
// rect among 999px capsules, and a fifth control bursting the 375px button
// row) both pass it. This tool captures the real pixels for the cells named
// in tests/appearance-snapshot-manifest.mjs and compares them.
//
// Pixels are compared in the browser: Chromium already decodes PNG, so the
// diff needs no image dependency.
//
// This net no longer renders the four middle eras in the controls tier: after
// the geometry drain their layout lives only in ratcheted sheet declarations
// and token tables, so tooling/appearance-token-check.mjs holds them as
// computed deltas against Classic instead of eight more screenshot cells.
//
// Usage:
//   node tooling/appearance-snapshot.mjs --capture           # write baseline
//   node tooling/appearance-snapshot.mjs --noise             # capture twice, report drift
//   node tooling/appearance-snapshot.mjs --verify            # compare to baseline

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";
import { assertReferenceAssets } from "./lib/reference-assets.mjs";
import { windowInterfaceRegistry } from "./interface-guidelines-contract.mjs";
import { snapshotCells } from "../tests/appearance-snapshot-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASELINE_DIR = join(root, "internal/evidence/drafts/appearance-baseline");
const INDEX_PATH = join(root, "tests/appearance-snapshot.json");
// A frozen wall clock keeps rendered dates out of the diff; it still advances
// so code that measures elapsed time does not stall.
const FROZEN_EPOCH = Date.UTC(2026, 7, 21, 9, 0, 0);
// Liquid Glass rasterizes backdrop-filter through the GPU, which lands a few
// units off between runs — measured at up to 6 across the matrix. Anything at
// or under this is not a change; anything above it is a real one.
const PIXEL_TOLERANCE = 8;
// ...and a floor on how many pixels have to clear it. The GPU noise tail puts
// the odd single pixel a few units out; a regression anyone can see moves a
// whole edge, a glyph, or a fill — dozens of pixels at minimum.
const MIN_CHANGED_PIXELS = 8;

// Each cell owns a browser context, so the pool is bounded the way the feature
// runner bounds its VMs. AI_SYSTEM6_SNAPSHOT_JOBS overrides it; 1 makes the run
// serial, which is the fallback if a machine ever shows parallel-only drift.
function resolveConcurrency() {
  const requested = Number(process.env.AI_SYSTEM6_SNAPSHOT_JOBS);
  if (Number.isFinite(requested) && requested >= 1) return Math.floor(requested);
  return Math.max(1, Math.min(4, availableParallelism()));
}
const CONCURRENCY = resolveConcurrency();

// Appearances that paint backdrop-filter cannot be captured concurrently. Two
// contexts blurring at once starve each other's rasterization, and the same
// build came back 74% different between runs — with the GPU disabled as well,
// so this is not a driver knob. Yosemite is in the Liquid Glass family and
// carries the same overlay. Everything else has no blur and parallelizes.
const BLUR_THEMES = new Set(["liquid-glass", "yosemite"]);

function parseArgs(argv) {
  const options = { mode: "capture", out: BASELINE_DIR, only: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--capture") options.mode = "capture";
    else if (flag === "--noise") options.mode = "noise";
    else if (flag === "--verify") options.mode = "verify";
    else if (flag === "--out") options.out = join(root, argv[++index]);
    else if (flag === "--only") options.only = argv[++index];
  }
  return options;
}

const DETERMINISM = `
  (() => {
    const base = ${FROZEN_EPOCH};
    const origin = performance.now();
    const RealDate = Date;
    const now = () => base + Math.round(performance.now() - origin);
    class FrozenDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [now()])); }
      static now() { return now(); }
    }
    globalThis.Date = FrozenDate;
    // Randomness is PINNED, not seeded. A seeded stream is not enough: section
    // ids ride crypto, and any other consumer drawing on a timer shifts the
    // stream, so the same heading came out {#b00f2d} in one run and {#2864b3}
    // in the next purely because the machine was busier. These return a value
    // that does not depend on how many times they have been called, which makes
    // a heading anchor a function of the document rather than of the schedule.
    Math.random = () => 0.4242424242424242;
    if (globalThis.crypto) {
      globalThis.crypto.getRandomValues = (array) => {
        for (let index = 0; index < array.length; index += 1) array[index] = (index * 37 + 11) & 0xff;
        return array;
      };
      globalThis.crypto.randomUUID = () => "a7f3c1d2-4b5e-4f60-a891-0c2d3e4f5a6b";
    }
  })();
`;

async function newPage(browser, cell) {
  const context = await browser.newContext({
    viewport: { width: cell.width, height: cell.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    hasTouch: cell.width < 768,
    isMobile: cell.width < 768,
  });
  // The showcase desktop includes the live model-status menu and ClioTalk
  // empty state. Letting those pixels depend on whether LM Studio happens to
  // be running made the same commit alternate between two 17k-30k pixel
  // layouts. A visual baseline must own its service state, so every cell sees
  // the same explicit offline provider instead of probing developer software.
  await context.route(/https?:\/\/(?:127\.0\.0\.1|localhost):(?:1234|11434)\//, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models: [] }),
    });
  });
  await context.addInitScript(DETERMINISM);
  await context.addInitScript((themeId) => {
    localStorage.setItem("ai-system-6-theme", themeId);
    localStorage.removeItem("ai-system-6-liquid-glass");
  }, cell.theme);
  const page = await context.newPage();
  return { context, page };
}

async function settle(page, themeId, profile) {
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 20000 });
  // The route windows do not exist in the desktop profile — that is the
  // profile contract, not a defect. Working-tier cells need the writing one.
  if (profile === "writing") {
    await page.evaluate(async () => {
      if (typeof activateWorkspaceProfile === "function") {
        await activateWorkspaceProfile("writing", { persist: false, announce: false });
      }
    });
    await page.waitForTimeout(150);
  }
  await page.evaluate((theme) => {
    window.AISystem6Theme?.applyTheme(theme, {
      experimental: true,
      persist: false,
      announce: false,
      modernFontPreference: false,
    });
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    const noMotion = document.createElement("style");
    noMotion.id = "appearance-snapshot-no-motion";
    noMotion.textContent =
      "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";
    document.head.append(noMotion);
  }, themeId);
  await page.evaluate(() => document.fonts?.ready);
  // Liquid Glass pulls a lazy stylesheet, and until it lands the layout is a
  // different one — the Outline came out 540px wide in one run and 563px (540
  // plus a scrollbar) in the next. Wait for every link to actually own a sheet
  // rather than for a number of milliseconds.
  await page.waitForFunction(() => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    return links.every((link) => {
      try { return Boolean(link.sheet); } catch { return true; }
    });
  }, null, { timeout: 15000 }).catch(() => {});
  // The menu bar's right cluster fills in after first paint too.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

/**
 * Wait until the surface stops changing, then shoot once.
 *
 * What has to settle is asynchronous CONTENT — the menu bar's right cluster and
 * any lazy appearance stylesheet land after first paint, and a cell shot before
 * them holds a different state than the same cell shot after. Pixels are the
 * wrong thing to wait on: Liquid Glass carries a few units of rasterization
 * noise, so consecutive frames are never byte-identical and a shoot-until-equal
 * loop burns its whole budget on every Liquid Glass cell and then times out.
 *
 * Geometry, text length and node count settle exactly when the content does,
 * they cost one evaluate instead of one screenshot, and they converge.
 */
async function settleSurface(page, selector, samples = 12) {
  let previous = "";
  let stableSamples = 0;
  for (let attempt = 0; attempt < samples; attempt += 1) {
    const signature = await page.evaluate((sel) => {
      const root = sel ? document.querySelector(sel) : document.body;
      if (!root) return "missing";
      const box = root.getBoundingClientRect();
      const menu = document.querySelector(".menu-bar, [data-menu-bar], #menu-bar");
      return [
        Math.round(box.width), Math.round(box.height),
        Math.round(box.x), Math.round(box.y),
        root.textContent?.length || 0,
        root.querySelectorAll("*").length,
        menu?.textContent?.length || 0,
      ].join("/");
    }, selector);
    if (signature === previous) {
      stableSamples += 1;
      // A route can report the same geometry once before its deferred
      // content paint lands (notably the phone Outline after the writing
      // profile handoff). Require three consecutive matches so the first
      // stable-looking frame is not mistaken for the settled surface.
      if (stableSamples >= 3) return true;
    } else {
      stableSamples = 0;
    }
    previous = signature;
    await page.waitForTimeout(250);
  }
  return false;
}

async function captureCell(page, cell, outDir) {
  const file = join(outDir, `${cell.id}.png`);
  if (cell.target === "desktop") {
    // The showcase promises ClioTalk in the foreground, not whichever
    // asynchronous boot task last repainted the menu bar. Pin Finder
    // single-task mode and the ClioTalk menu owner before waiting for pixels;
    // otherwise Liquid Glass alternates between a ClioTalk app menu and a
    // transient MultiFinder switcher with no source-byte change.
    await page.evaluate(async (epoch) => {
      if (typeof setFinderEnvironment === "function") {
        await setFinderEnvironment("finder", { persistStartup: false, announce: false });
      }
      document.querySelector('[data-workspace-capability="studio"]')?.classList.add("is-hidden");
      for (const win of document.querySelectorAll(".window")) {
        const clioTalk = win.dataset.window === "assistant";
        win.classList.toggle("is-hidden", !clioTalk);
        win.classList.toggle("is-active", clioTalk);
      }
      if (typeof renderAppMenuBar === "function") renderAppMenuBar("clioTalk");
      document.querySelector(".multifinder-menu")?.classList.add("is-hidden");
      // The menu clock shows FROZEN_EPOCH plus real elapsed time, so a page
      // that lives across a minute boundary displays a different minute. A
      // baseline cannot depend on how long the capture happened to take —
      // render the clock at the frozen epoch explicitly.
      if (typeof renderSystemClock === "function") {
        renderSystemClock(new Date(epoch));
      }
    }, FROZEN_EPOCH);
    await page.waitForFunction(() => {
      const clioTalk = document.querySelector('.window[data-window="assistant"]');
      return clioTalk
        && !clioTalk.textContent?.includes("Getting Clio ready")
        && !clioTalk.textContent?.includes("正在准备");
    }, null, { timeout: 10000 });
    await settleSurface(page, null);
    await page.screenshot({ path: file, animations: "disabled", timeout: 30000 });
  } else {
    const contract = windowInterfaceRegistry[cell.target];
    // Open through the app's own path, then hide the siblings. Toggling
    // is-hidden by hand leaves windows the profile or the mobile flow still
    // keeps off screen, and Playwright then waits for a stable element forever.
    const measure = (id) => {
      const target = document.querySelector(`.window[data-window="${id}"]`);
      if (!target) return { ok: false, why: "not registered" };
      const mobilePage = target.classList.contains("is-mobile-app-page");
      if (!mobilePage) {
        // On the desktop flow the siblings are cascaded behind; hide them so
        // the cell shows one window. The portrait flow already shows only one.
        for (const win of document.querySelectorAll(".window")) {
          if (win === target) continue;
          win.classList.add("is-hidden");
          win.classList.remove("is-active");
        }
        target.classList.remove("is-hidden");
        target.classList.add("is-active");
      }
      const box = target.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return { ok: false, why: `zero box ${Math.round(box.width)}x${Math.round(box.height)}` };
      if (getComputedStyle(target).visibility === "hidden") return { ok: false, why: "visibility hidden" };
      return { ok: true };
    };

    // Each step is its own evaluate with the waiting done on this side: an
    // in-page promise that outlives its task gets garbage collected mid-run.
    // The whole sequence retries, not just the measurement — when the portrait
    // handover drops a window it has to be opened again, not re-measured.
    let mounted = { ok: false, why: "not attempted" };
    for (let attempt = 0; attempt < 3 && !mounted.ok; attempt += 1) {
      await page.evaluate(async ({ id, ensure }) => {
        if (!document.querySelector(`.window[data-window="${id}"]`)
          && ensure === "loadLazyWindowModule" && typeof loadLazyWindowModule === "function") {
          await loadLazyWindowModule(id);
        }
      }, { id: cell.target, ensure: contract?.ensure });
      // Clear the other route windows BEFORE opening the target. openWindow
      // runs arrangeActiveWritingWorkspace, which pairs the target with any
      // route window that happens to be open — so whether the Outline came out
      // solo (563px) or paired with TeachText (892px) depended on boot timing,
      // and the cell drifted between two legitimate layouts. Hiding afterwards
      // was too late: the frame had already been written.
      await page.evaluate((id) => {
        for (const win of document.querySelectorAll(".window")) {
          if (win.dataset.window === id) continue;
          win.classList.add("is-hidden");
          win.classList.remove("is-active");
        }
      }, cell.target);
      // The portrait flow holds one app in the foreground. Opening the next
      // route window on top of the previous one leaves the newcomer unlaid-out,
      // so each cell starts from the home surface.
      const portrait = await page.evaluate(() => {
        if (typeof isPortraitDocumentFlow !== "function" || !isPortraitDocumentFlow()) return false;
        if (typeof mobileHomeToDesktop === "function") mobileHomeToDesktop();
        return true;
      });
      if (portrait) await page.waitForTimeout(250 * (attempt + 1));
      await page.evaluate((id) => {
        if (typeof openWindow === "function") openWindow(id);
      }, cell.target);
      // How long the foreground handover takes is not a number worth guessing
      // — poll for the laid-out box. Chasing it with fixed delays only moved
      // the failures between widths.
      await page.waitForFunction((id) => {
        const target = document.querySelector(`.window[data-window="${id}"]`);
        if (!target) return false;
        const box = target.getBoundingClientRect();
        return box.width > 2 && box.height > 2;
      }, cell.target, { timeout: 6000 }).catch(() => {});
      mounted = await page.evaluate(measure, cell.target);
    }
    if (!mounted.ok) return { id: cell.id, tier: cell.tier, missing: true, why: mounted.why };
    await page.waitForTimeout(80);
    // Liquid Glass rasterizes blur for every frame, and four contexts doing that
    // at once push a single element screenshot past a short deadline. The budget
    // is generous and retried rather than tuned: a cell dropped under load is
    // indistinguishable from a real failure in the report, which is worse than
    // being slow.
    const selector = `.window[data-window="${cell.target}"]`;
    await settleSurface(page, selector);
    try {
      await page.locator(selector).screenshot({ path: file, animations: "disabled", timeout: 30000 });
    } catch (error) {
      return { id: cell.id, tier: cell.tier, missing: true, why: `screenshot: ${error.name}` };
    }
  }
  const buffer = readFileSync(file);
  return { id: cell.id, tier: cell.tier, sha256: createHash("sha256").update(buffer).digest("hex"), bytes: buffer.length };
}

/** Compare two PNGs in the page: returns changed-pixel count and ratio. */
async function diffPng(page, aPath, bPath) {
  const a = readFileSync(aPath).toString("base64");
  const b = readFileSync(bPath).toString("base64");
  return page.evaluate(async ([left, right, tolerance]) => {
    const load = (data) => new Promise((done, fail) => {
      const image = new Image();
      image.onload = () => done(image);
      image.onerror = fail;
      image.src = `data:image/png;base64,${data}`;
    });
    const [one, two] = await Promise.all([load(left), load(right)]);
    if (one.width !== two.width || one.height !== two.height) {
      return { sizeMismatch: true, a: [one.width, one.height], b: [two.width, two.height] };
    }
    const draw = (image) => {
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    const first = draw(one);
    const second = draw(two);
    let changed = 0;
    let soft = 0;
    let maxDelta = 0;
    for (let index = 0; index < first.length; index += 4) {
      const delta = Math.abs(first[index] - second[index])
        + Math.abs(first[index + 1] - second[index + 1])
        + Math.abs(first[index + 2] - second[index + 2])
        + Math.abs(first[index + 3] - second[index + 3]);
      if (delta === 0) continue;
      if (delta <= tolerance) { soft += 1; continue; }
      changed += 1;
      if (delta > maxDelta) maxDelta = delta;
    }
    const total = first.length / 4;
    return { changed, soft, total, ratio: changed / total, maxDelta };
  }, [a, b, PIXEL_TOLERANCE]);
}

async function captureMatrix(browser, serverUrl, cells, outDir) {
  mkdirSync(outDir, { recursive: true });
  // One fresh page per cell. Grouping cells by (theme, width) was twice as fast
  // and wrong: opening the route windows in sequence left state behind, and
  // Review Desk came out 540x620 in one run and 563x733 in the next. A cell that
  // depends on which cell ran before it cannot be a baseline.
  //
  // Independent cells parallelize for free. Results are written back by index so
  // the report keeps manifest order whatever order the pool finishes in.
  const results = new Array(cells.length);
  const misses = [];
  const parallelQueue = [];
  const serialQueue = [];
  cells.forEach((cell, index) => {
    (BLUR_THEMES.has(cell.theme) ? serialQueue : parallelQueue).push(index);
  });

  async function pick(queue) {
    while (queue.length) {
      const index = queue.shift();
      const cell = cells[index];
      const { context, page } = await newPage(browser, cell);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(serverUrl, { waitUntil: "domcontentloaded" });
        await settle(page, cell.theme, cell.tier === "working" ? "writing" : "desktop");
        const record = await captureCell(page, cell, outDir);
        record.pageErrors = errors.length;
        results[index] = record;
        if (record.missing) misses.push(`${cell.id} (${record.why})`);
        process.stdout.write(record.missing ? "!" : ".");
      } catch (error) {
        results[index] = { id: cell.id, tier: cell.tier, missing: true, why: error.name };
        misses.push(`${cell.id} (${error.name})`);
        process.stdout.write("!");
      } finally {
        await context.close();
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, parallelQueue.length) || 1 }, () => pick(parallelQueue))
  );
  await pick(serialQueue);
  process.stdout.write("\n");
  if (misses.length) console.log(`  did not mount: ${misses.join("; ")}`);
  return results;
}

const options = parseArgs(process.argv.slice(2));
assertReferenceAssets("Appearance snapshot", root);
let cells = snapshotCells();
if (options.only) cells = cells.filter((cell) => cell.id.includes(options.only));

let server;
let browser;
let failed = false;
try {
  server = await startAppServer(root);
  // Software rasterization, deliberately. Liquid Glass paints backdrop-filter on
  // every surface; on the shared GPU process four concurrent contexts starve
  // each other, so a cell came back 74% different between two runs of the same
  // build and others never finished a frame. SwiftShader is slower per cell and
  // exactly reproducible, which is the only property a baseline can be built on.
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--force-color-profile=srgb",
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--disable-lcd-text",
      "--font-render-hinting=none",
      "--deterministic-mode",
    ],
  });

  if (options.mode === "noise") {
    const runA = join(root, "internal/evidence/drafts/appearance-noise/run-a");
    const runB = join(root, "internal/evidence/drafts/appearance-noise/run-b");
    rmSync(join(root, "internal/evidence/drafts/appearance-noise"), { recursive: true, force: true });
    console.log(`Capturing ${cells.length} cells, twice.`);
    const first = await captureMatrix(browser, server.url, cells, runA);
    const second = await captureMatrix(browser, server.url, cells, runB);
    const page = await browser.newPage();
    const rows = [];
    for (const cell of cells) {
      const a = first.find((r) => r.id === cell.id);
      const b = second.find((r) => r.id === cell.id);
      if (a?.missing || b?.missing) { rows.push({ id: cell.id, note: a?.why || b?.why || "did not mount" }); continue; }
      if (a.sha256 === b.sha256) { rows.push({ id: cell.id, ratio: 0, changed: 0, soft: 0 }); continue; }
      const diff = await diffPng(page, join(runA, `${cell.id}.png`), join(runB, `${cell.id}.png`));
      rows.push({ id: cell.id, ...diff });
    }
    await page.close();
    const stable = rows.filter((row) => row.changed === 0 && !row.note && !row.sizeMismatch).length;
    const softOnly = rows.filter((row) => row.changed === 0 && row.soft > 0).length;
    const missing = rows.filter((row) => row.note).length;
    console.log(`\n=== Noise report: same build, two runs ===`);
    console.log(`stable (within tolerance ${PIXEL_TOLERANCE}): ${stable}/${rows.length}   of which sub-threshold noise: ${softOnly}   missing: ${missing}`);
    for (const row of rows) {
      if (row.note) console.log(`  ~ ${row.id.padEnd(44)} ${row.note}`);
      // A size mismatch has no changed-pixel count, and the first version of
      // this report tested for one — so the loudest possible result, the same
      // cell coming out a different shape twice, printed nothing at all.
      else if (row.sizeMismatch) {
        console.log(`  ! ${row.id.padEnd(44)} size ${row.a.join("x")} -> ${row.b.join("x")}`);
      } else if (row.changed) {
        const pct = (row.ratio * 100).toFixed(4);
        console.log(`  ! ${row.id.padEnd(44)} ${row.changed} px (${pct}%) maxDelta ${row.maxDelta}`);
      }
    }
    writeFileSync(join(root, "internal/evidence/drafts/appearance-noise/report.json"), `${JSON.stringify(rows, null, 2)}\n`);
  } else if (options.mode === "capture") {
    const results = await captureMatrix(browser, server.url, cells, options.out);
    // A filtered capture refreshes only the cells it shot; it must not drop the
    // rest of the baseline out of the index.
    const index = options.only && existsSync(INDEX_PATH) ? JSON.parse(readFileSync(INDEX_PATH, "utf8")) : {};
    for (const record of results) index[record.id] = record.missing ? { missing: true } : { sha256: record.sha256, bytes: record.bytes };
    writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`);
    const missing = results.filter((r) => r.missing).map((r) => r.id);
    console.log(`Captured ${results.length - missing.length}/${results.length} cells -> ${options.out.replace(`${root}/`, "")}`);
    if (missing.length) console.log(`Did not mount: ${missing.join(", ")}`);
  } else {
    if (!existsSync(INDEX_PATH)) {
      // The baseline is machine-local by design, so a fresh clone has none. Say
      // what to run instead of throwing a stack at a release.
      console.error(
        "Appearance snapshot: no baseline on this machine.\n"
          + "  Capture one from a tree you trust, then re-run:\n"
          + "    npm run snapshot:appearance"
      );
      process.exit(1);
    }
    const baseline = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
    const current = join(root, "internal/evidence/drafts/appearance-current");
    rmSync(current, { recursive: true, force: true });
    const results = await captureMatrix(browser, server.url, cells, current);
    const page = await browser.newPage();
    let softDrift = 0;
    for (const record of results) {
      const known = baseline[record.id];
      if (!known) { console.log(`  + ${record.id} (new cell)`); continue; }
      if (record.missing) {
        console.log(`  ! ${record.id} did not mount (${record.why})`);
        failed = true;
        continue;
      }
      // Byte equality is the fast path, not the verdict: Liquid Glass
      // rasterizes 1-2 units off between runs, so a changed hash still has to
      // clear the measured tolerance before it counts as drift.
      if (known.sha256 === record.sha256) continue;
      const basePng = join(BASELINE_DIR, `${record.id}.png`);
      if (!existsSync(basePng)) {
        console.log(`  ! ${record.id} drifted (no baseline image to compare)`);
        failed = true;
        continue;
      }
      const diff = await diffPng(page, basePng, join(current, `${record.id}.png`));
      if (diff.sizeMismatch) {
        console.log(`  ! ${record.id} drifted size ${diff.a.join("x")} -> ${diff.b.join("x")}`);
        failed = true;
        continue;
      }
      if (diff.changed < MIN_CHANGED_PIXELS) {
        softDrift += 1;
        continue;
      }
      console.log(`  ! ${record.id} drifted ${diff.changed} px (${(diff.ratio * 100).toFixed(4)}%) maxDelta ${diff.maxDelta}`);
      failed = true;
    }
    await page.close();
    console.log(failed
      ? "Appearance snapshot: DRIFT"
      : `Appearance snapshot: ${results.length} cells match (${softDrift} within tolerance ${PIXEL_TOLERANCE})`);
  }
} finally {
  if (browser) await browser.close();
  if (server) await stopProcess(server.child);
}
process.exit(failed ? 1 : 0);
