// A targeted browser probe, run on demand.
//
// This is the shape the project keeps instead of a suite: no config, no
// fixtures, no CI job — a few dozen lines that drive the real app when a real
// browser is the only way to see the answer, then exit. Run it, read it, throw
// the invocation away.
//
//   node tests/e2e/probe-finder-rows.mjs
//
// It opens every static Finder window in both view modes and reports any row
// that rendered without exactly one icon and a name — the diagnostic the
// deleted 148-test suite lacked for the bug that prompted its removal.

import { chromium } from "@playwright/test";
import { repositoryRoot } from "../../tooling/lib/paths.mjs";
import { startAppServer, stopProcess } from "../../tooling/lib/app-preview-server.mjs";
import { bootApp, dismissGuide, openWindow, runAction } from "./helpers.mjs";

const WINDOWS = ["applications", "disk", "helpFolder", "finder"];
const MODES = ["icon", "list"];

const { child: server, url: baseURL } = await startAppServer(repositoryRoot);
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL });
const page = await context.newPage();
const warnings = [];
page.on("console", (message) => {
  if (message.type() === "warning" && message.text().includes("Finder row")) warnings.push(message.text());
});
page.on("pageerror", (error) => warnings.push(`pageerror: ${error.message}`));

try {
  await bootApp(page);
  await dismissGuide(page);
  for (const name of WINDOWS) {
    await openWindow(page, name);
    for (const mode of MODES) {
      await page.click(`[data-view-window="${name}"] .view-btn[data-view="${mode}"]`, { timeout: 5_000 });
      await page.waitForTimeout(150);
    }
  }
  const rows = await page.evaluate(() => {
    const counts = { rows: 0, icons: 0, unlabeled: 0 };
    for (const grid of document.querySelectorAll(".window-pane")) {
      for (const row of grid.querySelectorAll(".finder-item, .finder-list-row")) {
        counts.rows += 1;
        counts.icons += row.querySelectorAll(".sys-icon").length;
        if (!(row.querySelector(".finder-item-label")?.textContent || "").trim()) counts.unlabeled += 1;
      }
    }
    return counts;
  });
  console.log(`rows=${rows.rows} icons=${rows.icons} unlabeled=${rows.unlabeled}`);

  // The rows that prompted the probe: Applications → Extras, where a state
  // toggle rewrote the label and took the icon with it. Press Play, look at the
  // row the person looks at, press Stop.
  await openWindow(page, "applications");
  await runAction(page, "open-applications-folder-path:extras");
  await page.waitForSelector('[data-static-finder-action="play-teaser-demo"]', { timeout: 15_000 });
  const readDemoRow = () => page.evaluate(() => {
    const row = document.querySelector('[data-static-finder-action="play-teaser-demo"]');
    const icon = row?.querySelector(".sys-icon");
    return {
      running: row?.dataset.demoRunning || "",
      glyph: icon?.dataset.systemIcon || "",
      icons: row?.querySelectorAll(".sys-icon").length ?? -1,
      label: (row?.querySelector(".finder-item-label")?.textContent || "").trim(),
      painted: (icon?.querySelector("svg")?.getBoundingClientRect().width || 0) > 8,
    };
  });
  const idle = await readDemoRow();
  await page.locator('[data-static-finder-action="play-teaser-demo"]').dblclick();
  await page.waitForFunction(() => document.querySelector('[data-static-finder-action="play-teaser-demo"]')?.dataset.demoRunning === "true", undefined, { timeout: 20_000 });
  const running = await readDemoRow();
  await page.evaluate(() => window.AISystem6WritingDemo?.stopTeaser?.());
  await page.waitForFunction(() => document.querySelector('[data-static-finder-action="play-teaser-demo"]')?.dataset.demoRunning === "false", undefined, { timeout: 20_000 });
  const stopped = await readDemoRow();
  console.log(`demo row: idle=${JSON.stringify(idle)}\n          running=${JSON.stringify(running)}\n          stopped=${JSON.stringify(stopped)}`);
  const demoBroken = !idle.painted || !running.painted || !stopped.painted
    || idle.icons !== 1 || running.icons !== 1 || stopped.icons !== 1
    || running.glyph !== "pause" || stopped.glyph !== "writingDemo";
  // The other half of the same question: an icon element is not an icon if the
  // file it points at is not there. ClioPaint wore a placeholder for weeks
  // because its Classic asset was never written.
  const icons = await page.evaluate(async () => {
    const hrefs = [...document.querySelectorAll(".sys-icon image")]
      .map((image) => image.getAttribute("href"))
      .filter(Boolean);
    const unique = [...new Set(hrefs)];
    const bad = [];
    for (const href of unique) {
      const response = await fetch(href, { cache: "no-store" }).catch(() => null);
      if (!response?.ok) bad.push(`${href} → ${response?.status ?? "network error"}`);
    }
    return { checked: unique.length, bad };
  });
  console.log(`icon files referenced: ${icons.checked}, unreadable: ${icons.bad.length}`);
  if (icons.bad.length) console.error(`PROBLEM: ${icons.bad.join("\n")}`);
  if (rows.unlabeled || rows.icons !== rows.rows) {
    console.error(`PROBLEM: ${rows.icons} icons for ${rows.rows} rows, ${rows.unlabeled} without a name`);
  }
  if (demoBroken) console.error("PROBLEM: the demo row lost its icon or its state");
  if (warnings.length) console.error(`WARNINGS:\n${warnings.join("\n")}`);
  console.log(
    warnings.length || demoBroken || rows.unlabeled || icons.bad.length
      ? "probe: something is wrong"
      : "probe: every row has one icon and a name, every icon file reads, and the demo row survives its toggle"
  );
  process.exitCode = warnings.length || demoBroken || rows.unlabeled || icons.bad.length || rows.icons !== rows.rows ? 1 : 0;
} finally {
  await context.close();
  await browser.close();
  stopProcess(server);
}
