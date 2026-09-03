#!/usr/bin/env node
// Appearance token-table check — the fast half of the collapsed matrix.
//
// The geometry drain earned this collapse: after it, the four middle eras
// (platinum, aqua, snow-leopard, yosemite) carry layout ONLY through the
// ratcheted geometry declarations in their appearance sheets plus their token
// tables — everything else is the base sheet, which the pixel net proves in
// Classic. So the eight controls-tier screenshot cells those eras used to own
// (tests/appearance-snapshot-manifest.mjs, controls x 4 eras) are replaced by
// this check: it derives every per-appearance geometry declaration and token
// from the two era sheets, reads the COMPUTED value of each in a real page,
// and records how each era differs from Classic. That classic-anchored delta
// table is the era's whole layout identity; if it moves, the era moved.
//
// What stays pixels, on purpose: Classic (the proof appearance), Liquid Glass
// working/showcase cells (blur and material cannot be token-compared), and one
// showcase desktop frame per era so the era art stays guarded. Liquid Glass's
// controls tier left pixels for the same reason the middle eras did: the
// desktop-width glass material rasterizes into two stable machine-dependent
// renderings, so a screenshot cell cannot be held reproducibly. Its controls'
// structure is token-held here instead — computed deltas, never blur. This
// check runs in seconds against the ~90 s pixel matrix, and anchoring on
// Classic-in-the-same-run means a base layout change moves both sides of every
// delta equally — the pixel net owns that change, and this gate stays quiet.
//
// Determinism, following tooling/computed-style-probe.mjs: values are sorted
// multisets (DOM order is not stable), pseudo-elements are read through
// getComputedStyle's second argument, and Classic is read twice — once before
// the era passes and once after — so any target that cannot agree with itself
// inside one run is dropped instead of testifying.
//
// Usage:
//   node tooling/appearance-token-check.mjs --capture   # write machine-local baseline
//   node tooling/appearance-token-check.mjs --verify    # compare to baseline (default)
//   node tooling/appearance-token-check.mjs --noise     # two sweeps, report self-disagreement
//
// The baseline lives with the pixel baseline (git-ignored, machine-local):
//   internal/evidence/drafts/appearance-baseline/token-deltas.json
// npm run snapshot:appearance refreshes both; npm run verify:appearance-tokens
// runs only this fast path.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";
import { GEOMETRY_PROPERTIES, BORDER_SHORTHAND } from "./lib/appearance-geometry.mjs";
import { windowInterfaceRegistry } from "./interface-guidelines-contract.mjs";
import { lazyStyleBundles } from "./style-manifest.mjs";
import { TOKEN_COMPARED_THEMES } from "../tests/appearance-snapshot-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASELINE_PATH = join(root, "internal/evidence/drafts/appearance-baseline/token-deltas.json");
const SHEET_PATHS = [
  "apps/desktop/styles/65-appearance-themes.css",
  "apps/desktop/styles/67-aqua-appearance.css",
  "apps/desktop/styles/70-liquid-glass.css",
];
// A multiset over many elements can be long; past this it is stored hashed.
// Applied identically at capture and verify, so the comparison never notices.
const VALUE_CAP = 500;

const mode = process.argv.includes("--capture")
  ? "capture"
  : process.argv.includes("--noise") ? "noise" : "verify";

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** Flatten a stylesheet to its leaf rules, recursing through @media/@supports. */
function collectLeafRules(css) {
  const rules = [];
  const walk = (text) => {
    let index = 0;
    while (index < text.length) {
      const brace = text.indexOf("{", index);
      if (brace === -1) return;
      // Statements between rules (@import, @charset) end with ";" and would
      // otherwise glue themselves onto the next selector.
      const selector = (text.slice(index, brace).split(";").pop() || "").trim();
      let depth = 1;
      let scan = brace + 1;
      while (scan < text.length && depth) {
        if (text[scan] === "{") depth += 1;
        else if (text[scan] === "}") depth -= 1;
        scan += 1;
      }
      const body = text.slice(brace + 1, scan - 1);
      if (selector.startsWith("@")) {
        // Conditional groups hold real rules; @keyframes/@font-face hold none
        // that a theme prefix could reach.
        if (/^@(media|supports|layer|container)\b/.test(selector)) walk(body);
      } else if (body.includes("{")) {
        walk(body);
      } else if (selector) {
        rules.push({
          selectors: selector.split(",").map((one) => one.trim()).filter(Boolean),
          body,
        });
      }
      index = scan;
    }
  };
  walk(stripComments(css));
  return rules;
}

/**
 * Remove the theme prefix from one selector, or return null when the theme
 * attribute is not in the first compound (nothing in these sheets nests it
 * deeper, and a guess would probe the wrong element).
 */
