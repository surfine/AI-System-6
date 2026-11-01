#!/usr/bin/env node
// The performance gate: what the desk costs to open, and what it costs to type
// into.
//
// Why this gate exists. The phone design draft wrote a performance budget --
// cold start, warm start, key echo, scroll, keyboard shift -- and then nothing
// ever measured it. A budget nobody measures is a wish. Worse, the numbers in
// the draft are stated for an iPhone 14 Pro, and nothing in this repo has ever
// run on one; every claim about phone speed here has been a guess made on an
// Apple Silicon Mac with the fans off.
//
// So this gate does two honest things and refuses to pretend about a third.
//
//   1. It measures what a headless browser can actually measure: navigation to
//      `appReady`, LCP, CLS, blocking time, the long tasks in the first five
//      seconds, the bytes the boot set pulls off the wire, and the delay from
//      a key going down to the character being in the DOM at the next frame.
//   2. It holds those numbers against a checked-in baseline that RATCHETS. A
//      new regression is a refusal. A baseline entry that has IMPROVED is also
//      a refusal, until the number is corrected -- the same bookkeeping the
//      device matrix and the theme fidelity ledger use, so a win can never
//      hide behind a stale number and quietly pay for a later loss.
//   3. It says out loud which budget lines it cannot measure. Frames per
//      second on a machine with no display is not a frame rate. A soft
//      keyboard that no headless browser opens cannot shift a layout. Those
//      lines are listed in UNMEASURABLE below and are NOT scored.
//
// What the CPU throttle is and is not. Chromium's
// `Emulation.setCPUThrottlingRate` slows the main thread by a fixed multiple.
// At rate 4 this Mac is roughly a phone-class main thread for JavaScript work.
// It is NOT an iPhone 14 Pro: it does not model iOS's memory pressure, Safari's
// different parser and JIT, a real GPU, a real radio, or thermal throttling.
// Read every phone number here as "a phone-shaped main thread on this Mac".
// The engine is Chromium, because only Chromium exposes the CDP throttle and
// the long-task and layout-shift observers this gate lives on; iOS Safari
// LAYOUT is held by tooling/verify-device-matrix.mjs, which runs WebKit. The
// two gates are complements, and neither one is the other's proof.
//
// Contract: tests/features/web-vitals.test.mjs

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASELINE_PATH = join(root, "tooling", "web-vitals-baseline.json");

// ---- The budget, as named numbers ----------------------------------------
//
// Every line below is a number somebody decided, so every line is a constant
// with the decision written beside it. A budget buried as a literal inside a
// comparison is a budget nobody can find, argue with, or change on purpose.

/** The phone design draft: cold start to `appReady` with the shell already on the device. */
export const BUDGET_SHELL_WARM_START_MS = 2000;
/** The phone design draft: a warm start, everything already in memory. */
export const BUDGET_WARM_START_MS = 1000;
/** The phone design draft: a key press to the character echoing back. */
export const BUDGET_KEY_ECHO_MS = 50;
/** The phone design draft: scrolling inside the shell raises no long task. */
export const BUDGET_SCROLL_LONG_TASKS = 0;
/** Core Web Vitals "good" threshold for Largest Contentful Paint. */
export const BUDGET_LCP_MS = 2500;
/** Core Web Vitals "good" threshold for Interaction to Next Paint. Scored against the key-echo worst case. */
export const BUDGET_INP_MS = 200;
/** Core Web Vitals "good" threshold for Cumulative Layout Shift. */
export const BUDGET_CLS = 0.1;
/**
 * The two-floppy ceiling (2 x 1.44 MB), borrowed for the wire.
 *
 * The draft set no byte line at all. The repo already holds one for
 * index.html + the two bundles, so this gate applies the same ceiling to
 * everything the boot set actually transfers -- icons, fonts and lazily
 * arriving modules included. That is a stricter question than the floppy
 * budget asks, and as of the first capture the answer is over the line. It is
 * recorded as debt below rather than softened.
 */
