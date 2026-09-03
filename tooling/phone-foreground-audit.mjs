#!/usr/bin/env node
// Phone / tablet foreground audit.
//
// A phone shows one app at a time. The rule this tool measures is one line:
// THE SURFACE THE USER ASKED FOR IS THE SURFACE THAT STAYS. A window that
// another window opens as a side effect of preparing state must not take the
// single foreground away from the window the user actually opened.
//
// The failure is invisible to every static gate, because nothing is wrong with
// the markup: the wrong window simply wins a race about a second after the
// right one arrived. So the audit drives the real app, opens each window the
// way the window manager opens it, waits 2.5 s for all the deferred work to
// finish, and then asks the page which window holds the screen.
//
// Two walks, because the class has two halves:
//
//   (default)     open every window in the registry, one per fresh boot
//   --scenarios   drive five route commands that open a second window
//   --all         both
//
// Usage:
//   node tooling/phone-foreground-audit.mjs [--only <window,window>]
//                                           [--scenarios | --all]
//                                           [--jobs <n>] [--out <file>]
//
// Exit code 1 when any cell fails, so the tool can gate a change.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Three shapes, because the shell answers each one with a different model:
// phone portrait and tablet portrait both run the single-foreground document
// flow, while phone landscape keeps floating windows for everything except the
// four immersive games. A defect that only shows in one of them is still a
// defect for the writer who holds the phone that way.
const VIEWPORTS = [
  { id: "phone-portrait", width: 375, height: 812, touch: true },
  { id: "phone-landscape", width: 812, height: 375, touch: true },
  { id: "tablet-portrait", width: 768, height: 1024, touch: true },
];

// Skipped windows, each with the reason it genuinely cannot be measured here.
const SKIP = {
  micropolis: "game: vendored wasm engine, minutes to load, immersive model",
  openttd: "game: vendored wasm engine, minutes to load, immersive model",
  doom: "game: engine not built in this tree",
  bonsaiCity: "game: vendored wasm engine, immersive model",
  styleSheet: "alias: openWindow redirects it to reviewDesk('style')",
  claimCheck: "alias: openWindow redirects it to reviewDesk('facts')",
};

function parseArgs(argv) {
  const args = { only: null, out: null, scenarios: false, windows: true, jobs: 1 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--only") args.only = String(argv[index + 1] || "").split(",").filter(Boolean);
    if (argv[index] === "--out") args.out = argv[index + 1];
    if (argv[index] === "--jobs") args.jobs = Math.max(1, Number(argv[index + 1]) || 1);
    if (argv[index] === "--scenarios") { args.scenarios = true; args.windows = false; }
    if (argv[index] === "--all") { args.scenarios = true; args.windows = true; }
  }
  return args;
}

// Seed one project with a Question Sheet, an outline of two records, and a
// body in each Section Draft. The route scenarios below need a desk that has
// somewhere to advance TO; a bare boot has no project and every route command
// stops at the Project Hard Disk instead of exercising the foreground model.
// The outline is typed into the Outline window, not written onto the record.
// savePipelineData() reads the surfaces back into the project on every route
// command, so a project seeded only in memory arrives at the first command
// with an empty outline and the command stops before it ever reaches the
// foreground question this tool is asking.
const SEED_PROJECT = async () => {
  if (typeof ensureWritingFlowModule === "function") await ensureWritingFlowModule();
  const project = createProjectRecord("Foreground Audit");
  project.questionSheet = "Recipient: a friend who was there. Question: what actually changed?";
  await window.AISystem6StateStores?.projects?.commit?.((draft) => { draft.projects.unshift(project); });
  mountProject(project);
  await openWindow("outline");
  outlineContentEl.value = "## First record\n\nwhat happened\n\n## Second record\n\nwhat it cost\n";
  outlineContentEl.dispatchEvent(new Event("input", { bubbles: true }));
  if (typeof savePipelineData === "function") savePipelineData();
  const refs = typeof syncDraftsFromProjectOutline === "function"
    ? syncDraftsFromProjectOutline(project)
    : [];
  (project.drafts || []).forEach((draft, index) => {
    draft.body = `A drafted paragraph for record ${index + 1}.`;
  });
  return { id: project.id, outlineRecords: refs.length, drafts: (project.drafts || []).length };
};

