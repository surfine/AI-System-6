#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { windowInterfaceRegistry } from "./interface-guidelines-contract.mjs";

export const AUDIT_SCHEMA_VERSION = "1.0.0";

export const CORE_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "iphone-portrait", width: 390, height: 844, deviceClass: "phone", orientation: "portrait" }),
  Object.freeze({ id: "iphone-landscape", width: 844, height: 390, deviceClass: "phone", orientation: "landscape" }),
  Object.freeze({ id: "ipad-portrait", width: 820, height: 1180, deviceClass: "tablet", orientation: "portrait" }),
  Object.freeze({ id: "ipad-landscape", width: 1180, height: 820, deviceClass: "tablet", orientation: "landscape" }),
]);

export const FULL_VIEWPORT_PROBES = Object.freeze([
  Object.freeze({ id: "phone-minimum", width: 320, height: 568, deviceClass: "phone", orientation: "portrait" }),
  Object.freeze({ id: "phone-large", width: 430, height: 932, deviceClass: "phone", orientation: "portrait" }),
  Object.freeze({ id: "ipad-compact", width: 744, height: 1133, deviceClass: "tablet", orientation: "portrait" }),
  Object.freeze({ id: "ipad-large", width: 1024, height: 1366, deviceClass: "tablet", orientation: "portrait" }),
  ...[759, 760, 761, 819, 820, 859, 860, 861].map((width) => Object.freeze({
    id: `breakpoint-${width}`,
    width,
    height: 1100,
    deviceClass: "tablet",
    orientation: "portrait",
  })),
  ...[320, 375, 600, 744, 820, 1024].map((width) => Object.freeze({
    id: `ipad-multitask-${width}`,
    width,
    height: 900,
    deviceClass: width < 600 ? "phone" : "tablet",
    orientation: "portrait",
    containerProbe: true,
  })),
  Object.freeze({
    id: "reduced-motion",
    width: 390,
    height: 844,
    deviceClass: "phone",
    orientation: "portrait",
    reducedMotion: "reduce",
  }),
  Object.freeze({
    id: "text-scale-200",
    width: 320,
    height: 900,
    deviceClass: "phone",
    orientation: "portrait",
    textScale: 2,
  }),
  Object.freeze({
    id: "text-spacing",
    width: 390,
    height: 844,
    deviceClass: "phone",
    orientation: "portrait",
    textSpacing: true,
  }),
]);

export const MANUAL_ONLY_CAPABILITIES = Object.freeze([
  Object.freeze({ id: "safe-area-device-insets", platform: "iPhone/iPad hardware", reason: "Browser emulation cannot reproduce physical cutouts, system bars, or device safe-area insets." }),
  Object.freeze({ id: "home-screen-pwa", platform: "iOS/iPadOS Home Screen", reason: "Installed standalone-mode lifecycle and browser chrome require a real device receipt." }),
  Object.freeze({ id: "software-keyboard-avoidance", platform: "iOS/iPadOS", reason: "A desktop browser process cannot prove the system keyboard, VisualViewport, or dismissal behavior." }),
  Object.freeze({ id: "voiceover", platform: "iOS/iPadOS", reason: "DOM and axe checks do not prove VoiceOver reading order, rotor behavior, or spoken feedback." }),
  Object.freeze({ id: "full-keyboard-access", platform: "iPadOS", reason: "Playwright keyboard events do not reproduce iPadOS Full Keyboard Access focus navigation." }),
  Object.freeze({ id: "switch-control", platform: "iOS/iPadOS", reason: "Switch Control scanning and activation require an assistive-technology receipt." }),
]);

const LANGUAGES = Object.freeze(["en", "zh"]);
const THEMES = Object.freeze(["classic", "liquid-glass"]);
const VALID_MATRIX_NAMES = new Set(["smoke", "core", "full"]);
const VALID_ENGINES = new Set(["chromium", "webkit"]);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// Surfaces the product builds that the interface registry does not yet know
// about. This carried hand-written contracts for imagePromptStudio and
// sideAskPad, each stamped registryStatus: "missing" -- true when this audit
// was written, and false since both gained real contracts. They were inert
// (the loop below only fills a gap the registry leaves) but they still stated
// something untrue about the product, so they are gone. The escape hatch stays
// for the next window that ships ahead of its contract.
const DYNAMIC_PRODUCTION_SURFACES = Object.freeze([]);

const WINDOW_ACTION_OVERRIDES = Object.freeze({
  assistant: ["open-assistant"],
  control: ["open-control"],
  disk: [],
  documents: ["open-documents"],
  fileInfo: ["open-file-info"],
  finishingReceipt: ["open-finishing-receipt"],
  pageSetup: ["page-setup"],
  printDirectory: ["print-directory"],
  projectInfo: ["open-project-info"],
  projects: ["open-project-disks"],
  reviewDesk: ["open-review-desk"],
  saveChat: ["save-conversation"],
  sideAskPad: ["open-sideask-pad"],
  systemHelp: ["open-system-help"],
  teachText: ["open-teachtext"],
  textDisk: ["open-text-disk"],
  welcomeDisk: [],
});

function stableEnvironment(viewport, language, theme) {
  const suffix = [language, theme, viewport.reducedMotion === "reduce" ? "reduce" : ""].filter(Boolean).join("-");
  return Object.freeze({
    id: `${viewport.id}-${suffix}`,
    viewport: Object.freeze({ width: viewport.width, height: viewport.height }),
    deviceClass: viewport.deviceClass,
    orientation: viewport.orientation,
    language,
    locale: language === "zh" ? "zh-CN" : "en-US",
    theme,
    input: "touch",
    hasTouch: true,
    isMobile: true,
    reducedMotion: viewport.reducedMotion || "no-preference",
    textScale: viewport.textScale || 1,
    textSpacing: viewport.textSpacing === true,
    containerProbe: viewport.containerProbe === true,
  });
}

export function buildAuditMatrix(name = "smoke") {
  if (!VALID_MATRIX_NAMES.has(name)) throw new TypeError(`Unknown audit matrix: ${name}`);
  const core = CORE_VIEWPORTS.flatMap((viewport) =>
    LANGUAGES.flatMap((language) => THEMES.map((theme) => stableEnvironment(viewport, language, theme))));
  if (name === "core") return core;
  if (name === "smoke") {
    return [
      stableEnvironment(CORE_VIEWPORTS[0], "en", "classic"),
      stableEnvironment(CORE_VIEWPORTS[1], "zh", "liquid-glass"),
      stableEnvironment(CORE_VIEWPORTS[2], "zh", "classic"),
      stableEnvironment(CORE_VIEWPORTS[3], "en", "liquid-glass"),
    ];
  }
  return [
    ...core,
    ...FULL_VIEWPORT_PROBES.map((viewport) => stableEnvironment(viewport, "en", "classic")),
  ];
}