export const BUDGET_BOOT_TRANSFER_BYTES = 2_949_120;
/** A task is "long" at 50 ms -- the browser's own definition, and the draft's. */
export const LONG_TASK_MS = 50;
/** Long tasks are counted over the first five seconds of the cold start. */
export const LONG_TASK_WINDOW_MS = 5000;

// The three budget lines a headless browser cannot honestly answer. They are
// named here so the report can say so every run, instead of a reader assuming
// silence means a pass.
export const UNMEASURABLE = Object.freeze([
  {
    line: "scroll inside the shell holds 60 fps",
    why: "A headless browser has no display and no compositor deadline. Its frame "
      + "callbacks are a work queue, not a refresh rate, so any fps this gate printed "
      + "would be a number about the harness. The other half of that budget line -- no "
      + "long task over 50 ms while scrolling -- IS measured, as scrollLongTasksOver50.",
  },
  {
    line: "the keyboard opening causes zero layout shift",
    why: "No headless browser opens a soft keyboard, and neither Chromium's viewport "
      + "emulation nor the VirtualKeyboard API raises one. The shift this budget is "
      + "about happens on a real iOS device or it does not happen at all. The gate "
      + "measures the page's own CLS, which is a different question.",
  },
  {
    line: "the numbers are an iPhone 14 Pro",
    why: "They are this Mac with its main thread slowed 4x and an iPhone-shaped "
      + "viewport. See the CPU throttle note at the top of this file.",
  },
]);

// ---- The cells ------------------------------------------------------------

/** A phone main thread is roughly a quarter of this Mac's. See the header note. */
export const PHONE_CPU_THROTTLE_RATE = 4;
/** The desk cell is not CPU-starved, and an unthrottled clock is a steadier one. */
export const DESK_CPU_THROTTLE_RATE = 1;

export const VIEWPORTS = Object.freeze([
  {
    name: "iphone-14pro",
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    cpuThrottleRate: PHONE_CPU_THROTTLE_RATE,
  },
  {
    name: "mac-13-inch",
    width: 1280,
    height: 800,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    cpuThrottleRate: DESK_CPU_THROTTLE_RATE,
  },
]);

// ---- The tolerance band ---------------------------------------------------
//
// A wall clock is not a pixel. The same build, measured twice on the same
// machine, does not return the same millisecond, and this machine runs several
// lanes at once. So each metric declares how much movement is noise.
//
// The bands below were chosen from three consecutive full runs of this gate on
// 2026-09-05, on a shared machine, and each one is wider than the spread those
// runs produced -- see the numbers in the baseline's `observedSpread`. They are
// deliberately NOT wider than that: a band big enough to swallow a real
// regression is worse than no gate, because it teaches everyone that green
// means nothing.
//
// The counted and weighed metrics get much tighter bands than the timed ones,
// because bytes and resource counts do not care how busy the machine is.
export const TOLERANCE = Object.freeze({
  /**
   * Timings: +/- 35%.
   *
   * Where that number came from. Six consecutive cold starts on a quiet
   * machine measured 2886, 2888, 2894, 2895, 2899 and 2901 ms -- a spread of
   * 0.5%, and 629 boot responses every single time. The same gate run while
   * other lanes were working moved the same numbers by up to 103%. So the
   * noise here is not measurement noise, it is CONTENTION, and the answer to
   * contention is the ship queue's `quiet` flag, not a band wide enough to
   * swallow a doubling of boot time.
   *
   * 35% is therefore deliberately much tighter than a contended machine can
   * hold and much looser than a quiet one needs: it absorbs a busy Spotlight
   * or a backup, and it still refuses anything that gets half again slower.
   * Run this gate quiet, or do not believe its timings.
   */
  timingPct: 0.35,
  /**
   * Plus an absolute floor, because a percentage band around a small number is
   * a fiction. Blocking time on the desk cell measured 2 ms one pass and 64 ms
   * the next; 35% of 2 ms would refuse on a rounding error. Below this floor a
   * timing is held by its BUDGET line, not by the ratchet.
   */
  timingFloorMs: 120,
  /** Bytes: +/- 3%. Six quiet passes spread 1.7%, from one image variant. */
  bytesPct: 0.03,
  /** Whole-number metrics: +/- 3. A long task can split or merge between passes. */
  countAbsolute: 3,
  /** CLS: +/- 0.02 absolute. A percentage band around a baseline of 0 is meaningless. */
  clsAbsolute: 0.02,
});

