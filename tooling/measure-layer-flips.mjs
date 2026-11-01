#!/usr/bin/env node
// Layer-flip measurement: what a per-file @layer wrap would actually change on
// the real page.
//
// tooling/audit-layer-readiness.mjs lists flip CANDIDATES from selector
// heuristics: two rules in different files whose rightmost compounds share a
// class are assumed to be able to hit the same element. Many cannot —
// `…writing-spine-panel[data-nextstep-panel] .spine-actions .sys-icon` and
// `.control-strip-module .sys-icon` share `.sys-icon` and nothing else — so the
// list never drains, and "empty the list, then wrap" never happened. This tool
// measures instead of guessing:
//
//   1. It builds a VARIANT of every stylesheet the product ships: each source
//      file wrapped in the cascade layer style-manifest.mjs assigns it, lazy
//      sheets included, assembled and minified exactly the way
//      build-app-bundle.mjs assembles the real ones. The variant is written
//      under dist/layer-flips/ only; no source file and no real bundle changes.
//      A control rebuild WITHOUT the wrap must reproduce the served bytes, or
//      the run stops: that proves the assembly is the build's.
//   2. It boots the real app once per appearance (the saved-appearance path
//      appearance-snapshot.mjs boots through), turns MultiFinder on and opens
//      every registered window the way census:controls does (openWindow over
//      windowRegistry, in the writing profile), opens the menu bar's menus,
//      and records the computed style of every element (and ::before/::after)
//      that renders under either cascade.
//   3. In the same page, without reloading, it puts a disabled layered twin
//      beside each served sheet (each twin must hold as many style rules as
//      the sheet it doubles), switches between the two through
//      CSSStyleSheet.disabled, and compares element by element, property by
//      property.
//   4. For every difference it resolves the cascade over the live CSSOM and
//      names the rule that wins today and the rule that would win after the
//      wrap (source file + selector). A difference whose own winner changes is
//      a flip; one whose winner is unchanged is derived (a flipped custom
//      property or an inherited value arriving from an ancestor's flip).
//   5. It checks each audit candidate against the page: did its two selectors
//      ever match the same visible element, and did that element flip?
//
// Usage:
//   node tooling/measure-layer-flips.mjs                     # all appearances
//   node tooling/measure-layer-flips.mjs --themes aqua,classic
//   node tooling/measure-layer-flips.mjs --no-build          # reuse the built bundles
//   node tooling/measure-layer-flips.mjs --viewport 390x844 --out dist/verification/layer-flips-phone.json
//   node tooling/measure-layer-flips.mjs --current-digest dist/verification/current-a.json
//   node tooling/measure-layer-flips.mjs --compare-digest dist/verification/current-a.json dist/verification/current-b.json
//
// Output: dist/verification/layer-flips.json — appearance → property → element
// path → { current, variant, currentWinner, variantWinner }, plus a summary
// aggregated by file pair and the audit comparison.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";
import { buildInstrumentSource } from "./lib/cascade-instrument.mjs";
import { bootThemedPage, launchChromium, openEveryWindow, registeredThemeIds, revealAndSettle } from "./lib/cascade-page.mjs";
import { stampCssAssetUrls as stampWithBuild } from "./lib/css-asset-stamp.mjs";
import { minifyCss } from "./lib/minify-css.mjs";
import { desktopRoot, repositoryRoot } from "./lib/paths.mjs";
import { lazyStyleBundles, styleLayerByPath, styleLayerOrder, styleRuntimePaths } from "./style-manifest.mjs";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const OUT_PATH = join(repositoryRoot, argValue("--out") || "dist/verification/layer-flips.json");
const VARIANT_DIR = join(repositoryRoot, "dist/layer-flips/variant");
const [viewportWidth, viewportHeight] = (argValue("--viewport") || "1440x960").split("x").map(Number);
const VIEWPORT = { width: viewportWidth, height: viewportHeight };
// --current-digest <file>: also write a per-element hash of TODAY's computed
// style, so a rule move can be proven not to change the current cascade
// anywhere the page renders (diff two files with --compare-digest a b).
const DIGEST_PATH = argValue("--current-digest") ? join(repositoryRoot, argValue("--current-digest")) : null;
const currentDigest = {};
if (args.includes("--compare-digest")) {
  const [a, b] = [argValue("--compare-digest"), args[args.indexOf("--compare-digest") + 2]].map((file) => JSON.parse(readFileSync(join(repositoryRoot, file), "utf8")));
  let changed = 0;
  let missing = 0;
  for (const theme of Object.keys(a)) {
    for (const [path, hash] of Object.entries(a[theme])) {
      if (!(path in (b[theme] || {}))) { missing += 1; continue; }
      if (b[theme][path] !== hash) { changed += 1; if (changed <= 20) console.log(`changed ${theme} ${path}`); }
    }
  }
  const added = Object.keys(b).reduce((n, theme) => n + Object.keys(b[theme]).filter((path) => !(path in (a[theme] || {}))).length, 0);
  console.log(`current cascade: ${changed} changed, ${missing} rendered only before, ${added} rendered only after`);
  process.exit(changed || missing || added ? 1 : 0);
}
// ---------------------------------------------------------------------------
// 1. Variant sheets
// ---------------------------------------------------------------------------

