#!/usr/bin/env node
// The phone matrix: every registered window, at every supported phone
// geometry, asserted on what a finger can actually reach.
//
// Why this gate exists. The mobile shell was verified once, by hand, in
// portrait, on one screen size. Everything it did not photograph drifted. The
// 2026-09-05 audit found the whole landscape half of the matrix switched off:
// every phone rule keyed on `max-width: 860px`, and an iPhone Air turned
// sideways is 912 CSS px wide, so 76 of 76 windows were laid out as a desktop
// Mac. No gate noticed, because no gate had ever looked sideways.
//
// So this one looks at all three geometries, and holds a ratchet instead of a
// pass/fail line. The baseline names every failing (viewport, window, check)
// triple that exists today. A NEW failure is a refusal. A baseline entry that
// starts passing is ALSO a refusal, until it is deleted — the same honest
// bookkeeping the theme fidelity ledger uses, so an improvement can never hide
// behind a stale exemption.
//
// It asserts geometry and reachability, never how a window is painted. Pixels
// belong to appearance-snapshot; this gate is appearance-agnostic on purpose,
// which is why it runs one appearance and trusts the six-era token tables for
// the rest.
//
// Contract: tests/features/device-matrix.test.mjs

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { webkit } = require("playwright");

// WebKit, not Chromium. The product's phone audience is iOS Safari and every
// home-screen web app on iOS, which are the same engine; a Chromium pass would
// prove the layout for a browser nobody here runs.
const BASELINE_PATH = join(root, "tooling", "device-matrix-baseline.json");

// The two supported phone geometries of the design target (iPhone Air) plus
// the performance floor (iPhone 14 Pro). Portrait and landscape are separate
// designs, not one design measured twice, so both are cells.
// Every Apple device that runs a browser, except the watch. The logical sizes
// are what Safari actually reports, not the panel's pixel count: a 27-inch 5K
// Studio Display is 2560x1440 points, a 32-inch 6K Pro Display XDR is
// 3008x1692, and an iPhone Air is 420x912 upright and 912x420 on its side.
//
// Sweeping all 74 windows costs about two minutes a cell, so the matrix has two
// phases. Every window is opened on the cells whose SHAPE differs -- the phone
// in both orientations, the smallest phone, the tablet in both orientations,
// and the smallest Mac. The larger Macs differ only in how much room there is,
// so they get the desk-level geometry checks instead of another full sweep.
//
// A cell spends most of its two minutes waiting: the probe polls for the window
// to exist, then reads the same window twice 400ms apart, and every one of the
// 74 windows pays a settle and a close. Measured on the reference machine, the
// browser is idle for the large majority of a cell. So cells run a few at a
// time (see `cellLanes`), which shortens the wall clock the release spends on
// this gate without touching what any cell asserts: each cell keeps its own
// context and its own page, and the verdict is still decided cell by cell
// against the same ratchet. `--jobs 1` restores the one-cell-at-a-time run.
export const SWEEP_VIEWPORTS = Object.freeze([
  { name: "iphone-se-portrait", width: 375, height: 667, touch: true },
  { name: "iphone-14pro-portrait", width: 393, height: 852, touch: true },
  { name: "iphone-air-portrait", width: 420, height: 912, touch: true },
  { name: "iphone-air-landscape", width: 912, height: 420, touch: true },
  // iPhone 18 Pro and 18 Pro Max, held sideways: the two edges of the landscape
  // band. 874x402 is the SHORTEST landscape screen of any current phone, 18px
  // less than the Air, so it is where a tall sheet or palette first runs off
  // the bottom. 956x440 is the WIDEST, 44px past the Air, and it had been
  // asserted as a phone by the predicate test without the layout ever being
  // measured there. Apple's own figures: 2622x1206 and 2868x1320 at 460 ppi,
  // which Safari reports at 3x.
  { name: "iphone-18pro-landscape", width: 874, height: 402, touch: true },
  { name: "iphone-18promax-landscape", width: 956, height: 440, touch: true },
  // iPhone Duo. The outer display is what people meet with the device closed:
  // 466x678, wider and shorter than any phone this matrix had, and the first
  // cell where the system puts its own controls down one SIDE. The inner
  // display sideways is 890x626, the geometry that moved the device-class
  // height line from 500px to 660px -- past the 860px width line and taller
  // than the old height line, so it used to lay out as a desktop Mac.
  { name: "iphone-duo-outer-portrait", width: 466, height: 678, touch: true },
  { name: "iphone-duo-inner-landscape", width: 890, height: 626, touch: true },
  { name: "ipad-portrait", width: 820, height: 1180, touch: true },
  { name: "ipad-landscape", width: 1180, height: 820, touch: true },
  // iPad mini (A17 Pro, 8.3-inch, 2266x1488 at 326 ppi, which Safari reports
  // at 2x). Upright it is the WIDEST screen the phone flow runs on -- 744px,
  // under the 860px line -- so an 8.3-inch tablet gets the one-page phone
  // layout, and that had only ever been checked for desk geometry. Sideways it
  // is the SMALLEST touch desk, 1133x744: narrower and 76px shorter than the
  // iPad cell, so it is where a desk window first stops fitting under a finger.
  { name: "ipad-mini-portrait", width: 744, height: 1133, touch: true },
  { name: "ipad-mini-landscape", width: 1133, height: 744, touch: true },
  // A Mac has a mouse. Handing this cell a touch context would make it match
  // the coarse-pointer rules and prove the phone layout twice instead of
  // proving the desk once.
  { name: "mac-13-inch", width: 1280, height: 800, touch: false },
]);