/**
 * Every metric this gate scores: what it is, how it is compared, and which
 * budget line it answers. `budget: null` means the draft set no line for it --
 * it is still ratcheted, because a number nobody bounded can still get worse.
 */
export const METRICS = Object.freeze([
  {
    key: "coldStartMs",
    band: "timing",
    budget: null,
    label: "first visit, empty cache, no service worker -> appReady",
  },
  {
    key: "shellWarmStartMs",
    band: "timing",
    budget: BUDGET_SHELL_WARM_START_MS,
    label: "new document with the shell already cached -> appReady",
  },
  {
    key: "warmStartMs",
    band: "timing",
    budget: BUDGET_WARM_START_MS,
    label: "reload of a running page -> appReady",
  },
  { key: "lcpMs", band: "timing", budget: BUDGET_LCP_MS, label: "Largest Contentful Paint (cold)" },
  { key: "cls", band: "cls", budget: BUDGET_CLS, label: "Cumulative Layout Shift (cold)" },
  {
    key: "totalBlockingTimeMs",
    band: "timing",
    budget: null,
    label: "blocking time: sum of (long task - 50 ms) in the first 5 s",
  },
  {
    key: "bootTransferBytes",
    band: "bytes",
    budget: BUDGET_BOOT_TRANSFER_BYTES,
    label: "bytes off the wire before the desk reported ready",
  },
  { key: "bootResourceCount", band: "count", budget: null, label: "responses before ready" },
  {
    key: "longTasksOver50InFirst5s",
    band: "count",
    budget: null,
    label: `tasks over ${LONG_TASK_MS} ms in the first ${LONG_TASK_WINDOW_MS / 1000} s`,
  },
  {
    // The very first keystroke of a session is its own event: it pays for
    // whatever the field wires up lazily, and it pays once. Rolled into the
    // worst-case it swamped every other sample and made that metric a
    // measurement of lazy loading. Split out, both facts stay visible.
    key: "keyEchoFirstMs",
    band: "timing",
    budget: BUDGET_INP_MS,
    label: "the session's FIRST key-down to character-in-DOM (INP proxy)",
  },
  {
    key: "keyEchoWorstMs",
    band: "timing",
    budget: BUDGET_INP_MS,
    label: "worst steady-state key echo after the first (INP proxy)",
  },
  {
    key: "keyEchoP75Ms",
    band: "timing",
    budget: BUDGET_KEY_ECHO_MS,
    label: "75th-percentile steady-state key echo (the draft's 50 ms line)",
  },
  {
    key: "scrollLongTasksOver50",
    band: "count",
    budget: BUDGET_SCROLL_LONG_TASKS,
    label: "long tasks raised by a scripted scroll pass",
  },
]);

/** Key presses per pass: one first-keystroke sample plus twelve steady-state ones. */
const KEY_ECHO_SAMPLES = 13;
/**
 * Each cell is measured this many times and the FASTEST pass is kept.
 *
 * The fastest, not the median. Every source of noise on this machine is
 * additive -- another lane's browser, a backup, a compile -- so contention only
 * ever makes a pass slower and never makes it faster. The minimum is therefore
 * the closest thing available to what the build itself costs, and measured
 * across three full runs it moved less than half as much as the median of the
 * same passes did.
 */
const REPEATS = 3;

// ---- Command line ---------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log([
    "Usage: node tooling/verify-web-vitals.mjs [options]",
    "",
    "  --viewport <name>   only this cell (iphone-14pro | mac-13-inch)",
    "  --repeats <n>       passes per cell, fastest kept (default 3)",
    "  --update-baseline   rewrite the baseline from this run",
    "  --json <path>       also write every raw pass to a file",
  ].join("\n"));
  process.exit(0);
}
function optionValue(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}
const onlyViewport = optionValue("--viewport");
const updateBaseline = args.includes("--update-baseline");
const jsonPath = optionValue("--json");
const repeats = Number(optionValue("--repeats") || REPEATS);
if (!Number.isInteger(repeats) || repeats < 1) throw new Error("--repeats must be a positive integer");

