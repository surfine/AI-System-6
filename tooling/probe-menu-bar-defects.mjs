#!/usr/bin/env node
// Menu-bar defect probe: measures the real menu bar in a running app.
//
// This is a measurement tool, not a gate. It spawns its own server on a random
// port (never the shared dev server), boots the desktop, switches applications,
// and reports what each menu row actually shows and whether it is actually
// clickable. Use it to record a before number and an after number for a
// menu-bar change instead of trusting the source.
//
// Usage:
//   node tooling/probe-menu-bar-defects.mjs [--json out.json]

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

function parseArgs(argv) {
  const options = { json: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--json") options.json = argv[++index];
  }
  return options;
}

function httpReady(url) {
  return new Promise((resolveReady) => {
    const request = get(url, (response) => {
      response.resume();
      resolveReady(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on("error", () => resolveReady(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolveReady(false);
    });
  });
}

async function startAppServer() {
  const port = await new Promise((resolvePort) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(resolvedPort));
    });
  });
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
    if (await httpReady(url)) return { child, url, output: () => output };
    if (child.exitCode !== null) break;
    await new Promise((wait) => setTimeout(wait, 150));
  }
  child.kill("SIGTERM");
  throw new Error(`App server did not become ready.\n${output.trim()}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveStop();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill("SIGTERM");
  });
}

// Runs in the page. Reads every application menu row as a user would see it.
function readMenuBar() {
  const rows = [];
  document.querySelectorAll(".menu-bar > [data-app-menu]").forEach((menu) => {
    const menuId = menu.dataset.menuId || "";
    menu.querySelectorAll("button[data-action]").forEach((button) => {
      const span = button.querySelector(".shortcut");
      rows.push({
        menuId,
        action: button.dataset.action || "",
        shortcutId: button.dataset.shortcutId || "",
        datasetShortcut: button.dataset.shortcut || "",
        visibleShortcut: span ? (span.textContent || "").trim() : "",
        text: (button.textContent || "").trim(),
        disabled: button.disabled === true,
        isDisabledClass: button.classList.contains("is-disabled"),
        isChecked: button.classList.contains("is-checked"),
        hidden: button.classList.contains("is-hidden"),
      });
    });
  });
  return {
    activeAppId: typeof activeAppId === "string" ? activeAppId : "",
    workspaceProfile: document.body.dataset.workspaceProfile || "",
    rows,
  };
}

function summarize(snapshot) {
  const withShortcutId = snapshot.rows.filter((row) => row.shortcutId);
  return {
    activeAppId: snapshot.activeAppId,
    workspaceProfile: snapshot.workspaceProfile,
    totalRows: snapshot.rows.length,
    rowsWithShortcutId: withShortcutId.length,
    rowsWithDatasetShortcut: snapshot.rows.filter((row) => row.datasetShortcut).length,
    rowsShowingShortcut: snapshot.rows.filter((row) => row.visibleShortcut).length,
  };
}

const options = parseArgs(process.argv.slice(2));
const report = { steps: [] };
let server;
let browser;

try {
  server = await startAppServer();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message)));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(`console: ${message.text()}`);
  });
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);

  const step = async (name, before) => {
    if (before) await before();
    await page.waitForTimeout(250);
    const snapshot = await page.evaluate(readMenuBar);
    report.steps.push({ name, summary: summarize(snapshot), rows: snapshot.rows });
    return snapshot;
  };

  // 1. Startup (Finder).
  await step("boot-finder");

  // 2. After switching applications, one at a time.
  for (const [name, appWindow] of [
    ["teachText", "teachText"],
    ["clioTalk", "assistant"],
    ["reader", "reader"],
    ["docMap", "docMap"],
    ["timeMachine", "timeMachine"],
  ]) {
    await step(`open-${name}`, async () => {
      await page.evaluate(async (target) => {
        await openWindow(target);
        if (typeof updateMenuState === "function") updateMenuState();
      }, appWindow);
      await page.waitForTimeout(400);
    });
  }

  // 3. Does the advertised key actually reach the row's own handler?
  // A real ⌘-keydown on the real document, with the real dispatcher spied on.
  const keyProbe = [];
  for (const [appWindow, appId, key, label] of [
    ["teachText", "teachText", "o", "TeachText ⌘O (menu row: open-text-document)"],
    ["reader", "reader", "o", "Reader ⌘O (menu row: reader-open-source)"],
    ["assistant", "clioTalk", "n", "ClioTalk ⌘N (menu row: start-new-clio-chat)"],
  ]) {
    await page.evaluate(async (target) => {
      await openWindow(target);
      if (typeof updateMenuState === "function") updateMenuState();
    }, appWindow);
    await page.waitForTimeout(350);
    const dispatched = await page.evaluate(({ pressed, expectApp }) => {
      const seen = [];
      const original = window.handleAction;
      // runShortcut() calls the bundle's handleAction, which is a top-level
      // function declaration and therefore this same global property.
      window.handleAction = (action) => { seen.push(action); };
      document.activeElement?.blur?.();
      // Dispatch on an element, not the document: real keydowns always carry an
      // Element target and listeners call target.closest().
      document.body.dispatchEvent(new KeyboardEvent("keydown", {
        key: pressed,
        code: `Key${pressed.toUpperCase()}`,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }));
      window.handleAction = original;
      return { seen, activeAppId: typeof activeAppId === "string" ? activeAppId : "", expectApp };
    }, { pressed: key, expectApp: appId });
    keyProbe.push({ label, appId, foreground: dispatched.activeAppId, dispatches: dispatched.seen.join(", ") || "(nothing)" });
  }
  report.shortcutDispatch = keyProbe;

  // 4. DocMap layout rows against a real open map.
  report.docMapLayout = await page.evaluate(async () => {
    await openWindow("docMap");
    currentDocMap = { title: "probe", layout: "right", nodes: [] };
    if (typeof updateMenuState === "function") updateMenuState();
    const read = () => [...document.querySelectorAll(".menu-bar [data-layout-choice]")].map((btn) => ({
      action: btn.dataset.action,
      layoutChoice: btn.dataset.layoutChoice,
      text: (btn.textContent || "").trim(),
      checked: btn.classList.contains("is-checked"),
      disabled: btn.disabled === true,
    }));
    const onRight = read();
    currentDocMap = { title: "probe", layout: "balanced", nodes: [] };
    if (typeof updateMenuState === "function") updateMenuState();
    const onBalanced = read();
    currentDocMap = null;
    if (typeof updateMenuState === "function") updateMenuState();
    return { onRight, onBalanced };
  });

  // 4b. Switching language and then applications must not strip the keys
  // either: both writers paint the same span.
  report.languageSwitch = await page.evaluate(async () => {
    const count = () => document.querySelectorAll(".menu-bar > [data-app-menu] .shortcut").length;
    await openWindow("teachText");
    await switchLanguage();
    const afterLanguage = count();
    const language = typeof currentLanguage === "string" ? currentLanguage : "";
    await openWindow("assistant");
    await openWindow("teachText");
    const afterAppSwitch = count();
    const sample = document.querySelector(".menu-bar > [data-app-menu] button[data-shortcut-id]");
    const sampleText = (sample?.textContent || "").trim();
    await switchLanguage();
    return { language, afterLanguage, afterAppSwitch, sampleText };
  });

  // 5. Grey is only information if it can go black. Give the writing profile
  // and Time Machine the state their rows are waiting for.
  report.writingProfile = await page.evaluate(async () => {
    setWorkspaceProfile("writing", { persist: false });
    await openWindow("teachText");
    if (typeof updateMenuState === "function") updateMenuState();
    const wanted = ["open-question-sheet", "open-outline", "open-section-drafts", "open-review-desk", "open-image-manager"];
    return {
      profile: document.body.dataset.workspaceProfile || "",
      rows: [...document.querySelectorAll(".menu-bar button[data-action]")]
        .filter((btn) => wanted.includes(btn.dataset.action))
        .map((btn) => ({ action: btn.dataset.action, disabled: btn.disabled === true })),
    };
  });

  report.timeMachineWithState = await page.evaluate(async () => {
    await openWindow("timeMachine");
    // The module's own state variables, set to what a loaded live page looks
    // like, so the gate is exercised rather than merely observed at rest.
    currentTimeMachinePage = { url: "https://example.com", reader: { text: "probe body text" }, archive: null };
    currentTimeMachineView = "reader";
    if (typeof updateMenuState === "function") updateMenuState();
    return [...document.querySelectorAll(".menu-bar button[data-action]")]
      .filter((btn) => btn.dataset.action.startsWith("time-machine-"))
      .map((btn) => ({ action: btn.dataset.action, disabled: btn.disabled === true }));
  });

  report.pageErrors = pageErrors;
} finally {
  if (browser) await browser.close();
  await stopProcess(server?.child);
}

// --- human-readable output ---------------------------------------------------
const line = (text) => console.log(text);
line("");
line("=== Menu shortcut labels (defect 1) ===");
for (const entry of report.steps) {
  const s = entry.summary;
  line(
    `${entry.name.padEnd(18)} app=${String(s.activeAppId).padEnd(14)} profile=${s.workspaceProfile.padEnd(8)}`
    + ` rows=${String(s.totalRows).padStart(3)} withShortcutId=${String(s.rowsWithShortcutId).padStart(2)}`
    + ` datasetShortcut=${String(s.rowsWithDatasetShortcut).padStart(2)} SHOWING=${String(s.rowsShowingShortcut).padStart(2)}`
  );
}

const findRow = (stepName, action) =>
  report.steps.find((entry) => entry.name === stepName)?.rows.find((row) => row.action === action) || null;

line("");
line("=== Writing 'Go To' rows in TeachText (defect 2) ===");
for (const action of ["open-question-sheet", "open-outline", "open-section-drafts", "open-teachtext-manuscript", "open-review-desk", "open-image-manager"]) {
  const row = findRow("open-teachText", action);
  line(row
    ? `${action.padEnd(30)} disabled=${String(row.disabled).padEnd(5)} isDisabledClass=${row.isDisabledClass} text="${row.text}"`
    : `${action.padEnd(30)} (row not found)`);
}

line("");
line("=== Advertised keys that must actually work (defect 3) ===");
for (const entry of report.shortcutDispatch || []) {
  line(`${entry.label.padEnd(48)} foreground=${String(entry.foreground).padEnd(10)} -> ${entry.dispatches}`);
}

line("");
line("=== DocMap layout rows (defect 4) ===");
for (const row of report.steps.find((entry) => entry.name === "open-docMap")?.rows || []) {
  if (!row.action.startsWith("docmap-layout")) continue;
  line(`  no map: ${row.action.padEnd(26)} text="${row.text.padEnd(12)}" checked=${row.isChecked} disabled=${row.disabled}`);
}
for (const [state, rows] of Object.entries(report.docMapLayout || {})) {
  for (const row of rows) {
    line(`  ${state.padEnd(12)} ${row.action.padEnd(26)} text="${row.text.padEnd(12)}" checked=${row.checked} disabled=${row.disabled}`);
  }
}

line("");
line("=== Time Machine verbs (defect 5) ===");
const tmRows = (report.steps.find((entry) => entry.name === "open-timeMachine")?.rows || [])
  .filter((row) => row.action.startsWith("time-machine-"));
line(`rows=${tmRows.length} disabled=${tmRows.filter((row) => row.disabled).length} enabled=${tmRows.filter((row) => !row.disabled).length}`);
for (const row of tmRows) line(`  ${row.action.padEnd(34)} disabled=${row.disabled}`);

line("");
line("=== Shortcut spans after a language switch, then an application switch (defect 1) ===");
line(`  language=${report.languageSwitch?.language}  after language switch: ${report.languageSwitch?.afterLanguage}   after app switch: ${report.languageSwitch?.afterAppSwitch}   sample row: "${report.languageSwitch?.sampleText}"`);

line("");
line(`=== Same rows in the writing profile (must be black) — profile=${report.writingProfile?.profile} ===`);
for (const row of report.writingProfile?.rows || []) line(`  ${row.action.padEnd(30)} disabled=${row.disabled}`);

line("");
line("=== Time Machine verbs with a live reader page loaded (grey must go black) ===");
const withState = report.timeMachineWithState || [];
line(`rows=${withState.length} disabled=${withState.filter((row) => row.disabled).length} enabled=${withState.filter((row) => !row.disabled).length}`);
for (const row of withState) line(`  ${row.action.padEnd(34)} disabled=${row.disabled}`);

line("");
line(`page errors: ${report.pageErrors?.length ? report.pageErrors.join(" | ") : "none"}`);

if (options.json) {
  writeFileSync(options.json, JSON.stringify(report, null, 2));
  line(`\nwrote ${options.json}`);
}