// Checked for desk geometry only: the rails stay one glance apart, the reading
// measure holds, nothing runs off the screen, the page never scrolls sideways.
export const DESK_VIEWPORTS = Object.freeze([
  // The Duo's other two poses. Each is a near neighbour of a cell that is
  // already swept in full -- the outer display sideways of iphone-air-landscape,
  // the inner display upright of ipad-split-half -- so they are measured for
  // desk geometry rather than paying another full sweep.
  { name: "iphone-duo-outer-landscape", width: 678, height: 466, touch: true },
  { name: "iphone-duo-inner-portrait", width: 626, height: 890, touch: true },
  // The same two phones upright sit inside the band the swept portrait cells
  // already bracket (393 to 466 wide), so they take the desk checks only.
  // iPhone 13 mini: the narrowest phone this product still has to fit, in both
  // directions. Its landscape is 812 wide, which the width-keyed rules used to
  // hand the desk layout in a 375px-tall viewport.
  { name: "iphone-13mini-portrait", width: 375, height: 812, touch: true },
  { name: "iphone-13mini-landscape", width: 812, height: 375, touch: true },
  { name: "iphone-18pro-portrait", width: 402, height: 874, touch: true },
  { name: "iphone-18promax-portrait", width: 440, height: 956, touch: true },
  // The iPad mini upright is also swept above. It stays here under its own
  // name because the two lists run different checks: this one owns the
  // reading measure, and 744px is the widest column the phone flow ever sets
  // text in. Cell names key the baseline, so the same geometry cannot share one.
  { name: "ipad-mini-portrait-desk", width: 744, height: 1133, touch: true },
  { name: "ipad-13-landscape", width: 1366, height: 1024, touch: true },
  // iPad Split View, Stage Manager and Slide Over. 795x820 is the one that
  // matters most: it is the only size where a container query saying "side
  // rail" and a width media query saying "stack" are both true, and a lane
  // found the Reader's rail painted on the wrong axis in exactly that band.
  { name: "ipad-split-two-thirds", width: 795, height: 820, touch: true },
  { name: "ipad-split-half", width: 570, height: 820, touch: true },
  { name: "ipad-split-one-third", width: 375, height: 820, touch: true },
  { name: "ipad-stage-manager", width: 640, height: 700, touch: true },
  { name: "ipad-slide-over", width: 375, height: 730, touch: true },
  // Every MacBook, by the LOGICAL size macOS hands a browser at its default
  // scaling -- not the panel's pixel count. The 11-inch Air and the 17-inch Pro
  // are discontinued and kept anyway: they are the narrowest and the widest
  // laptop desks this product has ever had to draw, so they are the two that
  // find a layout that only works in the middle.
  { name: "macbook-11-air", width: 1366, height: 768, touch: false },
  { name: "macbook-12-retina", width: 1280, height: 800, touch: false },
  { name: "macbook-13-air", width: 1470, height: 956, touch: false },
  { name: "macbook-14-pro", width: 1512, height: 982, touch: false },
  { name: "macbook-15-pro", width: 1440, height: 900, touch: false },
  { name: "macbook-16-pro", width: 1728, height: 1117, touch: false },
  { name: "macbook-17-pro", width: 1920, height: 1200, touch: false },
  { name: "mac-24-4k", width: 1920, height: 1080, touch: false },
  { name: "mac-27-5k", width: 2560, height: 1440, touch: false },
  { name: "mac-32-6k", width: 3008, height: 1692, touch: false },
]);


// Windows that are not windows: both route to the Review Desk with a tab
// argument, so `openWindow` never produces an element of their own name.
const ROUTED_WINDOW_NAMES = new Set(["claimCheck", "styleSheet"]);

// Horizontal overflow is a defect everywhere except inside a container that
// declares itself scrollable. A window may only appear here with the selector
// that owns the scroll, so "it scrolls" stays a design decision on the record
// rather than a blanket exemption for the window.
const DECLARED_SCROLLERS = Object.freeze({
  // A tool palette, a thumbnail strip and a template list are horizontal
  // scrollers by design -- the same figure a phone uses everywhere -- and each
  // one below was confirmed by reading `overflow-x: auto` off the running
  // container, not by assuming it from the window's name.
  micropolis: [".micropolis-toolbar"],
  cmfStudio: [".cmf-view-strip"],
  bureaucracyMeme: [".bureaucracy-template-list"],
  openttd: ["canvas"],
  doom: ["canvas"],
  bonsaiCity: ["canvas", ".bonsai-viewport"],
  clioChart: [".clio-chart-scroll"],
  timeMachine: [".time-machine-track"],
});

// The chrome a finger has to hit to run the machine: close, zoom, shade, grow,
// the scroll arrows and thumb, and the menu titles. HIG.md's rule is that the
// System 6 glyph keeps its size and the HIT REGION grows around it, so this
// check reads the hit rect, never the drawn box.
const CHROME_HIT_SELECTORS = Object.freeze([
  ".close-box",
  ".resize-box",
  ".shade-box",
  ".grow-box",
]);
// 40, not 44. 40px is the touch size the product already ships for title-bar
// controls in its default appearance, and it clears WCAG 2.2's 24px minimum
// with room. The gap to Apple's 44pt recommendation cannot be closed by this
// gate's own rule: the title-bar control box is ALSO the box the era art is
// positioned inside (--system-titlebar-control-art-offset-* is computed from
// --system-titlebar-control-size), so growing it re-centres five eras' glyphs
// and moves the appearance baselines. That is a separate, evidence-led change.
const MIN_HIT_SIZE = 40;