export function createContextOptions(environment) {
  return {
    viewport: { ...environment.viewport },
    screen: { ...environment.viewport },
    hasTouch: environment.hasTouch === true,
    isMobile: environment.isMobile === true,
    locale: environment.locale,
    reducedMotion: environment.reducedMotion || "no-preference",
    deviceScaleFactor: 1,
    colorScheme: "light",
  };
}

export function productionSurfaceContracts(registry = windowInterfaceRegistry) {
  const surfaces = Object.entries(registry)
    .filter(([name]) => name !== "themeLab")
    .map(([name, contract]) => ({ name, contract: { ...contract, registryStatus: "registered" } }));
  const names = new Set(surfaces.map(({ name }) => name));
  for (const surface of DYNAMIC_PRODUCTION_SURFACES) {
    if (!names.has(surface.name)) surfaces.push({ name: surface.name, contract: { ...surface.contract } });
  }
  return surfaces.sort((a, b) => a.name.localeCompare(b.name));
}

export function classifyWindowOpen({ surfaceFound, visible, entryAttempted, entryKind = "", active = false, reason = "" }) {
  if (!surfaceFound) {
    return {
      status: "not-tested",
      reason: reason || "runtime-surface-missing",
      entryKind: entryKind || "none",
      entryAttempted: entryAttempted === true,
      active: false,
    };
  }
  if (visible && (entryAttempted || entryKind === "initial-state")) {
    return {
      status: "tested",
      reason: active ? "opened-and-active" : "opened-but-not-active",
      entryKind: entryKind || "user-entry",
      entryAttempted: entryAttempted === true,
      active: active === true,
    };
  }
  if (!entryAttempted) {
    return {
      status: "not-tested",
      reason: reason || "no-real-user-entry-found",
      entryKind: entryKind || "none",
      entryAttempted: false,
      active: false,
    };
  }
  return {
    status: "not-tested",
    reason: reason || "real-user-entry-did-not-open-surface",
    entryKind: entryKind || "user-entry",
    entryAttempted: true,
    active: false,
  };
}

export function createNotTestedProof(reason) {
  if (!String(reason || "").trim()) throw new TypeError("not-tested proof requires a reason");
  return {
    status: "not-tested",
    execution: "automated",
    environment: "emulated",
    conclusion: "not-tested",
    reason: String(reason),
  };
}

function validateHeader(document, kind, errors) {
  if (!document || typeof document !== "object" || Array.isArray(document)) errors.push("document must be an object");
  if (document?.schemaVersion !== AUDIT_SCHEMA_VERSION) errors.push(`schemaVersion must equal ${AUDIT_SCHEMA_VERSION}`);
  if (document?.kind !== kind) errors.push(`kind must equal ${kind}`);
  if (!document?.generatedAt || Number.isNaN(Date.parse(document.generatedAt))) errors.push("generatedAt must be an ISO date");
  if (!document?.source || typeof document.source !== "object") errors.push("source metadata is required");
}