if (!args.includes("--no-build")) {
  execFileSync(process.execPath, ["tooling/build-app-bundle.mjs"], { cwd: repositoryRoot, stdio: "ignore" });
}

const indexHtml = readFileSync(join(desktopRoot, "index.html"), "utf8");
const build = (indexHtml.match(/styles\.bundle\.css\?v=([^"']+)/) || [])[1];
if (!build) throw new Error("index.html carries no styles.bundle.css build stamp; run the build first");

// build-app-bundle.mjs's own URL stamp (tooling/lib/css-asset-stamp.mjs, the one
// the build calls), applied to the variant so every url() resolves to the
// byte-identical request the served sheet makes. A private copy of its pattern
// here had no .otf, so the control rebuild could not reproduce Cover Glass.
const stampCssAssetUrls = (css) => stampWithBuild(css, build);

const read = (path) => readFileSync(join(desktopRoot, path), "utf8");
const wrap = (path) => {
  const layer = styleLayerByPath[path];
  if (!layer) throw new Error(`${path} has no layer in style-manifest.mjs`);
  return `@layer ${layer} {\n${read(path)}\n}`;
};
// --order roles: the layer order by role instead of by file number, the order
// the lane decided on (2026-09-26): primitives (foundation), then every
// appearance sheet, then the boot component sheets, then the lazy windows.
const APPEARANCE_LAYERS = new Set(["appearance-themes", "aqua-appearance", "liquid-glass", "nextstep-shell",
  "nextstep-appearance", "desk-dock", "big-sur-appearance", "tiger-appearance", "system-7-appearance",
  "platinum-utility", "drawing-board-appearance", "lion-appearance"]);
const fileOrder = [...new Set(styleLayerOrder)];
// --order appearance-last: foundation, the boot components, the lazy windows,
// then every appearance sheet.
const ORDERS = {
  roles: () => [
    ...fileOrder.filter((name) => name === "foundation"),
    ...fileOrder.filter((name) => APPEARANCE_LAYERS.has(name)),
    ...fileOrder.filter((name) => name !== "foundation" && !APPEARANCE_LAYERS.has(name)),
  ],
  "appearance-last": () => [
    ...fileOrder.filter((name) => !APPEARANCE_LAYERS.has(name)),
    ...fileOrder.filter((name) => APPEARANCE_LAYERS.has(name)),
  ],
};
if (argValue("--order") && !ORDERS[argValue("--order")]) throw new Error(`--order must be one of ${Object.keys(ORDERS).join(", ")}`);
const layerOrder = argValue("--order") ? ORDERS[argValue("--order")]() : fileOrder;
// The served bundle declares the manifest's order; only the layered variant
// declares the order being measured.
const servedPreamble = `@layer ${styleLayerOrder.join(", ")};\n`;
const layerPreamble = `@layer ${layerOrder.join(", ")};\n`;
const sheetSets = [
  { output: "styles.bundle.css", sources: styleRuntimePaths, preamble: layerPreamble, servedPreamble },
  ...lazyStyleBundles.map((bundle) => ({ output: bundle.output, sources: bundle.sources, preamble: "", servedPreamble: "" })),
];
const variants = {};
const controlMismatches = [];
mkdirSync(VARIANT_DIR, { recursive: true });
for (const set of sheetSets) {
  const control = stampCssAssetUrls(minifyCss(set.servedPreamble + set.sources.map(read).join("\n")));
  const served = readFileSync(join(desktopRoot, set.output), "utf8").replace(/\n$/, "");
  if (control !== served) controlMismatches.push(set.output);
  const variant = stampCssAssetUrls(minifyCss(set.preamble + set.sources.map(wrap).join("\n")));
  variants[set.output] = variant;
  writeFileSync(join(VARIANT_DIR, set.output), `${variant}\n`);
}
if (controlMismatches.length) {
  console.error(`The unwrapped control does not reproduce the served sheets: ${controlMismatches.join(", ")}.`);
  console.error("Rebuild (npm run build:app) or drop --no-build; a variant built another way would measure the build, not the wrap.");
  process.exit(1);
}
const layerToFile = Object.fromEntries(Object.entries(styleLayerByPath).map(([path, layer]) => [layer, path]));

// ---------------------------------------------------------------------------
// 2. In-page instrument (runs in the page; plain function, no closures)
// ---------------------------------------------------------------------------

// The variant-specific half of the in-page instrument. The cascade helpers
// (rule collection, specificity, winner, paths, rendered targets) come from
// tooling/lib/cascade-instrument.mjs as `core`; this adds the layered twins,
// the two-cascade capture and the comparison. Runs in the page.
function installInstrument(core) {
  const { SEP, properties, pseudoOf, collectRules, matchedRules, candidatesFor, winner, describe, pathOf, visibleTargets } = core;

  const state = { snapshot: null, targets: null, visibleToday: null, visibleWrapped: null, installed: false };
  const variantStyles = () => [...document.querySelectorAll("style[data-layer-variant]")];
  const variantLinks = () => [...document.querySelectorAll("link[data-layer-variant-of]")];
  const setOf = (targets) => {
    const out = new Map();
    for (const [element, pseudo] of targets) {
      if (!out.has(pseudo)) out.set(pseudo, new Set());
      out.get(pseudo).add(element);
    }
    return out;
  };
  const has = (sets, element, pseudo) => Boolean(sets.get(pseudo)?.has(element));
  const flush = () => document.documentElement.getBoundingClientRect();
  // CSSStyleSheet.disabled, not the element's: clearing a <link>'s disabled
  // attribute drops its sheet and fetches it again, asynchronously, so the
  // next read would see the page without it.
  function useVariant(on) {
    variantLinks().forEach((link) => { if (link.sheet) link.sheet.disabled = on; });
    variantStyles().forEach((style) => { if (style.sheet) style.sheet.disabled = !on; });
    flush();
  }
  return {
    // Put a layered twin of every served sheet beside it, disabled.
    install(texts) {
      for (const link of [...document.querySelectorAll('link[rel="stylesheet"]')]) {
        const name = new URL(link.href, document.baseURI).pathname.split("/").pop();
        if (!(name in texts) || link.dataset.layerVariantOf) continue;
        const style = document.createElement("style");
        style.dataset.layerVariant = name;
        style.textContent = texts[name];
        link.before(style);
        style.sheet.disabled = true;
        link.dataset.layerVariantOf = name;
      }
      state.installed = true;
      // The wrap only adds @layer blocks: a twin with a different number of
      // style rules lost or gained rules in assembly and would measure that.
      const countRules = (list) => [...list].reduce((total, rule) =>
        total + (rule instanceof CSSStyleRule ? 1 : 0) + (rule.cssRules ? countRules(rule.cssRules) : 0), 0);
      const mismatched = variantLinks().filter((link) => {
        const twin = variantStyles().find((style) => style.dataset.layerVariant === link.dataset.layerVariantOf);
        return !link.sheet || !twin?.sheet || countRules(link.sheet.cssRules) !== countRules(twin.sheet.cssRules);
      }).map((link) => link.dataset.layerVariantOf);
      return { twins: variantStyles().map((style) => style.dataset.layerVariant), mismatched };
    },
    unswapped(texts) {
      return [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map((link) => new URL(link.href, document.baseURI).pathname.split("/").pop())
        .filter((name) => !(name in texts));
    },
    // Rendered in either cascade, then recorded under today's.
    capture() {
      const names = properties();
      useVariant(false);
      const today = visibleTargets();
      useVariant(true);
      const wrapped = visibleTargets();
      useVariant(false);
      state.visibleToday = setOf(today);
      state.visibleWrapped = setOf(wrapped);
      state.targets = [...today];
      for (const [element, pseudo] of wrapped) if (!has(state.visibleToday, element, pseudo)) state.targets.push([element, pseudo]);
      state.snapshot = new Map();
      for (const [element, pseudo] of state.targets) {
        const style = getComputedStyle(element, pseudo || null);
        if (!state.snapshot.has(pseudo)) state.snapshot.set(pseudo, new Map());
        state.snapshot.get(pseudo).set(element, names.map((name) => style.getPropertyValue(name)).join(SEP));
      }
      return { targets: state.targets.length, renderedToday: today.length, renderedWrapped: wrapped.length, properties: names.length };
    },
    // Today's cascade, one hash per rendered target: two runs whose digests
    // agree computed the same style for every element they both rendered.
    digest() {
      const out = {};
      const seen = new Map();
      // Standard properties only: custom properties are inputs, whose set and
      // order on <html> vary between page loads; what they resolve to is
      // already in the standard ones. Body classes are run state, not identity.
      const names = properties();
      const kept = names.map((name, index) => (name.startsWith("--") ? -1 : index)).filter((index) => index >= 0);
      for (const [element, pseudo] of state.targets) {
        if (!has(state.visibleToday, element, pseudo)) continue;
        const values = state.snapshot.get(pseudo).get(element).split(SEP);
        const text = kept.map((index) => `${names[index]}:${values[index]}`).join(SEP);
        let hash = 0x811c9dc5;
        for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index);
          hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        const path = pathOf(element).replace(/^body[^ ]*/, "body") + pseudo;
        const count = (seen.get(path) || 0) + 1;
        seen.set(path, count);
        out[count > 1 ? `${path} #${count}` : path] = hash.toString(16);
      }
      return out;
    },
    compare() {
      const names = properties();
      useVariant(true);
      const rules = collectRules();
      const differences = [];
      const visibility = [];
      // An element the page re-rendered after capture (MultiFinder's app list,
      // a clock) is out of the document: its computed style is empty, which is
      // no cascade at all. Count it, compare nothing for it.
      let detached = 0;
      for (const [element, pseudo] of state.targets) {
        if (!element.isConnected) { detached += 1; continue; }
        const path = pathOf(element) + pseudo;
        const shownToday = has(state.visibleToday, element, pseudo);
        const shownWrapped = has(state.visibleWrapped, element, pseudo);
        if (shownToday !== shownWrapped) visibility.push({ path, today: shownToday ? "rendered" : "not rendered", wrapped: shownWrapped ? "rendered" : "not rendered" });
        const before = state.snapshot.get(pseudo).get(element);
        const style = getComputedStyle(element, pseudo || null);
        const afterValues = names.map((name) => style.getPropertyValue(name));
        if (before === afterValues.join(SEP)) continue;
        const beforeValues = before.split(SEP);
        const matched = matchedRules(rules, element, pseudo);
        for (let index = 0; index < names.length; index += 1) {
          if (beforeValues[index] === afterValues[index]) continue;
          const property = names[index];
          const candidates = candidatesFor(matched, property);
          const inlineValue = pseudo ? "" : element.style?.getPropertyValue(property) || "";
          const today = winner(candidates, false);
          const wrapped = winner(candidates, true);
          const kind = inlineValue ? "inline" : !candidates.length ? "inherited-or-initial" : today === wrapped ? "derived" : "flip";
          differences.push({
            path,
            property,
            current: beforeValues[index],
            variant: afterValues[index],
            kind,
            currentWinner: describe(today, inlineValue),
            variantWinner: describe(wrapped, inlineValue),
          });
        }
      }
      useVariant(false);
      return { compared: state.targets.length - detached, detached, differences, visibility };
    },
    // Audit candidates: did the two selectors ever hit one visible element?
    coMatch(pairs) {
      const visible = (element) => element.checkVisibility({ visibilityProperty: true });
      const cache = new Map();
      const matches = (selector) => {
        if (cache.has(selector)) return cache.get(selector);
        const { base } = pseudoOf(selector);
        let found = null;
        try { found = new Set([...document.querySelectorAll(base)].filter(visible)); } catch { found = null; }
        cache.set(selector, found);
        return found;
      };
      return pairs.map(([earlier, later]) => {
        const a = matches(earlier);
        const b = matches(later);
        if (!a || !b) return "unparsed";
        if (!a.size || !b.size) return a.size || b.size ? "one-side-absent" : "both-absent";
        for (const element of a) if (b.has(element)) return "co-matched";
        return "disjoint";
      });
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Audit candidates, read from the audit's own --full listing
// ---------------------------------------------------------------------------

function auditCandidates() {
  const result = spawnSync(process.execPath, ["tooling/audit-layer-readiness.mjs", "--full"], {
    cwd: repositoryRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  const lines = result.stdout.split("\n");
  const total = Number((lines[0].match(/candidates: (\d+)/) || [])[1]);
  const pairs = [];
  let files = null;
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index].match(/^(styles\/\S+) -> (styles\/\S+): \d+$/);
    if (header) { files = [header[1], header[2]]; continue; }
    const props = lines[index].match(/^ {4}\[(.*)\]$/);
    if (props && files) {
      const earlier = lines[index + 1].replace(/^ {6}earlier\(\d+\): /, "");
      const later = lines[index + 2].replace(/^ {6}later\(\d+\): {3}/, "");
      pairs.push({ earlierFile: files[0], laterFile: files[1], earlier, later, properties: props[1].split(",") });
      index += 2;
    }
  }
  if (pairs.length !== total) throw new Error(`audit listing parsed ${pairs.length} of ${total} candidates`);
  return pairs;
}

// ---------------------------------------------------------------------------
// 4. Drive
// ---------------------------------------------------------------------------

const allThemes = registeredThemeIds();
const themes = argValue("--themes") ? argValue("--themes").split(",") : allThemes;

const candidates = auditCandidates();
const candidatePairs = candidates.map(({ earlier, later }) => [earlier, later]);

const server = await startAppServer(repositoryRoot);
const browser = await launchChromium();
const report = {
  generatedBy: "tooling/measure-layer-flips.mjs",
  generatedAt: new Date().toISOString(),
  commit: spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout.trim(),
  viewport: VIEWPORT,
  layerOrder,
  themes: {},
  coverage: {},
};
const coMatchByTheme = {};

try {
  for (const theme of themes) {
    const started = Date.now();
    const { context, page, pageErrors } = await bootThemedPage(browser, server.url, theme, VIEWPORT);
    const { windowNames, opened, failed } = await openEveryWindow(page);
    const revealed = await revealAndSettle(page, opened);

    await page.evaluate(`window.__layerFlips = ${buildInstrumentSource(installInstrument, layerOrder)}`);
    const unswapped = await page.evaluate((texts) => window.__layerFlips.unswapped(texts), variants);
    const { twins: swapped, mismatched } = await page.evaluate((texts) => window.__layerFlips.install(texts), variants);
    if (mismatched.length) throw new Error(`${theme}: layered twins lost or gained style rules: ${mismatched.join(", ")}`);
    const captured = await page.evaluate(() => window.__layerFlips.capture());
    coMatchByTheme[theme] = await page.evaluate((pairs) => window.__layerFlips.coMatch(pairs), candidatePairs);
    if (DIGEST_PATH) currentDigest[theme] = await page.evaluate(() => window.__layerFlips.digest());
    const { compared, detached, differences, visibility } = await page.evaluate(() => window.__layerFlips.compare());
    const inlineStyles = await page.evaluate(() => [...document.querySelectorAll("style:not([data-layer-variant])")].map((style) => (style.id ? `#${style.id}` : "") + ` ${style.textContent.length} chars`));

    const byProperty = {};
    for (const difference of differences) {
      byProperty[difference.property] ||= {};
      byProperty[difference.property][difference.path] = {
        current: difference.current,
        variant: difference.variant,
        kind: difference.kind,
        currentWinner: difference.currentWinner,
        variantWinner: difference.variantWinner,
      };
    }
    report.themes[theme] = byProperty;
    report.visibilityChanges ||= {};
    report.visibilityChanges[theme] = visibility;
    report.coverage[theme] = {
      windowsOpened: opened.length,
      windowsRevealed: revealed,
      windowsFailed: failed,
      renderedToday: captured.renderedToday,
      renderedWrapped: captured.renderedWrapped,
      renderedTargets: captured.targets,
      comparedTargets: compared,
      detachedBeforeCompare: detached,
      propertiesPerTarget: captured.properties,
      swappedSheets: swapped,
      linkedSheetsWithoutVariant: unswapped,
      unlayeredStyleElements: inlineStyles,
      pageErrors: pageErrors.slice(0, 10),
      seconds: Math.round((Date.now() - started) / 1000),
    };
    const flips = differences.filter((difference) => difference.kind === "flip").length;
    console.log(`${theme}: ${opened.length}/${windowNames.length} windows, ${captured.renderedToday} rendered targets (${captured.targets} in either cascade), ${differences.length} differing values (${flips} own flips), ${detached} detached, ${visibility.length} visibility changes in ${report.coverage[theme].seconds}s`);
    await context.close();
  }
} finally {
  await browser.close();
  await stopProcess(server.child);
}

// ---------------------------------------------------------------------------
// 5. Summaries
// ---------------------------------------------------------------------------

const fileOf = (winner) => {
  if (!winner) return "(none)";
  if (winner.layer && layerToFile[winner.layer]) return layerToFile[winner.layer];
  return winner.sheet || winner.file || "(unknown)";
};
const ruleKey = (winner) => `${fileOf(winner)} :: ${winner?.selector || ""}`;
const flipRules = new Map();
const kinds = {};
for (const [theme, byProperty] of Object.entries(report.themes)) {
  for (const [property, byPath] of Object.entries(byProperty)) {
    for (const [path, entry] of Object.entries(byPath)) {
      kinds[entry.kind] = (kinds[entry.kind] || 0) + 1;
      if (entry.kind !== "flip") continue;
      const key = `${ruleKey(entry.currentWinner)} => ${ruleKey(entry.variantWinner)}`;
      if (!flipRules.has(key)) {
        flipRules.set(key, {
          today: { file: fileOf(entry.currentWinner), selector: entry.currentWinner?.selector, specificity: entry.currentWinner?.specificity },
          wrapped: { file: fileOf(entry.variantWinner), selector: entry.variantWinner?.selector, specificity: entry.variantWinner?.specificity },
          themes: new Set(),
          properties: new Set(),
          instances: 0,
          sample: `${theme} ${path} ${property}: ${entry.current} -> ${entry.variant}`,
        });
      }
      const flip = flipRules.get(key);
      flip.themes.add(theme);
      flip.properties.add(property);
      flip.instances += 1;
    }
  }
}
const flipList = [...flipRules.values()].map((flip) => ({
  ...flip,
  themes: [...flip.themes],
  properties: [...flip.properties],
})).sort((a, b) => b.instances - a.instances);
const byFilePair = {};
for (const flip of flipList) {
  const key = `${flip.today.file} -> ${flip.wrapped.file}`;
  byFilePair[key] ||= { rulePairs: 0, instances: 0, themes: new Set() };
  byFilePair[key].rulePairs += 1;
  byFilePair[key].instances += flip.instances;
  flip.themes.forEach((theme) => byFilePair[key].themes.add(theme));
}
for (const value of Object.values(byFilePair)) value.themes = [...value.themes];

// Audit comparison: a candidate is confirmed when a measured flip names both
// of its rules; it is testable when its selectors met on a visible element.
const normalize = (selector) => String(selector || "").replace(/\s+/g, "").replace(/'/g, '"');
const flipKeys = new Set(flipList.map((flip) => `${flip.today.file}|${normalize(flip.today.selector)}|${flip.wrapped.file}|${normalize(flip.wrapped.selector)}`));
const auditRows = candidates.map((candidate, index) => {
  const outcomes = Object.values(coMatchByTheme).map((list) => list[index]);
  const coMatched = outcomes.includes("co-matched");
  const confirmed = flipKeys.has(`${candidate.earlierFile}|${normalize(candidate.earlier)}|${candidate.laterFile}|${normalize(candidate.later)}`);
  const status = confirmed ? "confirmed-flip"
    : coMatched ? "co-matched-no-flip"
      : outcomes.includes("disjoint") ? "disjoint"
        : outcomes.every((outcome) => outcome === "unparsed") ? "unparsed"
          : "not-rendered";
  return { ...candidate, status };
});
const auditCounts = auditRows.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }), {});
// Flips the audit never listed (e.g. against an unlayered injected <style>, or
// pairs its token heuristic does not bucket together).
const auditKeys = new Set(candidates.map((candidate) => `${candidate.earlierFile}|${normalize(candidate.earlier)}|${candidate.laterFile}|${normalize(candidate.later)}`));
const unlisted = flipList.filter((flip) => !auditKeys.has(`${flip.today.file}|${normalize(flip.today.selector)}|${flip.wrapped.file}|${normalize(flip.wrapped.selector)}`)).length;

report.summary = {
  themesMeasured: Object.keys(report.themes),
  differingValuesByKind: kinds,
  trueFlipRulePairs: flipList.length,
  trueFlipInstances: flipList.reduce((total, flip) => total + flip.instances, 0),
  byFilePair,
  flips: flipList,
  audit: {
    candidates: candidates.length,
    byStatus: auditCounts,
    flipsNotInAudit: unlisted,
  },
};
report.auditCandidates = auditRows.map(({ earlierFile, earlier, laterFile, later, status }) => ({ earlierFile, earlier, laterFile, later, status }));

mkdirSync(join(repositoryRoot, "dist/verification"), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 1)}\n`);
if (DIGEST_PATH) writeFileSync(DIGEST_PATH, `${JSON.stringify(currentDigest)}\n`);
console.log(`\nTrue flips: ${report.summary.trueFlipRulePairs} rule pairs, ${report.summary.trueFlipInstances} element/property values`);
console.log(`Differing values by kind: ${JSON.stringify(kinds)}`);
console.log(`Audit candidates ${candidates.length}: ${JSON.stringify(auditCounts)}; measured flips the audit does not list: ${unlisted}`);
for (const [pair, value] of Object.entries(byFilePair).sort((a, b) => b[1].instances - a[1].instances).slice(0, 15)) {
  console.log(`  ${pair}: ${value.rulePairs} rule pair(s), ${value.instances} value(s), ${value.themes.join(",")}`);
}
console.log(`Report: ${OUT_PATH.replace(`${repositoryRoot}/`, "")}`);