// The rails belong to the display's edges: the writing route hugs the left one
// and the launcher the right one (owner decision, 2026-09-14, overturning the
// centred composition that inset both of them from 2026-09-05 to 2026-09-14).
// A rail pulled back toward the middle is that decision returning by accident,
// and this is where it fails. Two points of slack absorb sub-pixel layout; a
// rail pushed further in by a phone's safe area is not this gate's business,
// because the phone flow already stands both rails down.
const RAIL_EDGE_OFFSET = 22;
const RAIL_EDGE_SLACK = 2;

// A column of body text stops here whatever the window does. 560 is the 72ch
// measure at the reading font, with a little room for a wider glyph run.
const MAX_READING_MEASURE = 560;

const CHECKS = Object.freeze([
  "opens",
  "role",
  "on-screen",
  "no-overflow",
  "fields-16px",
  "fields-apart",
  "close-reachable",
  "chrome-hit-44",
]);

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log([
    "Usage: node tooling/verify-device-matrix.mjs [options]",
    "",
    "  --only <a,b>       only these window names",
    "  --viewport <name>  only this viewport cell",
    "  --jobs <n>         how many cells to measure at once (default 4, 1 = one at a time)",
    "  --update-baseline  rewrite the baseline from this run",
    "  --json <path>      also write the raw run to a file",
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
const onlyWindows = optionValue("--only")?.split(",").map((name) => name.trim()).filter(Boolean) || null;
const onlyViewport = optionValue("--viewport");
const updateBaseline = args.includes("--update-baseline");
const jsonPath = optionValue("--json");

// How many cells are measured at once. A cell is mostly waiting -- see the note
// above SWEEP_VIEWPORTS -- so a handful of them in flight costs little and buys
// back most of the wall clock. The cap stays modest because each context is a
// full copy of the app, and because this gate may already share the machine
// with another release gate.
const jobs = Math.max(1, Math.min(
  Number.parseInt(optionValue("--jobs") || "4", 10) || 1,
  Math.max(1, availableParallelism()),
));

// Run `worker` over `items`, `jobs` at a time, and return the results in the
// order the items were declared — the report and the ratchet are read top to
// bottom, so the order they finish in must not reach the output. A worker that
// throws does not cancel its neighbours: every cell that can be measured is
// measured, and the first failure is raised once they are done, so one broken
// cell cannot hide the state of the other eight.
async function inLanes(items, worker) {
  const results = new Array(items.length);
  const failures = [];
  let next = 0;
  const runners = Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        failures.push(error);
      }
    }
  });
  await Promise.all(runners);
  if (failures.length) throw failures[0];
  return results;
}

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
  throw new Error(`Device matrix server did not start.\n${output.trim()}`);
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