function stripThemePrefix(selector, themeId) {
  if (themeId === "liquid-glass" && selector.startsWith("body.use-liquid-glass")) {
    // 70-liquid-glass.css scopes through a class, not a data attribute. The
    // attribute form (body.use-liquid-glass[data-theme="liquid-glass"]) falls
    // through to the branch below; this one handles the plain class prefix.
    let end = "body.use-liquid-glass".length;
    const rest = selector.slice(end).replace(/^[\s>+~]+/, "").trim();
    return rest || "body";
  }
  const attr = `[data-theme="${themeId}"]`;
  const at = selector.indexOf(attr);
  if (at === -1) return null;
  if (/[\s>+~]/.test(selector.slice(0, at))) return null;
  let end = at + attr.length;
  while (end < selector.length && !/[\s>+~]/.test(selector[end])) end += 1;
  const rest = selector.slice(end).replace(/^[\s>+~]+/, "").trim();
  if (rest) return rest;
  return selector.startsWith("html") ? "html" : "body";
}

/**
 * Derive the probe list from the sheets themselves: every geometry declaration
 * and every token a collapsed era declares becomes one (selector, property)
 * read. The list is a UNION across eras — reading a platinum-only selector
 * under aqua costs nothing and catches cross-era bleed.
 */
function extractProbes() {
  const probes = new Map();
  let geometryCount = 0;
  let tokenCount = 0;
  for (const sheetPath of SHEET_PATHS) {
    for (const rule of collectLeafRules(readFileSync(join(root, sheetPath), "utf8"))) {
      const declarations = [];
      for (const declaration of rule.body.split(";")) {
        const colon = declaration.indexOf(":");
        if (colon < 0) continue;
        const property = declaration.slice(0, colon).trim();
        const value = declaration.slice(colon + 1).trim();
        if (!value) continue;
        if (property.startsWith("--")) declarations.push(property);
        else if (BORDER_SHORTHAND.test(property)) {
          declarations.push(property === "border" ? "border-top-width" : `${property}-width`);
        } else if (GEOMETRY_PROPERTIES.has(property)) declarations.push(property);
      }
      if (!declarations.length) continue;
      for (const theme of TOKEN_COMPARED_THEMES) {
        for (const raw of rule.selectors) {
          const stripped = stripThemePrefix(raw, theme);
          if (!stripped) continue;
          for (const property of declarations) {
            const key = `${stripped}|${property}`;
            if (!probes.has(key)) {
              probes.set(key, { selector: stripped, property });
              if (property.startsWith("--")) tokenCount += 1;
              else geometryCount += 1;
            }
          }
        }
      }
    }
  }
  return { probes: [...probes.values()], geometryCount, tokenCount };
}

function normalize(value) {
  if (value.length <= VALUE_CAP) return value;
  const parts = value.split("~").length;
  return `sha256:${createHash("sha256").update(value).digest("hex")}#parts=${parts}`;
}