// ---- Server, borrowed whole from the device matrix -------------------------

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function httpReady(url) {
  return new Promise((done) => {
    const request = get(url, (response) => {
      response.resume();
      done(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on("error", () => done(false));
    request.setTimeout(1000, () => {
      request.destroy();
      done(false);
    });
  });
}

async function getFreePort() {
  return await new Promise((done, fail) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => (port ? done(port) : fail(new Error("Could not allocate a local port"))));
    });
    server.on("error", fail);
  });
}

async function startAppServer() {
  const port = await getFreePort();
  // 127.0.0.1, not a LAN address: a loopback origin is a secure context, which
  // is what lets the service worker register at all. Without it every "shell
  // warm" number in this gate would silently be a second cold start.
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (await httpReady(url)) return { child, url };
    if (child.exitCode !== null) break;
    await wait(150);
  }
  child.kill("SIGTERM");
  throw new Error(`Web vitals server did not start.\n${output.trim()}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((done) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      done();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      done();
    });
    child.kill("SIGTERM");
  });
}

// ---- The page-side instrument ---------------------------------------------
//
// Installed before any of the app's own script runs, for one reason: the moment
// `appReady` flips has to be read by the engine, not polled from Node. Polling
// adds the poll interval and a process hop to every start number, which is
// noise measured in tens of milliseconds on a metric budgeted in hundreds.
const INSTRUMENT = `(() => {
  const perf = { lcp: 0, cls: 0, longTasks: [], appReadyAt: null, scrollLongTasks: [] };
  window.__ais6Vitals = perf;
  // The resource timing buffer holds 250 entries by default, and the boot set
  // is larger than that. Left alone it truncates at whichever 250 responses
  // landed first, which made the byte total bimodal -- 3.2 MB on one pass and
  // 5.5 MB on the next, from the same build, because a different 250 fitted.
  // Raised here before a single response is recorded.
  try { performance.setResourceTimingBufferSize(4000); } catch { /* the count in the report says if it clipped */ }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) perf.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch { /* an engine without the observer reports 0, and the report says so */ }
  try {
    new PerformanceObserver((list) => {
      // hadRecentInput shifts are the user's own doing, and Core Web Vitals
      // excludes them. Counting them would score this gate's own typing.
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) perf.cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  } catch { /* same */ }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        perf.longTasks.push({ start: entry.startTime, duration: entry.duration });
        if (perf.scrollWindow) perf.scrollLongTasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch { /* same */ }
  const mark = () => {
    if (perf.appReadyAt === null && document.body && document.body.dataset.appReady === "ready") {
      perf.appReadyAt = performance.now();
    }
  };
  // At document_start there is no documentElement yet, let alone a body, so
  // there is nothing a MutationObserver can be pointed at. A 4 ms retry covers
  // the handful of milliseconds until <body> is parsed; from that moment on the
  // mark is the observer's, which is exact.
  const watchBody = () => {
    if (!document.body) {
      setTimeout(watchBody, 4);
      return;
    }
    new MutationObserver(mark).observe(document.body, { attributes: true, attributeFilter: ["data-app-ready"] });
    mark();
  };
  watchBody();
})()`;

/** Wait for the page's own mark, then read it. Never Date.now() around a goto. */
async function readyAt(page) {
  const handle = await page.waitForFunction(
    () => (window.__ais6Vitals && window.__ais6Vitals.appReadyAt !== null
      ? window.__ais6Vitals.appReadyAt
      : false),
    undefined,
    { timeout: 180_000 },
  );
  return Math.round(await handle.jsonValue());
}

/**
 * The boot set: every response that finished before the desk said ready, plus
 * the navigation itself. Anything that lands afterwards is the desk working,
 * not the desk opening.
 */
const BOOT_BYTES = `(readyAt) => {
  const navigation = performance.getEntriesByType("navigation")[0];
  const resources = performance.getEntriesByType("resource")
    .filter((entry) => entry.responseEnd <= readyAt);
  return {
    bytes: (navigation ? navigation.transferSize || 0 : 0)
      + resources.reduce((total, entry) => total + (entry.transferSize || 0), 0),
    count: resources.length + (navigation ? 1 : 0),
  };
}`;

/** Key down to the character being in the DOM at the next frame. Not key to photon: see UNMEASURABLE. */
async function measureKeyEcho(page) {
  const field = await page.evaluate(() => {
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      return box.width > 4 && box.height > 4 && getComputedStyle(el).visibility !== "hidden";
    };
    const pick = () => [...document.querySelectorAll("textarea, input[type=text]")].find(visible) || null;
    let el = pick();
    if (!el) {
      // Nothing typable on the desk as it opened, so open the one accessory
      // that is a text field and nothing else.
      try { openWindow("notePad"); } catch { /* reported as no field below */ }
    }
    el = el || pick();
    if (!el) return null;
    if (!el.id) el.id = "ais6-vitals-field";
    return `#${el.id}`;
  });
  if (!field) {
    await wait(900);
  }
  const selector = field || await page.evaluate(() => {
    const el = [...document.querySelectorAll("textarea, input[type=text]")]
      .find((node) => node.getBoundingClientRect().width > 4);
    if (!el) return null;
    if (!el.id) el.id = "ais6-vitals-field";
    return `#${el.id}`;
  });
  if (!selector) {
    throw new Error("Web vitals found no typable field on the desk; the key-echo metric cannot be faked.");
  }
  await page.focus(selector);
  const samples = [];
  for (let index = 0; index < KEY_ECHO_SAMPLES; index += 1) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      window.__ais6Echo = null;
      let downAt = 0;
      // A trusted event's timeStamp shares performance.now()'s time origin, so
      // this subtraction is one clock, not two.
      el.addEventListener("keydown", (event) => { downAt = event.timeStamp; }, { once: true });
      el.addEventListener("input", () => {
        requestAnimationFrame(() => { window.__ais6Echo = performance.now() - downAt; });
      }, { once: true });
    }, selector);
    await page.keyboard.press("a");
    const handle = await page.waitForFunction(
      () => (typeof window.__ais6Echo === "number" ? window.__ais6Echo : false),
      undefined,
      { timeout: 15_000 },
    );
    samples.push(await handle.jsonValue());
  }
  // Leave the field as it was found. This gate measures the product; it does
  // not get to leave twelve letters in the writer's prompt.
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, selector);
  const [first, ...steady] = samples;
  const sorted = [...steady].sort((a, b) => a - b);
  return {
    first: Math.round(first),
    worst: Math.round(sorted[sorted.length - 1]),
    p75: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))]),
    samples: samples.map((value) => Math.round(value)),
  };
}