// The probe runs in the page because every assertion here is about computed
// geometry, which only the engine knows. It returns findings, never verdicts:
// the ratchet upstairs decides what a finding means.
const PROBE = `async (options) => {
  const { name, scrollers, chromeSelectors, minHit } = options;
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const failed = [];
  const detail = {};
  // Measure one window on an otherwise empty desk. The sweep opens 74 of them
  // in a row, and a window left over from the previous one -- a modal, an
  // accessory, a status line still carrying the last message -- makes the
  // verdict depend on registry order rather than on the window under test.
  for (const other of document.querySelectorAll('.window[data-window]:not(.is-hidden)')) {
    const otherName = other.dataset.window;
    if (otherName && otherName !== name) { try { closeWindow(otherName); } catch { /* it will be reported on its own turn */ } }
  }
  await sleep(150);
  // A studio surface is deliberately unavailable on the desktop profile, and
  // the public deployment starts there. Measuring it means entering the profile
  // that owns it — the same switch a person makes by opening Writing Studio —
  // instead of reporting the product's own rule as a geometry defect. The
  // verdict for any finding is re-measured on a page loaded from scratch, so
  // the sweep continuing in the writing profile afterwards cannot decide a
  // result on its own.
  if (typeof workspaceCapabilityForWindow === "function" && typeof workspaceCapabilityVisible === "function"
      && typeof setWorkspaceProfile === "function") {
    if (!workspaceCapabilityVisible(workspaceCapabilityForWindow(name))) {
      setWorkspaceProfile("writing", { persist: false });
    }
  }
  try { openWindow(name); } catch (error) { detail.openError = String(error).slice(0, 160); }
  // Poll, never sleep a fixed time. A window whose module arrives lazily can
  // take a second to exist, and one that exists can still be mid-layout; a
  // fixed wait turns both into a flaky verdict, and a flaky gate is worse than
  // no gate because it teaches everyone to re-run it.
  const deadline = Date.now() + options.settleMs;
  let hiddenSince = null;
  let win = null;
  while (Date.now() < deadline) {
    win = document.querySelector('.window[data-window="' + name + '"]');
    if (win) {
      const box = win.getBoundingClientRect();
      // A window that is on screen is settled. A HIDDEN one is not: the
      // capability handoff hides a window for a moment before it lays it out,
      // and treating that moment as settled records "the window does not open"
      // for whichever window was unlucky. Measured 2026-09-15: two full runs in
      // a row refused the duo-outer cell for a different window each time
      // (docMap, then chooser), and each of those windows opens by itself in a
      // cell of its own. So hidden is waited out -- but only briefly. Two
      // seconds of hidden is a verdict, not a handoff, and it keeps the cost of
      // a window that really never opens at seconds rather than the deadline.
      if (!win.classList.contains("is-hidden") && box.width > 0 && box.height > 0) break;
      if (win.classList.contains("is-hidden")) {
        if (hiddenSince === null) hiddenSince = Date.now();
        else if (Date.now() - hiddenSince > 2000) break;
      } else {
        hiddenSince = null;
      }
    }
    await sleep(60);
  }
  await sleep(120);
  win = document.querySelector('.window[data-window="' + name + '"]');
  if (!win) return { failed: ["opens"], detail: { ...detail, reason: "no element" } };

  // Measure the window twice, a moment apart, and report only what BOTH passes
  // see. The question this gate asks is whether a window is usable, not whether
  // anything ever flashed wider than the screen: the shared status line moves
  // into whichever window is in front and carries the previous surface's
  // message with it, so a single pass turns that into a finding that depends on
  // registry order. A defect that is real is still there 400ms later.
  const measure = () => {
  const failedNow = [];
  const detailNow = {};
  const style = getComputedStyle(win);
  const hidden = win.classList.contains("is-hidden") || style.display === "none" || style.visibility === "hidden";
  if (hidden) failedNow.push("opens");

  // Three of the checks below are about a finger. A Mac has a mouse: it has no
  // mobile role, its fields do not make iOS zoom, and its 16px grow box is a
  // precise target rather than a small one. Running them there would prove the
  // phone layout twice and say nothing about the desk.
  const roles = ["app-page", "finder-page", "dialog", "system-page", "accessory"]
    .filter((role) => win.classList.contains("is-mobile-" + role));
  detailNow.roles = roles;
  if (options.phoneFlow && roles.length !== 1) failedNow.push("role");

  // Painted, not merely laid out. A closed <details> keeps a layout box for its
  // absolutely positioned popover in WebKit, so a naive display/visibility test
  // reported every command menu as 88px of overflow that a screenshot proves is
  // not on screen. checkVisibility answers the question actually being asked.
  const painted = (element) => {
    if (typeof element.checkVisibility === "function") {
      if (!element.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return false;
    } else {
      const elementStyle = getComputedStyle(element);
      if (elementStyle.display === "none" || elementStyle.visibility === "hidden" || elementStyle.opacity === "0") return false;
    }
    return !element.closest("details:not([open])");
  };
  const viewportWidth = innerWidth;
  const viewportHeight = innerHeight;
  const rect = win.getBoundingClientRect();
  detailNow.rect = [rect.left, rect.top, rect.width, rect.height].map(Math.round);
  if (!hidden && (rect.left < -1 || rect.top < -1 || rect.right > viewportWidth + 1 || rect.bottom > viewportHeight + 1)) {
    failedNow.push("on-screen");
  }

  if (document.documentElement.scrollWidth > viewportWidth + 1) {
    detailNow.scrollWidth = document.documentElement.scrollWidth;
    failedNow.push("no-overflow");
  } else if (!hidden) {
    // A child may cross the right edge only inside a declared scroller.
    const allowed = (element) => scrollers.some((selector) => element.closest(selector));
    const spilling = [];
    const nodes = [];
    for (const element of win.querySelectorAll("*")) {
      if (!painted(element)) continue;
      const box = element.getBoundingClientRect();
      if (box.width <= 4 || box.right <= viewportWidth + 1) continue;
      if (allowed(element)) continue;
      spilling.push(Math.round(box.right));
      if (nodes.length < 3) {
        nodes.push(element.tagName + "#" + (element.id || "-") + "." + String(element.className || "").slice(0, 40)
          + " x=" + Math.round(box.left) + " w=" + Math.round(box.width));
      }
    }
    if (spilling.length) {
      detailNow.spillRight = Math.max(...spilling);
      detailNow.spillCount = spilling.length;
      detailNow.spillNodes = nodes;
      failedNow.push("no-overflow");
    }
  }

  // A command panel is measured closed everywhere above, because a closed
  // <details> keeps a layout box WebKit reports as overflow. But the question
  // a writer asks is what happens when they open it, and twice now the answer
  // was "a panel anchored off the screen edge": the writing route's Cmds menu
  // ran 98px past the right of a 375px phone, and Quick Draft's deliver menu
  // 65px past the left. Open each one, measure, close it again.
  const menuSpills = [];
  if (!hidden) {
    for (const menu of win.querySelectorAll("details.teachtext-command-menu[open]")) {
      for (const panel of menu.querySelectorAll(".teachtext-command-popover, .teachtext-command-subpopover")) {
        const box = panel.getBoundingClientRect();
        if (box.width <= 4 || box.height <= 4) continue;
        const offLeft = Math.max(0, Math.round(-box.left));
        const offRight = Math.max(0, Math.round(box.right - viewportWidth));
        const offBottom = Math.max(0, Math.round(box.bottom - viewportHeight));
        const offTop = Math.max(0, Math.round(-box.top));
        if (offLeft || offRight || offBottom || offTop) {
          menuSpills.push((menu.className || "menu")
            + " x:" + Math.round(box.left) + "-" + Math.round(box.right)
            + " y:" + Math.round(box.top) + "-" + Math.round(box.bottom));
        }
      }
    }
  }
  if (menuSpills.length) {
    detailNow.menuSpills = menuSpills.slice(0, 3);
    failedNow.push("menu-on-screen");
  }

  // Two writing surfaces in one grid cell is not a near miss, it is a field
  // nobody can reach: Quick Draft's "What I want to say" was drawn underneath
  // Materials in landscape on a phone, 56px of overlap, because the intake
  // row's floor was 0 while the textarea's minimum is 72px. A row that cannot
  // shrink far enough to hide a field is the fix; this is the net under it.
  // Only the typing surfaces are compared, and only a substantial overlap
  // counts, so a custom select sitting over its own native control -- which is
  // how the System 6 select harness is built -- is not reported.
  const typingSurfaces = [...win.querySelectorAll("textarea, input[type=text], input:not([type])")]
    .filter((field) => painted(field) && !field.closest(".select-wrap"))
    .map((field) => ({ field, box: field.getBoundingClientRect() }))
    .filter((entry) => entry.box.width > 8 && entry.box.height > 8);
  const overlappingFields = [];
  for (let i = 0; i < typingSurfaces.length; i += 1) {
    for (let j = i + 1; j < typingSurfaces.length; j += 1) {
      const a = typingSurfaces[i].box;
      const b = typingSurfaces[j].box;
      const wide = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const tall = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (wide <= 0 || tall <= 0) continue;
      const smaller = Math.min(a.width * a.height, b.width * b.height);
      if (!smaller || (wide * tall) / smaller < 0.25) continue;
      overlappingFields.push((typingSurfaces[i].field.id || "field") + " over " + (typingSurfaces[j].field.id || "field")
        + " " + Math.round(wide) + "x" + Math.round(tall));
    }
  }
  if (overlappingFields.length) {
    detailNow.overlappingFields = overlappingFields.slice(0, 3);
    failedNow.push("fields-apart");
  }

  const smallFields = [];
  for (const field of options.touch ? win.querySelectorAll("input, textarea, select") : []) {
    if (field.type === "checkbox" || field.type === "radio" || field.type === "hidden") continue;
    if (!painted(field)) continue;
    const size = parseFloat(getComputedStyle(field).fontSize);
    if (size < 16) smallFields.push(Math.round(size * 10) / 10);
  }
  if (smallFields.length) {
    detailNow.smallFields = smallFields.length;
    detailNow.smallestField = Math.min(...smallFields);
    failedNow.push("fields-16px");
  }

  const closeBox = win.querySelector(".close-box");
  if (!hidden) {
    if (!closeBox) {
      detailNow.closeBox = "missing";
      failedNow.push("close-reachable");
    } else {
      const box = closeBox.getBoundingClientRect();
      const reachable = box.width > 0 && box.height > 0
        && box.left >= -1 && box.top >= -1
        && box.right <= viewportWidth + 1 && box.bottom <= viewportHeight + 1;
      if (!reachable) failedNow.push("close-reachable");
    }
  }

  if (!hidden && options.touch) {
    const undersized = [];
    for (const selector of chromeSelectors) {
      // The window's OWN chrome only. A page may legitimately contain mock
      // windows -- the Theme Lab renders sample windows inside its body -- and
      // those samples are drawings of chrome, not chrome a finger has to hit.
      // Measured 2026-09-23: a deep query flagged two sample close boxes that
      // sit below the fold, so the gate asked elementFromPoint for a point
      // outside the viewport and refused a tap nobody was ever offered.
      const scoped = ":scope > .title-bar > " + selector + ", :scope > " + selector;
      for (const control of win.querySelectorAll(scoped)) {
        if (!painted(control)) continue;
        // The hit region is the element's own box, plus any absolutely
        // positioned pseudo-element that extends BEYOND it with negative
        // insets -- an owned invisible expander. A pseudo that merely draws
        // the glyph inside the box is not a hit region, and reading its size
        // as one is how an earlier version of this probe reported every close
        // box as 11x11 when the shipped box is 40x40.
        const box = control.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        let hitWidth = box.width;
        let hitHeight = box.height;
        // The insets of the expander actually being credited, so the hit test
        // below asks about the region this loop is claiming rather than the
        // element's own box.
        let region = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        for (const pseudo of ["::before", "::after"]) {
          const pseudoStyle = getComputedStyle(control, pseudo);
          if (!pseudoStyle || pseudoStyle.content === "none" || pseudoStyle.position !== "absolute") continue;
          const outward = (value) => {
            const parsed = parseFloat(value);
            return Number.isFinite(parsed) && parsed < 0 ? -parsed : 0;
          };
          const width = box.width + outward(pseudoStyle.left) + outward(pseudoStyle.right);
          const height = box.height + outward(pseudoStyle.top) + outward(pseudoStyle.bottom);
          if (width >= hitWidth && height >= hitHeight) {
            region = {
              left: box.left - outward(pseudoStyle.left),
              top: box.top - outward(pseudoStyle.top),
              right: box.right + outward(pseudoStyle.right),
              bottom: box.bottom + outward(pseudoStyle.bottom),
            };
          }
          hitWidth = Math.max(hitWidth, width);
          hitHeight = Math.max(hitHeight, height);
        }
        if (hitWidth < minHit - 0.5 || hitHeight < minHit - 0.5) {
          undersized.push(selector + ":" + Math.round(hitWidth) + "x" + Math.round(hitHeight));
          continue;
        }
        // A region that adds up is not the same as a region that answers a
        // tap. Measured 2026-09-22: an alarm-clock close box with a transparent
        // expander satisfied the sum above while three of its four edges
        // belonged to other things -- a sibling painted over the right, the
        // readout over the bottom, and the title bar clipped the top. The gate
        // would have gone green over a region nobody can touch, so the region
        // is asked to answer for itself: its centre always, and each edge a
        // pixel inside when an expander is what earned the size.
        const expanded = region.left < box.left - 0.5 || region.right > box.right + 0.5
          || region.top < box.top - 0.5 || region.bottom > box.bottom + 0.5;
        const samples = [[(box.left + box.right) / 2, (box.top + box.bottom) / 2]];
        if (expanded) {
          samples.push(
            [region.left + 1, (region.top + region.bottom) / 2],
            [region.right - 1, (region.top + region.bottom) / 2],
            [(region.left + region.right) / 2, region.top + 1],
            [(region.left + region.right) / 2, region.bottom - 1],
          );
        }
        const owner = (x, y) => {
          if (x < 0 || y < 0 || x > viewportWidth || y > viewportHeight) return null;
          return document.elementFromPoint(x, y);
        };
        const dead = samples.filter(([x, y]) => {
          const hit = owner(x, y);
          return !(hit && (hit === control || control.contains(hit) || hit.contains(control)));
        });
        if (dead.length) {
          undersized.push(
            selector + ":" + Math.round(hitWidth) + "x" + Math.round(hitHeight)
            + " region-refuses-tap(" + dead.length + "/" + samples.length + ")",
          );
        }
      }
    }
    if (undersized.length) {
      detailNow.undersizedChrome = undersized.slice(0, 4);
      failedNow.push("chrome-hit-44");
    }
  }
  return { failed: failedNow, detail: detailNow };
  };

  // The command menus are opened here, not inside measure(): the desk nudges an
  // opened panel back inside the window on the element's own toggle event, and
  // that event does not run while a synchronous measurement is in progress. A
  // person opens a menu and then looks at it; so does this.
  const openedMenus = [];
  for (const menu of win.querySelectorAll("details.teachtext-command-menu")) {
    if (menu.open) continue;
    menu.open = true;
    openedMenus.push(menu);
  }
  if (openedMenus.length) await sleep(120);
  const first = measure();
  await sleep(400);
  const second = measure();
  openedMenus.forEach((menu) => { menu.open = false; });
  const stable = first.failed.filter((check) => second.failed.includes(check));
  return { failed: stable, detail: { ...detail, ...second.detail } };
}`;