// Each scenario is one sentence of product behaviour, written as the two things
// that can be checked from outside: what the user did, and which surface must
// be looking back at them afterwards.
const SCENARIOS = [
  {
    id: "open-question-sheet",
    direction: "side-effect must not win",
    expect: "questionSheet",
    // Regression guard for the instance already fixed on main: the Question
    // Sheet prepares the manuscript tab, and the manuscript must stay behind.
    run: async () => { await openWindow("questionSheet"); },
  },
  {
    id: "outline-to-section-drafts",
    direction: "side-effect must not win",
    expect: "sectionDrafts",
    // Advancing into drafting opens the manuscript as a read-only companion.
    run: async () => {
      await openWindow("outline");
      await advanceOutlineToSectionDrafts();
    },
  },
  {
    id: "drafts-to-manuscript",
    direction: "deliberate advance must win",
    expect: "teachText",
    // The route stop IS the manuscript here, so the manuscript must take it.
    run: async () => {
      await openWindow("sectionDrafts");
      await advanceDraftsToManuscript();
    },
  },
  {
    id: "go-to-manuscript",
    direction: "deliberate advance must win",
    expect: "teachText",
    // Writing > Go To > Manuscript (Command-4) from inside Section Drafts.
    run: async () => {
      await openWindow("sectionDrafts");
      openTeachTextManuscriptWindow();
    },
  },
  {
    id: "manuscript-to-review-desk",
    direction: "side-effect must not win",
    expect: "reviewDesk",
    // Review Desk opens the finalized manuscript beside it as a companion.
    run: async () => {
      await openWindow("teachText");
      await openReviewDesk("style");
    },
  },
];

// Read the same registry the app declares, so a new window joins the audit by
// existing rather than by somebody remembering to add it to a list here.
async function registryWindowNames() {
  const harness = await import("../tests/helpers/feature-test-harness.mjs");
  return Object.keys(harness.windowRegistryRecords());
}

// One reading of the screen. `fullScreen` is the window the mobile shell chose
// to fill the work area; `topmost` is the highest-z visible window, which is
// the right question for an overlay (a Desk Accessory correctly floats above
// the app page instead of replacing it).
const PROBE = () => {
  const seen = [];
  document.querySelectorAll(".window[data-window]").forEach((win) => {
    if (win.classList.contains("is-hidden") || win.classList.contains("is-app-hidden")) return;
    const box = win.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const role = ["app-page", "finder-page", "dialog", "system-page", "accessory"]
      .find((kind) => win.classList.contains(`is-mobile-${kind}`)) || "";
    seen.push({
      name: win.dataset.window,
      z: Number(getComputedStyle(win).zIndex) || 0,
      role,
      workArea: win.classList.contains("is-mobile-work-area"),
      fullScreen: win.classList.contains("is-mobile-fullscreen"),
      width: Math.round(box.width),
      height: Math.round(box.height),
    });
  });
  seen.sort((a, b) => b.z - a.z);
  return {
    visible: seen,
    fullScreen: seen.find((entry) => entry.fullScreen)?.name || null,
    topmost: seen[0]?.name || null,
    foregroundBody: document.body.classList.contains("mobile-app-foreground"),
  };
};

async function bootPage(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    hasTouch: viewport.touch,
    isMobile: viewport.touch,
  });
  // A local model server that happens to be running would change the timing of
  // the very races this tool measures. Every run sees the same offline answer.
  await context.route(/https?:\/\/(?:127\.0\.0\.1|localhost):(?:1234|11434)\//, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: [] }) });
  });
  const page = await context.newPage();
  return { context, page };
}

async function measure(browser, url, viewport, name) {
  const { context, page } = await bootPage(browser, viewport);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 25000 });
    await page.evaluate(async () => {
      if (typeof activateWorkspaceProfile === "function") {
        await activateWorkspaceProfile("writing", { persist: false, announce: false });
      }
    });
    await page.waitForTimeout(400);
    const before = await page.evaluate(PROBE);
    const opened = await page.evaluate(async (target) => {
      if (typeof openWindow !== "function") return "no-openWindow";
      await openWindow(target);
      return "ok";
    }, name);
    // 2.5 s is not a settling delay, it is the length of the window in which
    // the defect happens: the wrong surface arrives about a second late, after
    // a lazy module load and the placement tail have both finished.
    await page.waitForTimeout(2500);
    const after = await page.evaluate(PROBE);
    return { name, viewport: viewport.id, opened, before, after, errors };
  } catch (error) {
    return { name, viewport: viewport.id, opened: "error", error: String(error?.message || error), errors };
  } finally {
    await context.close();
  }
}

// A window that CAN fill the work area must be the one that fills it. An
// overlay — a dialog, a system page, a Desk Accessory — correctly floats above
// the app page instead of replacing it, so for those the question is whether it
// is on top. Either way the answer must name the window the user opened.
function canFillWorkArea(entry) {
  if (entry.role === "app-page" || entry.role === "finder-page") return true;
  // Landscape carries no portrait role classes; the work-area class is the
  // same decision written by the same function.
  return !entry.role && entry.workArea;
}