async function preparePage(browser, serverUrl) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  // Same stub as the pixel net: the menu bar's model status must not depend on
  // whether LM Studio happens to be running on the build machine.
  await context.route(/https?:\/\/(?:127\.0\.0\.1|localhost):(?:1234|11434)\//, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: [] }) });
  });
  await context.addInitScript(() => {
    localStorage.setItem("ai-system-6-theme", "classic");
    localStorage.removeItem("ai-system-6-liquid-glass");
  });
  // Pin randomness and time the same way the pixel net does: the Puzzle
  // shuffles its tiles from Math.random at mount, and the disabled-tile
  // multiset rides the `button:disabled` probes — an unpinned shuffle made
  // one token's element count settle 124/125/126 by run. A baseline cannot
  // hold a shuffle.
  await context.addInitScript(() => {
    const base = Date.UTC(2026, 7, 21, 9, 0, 0);
    const origin = performance.now();
    const now = () => base + Math.round(performance.now() - origin);
    class FrozenDate extends Date {
      constructor(...args) { super(...(args.length ? args : [now()])); }
      static now() { return now(); }
    }
    globalThis.Date = FrozenDate;
    Math.random = () => 0.4242424242424242;
    if (globalThis.crypto) {
      globalThis.crypto.getRandomValues = (array) => {
        for (let index = 0; index < array.length; index += 1) array[index] = (index * 37 + 11) & 0xff;
        return array;
      };
      globalThis.crypto.randomUUID = () => "a7f3c1d2-4b5e-4f60-a891-0c2d3e4f5a6b";
    }
  });
  const page = await context.newPage();
  await page.goto(serverUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 20000 });
  await page.evaluate(() => {
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    const noMotion = document.createElement("style");
    noMotion.id = "appearance-token-check-no-motion";
    noMotion.textContent =
      "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";
    document.head.append(noMotion);
  });
  // ClioTalk's boot copy swaps out asynchronously; multiset sizes must not
  // straddle that swap.
  await page.waitForFunction(() => {
    const clioTalk = document.querySelector('.window[data-window="assistant"]');
    return !clioTalk
      || (!clioTalk.textContent?.includes("Getting Clio ready") && !clioTalk.textContent?.includes("正在准备"));
  }, null, { timeout: 10000 }).catch(() => {});
  // Mount every registered window once through the window manager's own shell
  // loader, the same way verify-appearance-app-coverage.mjs does, so a selector
  // that lives inside a lazy window has something to match.
  for (const [id, contract] of Object.entries(windowInterfaceRegistry)) {
    await page.evaluate(async ({ windowId, ensure }) => {
      if (!document.querySelector(`.window[data-window="${windowId}"]`)
        && ensure === "loadLazyWindowModule"
        && typeof loadLazyWindowAppearanceShell === "function") {
        await loadLazyWindowAppearanceShell(windowId);
      }
    }, { windowId: id, ensure: contract.ensure });
  }
  // A static window's layout can live in a lazy sheet; ask for all of them.
  await page.evaluate((bundles) => {
    for (const output of bundles) {
      if (document.querySelector(`link[rel="stylesheet"][href*="${output}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = output;
      document.head.append(link);
    }
  }, lazyStyleBundles.map((bundle) => bundle.output));
  await page.waitForFunction(
    () => [...document.querySelectorAll('link[rel="stylesheet"]')].every((link) => {
      try { return Boolean(link.sheet); } catch { return true; }
    }),
    null,
    { timeout: 15000 },
  ).catch(() => {});
  await page.evaluate(() => document.fonts?.ready);
  return { context, page };
}

async function readPass(page, themeId, probeList) {
  await page.evaluate((theme) => {
    window.AISystem6Theme?.applyTheme(theme, {
      experimental: true,
      persist: false,
      announce: false,
      modernFontPreference: false,
    });
  }, themeId);
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(200);
  const raw = await page.evaluate((list) => {
    const out = {};
    for (const { selector, property } of list) {
      const pseudoAt = selector.search(/::(before|after|first-line|first-letter|marker|placeholder)\b/);
      const host = pseudoAt === -1 ? selector : selector.slice(0, pseudoAt);
      const pseudo = pseudoAt === -1 ? null : selector.slice(pseudoAt);
      let nodes = [];
      try { nodes = [...document.querySelectorAll(host)]; } catch {
        out[`${selector}|${property}`] = "BAD-SELECTOR";
        continue;
      }
      // Sorted: querySelectorAll returns document order and window mount order
      // is not stable between runs. The multiset survives; a reshuffle does not
      // masquerade as a change.
      out[`${selector}|${property}`] = nodes.length
        ? nodes.map((node) => getComputedStyle(node, pseudo).getPropertyValue(property).trim()).sort().join("~")
        : "NO-MATCH";
    }
    return out;
  }, probeList);
  const values = {};
  for (const [key, value] of Object.entries(raw)) values[key] = normalize(value);
  return values;
}

/** One full sweep: classic, the collapsed eras, classic again. */
async function sweep(page, probeList) {
  const classicA = await readPass(page, "classic", probeList);
  const themePasses = {};
  for (const theme of TOKEN_COMPARED_THEMES) {
    themePasses[theme] = await readPass(page, theme, probeList);
  }
  const classicB = await readPass(page, "classic", probeList);
  const unstable = new Set(
    Object.keys(classicA).filter((key) => classicA[key] !== classicB[key])
  );
  const deltas = {};
  for (const theme of TOKEN_COMPARED_THEMES) {
    const delta = {};
    for (const key of Object.keys(classicA)) {
      if (unstable.has(key)) continue;
      if (themePasses[theme][key] !== classicA[key]) {
        delta[key] = { classic: classicA[key], value: themePasses[theme][key] };
      }
    }
    deltas[theme] = delta;
  }
  return { deltas, unstable: [...unstable].sort() };
}

const startedAt = Date.now();
const { probes, geometryCount, tokenCount } = extractProbes();
let server;
let browser;
let failed = false;
try {
  server = await startAppServer(root);
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"],
  });
  const { context, page } = await preparePage(browser, server.url);
  const result = await sweep(page, probes);

  if (mode === "noise") {
    const second = await sweep(page, probes);
    const disagreeing = new Set();
    for (const theme of TOKEN_COMPARED_THEMES) {
      const keys = new Set([...Object.keys(result.deltas[theme]), ...Object.keys(second.deltas[theme])]);
      for (const key of keys) {
        if (JSON.stringify(result.deltas[theme][key]) !== JSON.stringify(second.deltas[theme][key])) {
          disagreeing.add(`${theme}|${key}`);
        }
      }
    }
    console.log(`\n=== Noise report: same tree, two sweeps ===`);
    console.log(`self-dropped in-run: ${result.unstable.length + second.unstable.length} keys; delta disagreement between sweeps: ${disagreeing.size}`);
    for (const key of disagreeing) console.log(`  ~ ${key}  <- state-sensitive, cannot testify`);
    failed = disagreeing.size > 0;
  } else if (mode === "capture") {
    mkdirSync(dirname(BASELINE_PATH), { recursive: true });
    const entryCount = TOKEN_COMPARED_THEMES.reduce((sum, theme) => sum + Object.keys(result.deltas[theme]).length, 0);
    // A key can be stable inside one run and still disagree across runs when
    // the matched element set depends on window state (a disabled-button
    // count that settles 124/125/126 by mount timing). Capture runs a second
    // sweep and records cross-sweep disagreements as unstable, so verify
    // skips them instead of testifying about a count that cannot be held.
    const second = await sweep(page, probes);
    const crossRunUnstable = new Set(result.unstable);
    for (const theme of TOKEN_COMPARED_THEMES) {
      const keys = new Set([...Object.keys(result.deltas[theme]), ...Object.keys(second.deltas[theme])]);
      for (const key of keys) {
        if (JSON.stringify(result.deltas[theme][key]) !== JSON.stringify(second.deltas[theme][key])) {
          crossRunUnstable.add(key);
        }
      }
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify({
      generatedBy: "tooling/appearance-token-check.mjs --capture",
      probeCount: probes.length,
      geometryProbes: geometryCount,
      tokenProbes: tokenCount,
      unstable: [...crossRunUnstable].sort(),
      themes: result.deltas,
    }, null, 1)}\n`);
    console.log(
      `Captured token/geometry deltas for ${TOKEN_COMPARED_THEMES.join(", ")}: `
        + `${entryCount} classic-anchored entries from ${probes.length} probes `
        + `(${geometryCount} geometry, ${tokenCount} tokens; ${crossRunUnstable.size} dropped as self/cross-run unstable) `
        + `in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
    );
  } else {
    if (!existsSync(BASELINE_PATH)) {
      console.error(
        "Appearance token check: no baseline on this machine.\n"
          + "  Capture one from a tree you trust, then re-run:\n"
          + "    npm run snapshot:appearance"
      );
      process.exit(1);
    }
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    const baselineUnstable = new Set(baseline.unstable || []);
    const currentUnstable = new Set(result.unstable);
    const probeKeys = new Set(probes.map((probe) => `${probe.selector}|${probe.property}`));
    let compared = 0;
    let skipped = 0;
    for (const theme of TOKEN_COMPARED_THEMES) {
      const known = baseline.themes?.[theme] || {};
      const current = result.deltas[theme] || {};
      const keys = new Set([...Object.keys(known), ...Object.keys(current)]);
      for (const key of keys) {
        if (baselineUnstable.has(key) || currentUnstable.has(key)) { skipped += 1; continue; }
        compared += 1;
        const was = known[key];
        const now = current[key];
        if (was && !now) {
          // Absent from the current delta for one of two reasons: the era's
          // value now equals Classic's (probed, but no difference), or the
          // declaration left the sheet entirely (never probed this run).
          const probed = probeKeys.has(key);
          console.log(probed
            ? `  ! ${theme}  ${key}  now matches classic (baseline held "${was.classic}" -> "${was.value}")`
            : `  ! ${theme}  ${key}  no longer probed — the declaration left the sheet; if intended, recapture with npm run snapshot:appearance`);
          failed = true;
        } else if (!was && now) {
          console.log(`  ! ${theme}  ${key}  newly differs from classic: "${now.classic}" -> "${now.value}"`);
          failed = true;
        } else if (was.classic !== now.classic || was.value !== now.value) {
          console.log(`  ! ${theme}  ${key}  baseline "${was.classic}" -> "${was.value}", now "${now.classic}" -> "${now.value}"`);
          failed = true;
        }
      }
    }
    if (!compared) {
      // Every probe was dropped as state-sensitive, or the baseline holds no
      // entries for these eras. Either way the four middle eras were held
      // against nothing, and the line below would still have said they hold.
      console.error(
        `Appearance token check: 0 entries compared (${skipped} skipped as state-sensitive), so nothing was verified.\n`
          + "  Re-capture the baseline for this tree: npm run snapshot:appearance",
      );
      failed = true;
    }
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(failed
      ? `Appearance token check: DRIFT (an era moved relative to Classic; if intended, npm run snapshot:appearance)`
      : `Appearance token check: ${TOKEN_COMPARED_THEMES.length} eras hold their classic-anchored deltas `
        + `(${compared} entries compared, ${skipped} skipped as state-sensitive) in ${elapsed}s`);
  }
  await context.close();
} finally {
  if (browser) await browser.close();
  if (server) await stopProcess(server.child);
}
process.exit(failed ? 1 : 0);