/**
 * Long tasks raised by scrolling. The fps half of that budget line is not
 * measurable here (see UNMEASURABLE); this half is.
 *
 * `scrollTargets` travels with the number on purpose: if nothing on the desk
 * scrolls, zero long tasks is a fact about the probe, not about the product,
 * and the report has to be able to say which it is.
 */
async function measureScroll(page) {
  // Nothing on the freshly opened desk scrolls -- measured on 2026-09-05, at
  // both cells: no window, no rail, not the desk itself. A scroll probe with
  // nothing to scroll reports a perfect zero and means nothing, so this one
  // opens a surface that carries real product content past the bottom of the
  // window. System Help is 2368 px of list in a 208 px phone window.
  await page.evaluate(async () => {
    try { openWindow("systemHelp"); } catch { /* the missing scroller is the refusal below */ }
    await new Promise((done) => setTimeout(done, 1200));
  });
  const targets = await page.evaluate(async () => {
    const perf = window.__ais6Vitals;
    perf.scrollLongTasks = [];
    perf.scrollWindow = true;
    const scrollable = [document.scrollingElement, ...document.querySelectorAll("*")]
      .filter((el) => el && el.scrollHeight > el.clientHeight + 8)
      .filter((el) => {
        if (el === document.scrollingElement) return true;
        const style = getComputedStyle(el);
        return /auto|scroll/.test(style.overflowY);
      })
      .slice(0, 6);
    for (const el of scrollable) {
      for (let step = 0; step < 8; step += 1) {
        el.scrollTop = Math.min(el.scrollHeight, (step + 1) * 120);
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      }
      el.scrollTop = 0;
    }
    await new Promise((done) => setTimeout(done, 400));
    perf.scrollWindow = false;
    return scrollable.length;
  });
  const long = await page.evaluate(
    (limit) => window.__ais6Vitals.scrollLongTasks.filter((task) => task.duration > limit).length,
    LONG_TASK_MS,
  );
  await page.evaluate(() => { try { closeWindow("systemHelp"); } catch { /* left open costs nothing here */ } });
  if (!targets) {
    throw new Error(
      "Web vitals found nothing scrollable after opening System Help. The scroll metric "
      + "would be a vacuous zero, so the gate refuses instead of reporting it.",
    );
  }
  return { scrollTargets: targets, longTasks: long };
}