function loadBaseline() {
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : { failures: {} };
  } catch {
    return { failures: {} };
  }
}

// One cell of the sweep: every registered window, opened once, measured on its
// own context. It returns everything it saw instead of writing into shared
// state, because a cell no longer runs alone — see `inLanes`.
async function sweepCell({ server, browser, viewport, baseline }) {
  const startedAt = Date.now();
  const observed = {};
  const raw = {};
  const pageErrors = [];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.touch ? 3 : 2,
    isMobile: viewport.touch,
    hasTouch: viewport.touch,
    userAgent: viewport.touch
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  });
  try {
    const page = await context.newPage();
    let tearingDown = false;
    // A page torn down mid-navigation rejects whatever it was still loading.
    // That is this gate reloading, not the product failing, so errors raised
    // while a confirmation reload is in flight are not findings.
    page.on("pageerror", (error) => {
      if (tearingDown) return;
      pageErrors.push(String(error).replace(/\s+/g, " ").slice(0, 140));
    });
    await page.goto(server.url);
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 120_000 });
    await page.waitForTimeout(1200);

    const names = (await page.evaluate(() => Object.keys(windowRegistry)))
      .filter((name) => !ROUTED_WINDOW_NAMES.has(name))
      .filter((name) => !onlyWindows || onlyWindows.includes(name));

    for (const name of names) {
      const probeArgs = {
        name,
          // How long the probe may wait for the window to exist and have a box.
          // It is a deadline, not a wait: the poll leaves the moment the window
          // is laid out. It was 6s, and on a machine carrying other browsers a
          // cell reported `findChange opens 0x0` — a window that had not mounted
          // yet, recorded as a window that does not mount. 15s costs nothing
          // when the app is the only thing running, and it stops the gate from
          // turning this machine's load into a finding about the product.
          settleMs: 15_000,
        touch: viewport.touch !== false,
        // The phone FLOW is narrower than the touch class. The product's own
        // rule is width <= 860, or a coarse pointer on a screen <= 500 tall.
        // An iPad in landscape is 1180x820: touch, but a regular-width screen
        // that correctly takes the desk with floating windows. Asking it for
        // a phone role would be asking it to be a phone.
        phoneFlow: viewport.touch !== false
          && (viewport.width <= 860 || viewport.height <= 500),
        scrollers: DECLARED_SCROLLERS[name] || [],
        chromeSelectors: CHROME_HIT_SELECTORS,
        minHit: MIN_HIT_SIZE,
      };
      let result = await page.evaluate(`(${PROBE})(${JSON.stringify(probeArgs)})`);
      // A sweep of 74 windows in one page accumulates state: a lazy module
      // still arriving, a receipt from the previous surface, a restore that
      // has not settled. So a finding is never reported from the sweep. It is
      // re-measured on a page loaded from scratch, with that window as the
      // only thing ever opened, and THAT verdict is the one that counts.
      // Findings are rare, so this costs a reload only when something is
      // wrong -- and it is the difference between a gate people trust and a
      // gate people re-run until it goes green.
      const expected = new Set(baseline.failures?.[viewport.name]?.[name] || []);
      const unexpected = result.failed.filter((check) => !expected.has(check));
      if (unexpected.length) {
        // The reload is a second opinion, not a precondition. A machine busy
        // with thirteen cells can miss the boot deadline, and a gate that
        // throws there reports nothing at all about the other 73 windows.
        // Only a finding the baseline does not already carry is worth the
        // reload: a known one costs two minutes to confirm what is written
        // down, and that cost is what made the gate too slow to run.
        try {
          tearingDown = true;
          await page.goto(server.url);
          await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 120_000 });
          await page.waitForTimeout(1200);
          tearingDown = false;
          result = await page.evaluate(`(${PROBE})(${JSON.stringify(probeArgs)})`);
          result.confirmedOnCleanPage = true;
        } catch (error) {
          tearingDown = false;
          result.confirmedOnCleanPage = false;
          result.confirmError = String(error).slice(0, 120);
        }
      }
      if (result.failed.length) observed[name] = result.failed.sort();
      raw[name] = result;
      await page.evaluate((windowName) => {
        try { closeWindow(windowName); } catch { /* a window that refuses to close is its own finding */ }
        document.querySelectorAll(".system-modal button").forEach((button) => {
          if (/^(OK|好|取消|Cancel)$/.test(button.textContent.trim())) button.click();
        });
      }, name);
      await page.waitForTimeout(120);
    }
  } finally {
    await context.close();
  }
  // A cell is minutes long, and a release log that says nothing for six of
  // them reads as a hang. One line per cell is the whole progress report.
  console.log(`[device-matrix] ${viewport.name} measured in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  return { viewport: viewport.name, observed, raw, pageErrors };
}

async function run() {
  const baseline = loadBaseline();
  const server = await startAppServer();
  const observed = {};
  const pageErrors = [];
  const raw = {};
  const cells = SWEEP_VIEWPORTS.filter((viewport) => !onlyViewport || viewport.name === onlyViewport);
  const deskNamed = DESK_VIEWPORTS.some((viewport) => viewport.name === onlyViewport);
  if (!cells.length && !deskNamed) throw new Error(`Unknown viewport: ${onlyViewport}`);

  if (cells.length) {
    const browser = await webkit.launch();
    let swept;
    try {
      if (cells.length > 1) {
        console.log(`[device-matrix] ${cells.length} cells, ${Math.min(jobs, cells.length)} measured at a time.`);
      }
      swept = await inLanes(cells, (viewport) => sweepCell({ server, browser, viewport, baseline }));
    } finally {
      // The server stays up: the desk-geometry phase below opens its own browser
      // against the same server, and stopping it here is what made every desk
      // cell time out waiting for a page that could no longer load.
      await browser.close();
    }
    for (const cell of swept) {
      observed[cell.viewport] = cell.observed;
      raw[cell.viewport] = cell.raw;
      pageErrors.push(...cell.pageErrors);
    }
  }

  // ---- Desk geometry on the larger displays ------------------------------
  //
  // These cells do not need every window opened: what changes with a bigger
  // display is how much room the desk has, so the checks are about the desk.
  // The composition keeps the writing spine and the launcher one glance apart
  // (a 13-inch has them 1038 apart and that reads as one desk; 2318, which is
  // what a 27-inch measured before the composition existed, does not), the
  // reading measure holds whatever the window does, and nothing runs off.
  const deskCells = onlyViewport
    ? DESK_VIEWPORTS.filter((viewport) => viewport.name === onlyViewport)
    : DESK_VIEWPORTS;
  const deskObserved = {};
  if (!onlyWindows) {
    const deskBrowser = await webkit.launch();
    try {
      const results = await inLanes(deskCells, async (viewport) => {
        const context = await deskBrowser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 2,
          isMobile: viewport.touch,
          hasTouch: viewport.touch,
        });
        try {
          const page = await context.newPage();
          await page.goto(server.url);
          await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 60_000 });
          await page.waitForTimeout(1100);
          const result = await page.evaluate(`(async () => {
          try { openWindow("reader"); } catch {}
          await new Promise((done) => setTimeout(done, 1000));
          const win = document.querySelector('.window[data-window="reader"]');
          const rail = document.querySelector(".icon-column");
          const failed = [];
          const detail = {};
          // The window is measured where the product puts it: the deployment
          // starts on the desktop profile, and that is the reader a person
          // sees first. Its placement is judged there, before the profile
          // switch below moves the desk under it.
          const railBox = rail ? rail.getBoundingClientRect() : null;
          if (win && railBox) {
            const box = win.getBoundingClientRect();
            detail.window = [box.left, box.top, box.width, box.height].map(Math.round);
            if (box.right > innerWidth + 1 || box.left < -1 || box.bottom > innerHeight + 1) failed.push("on-screen");
            if (box.right > railBox.left + 1) failed.push("clear-of-the-launcher");
          }
          // The two rails are a pair only in the profile that owns the spine.
          // The public deployment starts on the desktop profile, where it is
          // deliberately absent; measuring a hidden element made the whole
          // width of a 6K display read as the gap between them. Stand in the
          // writing profile for this one number -- the switch the window sweep
          // already makes -- and only when both rails are actually on screen.
          const spineBefore = document.querySelector(".writing-spine-panel");
          const spineVisible = spineBefore && spineBefore.getBoundingClientRect().width > 0;
          if (!spineVisible && typeof setWorkspaceProfile === "function"
              && document.body.dataset.workspaceProfile !== "writing") {
            setWorkspaceProfile("writing", { persist: false });
            await new Promise((done) => setTimeout(done, 900));
          }
          const spine = document.querySelector(".writing-spine-panel");
          // In the phone flow both rails are folded to zero width behind the
          // foreground app, so their separation is not a number about the desk.
          const phoneFlow = innerWidth <= 860 || (matchMedia("(hover: none) and (pointer: coarse)").matches && innerHeight <= 500);
          if (spine && rail && !phoneFlow && spine.getBoundingClientRect().width > 0) {
            const spineBox = spine.getBoundingClientRect();
            const railBox = rail.getBoundingClientRect();
            detail.railsApart = Math.round(railBox.left - spineBox.right);
            detail.railEdges = { left: Math.round(spineBox.left), right: Math.round(innerWidth - railBox.right) };
            if (detail.railEdges.left > ${RAIL_EDGE_OFFSET + RAIL_EDGE_SLACK}
                || detail.railEdges.right > ${RAIL_EDGE_OFFSET + RAIL_EDGE_SLACK}) failed.push("rails-at-the-edges");
          }
          if (phoneFlow && win) {
            const box = win.getBoundingClientRect();
            if (Math.round(box.width) !== innerWidth) failed.push("phone-shell-fills-width");
          }
          if (win) {
            // Its own placement was judged above, before the profile switch.
            // What is left here is the reading measure, which is a property of
            // the column and not of which desk the window is sitting on.
            const column = win.querySelector(".reader-content");
            if (column) {
              const widest = Math.max(0, ...[...column.querySelectorAll("p, li, div, h1, h2")].map((el) => el.getBoundingClientRect().width));
              detail.readingMeasure = Math.round(widest);
              if (widest > ${MAX_READING_MEASURE}) failed.push("reading-measure");
            }
          }
          if (document.documentElement.scrollWidth > innerWidth + 1) failed.push("no-overflow");
          return { failed, detail };
        })()`);
          return { viewport: viewport.name, result };
        } finally {
          await context.close();
        }
      });
      for (const { viewport, result } of results) {
        if (result.failed.length) deskObserved[viewport] = result.failed.sort();
        raw[viewport] = result;
      }
    } finally {
      await deskBrowser.close();
    }
  }
  await stopProcess(server.child);

  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(raw, null, 1)}\n`);

  if (updateBaseline) {
    const next = {
      note: "Every (viewport, window, check) that fails today. New failures are refused; an entry that starts passing is also refused until it is deleted, so an improvement cannot hide behind a stale exemption. Regenerate with --update-baseline only when the change is a deliberate, explained shrink.",
      checks: [...CHECKS],
      viewports: {
        swept: SWEEP_VIEWPORTS.map((viewport) => `${viewport.name} ${viewport.width}x${viewport.height}`),
        deskOnly: DESK_VIEWPORTS.map((viewport) => `${viewport.name} ${viewport.width}x${viewport.height}`),
      },
      failures: { ...observed, ...Object.fromEntries(Object.entries(deskObserved).map(([name, checks]) => [name, { desk: checks }])) },
      pageErrors: [...new Set(pageErrors)].sort(),
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    const count = Object.values(observed).reduce((total, cell) => total + Object.keys(cell).length, 0);
    console.log(`Device matrix baseline written: ${count} window cells with findings.`);
    return 0;
  }

  for (const [name, checks] of Object.entries(deskObserved)) observed[name] = { desk: checks };

  const problems = [];
  const ratchetCells = [...cells, ...(onlyWindows ? [] : deskCells)];
  for (const viewport of ratchetCells) {
    const seen = observed[viewport.name] || {};
    const expected = baseline.failures?.[viewport.name] || {};
    const names = new Set([...Object.keys(seen), ...Object.keys(expected)]);
    for (const name of names) {
      if (onlyWindows && !onlyWindows.includes(name)) continue;
      const now = new Set(seen[name] || []);
      const before = new Set(expected[name] || []);
      for (const check of now) {
        if (!before.has(check)) {
          const detail = raw[viewport.name]?.[name]?.detail || {};
          problems.push(`NEW  ${viewport.name} ${name} ${check} ${JSON.stringify(detail)}`);
        }
      }
      for (const check of before) {
        if (!now.has(check)) problems.push(`FIXED (delete from baseline) ${viewport.name} ${name} ${check}`);
      }
    }
  }
  // A page error is a finding like any other, so it ratchets like any other.
  // Recording one keeps it visible with its reason instead of turning the gate
  // into something people re-run until it passes.
  const baselinedErrors = new Set(baseline.pageErrors || []);
  for (const error of pageErrors) {
    if (!baselinedErrors.has(error)) problems.push(`NEW PAGE ERROR ${error}`);
  }
  // A baselined error can only be declared fixed by a run that could have
  // raised it. A scoped run opens a handful of windows, so it exercises almost
  // none of the error paths; reporting "delete this" from there would train
  // everyone to delete entries that are still true.
  const fullRun = !onlyWindows && !onlyViewport;
  if (fullRun) {
    for (const error of baselinedErrors) {
      if (!pageErrors.includes(error)) problems.push(`FIXED (delete from baseline pageErrors) ${error}`);
    }
  }

  const remaining = Object.values(observed).reduce(
    (total, cell) => total + Object.values(cell).reduce((sum, list) => sum + list.length, 0),
    0,
  );
  if (problems.length) {
    console.error("Device matrix refused:");
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`\n${remaining} findings observed across ${cells.length} viewport(s).`);
    return 1;
  }
  console.log(`Device matrix OK — ${remaining} baselined findings across ${cells.length} viewport(s), none new.`);
  return 0;
}

process.exitCode = await run();