export function validateCoverageMatrixDocument(document) {
  const errors = [];
  validateHeader(document, "ai-system-6-hig-coverage-matrix", errors);
  if (!Array.isArray(document?.environments) || !document.environments.length) errors.push("environments must be non-empty");
  if (!Array.isArray(document?.records)) errors.push("records must be an array");
  if (!Array.isArray(document?.manualCapabilities) || !document.manualCapabilities.length) errors.push("manualCapabilities must be non-empty");
  for (const [index, record] of (document?.records || []).entries()) {
    const proof = record?.proof;
    if (!record?.id || !record?.surface?.name || !record?.environmentId) errors.push(`records[${index}] is missing identity`);
    if (!proof || !["tested", "not-tested", "error"].includes(proof.status)) errors.push(`records[${index}].proof.status is invalid`);
    if (proof?.execution !== "automated") errors.push(`records[${index}].proof.execution must be automated`);
    if (proof?.environment !== "emulated") errors.push(`records[${index}].proof.environment must be emulated`);
    if (proof?.status === "not-tested" && (!proof.reason || proof.conclusion !== "not-tested")) {
      errors.push(`records[${index}] not-tested proof requires a reason and not-tested conclusion`);
    }
  }
  for (const [index, capability] of (document?.manualCapabilities || []).entries()) {
    if (capability?.status !== "not-tested" || capability?.proof?.conclusion === "pass") {
      errors.push(`manualCapabilities[${index}] cannot be marked pass`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateBrowserFindingsDocument(document) {
  const errors = [];
  validateHeader(document, "ai-system-6-hig-browser-findings", errors);
  if (!Array.isArray(document?.findings)) errors.push("findings must be an array");
  for (const [index, finding] of (document?.findings || []).entries()) {
    if (!finding?.id || !["P0", "P1", "P2", "P3"].includes(finding?.severity)) errors.push(`findings[${index}] has invalid identity or severity`);
    if (!["High", "Medium", "Low"].includes(finding?.confidence)) errors.push(`findings[${index}] has invalid confidence`);
    for (const key of ["expected", "actual", "impact", "recommendedFix", "verification"]) {
      if (!String(finding?.[key] || "").trim()) errors.push(`findings[${index}].${key} is required`);
    }
    if (!Array.isArray(finding?.reproduction) || !finding.reproduction.length) errors.push(`findings[${index}].reproduction is required`);
    if (!Array.isArray(finding?.evidence) || !finding.evidence.length) errors.push(`findings[${index}].evidence is required`);
  }
  return { valid: errors.length === 0, errors };
}

function parseArgs(argv) {
  const options = {
    engine: "chromium",
    matrix: "smoke",
    baseUrl: "",
    out: "",
    axeModule: "",
    screenshots: false,
    port: Number(process.env.HIG_AUDIT_PORT || 4209),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--screenshots") options.screenshots = true;
    else if (argument === "--out") options.out = argv[++index] || "";
    else if (argument === "--base-url") options.baseUrl = argv[++index] || "";
    else if (argument === "--engine") options.engine = argv[++index] || "";
    else if (argument === "--matrix") options.matrix = argv[++index] || "";
    else if (argument === "--port") options.port = Number(argv[++index]);
    else if (argument === "--axe-module") {
      const candidate = argv[index + 1];
      options.axeModule = candidate && !candidate.startsWith("--") ? argv[++index] : "@axe-core/playwright";
    } else {
      throw new TypeError(`Unknown argument: ${argument}`);
    }
  }
  if (options.help) return options;
  if (!options.out) throw new TypeError("--out is required");
  if (!VALID_ENGINES.has(options.engine)) throw new TypeError("--engine must be chromium or webkit");
  if (!VALID_MATRIX_NAMES.has(options.matrix)) throw new TypeError("--matrix must be smoke, core, or full");
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new TypeError("--port must be an integer from 1024 to 65535");
  return options;
}

function usage() {
  return `Usage: node tooling/hig-browser-audit.mjs --out DIR [options]\n\nOptions:\n  --base-url URL             Audit an already-running server (otherwise npm start is used)\n  --engine chromium|webkit   Playwright engine (default: chromium)\n  --matrix smoke|core|full   Environment matrix (default: smoke)\n  --axe-module [SPECIFIER]   Run AxeBuilder from the optional module\n  --screenshots              Save viewport screenshots for opened surfaces\n  --port PORT                Owned local-server port (default: 4209)\n`;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/*$/, "/");
  url.search = "";
  url.hash = "";
  return url.href;
}

async function waitForServer(baseUrl, child, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) throw new Error(`npm start exited with code ${child.exitCode}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await new Promise((settle) => setTimeout(settle, 250));
  }
  throw new Error(`Timed out waiting for ${baseUrl}: ${lastError}`);
}

async function startOwnedServer(port) {
  const output = [];
  const child = spawn("npm", ["start"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const collect = (chunk) => {
    output.push(String(chunk));
    if (output.length > 80) output.splice(0, output.length - 80);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const baseUrl = `http://127.0.0.1:${port}/`;
  try {
    await waitForServer(baseUrl, child);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n${output.join("")}`);
  }
  return { baseUrl, child, output };
}

async function stopOwnedServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((settle) => child.once("exit", settle)),
    new Promise((settle) => setTimeout(settle, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function sha256File(path) {
  try {
    return createHash("sha256").update(await readFile(path)).digest("hex");
  } catch {
    return "";
  }
}

async function sha256Response(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return "";
    return createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
  } catch {
    return "";
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function gitValue(args) {
  return new Promise((settle) => {
    const child = spawn("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] });
    let value = "";
    child.stdout.on("data", (chunk) => { value += chunk; });
    child.on("exit", (code) => settle(code === 0 ? value.trim() : ""));
  });
}

async function collectSourceMetadata(baseUrl, serverMode) {
  const packageJson = await readJson(join(ROOT, "package.json"));
  const buildInfo = await readJson(join(ROOT, "build-info.json"));
  let liveVersion = null;
  try {
    const response = await fetch(new URL("api/version", baseUrl), { signal: AbortSignal.timeout(10_000) });
    if (response.ok) liveVersion = await response.json();
  } catch {}
  return {
    sourceCommit: await gitValue(["rev-parse", "HEAD"]),
    branch: await gitValue(["branch", "--show-current"]),
    packageVersion: packageJson?.version || "",
    build: buildInfo?.build || buildInfo?.buildNumber || "",
    serverMode,
    baseUrl,
    liveVersion,
    localHashes: {
      appBundle: await sha256File(join(ROOT, "apps/desktop/app.bundle.js")),
      stylesBundle: await sha256File(join(ROOT, "apps/desktop/styles.bundle.css")),
    },
    servedHashes: {
      appBundle: await sha256Response(new URL("app.bundle.js", baseUrl)),
      stylesBundle: await sha256Response(new URL("styles.bundle.css", baseUrl)),
    },
  };
}

function kebabCase(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

function actionCandidates(name) {
  const actions = new Set(WINDOW_ACTION_OVERRIDES[name] || []);
  actions.add(`open-${kebabCase(name)}`);
  return [...actions].filter(Boolean);
}

async function visibleSurfaceState(page, name) {
  return page.evaluate((windowName) => {
    const surface = document.querySelector(`[data-window="${CSS.escape(windowName)}"]`);
    if (!surface) return { found: false, visible: false, active: false };
    const style = getComputedStyle(surface);
    const rect = surface.getBoundingClientRect();
    const visible = !surface.hidden
      && !surface.classList.contains("is-hidden")
      && !surface.classList.contains("is-app-hidden")
      && !surface.classList.contains("is-collapsed")
      && style.display !== "none"
      && style.visibility !== "hidden"
      && rect.width > 0
      && rect.height > 0;
    return { found: true, visible, active: surface.classList.contains("is-active") };
  }, name);
}

async function revealMenuForLocator(locator) {
  const menu = locator.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' menu ')][1]");
  if (!await menu.count()) return false;
  const toggle = menu.locator(":scope > button").first();
  if (!await toggle.isVisible().catch(() => false)) return false;
  await toggle.click({ timeout: 3_000 });
  return true;
}

async function clickLocatorAsUser(locator) {
  const metadata = await locator.evaluate((element) => ({
    desktop: element.matches(".desktop-icon") || !!element.closest(".icon-column"),
    staticFinder: element.hasAttribute("data-static-finder-action"),
  }));
  if (metadata.desktop || metadata.staticFinder) {
    await locator.dblclick({ timeout: 5_000 });
    return metadata.desktop ? "desktop-double-click" : "finder-double-click";
  }
  await locator.click({ timeout: 5_000 });
  return "control-click";
}

async function clickEntrySelector(page, selector, ancestry, depth) {
  const candidates = page.locator(selector);
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    let candidate = candidates.nth(index);
    if (!await candidate.isVisible().catch(() => false)) {
      await revealMenuForLocator(candidate).catch(() => false);
    }
    if (!await candidate.isVisible().catch(() => false)) {
      const owner = await candidate.evaluate((element) => element.closest("[data-window]")?.dataset.window || "").catch(() => "");
      if (owner && !ancestry.has(owner) && depth < 4) {
        const opened = await openSurfaceThroughRealEntry(page, owner, new Set([...ancestry]), depth + 1);
        if (opened.status === "tested") candidate = page.locator(selector).nth(index);
      }
    }
    if (!await candidate.isVisible().catch(() => false)) continue;
    if (await candidate.isDisabled().catch(() => false)) continue;
    try {
      return { clicked: true, entryKind: await clickLocatorAsUser(candidate), selector };
    } catch {}
  }
  return { clicked: false, entryKind: "", selector };
}

async function openSurfaceThroughRealEntry(page, name, ancestry = new Set(), depth = 0) {
  if (ancestry.has(name)) return classifyWindowOpen({ surfaceFound: false, visible: false, entryAttempted: false, reason: "entry-cycle" });
  ancestry.add(name);
  const before = await visibleSurfaceState(page, name);
  if (before.visible) return { ...classifyWindowOpen({ surfaceFound: true, visible: true, entryAttempted: false, entryKind: "initial-state", active: before.active }), selector: "" };

  const selectors = [
    `[data-open="${name}"]`,
    ...actionCandidates(name).flatMap((action) => [
      `[data-action="${action}"]`,
      `[data-static-finder-action="${action}"]`,
    ]),
  ];
  let attempted = false;
  let lastEntry = { entryKind: "", selector: "" };
  for (const selector of selectors) {
    const entry = await clickEntrySelector(page, selector, ancestry, depth);
    if (!entry.clicked) continue;
    attempted = true;
    lastEntry = entry;
    try {
      await page.waitForFunction((windowName) => {
        const surface = document.querySelector(`[data-window="${CSS.escape(windowName)}"]`);
        if (!surface) return false;
        const rect = surface.getBoundingClientRect();
        const style = getComputedStyle(surface);
        return !surface.hidden
          && !surface.classList.contains("is-hidden")
          && !surface.classList.contains("is-app-hidden")
          && !surface.classList.contains("is-collapsed")
          && style.display !== "none"
          && style.visibility !== "hidden"
          && rect.width > 0
          && rect.height > 0;
      }, name, { timeout: 10_000 });
    } catch {}
    const after = await visibleSurfaceState(page, name);
    if (after.visible) {
      return {
        ...classifyWindowOpen({
          surfaceFound: true,
          visible: true,
          entryAttempted: true,
          entryKind: entry.entryKind,
          active: after.active,
        }),
        selector: entry.selector,
      };
    }
  }
  const after = await visibleSurfaceState(page, name);
  return {
    ...classifyWindowOpen({
      surfaceFound: after.found || before.found,
      visible: after.visible,
      entryAttempted: attempted,
      entryKind: lastEntry.entryKind,
      active: after.active,
    }),
    selector: lastEntry.selector,
  };
}

async function clickActionThroughRealEntry(page, action) {
  for (const selector of [`[data-action="${action}"]`, `[data-static-finder-action="${action}"]`]) {
    const result = await clickEntrySelector(page, selector, new Set(), 0);
    if (result.clicked) return result;
  }
  return { clicked: false, entryKind: "", selector: "" };
}

async function configureLanguage(page, language) {
  const desired = language === "zh" ? "zh-Hans" : "en";
  const current = await page.locator("html").getAttribute("lang");
  if (current === desired || (language === "zh" && current?.startsWith("zh"))) return { status: "configured", entryKind: "initial-state" };
  const entry = await clickActionThroughRealEntry(page, "switch-language");
  if (!entry.clicked) return { status: "not-tested", reason: "language-switch-entry-unavailable" };
  try {
    await page.waitForFunction((expected) => document.documentElement.lang === expected || (expected === "zh-Hans" && document.documentElement.lang.startsWith("zh")), desired, { timeout: 5_000 });
    return { status: "configured", entryKind: entry.entryKind };
  } catch {
    return { status: "not-tested", reason: "language-switch-did-not-set-requested-language", entryKind: entry.entryKind };
  }
}

async function closeSurfaceThroughChrome(page, name) {
  const close = page.locator(`[data-window="${name}"] .close-box`).first();
  if (!await close.isVisible().catch(() => false)) return false;
  try {
    await close.click({ timeout: 3_000 });
    await page.waitForTimeout(50);
    return !(await visibleSurfaceState(page, name)).visible;
  } catch {
    return false;
  }
}

async function dismissAuditBlockingDialogs(page) {
  // Audit isolation only: dismiss a dialog through its explicit Cancel path.
  // Never accept an arbitrary modal here, because doing so can commit data or
  // erase the error state the next surface needs to observe.
  for (let pass = 0; pass < 12; pass += 1) {
    const dialog = page.locator("dialog[open]").first();
    if (!await dialog.count()) break;
    const cancel = dialog.locator([
      "#system-modal-cancel",
      "button[value='cancel']",
      "button[data-action*='cancel']",
      "button[data-i18n*='cancel']",
    ].join(", ")).first();
    try {
      if (await cancel.isVisible().catch(() => false)) await cancel.click({ timeout: 2_000 });
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(50);
    } catch {
      break;
    }
  }
}

async function settleDesktopThroughChrome(page) {
  // A restored or startup window may cover desktop launchers. Close only
  // through visible title-bar controls; never rewrite visibility classes.
  for (let pass = 0; pass < 8; pass += 1) {
    const visibleWindow = page.locator(".window:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)").filter({ visible: true }).last();
    if (!await visibleWindow.count()) break;
    const name = await visibleWindow.getAttribute("data-window");
    const close = visibleWindow.locator(".close-box").first();
    if (!name || !await close.isVisible().catch(() => false)) break;
    try {
      await close.click({ timeout: 2_000 });
      await page.waitForTimeout(50);
    } catch {
      break;
    }
  }
}

async function configureTheme(page, theme) {
  const current = await page.evaluate(() => window.AISystem6Theme?.getCurrentTheme?.() || "classic");
  if (current === theme) return { status: "configured", entryKind: "initial-state" };
  const control = await openSurfaceThroughRealEntry(page, "control");
  if (control.status !== "tested") return { status: "not-tested", reason: "control-panel-entry-unavailable" };
  const generalTab = page.locator("#control-tab-general");
  const select = page.locator("#appearance-theme");
  try {
    await generalTab.click({ timeout: 5_000 });
    await select.selectOption(theme, { timeout: 5_000 });
    await page.waitForFunction((expected) => window.AISystem6Theme?.getCurrentTheme?.() === expected, theme, { timeout: 5_000 });
    await closeSurfaceThroughChrome(page, "control");
    return { status: "configured", entryKind: control.entryKind };
  } catch (error) {
    return { status: "not-tested", reason: `theme-selection-failed: ${error.message}`, entryKind: control.entryKind };
  }
}

async function ensureWritingWorkspace(page) {
  const profile = await page.locator("body").getAttribute("data-workspace-profile");
  if (profile === "writing") return { status: "configured", entryKind: "initial-state" };
  const toggle = page.locator("#finder-writing-studio-toggle");
  if (!await toggle.isVisible().catch(() => false)) return { status: "not-tested", reason: "writing-studio-entry-unavailable" };
  try {
    await clickLocatorAsUser(toggle);
    await page.waitForFunction(() => document.body.dataset.workspaceProfile === "writing", null, { timeout: 10_000 });
    return { status: "configured", entryKind: "desktop-double-click" };
  } catch (error) {
    return { status: "not-tested", reason: `writing-workspace-entry-failed: ${error.message}` };
  }
}

async function applyStressEnvironment(page, environment) {
  if (environment.textScale !== 1) {
    await page.addStyleTag({ content: `html { font-size: ${environment.textScale * 100}% !important; }` });
  }
  if (environment.textSpacing) {
    await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }" });
  }
}

async function collectSurfaceMeasurements(page, name) {
  return page.evaluate((windowName) => {
    const surface = document.querySelector(`[data-window="${CSS.escape(windowName)}"]`);
    if (!surface) return null;
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden
        && !element.closest("[hidden]")
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number.parseFloat(style.opacity || "1") > 0
        && rect.width > 0
        && rect.height > 0;
    };
    const rectObject = (rect) => ({
      x: Math.round(rect.x * 100) / 100,
      y: Math.round(rect.y * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      right: Math.round(rect.right * 100) / 100,
      bottom: Math.round(rect.bottom * 100) / 100,
    });
    const accessibleName = (element) => {
      const direct = element.getAttribute("aria-label");
      if (direct?.trim()) return direct.trim();
      const labelledBy = (element.getAttribute("aria-labelledby") || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() || "")
        .filter(Boolean)
        .join(" ");
      if (labelledBy) return labelledBy;
      if (element.id) {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
      }
      return String(element.getAttribute("title") || element.getAttribute("placeholder") || element.textContent || element.value || "").trim();
    };
    const selectorFor = (element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      if (element.dataset.action) return `[data-action="${CSS.escape(element.dataset.action)}"]`;
      const tag = element.tagName.toLowerCase();
      const siblings = [...element.parentElement?.children || []].filter((item) => item.tagName === element.tagName);
      return `${tag}:nth-of-type(${Math.max(1, siblings.indexOf(element) + 1)})`;
    };
    const interactiveSelector = [
      "a[href]", "button", "input", "select", "textarea", "summary",
      "[role='button']", "[role='link']", "[role='menuitem']", "[role='option']",
      "[role='checkbox']", "[role='radio']", "[role='switch']", "[role='slider']", "[tabindex]",
    ].join(",");
    const controls = [...surface.querySelectorAll(interactiveSelector)].filter(visible).map((element) => {
      const rect = element.getBoundingClientRect();
      const center = {
        x: Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2)),
        y: Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2)),
      };
      const hit = document.elementFromPoint(center.x, center.y);
      const hitMatches = !!hit && (hit === element || element.contains(hit) || hit.contains(element));
      const inlineTextExceptionCandidate = element.matches("a[href]") && !!element.closest("p,li,dd,dt,blockquote");
      return {
        selector: selectorFor(element),
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role") || "",
        action: element.dataset.action || element.dataset.staticFinderAction || element.dataset.open || "",
        accessibleName: accessibleName(element),
        disabled: !!element.disabled || element.getAttribute("aria-disabled") === "true",
        tabIndex: element.tabIndex,
        rect: rectObject(rect),
        target: {
          below24: rect.width < 24 || rect.height < 24,
          below44: rect.width < 44 || rect.height < 44,
          inlineTextExceptionCandidate,
        },
        hitTest: {
          center,
          matches: hitMatches,
          hitTag: hit?.tagName?.toLowerCase() || "",
          hitId: hit?.id || "",
        },
      };
    });
    const overflow = [surface, ...surface.querySelectorAll("*")].filter(visible).map((element) => {
      const style = getComputedStyle(element);
      const horizontal = element.scrollWidth > element.clientWidth + 1;
      const vertical = element.scrollHeight > element.clientHeight + 1;
      const clipsX = horizontal && ["hidden", "clip"].includes(style.overflowX);
      const clipsY = vertical && ["hidden", "clip"].includes(style.overflowY);
      if (!horizontal && !vertical) return null;
      return {
        selector: selectorFor(element),
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        clipsX,
        clipsY,
      };
    }).filter(Boolean).slice(0, 100);
    const surfaceRect = surface.getBoundingClientRect();
    const liveRegions = [...surface.querySelectorAll("[aria-live], [role='status'], [role='alert'], [role='log'], [role='progressbar']")].map((element) => ({
      selector: selectorFor(element),
      role: element.getAttribute("role") || "",
      ariaLive: element.getAttribute("aria-live") || "",
      ariaBusy: element.getAttribute("aria-busy") || "",
      text: String(element.textContent || "").trim().slice(0, 500),
    }));
    return {
      surface: {
        rect: rectObject(surfaceRect),
        active: surface.classList.contains("is-active"),
        role: surface.getAttribute("role") || "",
        accessibleName: accessibleName(surface),
        clippedByViewport: surfaceRect.left < -1 || surfaceRect.top < -1 || surfaceRect.right > innerWidth + 1 || surfaceRect.bottom > innerHeight + 1,
      },
      viewport: { width: innerWidth, height: innerHeight },
      controls,
      focusable: controls.filter((control) => !control.disabled && control.tabIndex >= 0).map((control) => control.selector),
      liveRegions,
      overflow,
      document: {
        lang: document.documentElement.lang,
        theme: window.AISystem6Theme?.getCurrentTheme?.() || "",
        workspaceProfile: document.body.dataset.workspaceProfile || "",
      },
    };
  }, name);
}

async function collectRotationState(page, name) {
  return page.evaluate((windowName) => {
    const surface = document.querySelector(`[data-window="${CSS.escape(windowName)}"]`);
    if (!surface) return null;
    const writable = [...surface.querySelectorAll("textarea, input:not([type='button']):not([type='submit']):not([type='file']):not([type='checkbox']):not([type='radio'])")]
      .find((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return !element.disabled
          && !element.readOnly
          && !element.closest("[hidden], .is-hidden")
          && rect.width > 0
          && rect.height > 0
          && style.display !== "none"
          && style.visibility !== "hidden";
      });
    const selectorFor = (element) => element?.id ? `#${CSS.escape(element.id)}` : "";
    const scrolling = [...surface.querySelectorAll("*")].filter((element) => element.scrollTop > 0 || element.scrollLeft > 0).map((element) => ({
      selector: selectorFor(element),
      top: element.scrollTop,
      left: element.scrollLeft,
    })).filter((entry) => entry.selector);
    return {
      writable: writable ? {
        selector: selectorFor(writable),
        value: writable.value,
        selectionStart: typeof writable.selectionStart === "number" ? writable.selectionStart : null,
        selectionEnd: typeof writable.selectionEnd === "number" ? writable.selectionEnd : null,
      } : null,
      focused: selectorFor(document.activeElement),
      scrolling,
      openDialogs: [...document.querySelectorAll("dialog[open]")].map((element) => element.id || element.getAttribute("aria-label") || "dialog"),
      openMenus: [...document.querySelectorAll(".menu.is-open")].map((element) => element.querySelector(":scope > button")?.getAttribute("aria-label") || "menu"),
      busy: [...surface.querySelectorAll("[aria-busy='true']")].map((element) => element.id || element.getAttribute("role") || element.tagName.toLowerCase()),
    };
  }, name);
}

async function runRotationProbe(page, name, environment) {
  if (environment.orientation !== "portrait") return createNotTestedProof("rotation is exercised from portrait environments only");
  const beforeWritable = await page.evaluate((windowName) => {
    const surface = document.querySelector(`[data-window="${CSS.escape(windowName)}"]`);
    const element = [...surface?.querySelectorAll("textarea, input:not([type='button']):not([type='submit']):not([type='file']):not([type='checkbox']):not([type='radio'])") || []]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return !candidate.disabled
          && !candidate.readOnly
          && !candidate.closest("[hidden], .is-hidden")
          && rect.width > 0
          && rect.height > 0
          && style.display !== "none"
          && style.visibility !== "hidden";
      });
    if (!element) return null;
    if (!element.id) element.id = `hig-audit-rotation-${windowName}`;
    return { selector: `#${CSS.escape(element.id)}`, originalValue: element.value };
  }, name);
  const marker = `HIG rotation ${name}`;
  if (beforeWritable?.selector) {
    const field = page.locator(beforeWritable.selector);
    try {
      await field.fill(marker, { timeout: 2_000 });
      await field.evaluate((element) => {
        element.focus();
        if (typeof element.setSelectionRange === "function") element.setSelectionRange(4, 12);
      });
    } catch {
      beforeWritable.selector = "";
    }
  }
  const before = await collectRotationState(page, name);
  await page.setViewportSize({ width: environment.viewport.height, height: environment.viewport.width });
  await page.waitForTimeout(150);
  const after = await collectRotationState(page, name);
  await page.setViewportSize({ ...environment.viewport });
  await page.waitForTimeout(100);
  const comparisons = {
    text: before?.writable ? after?.writable?.value === before.writable.value : null,
    selection: before?.writable && before.writable.selectionStart !== null
      ? after?.writable?.selectionStart === before.writable.selectionStart && after?.writable?.selectionEnd === before.writable.selectionEnd
      : null,
    focus: before?.focused ? after?.focused === before.focused : null,
    dialogs: JSON.stringify(after?.openDialogs || []) === JSON.stringify(before?.openDialogs || []),
    menus: JSON.stringify(after?.openMenus || []) === JSON.stringify(before?.openMenus || []),
    busy: JSON.stringify(after?.busy || []) === JSON.stringify(before?.busy || []),
    scroll: JSON.stringify(after?.scrolling || []) === JSON.stringify(before?.scrolling || []),
  };
  const applicable = Object.values(comparisons).filter((value) => value !== null);
  return {
    status: applicable.every(Boolean) ? "tested" : "error",
    execution: "automated",
    environment: "emulated",
    conclusion: applicable.every(Boolean) ? "retained-in-emulation" : "state-loss-observed-in-emulation",
    before,
    after,
    comparisons,
    exclusions: {
      pointerCapture: "not-tested: requires a feature-specific active drag",
      gameState: "not-tested: no generic semantic game-state interface",
      softwareKeyboard: "not-tested: requires iOS/iPadOS hardware",
    },
  };
}

async function loadAxeBuilder(specifier) {
  if (!specifier) return null;
  const module = await import(specifier);
  const AxeBuilder = module.default || module.AxeBuilder;
  if (typeof AxeBuilder !== "function") throw new TypeError(`${specifier} does not export AxeBuilder`);
  return AxeBuilder;
}

async function runAxe(page, name, AxeBuilder) {
  if (!AxeBuilder) return createNotTestedProof("axe module was not requested");
  try {
    const result = await new AxeBuilder({ page }).include(`[data-window="${name}"]`).analyze();
    return {
      status: "tested",
      execution: "automated",
      environment: "emulated",
      conclusion: result.violations.length ? "violations-found" : "no-violations-found",
      violations: result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html.slice(0, 500), failureSummary: node.failureSummary })),
      })),
    };
  } catch (error) {
    return { ...createNotTestedProof(`axe execution failed: ${error.message}`), status: "error" };
  }
}

function findingId(code, recordId, detail = "") {
  const suffix = createHash("sha256").update(`${code}\0${recordId}\0${detail}`).digest("hex").slice(0, 10).toUpperCase();
  return `HIG-${code}-${suffix}`;
}

function baseFinding(record, code, detail, values) {
  return {
    id: findingId(code, record.id, detail),
    code,
    severity: values.severity,
    confidence: values.confidence || "High",
    surface: record.surface.name,
    environments: [record.environmentId],
    expected: values.expected,
    actual: values.actual,
    impact: values.impact,
    reproduction: [
      `Run the ${record.environment.engine} ${record.environmentId} audit environment.`,
      record.open.selector ? `Activate the real entry ${record.open.selector}.` : "Attempt to locate and activate a real user entry.",
      values.reproduction,
    ],
    evidence: [`coverage-matrix.json#/records/${record.id}`],
    recommendedFix: values.recommendedFix,
    verification: values.verification,
  };
}

function findingsForRecord(record) {
  const findings = [];
  if (record.proof.status === "not-tested") {
    findings.push(baseFinding(record, "COVERAGE", record.proof.reason, {
      severity: "P2",
      expected: "The production surface is reachable through a real user entry and can be measured.",
      actual: `The surface was not tested: ${record.proof.reason}.`,
      impact: "The interaction surface has no runtime mobile/tablet evidence in this environment.",
      reproduction: "Observe that no tested open state is recorded.",
      recommendedFix: "Restore or document a reachable user entry, then rerun the same matrix cell.",
      verification: "The record must become tested through a click/double-click entry without manipulating hidden classes.",
    }));
    return findings;
  }
  if (record.proof.status === "error") {
    findings.push(baseFinding(record, "RUNNER", record.proof.reason, {
      severity: "P2",
      expected: "The automated audit completes and emits measurements.",
      actual: record.proof.reason,
      impact: "The environment has incomplete evidence.",
      reproduction: "Observe the recorded runner error.",
      recommendedFix: "Resolve the runtime or harness failure without bypassing the real entry path.",
      verification: "Rerun this exact environment until measurements are emitted.",
    }));
    return findings;
  }
  const measurements = record.measurements;
  if (measurements?.surface?.clippedByViewport) {
    findings.push(baseFinding(record, "REFLOW", "surface", {
      severity: "P1",
      expected: "The primary task and escape path remain inside the supported viewport after reflow.",
      actual: `Surface bounds ${JSON.stringify(measurements.surface.rect)} exceed ${measurements.viewport.width}x${measurements.viewport.height}.`,
      impact: "Content or the close path can become unreachable on a supported orientation or multitasking width.",
      reproduction: "Compare the surface rectangle with the viewport rectangle.",
      recommendedFix: "Repair the owned responsive/container layout while preserving the System 6 object grammar.",
      verification: "Repeat geometry and elementFromPoint measurements at this viewport and adjacent breakpoints.",
    }));
  }
  for (const control of measurements?.controls || []) {
    if (!control.accessibleName) {
      findings.push(baseFinding(record, "NAME", control.selector, {
        severity: "P1",
        expected: "Every operable control exposes a programmatic accessible name.",
        actual: `${control.selector} has no computed audit name.`,
        impact: "Assistive-technology users cannot identify the control's purpose.",
        reproduction: `Inspect ${control.selector}'s label, aria-label, aria-labelledby, title, and text.`,
        recommendedFix: "Add an object-specific accessible name without adding touch-only visible labels to menu-bar glyph buttons.",
        verification: "Confirm the accessibility tree exposes the intended name, then obtain a VoiceOver receipt.",
      }));
    }
    if (control.target.below24 && !control.target.inlineTextExceptionCandidate) {
      findings.push(baseFinding(record, "TARGET24", control.selector, {
        severity: "P1",
        expected: "A non-exempt pointer target is at least 24 by 24 CSS pixels and has no overlapping owned target.",
        actual: `${control.selector} measures ${control.rect.width}x${control.rect.height} CSS pixels.`,
        impact: "The action may be unavailable to users with limited touch precision.",
        reproduction: `Read the bounding rectangle and center hit test for ${control.selector}.`,
        recommendedFix: "Increase the owned hit region without enlarging or smoothing the classic visible glyph.",
        verification: "Measure a non-overlapping 24x24 minimum and target 44x44 comfort region under coarse pointer.",
      }));
    } else if (control.target.below44 && !control.target.inlineTextExceptionCandidate) {
      findings.push(baseFinding(record, "TARGET44", control.selector, {
        severity: "P2",
        expected: "Coarse-pointer controls provide a 44 by 44 CSS pixel comfort hit region while preserving the classic glyph size.",
        actual: `${control.selector} measures ${control.rect.width}x${control.rect.height} CSS pixels.`,
        impact: "The control meets or approaches the WCAG floor but remains uncomfortable on touch hardware.",
        reproduction: `Read the bounding rectangle for ${control.selector}.`,
        recommendedFix: "Expand only the owned hit region and confirm it does not overlap neighboring controls.",
        verification: "Measure 44x44 under coarse pointer and repeat elementFromPoint checks for adjacent targets.",
      }));
    }
    if (!control.hitTest.matches) {
      findings.push(baseFinding(record, "HIT", control.selector, {
        severity: "P1",
        expected: "The control or one of its descendants owns the center hit point.",
        actual: `${control.selector}'s center resolves to ${control.hitTest.hitTag}${control.hitTest.hitId ? `#${control.hitTest.hitId}` : ""}.`,
        impact: "A visible action can be intercepted or inoperable.",
        reproduction: `Call elementFromPoint at ${control.hitTest.center.x}, ${control.hitTest.center.y}.`,
        recommendedFix: "Correct activation/z-order or the responsible overlay in its owning layer.",
        verification: "Bring the window front through the real entry and confirm the center resolves inside the target in both themes.",
      }));
    }
  }
  for (const overflow of measurements?.overflow || []) {
    if (!overflow.clipsX && !overflow.clipsY) continue;
    findings.push(baseFinding(record, "OVERFLOW", overflow.selector, {
      severity: "P2",
      expected: "Content reflows or has an operable scrolling path instead of being clipped.",
      actual: `${overflow.selector} is ${overflow.clientWidth}x${overflow.clientHeight}, scrolls to ${overflow.scrollWidth}x${overflow.scrollHeight}, and clips overflow.`,
      impact: "Localized content or actions can be hidden at this size/language/theme combination.",
      reproduction: `Compare scroll and client dimensions for ${overflow.selector}.`,
      recommendedFix: "Repair the owned responsive layout or provide an explicit scrolling container.",
      verification: "Repeat the overflow measurement in English, Chinese, portrait, landscape, and adjacent breakpoints.",
    }));
  }
  if (record.rotation?.status === "error") {
    findings.push(baseFinding(record, "ROTATION", "state", {
      severity: "P1",
      expected: "Rotation changes geometry without losing unsaved text, selection, focus, dialog/menu state, pending state, or scroll state.",
      actual: `The emulated rotation comparison failed: ${JSON.stringify(record.rotation.comparisons)}.`,
      impact: "A supported orientation change can interrupt or destroy in-progress work.",
      reproduction: "Enter the disposable marker, rotate in the same context, and compare the before/after state snapshot.",
      recommendedFix: "Preserve state independently of responsive rendering and avoid reinitializing the surface on resize.",
      verification: "Pass the same-session emulated probe and then capture an iPhone/iPad hardware rotation receipt.",
    }));
  }
  for (const violation of record.axe?.violations || []) {
    findings.push(baseFinding(record, "AXE", violation.id, {
      severity: ["critical", "serious"].includes(violation.impact) ? "P1" : violation.impact === "moderate" ? "P2" : "P3",
      expected: `The surface passes axe rule ${violation.id}.`,
      actual: `${violation.nodes.length} node(s) fail: ${violation.help}.`,
      impact: "The automated accessibility rule reports a standards risk that requires product-context review.",
      reproduction: `Run axe rule ${violation.id} against the opened surface.`,
      recommendedFix: `Resolve the rule using ${violation.helpUrl}, while preserving the product and historical UI contracts.`,
      verification: "Rerun axe and complete the corresponding assistive-technology manual script where applicable.",
    }));
  }
  if ((record.errors?.page || []).length || (record.errors?.console || []).length) {
    findings.push(baseFinding(record, "RUNTIME", "console-page", {
      severity: "P2",
      expected: "Opening and measuring the surface produces no page exception or error-level console message.",
      actual: JSON.stringify(record.errors),
      impact: "A runtime failure can hide feedback, prevent an action, or invalidate audit evidence.",
      reproduction: "Open the surface through the recorded entry and inspect page/console errors.",
      recommendedFix: "Diagnose the failing runtime path with a bounded probe before changing UI behavior.",
      verification: "Repeat the exact engine/environment cell with an empty error slice.",
    }));
  }
  return findings;
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function recordId(surface, environment, engine) {
  return `${engine}:${environment.id}:${surface}`;
}

function manualCapabilityRecords(engine) {
  return MANUAL_ONLY_CAPABILITIES.map((capability) => ({
    ...capability,
    status: "not-tested",
    proof: {
      execution: "manual-required",
      environment: "real-device-required",
      conclusion: "not-tested",
      engine,
    },
  }));
}

async function auditEnvironment({ browser, environment, engine, baseUrl, surfaces, out, screenshots, AxeBuilder }) {
  const context = await browser.newContext(createContextOptions(environment));
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ text: message.text(), location: message.location() });
  });
  page.on("pageerror", (error) => pageErrors.push({ name: error.name, message: error.message, stack: error.stack || "" }));
  const records = [];
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(() => !document.body.classList.contains("is-booting"), null, { timeout: 30_000 }).catch(() => {});
    await applyStressEnvironment(page, environment);
    const language = await configureLanguage(page, environment.language);
    const theme = await configureTheme(page, environment.theme);
    await settleDesktopThroughChrome(page);

    for (const surface of surfaces) {
      await dismissAuditBlockingDialogs(page);
      const consoleStart = consoleErrors.length;
      const pageStart = pageErrors.length;
      let workspace = { status: "configured", entryKind: "not-required" };
      if (surface.contract.role === "writing-route") workspace = await ensureWritingWorkspace(page);
      let open = null;
      let proof = null;
      let measurements = null;
      let rotation = createNotTestedProof("surface did not reach the rotation probe");
      let axe = createNotTestedProof("surface did not reach the axe probe");
      const evidence = [];
      try {
        if (language.status !== "configured") {
          open = classifyWindowOpen({ surfaceFound: false, visible: false, entryAttempted: false, reason: language.reason });
        } else if (theme.status !== "configured") {
          open = classifyWindowOpen({ surfaceFound: false, visible: false, entryAttempted: false, reason: theme.reason });
        } else if (workspace.status !== "configured") {
          open = classifyWindowOpen({ surfaceFound: false, visible: false, entryAttempted: false, reason: workspace.reason });
        } else {
          open = await openSurfaceThroughRealEntry(page, surface.name);
        }
        proof = open.status === "tested"
          ? { status: "tested", execution: "automated", environment: "emulated", conclusion: "opened-and-measured" }
          : createNotTestedProof(open.reason);
        if (open.status === "tested") {
          measurements = await collectSurfaceMeasurements(page, surface.name);
          rotation = await runRotationProbe(page, surface.name, environment);
          axe = await runAxe(page, surface.name, AxeBuilder);
          if (screenshots) {
            const screenshotPath = join(out, "screenshots", engine, environment.id, `${surface.name}.png`);
            await mkdir(dirname(screenshotPath), { recursive: true });
            await page.screenshot({ path: screenshotPath, fullPage: false });
            evidence.push(relative(out, screenshotPath));
          }
        }
      } catch (error) {
        proof = {
          status: "error",
          execution: "automated",
          environment: "emulated",
          conclusion: "error",
          reason: error?.stack || error?.message || String(error),
        };
        open ||= classifyWindowOpen({ surfaceFound: false, visible: false, entryAttempted: false, reason: "runner-error" });
      }
      records.push({
        id: recordId(surface.name, environment, engine),
        surface,
        environmentId: environment.id,
        environment: { ...environment, engine },
        configuration: { language, theme, workspace },
        open,
        proof,
        measurements,
        rotation,
        axe,
        errors: {
          console: consoleErrors.slice(consoleStart),
          page: pageErrors.slice(pageStart),
        },
        evidence,
      });
      await closeSurfaceThroughChrome(page, surface.name);
      await dismissAuditBlockingDialogs(page);
    }
  } finally {
    await context.close();
  }
  return records;
}

export async function runAudit(options) {
  const outputRoot = resolve(options.out);
  await mkdir(outputRoot, { recursive: true });
  let ownedServer = null;
  const serverMode = options.baseUrl ? "external-read-only" : "owned-npm-start";
  if (!options.baseUrl) ownedServer = await startOwnedServer(options.port);
  const baseUrl = normalizeBaseUrl(options.baseUrl || ownedServer.baseUrl);
  let browser = null;
  try {
    const playwright = await import("@playwright/test");
    const browserType = playwright[options.engine];
    if (!browserType) throw new TypeError(`Playwright engine is unavailable: ${options.engine}`);
    const AxeBuilder = await loadAxeBuilder(options.axeModule);
    browser = await browserType.launch({ headless: true });
    const environments = buildAuditMatrix(options.matrix);
    const surfaces = productionSurfaceContracts();
    const source = await collectSourceMetadata(baseUrl, serverMode);
    const coverage = {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      kind: "ai-system-6-hig-coverage-matrix",
      generatedAt: new Date().toISOString(),
      source,
      run: {
        engine: options.engine,
        matrix: options.matrix,
        baseUrl,
        screenshots: options.screenshots,
        axeModule: options.axeModule || null,
        execution: "automated",
        environment: "emulated",
      },
      environments: environments.map((environment) => ({ ...environment, engine: options.engine })),
      surfaces,
      records: [],
      manualCapabilities: manualCapabilityRecords(options.engine),
    };
    for (const environment of environments) {
      process.stdout.write(`Auditing ${options.engine} ${environment.id} (${surfaces.length} surfaces)...\n`);
      const records = await auditEnvironment({
        browser,
        environment,
        engine: options.engine,
        baseUrl,
        surfaces,
        out: outputRoot,
        screenshots: options.screenshots,
        AxeBuilder,
      });
      coverage.records.push(...records);
      await writeJsonAtomic(join(outputRoot, "coverage-matrix.json"), coverage);
    }
    const findings = {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      kind: "ai-system-6-hig-browser-findings",
      generatedAt: new Date().toISOString(),
      source,
      run: coverage.run,
      findings: coverage.records.flatMap(findingsForRecord).sort((a, b) =>
        a.severity.localeCompare(b.severity) || a.surface.localeCompare(b.surface) || a.id.localeCompare(b.id)),
    };
    const coverageValidation = validateCoverageMatrixDocument(coverage);
    const findingsValidation = validateBrowserFindingsDocument(findings);
    if (!coverageValidation.valid || !findingsValidation.valid) {
      throw new Error(`Audit output validation failed:\n${[...coverageValidation.errors, ...findingsValidation.errors].join("\n")}`);
    }
    await writeJsonAtomic(join(outputRoot, "coverage-matrix.json"), coverage);
    await writeJsonAtomic(join(outputRoot, "browser-findings.json"), findings);
    return { coverage, findings };
  } finally {
    await browser?.close();
    await stopOwnedServer(ownedServer?.child);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const { coverage, findings } = await runAudit(options);
  process.stdout.write(`HIG browser audit wrote ${coverage.records.length} coverage records and ${findings.findings.length} findings to ${resolve(options.out)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