// ---- One pass over one cell ------------------------------------------------

async function measureCell(browser, serverUrl, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
  });
  await context.addInitScript(INSTRUMENT);
  try {
    // --- cold: a context that has never seen this origin ---
    const cold = await context.newPage();
    const coldClient = await context.newCDPSession(cold);
    await coldClient.send("Emulation.setCPUThrottlingRate", { rate: viewport.cpuThrottleRate });
    await cold.goto(serverUrl);
    const coldStartMs = await readyAt(cold);
    const boot = await cold.evaluate(`(${BOOT_BYTES})(${coldStartMs})`);
    // The long-task window closes five seconds after navigation, so the page
    // has to be allowed to live that long before the window is read.
    await cold.waitForTimeout(Math.max(0, LONG_TASK_WINDOW_MS - coldStartMs) + 500);
    const vitals = await cold.evaluate((limit) => {
      const perf = window.__ais6Vitals;
      const early = perf.longTasks.filter((task) => task.start < limit.window);
      return {
        lcp: Math.round(perf.lcp),
        cls: Number(perf.cls.toFixed(4)),
        longTasks: early.filter((task) => task.duration > limit.long).length,
        blocking: Math.round(early.reduce((total, task) => total + Math.max(0, task.duration - limit.long), 0)),
      };
    }, { long: LONG_TASK_MS, window: LONG_TASK_WINDOW_MS });

    // The service worker installs after `load`. Waiting for it to CONTROL the
    // origin is the whole difference between the next number being a shell-warm
    // start and being a second cold one, so it is waited for explicitly and a
    // timeout here is a refusal, not a shrug.
    await cold.waitForFunction(
      async () => {
        const registration = await navigator.serviceWorker?.getRegistration?.();
        return Boolean(registration && registration.active);
      },
      undefined,
      { timeout: 60_000 },
    );

    const keyEcho = await measureKeyEcho(cold);
    const scroll = await measureScroll(cold);

    // --- shell warm: a NEW document, served by the worker's cache ---
    const warm = await context.newPage();
    const warmClient = await context.newCDPSession(warm);
    await warmClient.send("Emulation.setCPUThrottlingRate", { rate: viewport.cpuThrottleRate });
    await warm.goto(serverUrl);
    const shellWarmStartMs = await readyAt(warm);
    const controlled = await warm.evaluate(() => Boolean(navigator.serviceWorker.controller));

    // --- warm: the same page again, same renderer, code cache hot ---
    await warm.reload();
    const warmStartMs = await readyAt(warm);

    return {
      coldStartMs,
      shellWarmStartMs,
      warmStartMs,
      lcpMs: vitals.lcp,
      cls: vitals.cls,
      totalBlockingTimeMs: vitals.blocking,
      bootTransferBytes: boot.bytes,
      bootResourceCount: boot.count,
      longTasksOver50InFirst5s: vitals.longTasks,
      keyEchoFirstMs: keyEcho.first,
      keyEchoWorstMs: keyEcho.worst,
      keyEchoP75Ms: keyEcho.p75,
      scrollLongTasksOver50: scroll.longTasks,
      detail: {
        keyEchoSamples: keyEcho.samples,
        scrollTargets: scroll.scrollTargets,
        serviceWorkerControlled: controlled,
      },
    };
  } finally {
    await context.close();
  }
}

