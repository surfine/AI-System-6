#!/usr/bin/env node
// Menu-truth probe: does every menu row's appearance match its answer?
//
// This is a measurement tool, not a gate. It spawns its own server on a random
// port (never the shared dev server), boots the desktop, and for both workspace
// profiles walks every application's menu bar. For each row it records what the
// row looks like (disabled or not) and then really dispatches the row's action
// through handleAction(), the same entry a click uses, to record whether the
// dispatch was accepted or refused.
//
// The handlers are swapped for recording stubs first. Everything before the
// handler call — the command lookup, isAvailable(), and the write-lease check —
// is the real code, so "accepted" means the real gate let the action through.
// Stubbing is what makes the sweep possible at all: shut-down-system and
// switch-language would otherwise end the probe partway through the first menu.
//
// Two inconsistencies are the point:
//   BLACK-BUT-REFUSED  the row looks usable and the click is thrown away
//   GREY-BUT-ACCEPTED  the row looks unusable and the action runs anyway
//
// Usage:
//   node tooling/probe-menu-truth.mjs [--json out.json]

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { dirname } from "node:path";
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

// One context per application menu set, named by the window that brings it to
// the front. The four route windows are listed separately because their rows
// carry data-menu-surface and only appear when that surface is in front.
const CONTEXTS = [
  ["finder", "finder"],
  ["quickDraft", "quickDraft"],
  ["teachText", "teachText"],
  ["clioTalk", "assistant"],
  ["reader", "reader"],
  ["timeMachine", "timeMachine"],
  ["docMap", "docMap"],
  ["scrapbook", "scrapbook"],
  ["searcher", "findPath"],
  ["clioStage", "clioStage"],
  ["clioChart", "clioChart"],
  ["liquidCover", "liquidCover"],
  ["cmfStudio", "cmfStudio"],
  ["soundscape", "soundscape"],
  ["endfield", "endfieldTerminal"],
  ["bureaucracyMeme", "bureaucracyMeme"],
  ["system", "themeLab"],
  ["questionSheet", "questionSheet"],
  ["outline", "outline"],
  ["sectionDrafts", "sectionDrafts"],
  ["reviewDesk", "reviewDesk"],
  ["projects", "projects"],
  ["documents", "documents"],
  ["trash", "trash"],
];

// Runs in the page: bring a context to the front, read every row, then really
// dispatch every row's action and report which ones the gate let through.
function probeContext(windowName) {
  const hiddenByAncestor = (button) => {
    let node = button;
    while (node && !node.classList?.contains("menu-bar")) {
      if (node.classList?.contains("is-hidden")) return true;
      node = node.parentElement;
    }
    return false;
  };

  if (typeof updateMenuState === "function") updateMenuState();

  // The whole menu bar, not only the application menus: the Apple menu and the
  // status controls live in index.html and are rows the user meets too.
  // #cloud-model-popover is excluded on purpose. Its buttons carry data-action
  // as a local identifier, not as a system command: cloud-model.js wires its
  // own click listener and calls stopPropagation(), so the shared dispatcher
  // never sees them. They are correctly black and they correctly work; reading
  // them through handleAction() reports a refusal the user never meets.
  const rows = [...document.querySelectorAll(".menu-bar button[data-action]")]
    .filter((button) => !button.closest("#cloud-model-popover"))
    .map((button) => {
      const disabled = button.disabled === true;
      const greyClass = button.classList.contains("is-disabled");
      return {
        menuId: button.closest("[data-app-menu]")?.dataset.menuId
          || (button.closest(".apple-menu-popover") ? "apple" : "menu-bar"),
        action: button.dataset.action || "",
        label: (button.querySelector(".shortcut")
          ? button.textContent.replace(button.querySelector(".shortcut").textContent, "")
          : button.textContent || "").trim(),
        disabled,
        isDisabledClass: greyClass,
        // What the user sees. `is-disabled` alone still prints grey ink and
        // sets pointer-events:none, so a row can look dead without being
        // disabled — and a keyboard or programmatic dispatch still reaches it.
        looksUnavailable: disabled || greyClass,
        hidden: hiddenByAncestor(button),
        independent: !!button.closest("[data-action-availability='independent']"),
      };
    });

  // Swap every handler for a recorder. The lookup, isAvailable() and the
  // write-lease check in handleAction() stay real.
  const realRegistry = getApplicationCommandRegistry();
  const stubbed = new Map();
  realRegistry.forEach((command, id) => {
    stubbed.set(id, Object.freeze({
      id,
      handler: () => { window.__menuTruthRan = true; },
      isAvailable: command.isAvailable,
      shortcut: command.shortcut,
    }));
  });

  const results = [];
  for (const row of rows) {
    const known = realRegistry.has(row.action);
    let available = null;
    try {
      available = known ? realRegistry.get(row.action).isAvailable() === true : null;
    } catch (error) {
      available = `threw: ${error.message}`;
    }
    const writeBlocked = writeRequiredActions.has(row.action)
      && window.AISystem6WriteLease?.canMutate?.() !== true;

    window.__menuTruthRan = false;
    let threw = "";
    applicationCommandRegistryCache = stubbed;
    try {
      handleAction(row.action);
    } catch (error) {
      threw = String(error?.message || error);
    }
    applicationCommandRegistryCache = null;
    const accepted = window.__menuTruthRan === true;

    let reason = "accepted";
    if (!accepted) {
      if (!known) reason = "no-command";
      else if (available !== true) reason = "unavailable";
      else if (writeBlocked) reason = "write-lease";
      else if (threw) reason = "threw";
      else reason = "refused";
    }
    results.push({ ...row, known, available, accepted, reason, threw });
  }

  return {
    windowName,
    activeAppId: typeof activeAppId === "string" ? activeAppId : "",
    menuSetId: typeof menuSetIdForApp === "function"
      ? menuSetIdForApp(typeof activeAppId === "string" ? activeAppId : "finder")
      : "",
    frontWindow: document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window || "",
    rows: results,
  };
}

