// Does every application actually open?
//
// Reported as "玻璃封面 app 怎么打不开": the row was clickable, the module
// loaded, the window was built — and nothing appeared. The census that
// dispatches every control calls that live, because the DOM did change; what it
// cannot see is whether the window the person asked for ever became visible.
//
//   node tests/e2e/probe-app-launch.spec.mjs
//
// This drives the Applications folders and, for every row, dispatches its
// action and waits for a window to appear that was not there before. Rows that
// are not applications (folders, the two demos) are named and skipped rather
// than silently ignored.

import { chromium } from "@playwright/test";
import { repositoryRoot } from "../../tooling/lib/paths.mjs";
import { startAppServer, stopProcess } from "../../tooling/lib/app-preview-server.mjs";
import { bootApp, dismissGuide, openWindow, runAction } from "./helpers.mjs";

const NOT_APPLICATIONS = new Set([
  // Folder rows walk the same window to another location.
  "open-applications-folder-path:create",
  "open-applications-folder-path:games",
  "open-applications-folder-path:extras",
  // The demos drive the desk rather than opening one window.
  "play-writing-demo",
  "play-teaser-demo",
  // These two fill an existing flow instead of putting up a window of their own.
  "open-rebuild-flow",
]);

const { child: server, url: baseURL } = await startAppServer(repositoryRoot);
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const failures = [];
const skipped = [];

const visibleWindows = () => page.evaluate(() => [...document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)")]
  .map((win) => win.dataset.window)
  .filter(Boolean));

try {
  await bootApp(page);
  await dismissGuide(page);
  await openWindow(page, "applications");

  const rows = [];
  for (const folder of ["", "create", "games", "extras"]) {
    if (folder) await runAction(page, `open-applications-folder-path:${folder}`);
    await page.waitForTimeout(150);
    const listed = await page.evaluate(() => [...document.querySelectorAll('[data-window="applications"] [data-static-finder-action]')]
      .map((row) => row.dataset.staticFinderAction));
    for (const action of listed) if (!rows.includes(action)) rows.push(action);
  }
  console.log(`rows: ${rows.length} (${rows.filter((action) => !NOT_APPLICATIONS.has(action)).length} applications)`);

  for (const action of rows) {
    if (NOT_APPLICATIONS.has(action)) {
      skipped.push(action);
      continue;
    }
    const before = await visibleWindows();
    let settled = "pending";
    void page.evaluate((name) => {
      window.__probeSettled = "pending";
      void handleAction(name).then(
        () => { window.__probeSettled = "resolved"; },
        (error) => { window.__probeSettled = `rejected:${error?.message || error}`; }
      );
    }, action);
    // A window the action opened shows up within a few seconds — the biggest
    // modules take that long to load on a cold desk — while a mount that waits
    // on itself never does, however long the page runs.
    let appeared = [];
    const started = Date.now();
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await page.waitForTimeout(100);
      const now = await visibleWindows();
      appeared = now.filter((name) => !before.includes(name));
      if (appeared.length) break;
      const state = await page.evaluate(() => window.__probeSettled);
      settled = state;
      if (state !== "pending") break;
    }
    if (!appeared.length) {
      settled = await page.evaluate(() => window.__probeSettled);
      const after = await visibleWindows();
      failures.push(`${action}: no window appeared (action ${settled}; before=[${before.join(",")}] after=[${after.join(",")}])`);
      console.log(`NO   ${action} — no window appeared (action ${settled}, ${Date.now() - started}ms)`);
    } else {
      console.log(`OK   ${action} → ${appeared.join(", ")} (${Date.now() - started}ms)`);
    }
    // Leave the desk as it was for the next row: close what just opened.
    for (const name of appeared) {
      await page.evaluate((windowName) => closeWindow(windowName, true), name).catch(() => {});
    }
    await page.waitForTimeout(120);
  }

  if (skipped.length) console.log(`skipped (not applications): ${skipped.join(", ")}`);
  if (failures.length) {
    console.error(`PROBLEM:\n${failures.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("probe: every application opened a window");
  }
} finally {
  await context.close();
  await browser.close();
  stopProcess(server);
}