function summarise(passes) {
  const summary = {};
  const spread = {};
  for (const metric of METRICS) {
    const values = passes.map((pass) => pass[metric.key]);
    const value = Math.min(...values);
    summary[metric.key] = metric.key === "cls" ? Number(value.toFixed(4)) : Math.round(value);
    const low = Math.min(...values);
    const high = Math.max(...values);
    // Four decimals, not three: CLS is the one metric whose baseline is kept to
    // four, and a spread rounded shorter than the value it brackets makes the
    // baseline look like it sits below its own floor.
    spread[metric.key] = { low: Math.round(low * 10000) / 10000, high: Math.round(high * 10000) / 10000 };
  }
  return { summary, spread };
}

// ---- The ratchet -----------------------------------------------------------

function band(metric, baselineValue) {
  if (metric.band === "cls") return { low: baselineValue - TOLERANCE.clsAbsolute, high: baselineValue + TOLERANCE.clsAbsolute };
  if (metric.band === "count") return { low: baselineValue - TOLERANCE.countAbsolute, high: baselineValue + TOLERANCE.countAbsolute };
  if (metric.band === "bytes") {
    return { low: baselineValue * (1 - TOLERANCE.bytesPct), high: baselineValue * (1 + TOLERANCE.bytesPct) };
  }
  const slack = Math.max(baselineValue * TOLERANCE.timingPct, TOLERANCE.timingFloorMs);
  return { low: baselineValue - slack, high: baselineValue + slack };
}