async function measureScenario(browser, url, viewport, scenario) {
  const { context, page } = await bootPage(browser, viewport);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 25000 });
    await page.evaluate(async () => {
      if (typeof activateWorkspaceProfile === "function") {
        await activateWorkspaceProfile("writing", { persist: false, announce: false });
      }
    });
    const seeded = await page.evaluate(SEED_PROJECT);
    await page.waitForTimeout(400);
    const before = await page.evaluate(PROBE);
    await page.evaluate(scenario.run);
    await page.waitForTimeout(2500);
    const after = await page.evaluate(PROBE);
    return { name: scenario.id, viewport: viewport.id, opened: "ok", seeded, expect: scenario.expect, direction: scenario.direction, before, after, errors };
  } catch (error) {
    return { name: scenario.id, viewport: viewport.id, opened: "error", expect: scenario.expect, direction: scenario.direction, error: String(error?.message || error), errors };
  } finally {
    await context.close();
  }
}

function judgeScenario(cell) {
  if (cell.opened === "error") return { status: "error", onScreen: null, why: cell.error };
  const entry = cell.after?.visible?.find((item) => item.name === cell.expect);
  const onScreen = cell.after?.fullScreen || cell.after?.topmost || null;
  if (!entry) return { status: "fail", kind: "scenario", onScreen, why: `${cell.expect} is not even visible` };
  const fills = canFillWorkArea(entry);
  const holder = fills && cell.after.fullScreen ? cell.after.fullScreen : cell.after.topmost;
  if (holder === cell.expect) return { status: "pass", kind: "scenario", onScreen: holder, why: "" };
  return { status: "fail", kind: "scenario", onScreen: holder, why: `${holder} holds the screen instead of ${cell.expect}` };
}

function judge(cell) {
  if (cell.opened === "error") return { status: "error", onScreen: null, why: cell.error };
  const entry = cell.after?.visible?.find((item) => item.name === cell.name);
  if (!entry) {
    return {
      status: "fail",
      kind: "unknown",
      onScreen: cell.after?.fullScreen || cell.after?.topmost || null,
      why: "opened window is not visible",
    };
  }
  const fills = canFillWorkArea(entry);
  const kind = fills ? "work-area" : "overlay";
  const onScreen = fills && cell.after.fullScreen ? cell.after.fullScreen : cell.after.topmost;
  if (onScreen === cell.name) return { status: "pass", kind, onScreen, why: "" };
  return { status: "fail", kind, onScreen, why: `${onScreen} holds the screen instead` };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const names = (args.only || await registryWindowNames()).filter((name) => !SKIP[name]);
  const server = await startAppServer(root);
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-lcd-text"] });
  const rows = [];
  // Concurrency defaults to one, because pages racing on one machine perturb
  // the very timing this tool measures. Raise it to finish a whole-registry
  // walk on a busy machine, then re-run any failing cell on its own (`--only`)
  // before believing it — a cell that only fails under load is load, not a
  // defect, and a cell that fails alone is real.
  async function walk(items, run) {
    let next = 0;
    const workers = Array.from({ length: args.jobs }, async () => {
      for (let index = next++; index < items.length; index = next++) await run(items[index]);
    });
    await Promise.all(workers);
  }
  try {
    for (const viewport of VIEWPORTS) {
      if (args.windows) {
        await walk(names, async (name) => {
          const cell = await measure(browser, server.url, viewport, name);
          const verdict = judge(cell);
          rows.push({ ...cell, ...verdict });
          const mark = verdict.status === "pass" ? "OK " : "NO ";
          console.log(`${mark} ${viewport.id.padEnd(16)} ${name.padEnd(20)} -> ${verdict.onScreen || "(nothing)"} ${verdict.why}`);
        });
      }
      if (args.scenarios) {
        // Always serial: a scenario drives a route command through several
        // un-awaited opens, which is the sequence being measured.
        for (const scenario of SCENARIOS) {
          const cell = await measureScenario(browser, server.url, viewport, scenario);
          const verdict = judgeScenario(cell);
          rows.push({ ...cell, ...verdict });
          const mark = verdict.status === "pass" ? "OK " : "NO ";
          console.log(`${mark} ${viewport.id.padEnd(16)} ${scenario.id.padEnd(26)} want ${String(scenario.expect).padEnd(14)} got ${verdict.onScreen || "(nothing)"} ${verdict.why}`);
        }
      }
    }
  } finally {
    await browser.close();
    await stopProcess(server.child);
  }
  const failures = rows.filter((row) => row.status !== "pass");
  console.log(`\n${rows.length} cells, ${failures.length} failing.`);
  for (const [name, why] of Object.entries(SKIP)) console.log(`--  skipped ${name}: ${why}`);
  if (args.out) {
    await mkdir(dirname(resolve(args.out)), { recursive: true });
    await writeFile(resolve(args.out), `${JSON.stringify(rows, null, 2)}\n`);
  }
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