const options = parseArgs(process.argv.slice(2));
const report = { generatedAt: new Date().toISOString(), profiles: {} };
let server;
let browser;

try {
  server = await startAppServer();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message)));
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);

  for (const profile of ["desktop", "writing"]) {
    await page.evaluate(async (value) => {
      setWorkspaceProfile(value, { persist: false });
      if (typeof hideWorkspaceDisallowedWindows === "function") hideWorkspaceDisallowedWindows();
      if (typeof refreshWorkspaceProfileSurfaces === "function") refreshWorkspaceProfileSurfaces();
    }, profile);
    await page.waitForTimeout(250);

    const contexts = [];
    for (const [label, windowName] of CONTEXTS) {
      const opened = await page.evaluate(async (name) => {
        try {
          await openWindow(name);
        } catch (error) {
          return { ok: false, error: String(error?.message || error) };
        }
        return { ok: true, error: "" };
      }, windowName);
      await page.waitForTimeout(300);
      const measured = await page.evaluate(probeContext, windowName);
      contexts.push({ label, opened, ...measured });
    }
    report.profiles[profile] = contexts;
  }

  report.pageErrors = pageErrors;
} finally {
  if (browser) await browser.close();
  await stopProcess(server?.child);
}

// --- report ------------------------------------------------------------------
const line = (text) => console.log(text);

// A row is judged once per (profile, action). The same action appears in many
// application menus; the strictest observation wins, because one lying context
// is enough for the user to meet the lie.
function collapse(contexts) {
  const byAction = new Map();
  for (const context of contexts) {
    for (const row of context.rows) {
      if (row.hidden) continue;
      const key = row.action;
      const entry = byAction.get(key) || { action: key, label: row.label, sightings: [] };
      entry.sightings.push({ ...row, context: context.label, menuId: row.menuId });
      byAction.set(key, entry);
    }
  }
  return byAction;
}

function inconsistencies(contexts) {
  const blackButRefused = [];
  const greyButAccepted = [];
  for (const [action, entry] of collapse(contexts)) {
    const lying = entry.sightings.filter((row) => !row.looksUnavailable && !row.accepted);
    const hiding = entry.sightings.filter((row) => row.looksUnavailable && row.accepted);
    if (lying.length) {
      blackButRefused.push({
        action,
        label: entry.label,
        reason: lying[0].reason,
        where: [...new Set(lying.map((row) => `${row.context}/${row.menuId}`))].join(" "),
      });
    }
    if (hiding.length) {
      greyButAccepted.push({
        action,
        label: entry.label,
        where: [...new Set(hiding.map((row) => `${row.context}/${row.menuId}`))].join(" "),
      });
    }
  }
  const sort = (list) => list.sort((a, b) => a.action.localeCompare(b.action));
  return { blackButRefused: sort(blackButRefused), greyButAccepted: sort(greyButAccepted) };
}

for (const [profile, contexts] of Object.entries(report.profiles)) {
  const rowCount = contexts.reduce((total, context) => total + context.rows.filter((row) => !row.hidden).length, 0);
  const actionCount = collapse(contexts).size;
  const { blackButRefused, greyButAccepted } = inconsistencies(contexts);
  report.profiles[profile].summary = { rowCount, actionCount, blackButRefused, greyButAccepted };

  line("");
  line(`=== profile: ${profile} — ${rowCount} visible rows over ${contexts.length} contexts, ${actionCount} distinct actions ===`);
  line("");
  line(`--- BLACK BUT REFUSED (${blackButRefused.length}) — looks usable, click thrown away ---`);
  for (const row of blackButRefused) {
    line(`  ${row.action.padEnd(38)} ${row.reason.padEnd(12)} "${row.label}"  @ ${row.where}`);
  }
  if (!blackButRefused.length) line("  (none)");
  line("");
  line(`--- GREY BUT ACCEPTED (${greyButAccepted.length}) — looks unusable, action runs ---`);
  for (const row of greyButAccepted) {
    line(`  ${row.action.padEnd(38)} "${row.label}"  @ ${row.where}`);
  }
  if (!greyButAccepted.length) line("  (none)");
}

line("");
line(`page errors: ${report.pageErrors?.length ? report.pageErrors.join(" | ") : "none"}`);

if (options.json) {
  writeFileSync(options.json, JSON.stringify(report, null, 2));
  line(`\nwrote ${options.json}`);
}