function loadBaseline() {
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function budgetDebt(cellSummary) {
  const debt = [];
  for (const metric of METRICS) {
    if (metric.budget === null) continue;
    if (cellSummary[metric.key] > metric.budget) debt.push(metric.key);
  }
  return debt;
}

function reportCell(name, summary, baselineCell) {
  const lines = [`  ${name}`];
  for (const metric of METRICS) {
    const value = summary[metric.key];
    const base = baselineCell ? baselineCell[metric.key] : null;
    const budget = metric.budget === null
      ? "no line"
      : `${metric.budget} ${value > metric.budget ? "OVER" : "ok"}`;
    lines.push(`    ${metric.key.padEnd(26)} ${String(value).padStart(10)}  baseline ${String(base ?? "-").padStart(10)}  budget ${budget}`);
  }
  return lines.join("\n");
}

async function run() {
  const baseline = loadBaseline();
  if (!baseline && !updateBaseline) {
    console.error("Web vitals refused: no baseline. Capture one with --update-baseline and commit it.");
    return 1;
  }
  const cells = VIEWPORTS.filter((viewport) => !onlyViewport || viewport.name === onlyViewport);
  if (!cells.length) throw new Error(`Unknown viewport: ${onlyViewport}`);

  const server = await startAppServer();
  const browser = await chromium.launch();
  const observed = {};
  const spreads = {};
  const raw = {};
  try {
    for (const viewport of cells) {
      const passes = [];
      for (let pass = 0; pass < repeats; pass += 1) {
        passes.push(await measureCell(browser, server.url, viewport));
      }
      const { summary, spread } = summarise(passes);
      observed[viewport.name] = summary;
      spreads[viewport.name] = spread;
      raw[viewport.name] = passes;
    }
  } finally {
    await browser.close();
    await stopProcess(server.child);
  }

  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(raw, null, 1)}\n`);

  if (updateBaseline) {
    const next = {
      note: "Fastest of "
        + `${repeats} passes per cell. A NEW regression outside the tolerance band is a refusal; a `
        + "value that has IMPROVED past the band is ALSO a refusal until the number here is "
        + "corrected, so a win cannot hide behind a stale number. Regenerate with "
        + "--update-baseline only when the change is deliberate and explained.",
      capturedBy: "tooling/verify-web-vitals.mjs",
      repeats,
      cpuThrottle: Object.fromEntries(VIEWPORTS.map((v) => [v.name, v.cpuThrottleRate])),
      tolerance: TOLERANCE,
      budgets: Object.fromEntries(METRICS.filter((m) => m.budget !== null).map((m) => [m.key, m.budget])),
      unmeasurable: UNMEASURABLE.map((entry) => entry.line),
      cells: observed,
      observedSpread: spreads,
      budgetDebt: Object.fromEntries(Object.entries(observed).map(([name, summary]) => [name, budgetDebt(summary)])),
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log("Web vitals baseline written.");
    for (const [name, summary] of Object.entries(observed)) console.log(reportCell(name, summary, summary));
    return 0;
  }

  const problems = [];
  for (const viewport of cells) {
    const summary = observed[viewport.name];
    const baselineCell = baseline.cells?.[viewport.name];
    if (!baselineCell) {
      problems.push(`NEW CELL ${viewport.name} is not in the baseline`);
      continue;
    }
    const debt = new Set(baseline.budgetDebt?.[viewport.name] || []);
    for (const metric of METRICS) {
      const value = summary[metric.key];
      const base = baselineCell[metric.key];
      if (typeof base !== "number") {
        problems.push(`NEW METRIC ${viewport.name} ${metric.key} is not in the baseline`);
        continue;
      }
      const limits = band(metric, base);
      if (value > limits.high) {
        problems.push(`REGRESSED ${viewport.name} ${metric.key}: ${value} vs baseline ${base} (band <= ${Math.round(limits.high * 100) / 100})`);
      } else if (value < limits.low) {
        problems.push(`IMPROVED (correct the baseline) ${viewport.name} ${metric.key}: ${value} vs baseline ${base} (band >= ${Math.round(limits.low * 100) / 100})`);
      }
      // A budget the product already met may not be newly broken, even inside
      // the tolerance band. A budget it already owed is held by the ratchet
      // above and by the debt list, which the report prints every run.
      if (metric.budget !== null && value > metric.budget && !debt.has(metric.key)) {
        problems.push(`OVER BUDGET ${viewport.name} ${metric.key}: ${value} > ${metric.budget}, and the baseline was under it`);
      }
      if (metric.budget !== null && value <= metric.budget && debt.has(metric.key)) {
        problems.push(`BUDGET MET (delete from budgetDebt) ${viewport.name} ${metric.key}: ${value} <= ${metric.budget}`);
      }
    }
  }

  console.log("Web vitals, fastest of "
    + `${repeats} pass(es) per cell (Chromium; phone cell throttled ${PHONE_CPU_THROTTLE_RATE}x):`);
  for (const viewport of cells) {
    console.log(reportCell(viewport.name, observed[viewport.name], baseline.cells?.[viewport.name]));
  }
  console.log("\nThis gate must run QUIET. Another browser on the machine moves its timings by more"
    + "\nthan its band; the byte and count metrics hold either way.");
  console.log("\nNot measured here, and not scored:");
  for (const entry of UNMEASURABLE) console.log(`  - ${entry.line}`);

  if (problems.length) {
    console.error("\nWeb vitals refused:");
    for (const problem of problems) console.error(`  ${problem}`);
    return 1;
  }
  console.log("\nWeb vitals OK — every metric inside its band, no budget newly broken.");
  return 0;
}

// Only when this file is the thing that was run. Its declarations -- the
// budget constants, the cells, the tolerance -- are imported by
// tests/features/web-vitals.test.mjs so the contract can read the values the
// gate actually compares against instead of grepping for their spelling. An
// unguarded top-level call meant that importing the declarations launched a
// browser and measured the whole product, which is how the contract test first
// discovered this line.
const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exitCode = await run();
