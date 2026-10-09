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
import { createRequire } from "node:module";
import { join } from "node:path";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";
import { minifyCss } from "./lib/minify-css.mjs";
import { desktopRoot, repositoryRoot } from "./lib/paths.mjs";
import { lazyStyleBundles, styleLayerByPath, styleLayerOrder, styleRuntimePaths } from "./style-manifest.mjs";
import { enableMultiFinder } from "../tests/e2e/helpers.mjs";

import { stubLocalModels } from "./lib/stub-local-models.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const OUT_PATH = join(repositoryRoot, argValue("--out") || "dist/verification/layer-flips.json");
const VARIANT_DIR = join(repositoryRoot, "dist/layer-flips/variant");
const [viewportWidth, viewportHeight] = (argValue("--viewport") || "1440x960").split("x").map(Number);
const VIEWPORT = { width: viewportWidth, height: viewportHeight };
const PHONE = VIEWPORT.width < 768;
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
// Windows that start a network session, a game loop or a model call on open
// are still opened: their chrome is the measured surface, and a failure to
// open is recorded as coverage, never skipped silently.
const WINDOW_OPEN_TIMEOUT = 20000;

// ---------------------------------------------------------------------------
// 1. Variant sheets
// ---------------------------------------------------------------------------

if (!args.includes("--no-build")) {
  execFileSync(process.execPath, ["tooling/build-app-bundle.mjs"], { cwd: repositoryRoot, stdio: "ignore" });
}

const indexHtml = readFileSync(join(desktopRoot, "index.html"), "utf8");
const build = (indexHtml.match(/styles\.bundle\.css\?v=([^"']+)/) || [])[1];
if (!build) throw new Error("index.html carries no styles.bundle.css build stamp; run the build first");

// build-app-bundle.mjs's own URL stamp, applied to the variant so every url()
// resolves to the byte-identical request the served sheet makes.
function stampCssAssetUrls(css) {
  return css.replace(
    /url\(\s*(['"]?)((?:\.{0,2}\/)*assets\/[\w./-]+\.(?:svg|png|jpg|jpeg|webp|gif|ico|woff|woff2|dat|ttf)(?:\?[^)'"]*)?)\1\s*\)/gi,
    (match, quote, url) => (/\?/.test(url) ? match : `url(${quote}${url}?v=${build}${quote})`)
  );
}

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

function installInstrument(layerOrderList) {
  const SEP = "\u0001";
  const PSEUDOS = ["", "::before", "::after"];
  const layerRank = new Map(layerOrderList.map((name, index) => [name, index]));
  let propertyNames = null;
  const properties = () => {
    if (propertyNames) return propertyNames;
    // Logical longhands (padding-inline-start, inset-block-end, inline-size…)
    // restate a physical one in horizontal, left-to-right writing; comparing
    // both would count every such difference twice, and only the physical one
    // is what the rules here declare.
    const style = getComputedStyle(document.documentElement);
    const names = [];
    for (let index = 0; index < style.length; index += 1) {
      const name = style.item(index);
      if (/-(?:inline|block)(?:-|$)|^(?:min-|max-)?(?:inline|block)-size$/.test(name)) continue;
      names.push(name);
    }
    propertyNames = names;
    return names;
  };

  function splitList(text) {
    const out = [];
    let current = "";
    let paren = 0;
    let bracket = 0;
    let quote = "";
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quote) {
        current += char;
        if (char === "\\") { current += text[i + 1] || ""; i += 1; } else if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") { quote = char; current += char; continue; }
      if (char === "(") paren += 1;
      else if (char === ")") paren -= 1;
      else if (char === "[") bracket += 1;
      else if (char === "]") bracket -= 1;
      if (char === "," && !paren && !bracket) { out.push(current.trim()); current = ""; } else current += char;
    }
    if (current.trim()) out.push(current.trim());
    return out;
  }

  // Selectors Level 4 specificity: :where() is zero, :is()/:not()/:has() take
  // their most specific argument, :nth-child(… of S) adds S.
  function specificity(selector) {
    let a = 0;
    let b = 0;
    let c = 0;
    let i = 0;
    const identEnd = (start) => {
      let j = start;
      while (j < selector.length && /[\w\-\u0080-￿\\]/.test(selector[j])) j += selector[j] === "\\" ? 2 : 1;
      return j;
    };
    const parenEnd = (start) => {
      let depth = 0;
      let quote = "";
      for (let j = start; j < selector.length; j += 1) {
        const char = selector[j];
        if (quote) { if (char === "\\") j += 1; else if (char === quote) quote = ""; continue; }
        if (char === '"' || char === "'") quote = char;
        else if (char === "(") depth += 1;
        else if (char === ")") { depth -= 1; if (!depth) return j + 1; }
      }
      return selector.length;
    };
    const maxOf = (list) => splitList(list).map(specificity)
      .reduce((best, next) => (compare(next, best) > 0 ? next : best), [0, 0, 0]);
    while (i < selector.length) {
      const char = selector[i];
      if (char === "#") { a += 1; i = identEnd(i + 1); } else if (char === ".") { b += 1; i = identEnd(i + 1); } else if (char === "[") {
        b += 1;
        let quote = "";
        let j = i + 1;
        for (; j < selector.length; j += 1) {
          const inner = selector[j];
          if (quote) { if (inner === quote) quote = ""; continue; }
          if (inner === '"' || inner === "'") quote = inner;
          else if (inner === "]") break;
        }
        i = j + 1;
      } else if (char === ":") {
        if (selector[i + 1] === ":") {
          c += 1;
          i = identEnd(i + 2);
          if (selector[i] === "(") i = parenEnd(i);
          continue;
        }
        const end = identEnd(i + 1);
        const name = selector.slice(i + 1, end).toLowerCase();
        i = end;
        if (selector[i] === "(") {
          const close = parenEnd(i);
          const inner = selector.slice(i + 1, close - 1);
          i = close;
          if (name === "where") continue;
          if (["is", "not", "has", "matches", "-webkit-any"].includes(name)) {
            const [x, y, z] = maxOf(inner);
            a += x; b += y; c += z;
          } else if (name === "nth-child" || name === "nth-last-child") {
            b += 1;
            const of = inner.search(/\sof\s/i);
            if (of !== -1) { const [x, y, z] = maxOf(inner.slice(of + 4)); a += x; b += y; c += z; }
          } else b += 1;
        } else if (["before", "after", "first-line", "first-letter"].includes(name)) c += 1;
        else b += 1;
      } else if (/[A-Za-z_\u0080-￿\\-]/.test(char)) {
        c += 1;
        i = identEnd(i);
      } else i += 1;
    }
    return [a, b, c];
  }
  function compare(left, right) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const delta = (left[index] ?? 0) - (right[index] ?? 0);
      if (delta) return delta;
    }
    return 0;
  }

  const pseudoOf = (selector) => {
    const match = selector.match(/(::?(?:before|after))\s*$/i);
    if (match) return { pseudo: `::${match[1].replace(/^:+/, "").toLowerCase()}`, base: selector.slice(0, -match[0].length) || "*" };
    if (/::[\w-]+(\([^)]*\))?\s*$/.test(selector)) return { pseudo: "other", base: selector };
    return { pseudo: "", base: selector };
  };

  function sheetLabel(sheet, index) {
    const node = sheet.ownerNode;
    if (node?.dataset?.layerVariant) return node.dataset.layerVariant;
    if (sheet.href) return new URL(sheet.href).pathname.split("/").pop();
    const id = node?.id ? `#${node.id}` : "";
    return `inline <style>${id} #${index}`;
  }

  function collectRules() {
    const rules = [];
    const walk = (list, context) => {
      for (const rule of list) {
        if (rule instanceof CSSLayerBlockRule) walk(rule.cssRules, { ...context, layer: rule.name });
        else if (rule instanceof CSSMediaRule) { if (matchMedia(rule.conditionText || rule.media.mediaText).matches) walk(rule.cssRules, context); } else if (rule instanceof CSSSupportsRule) { if (CSS.supports(rule.conditionText)) walk(rule.cssRules, context); } else if (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule) walk(rule.cssRules, { ...context, container: rule.conditionText });
        else if (rule instanceof CSSStyleRule) {
          rules.push({
            rule,
            selectors: splitList(rule.selectorText).map((text) => ({ text, ...pseudoOf(text), spec: specificity(text) })),
            layer: context.layer ?? null,
            sheet: context.sheet,
            container: context.container || null,
            order: rules.length,
          });
        }
      }
    };
    Array.from(document.styleSheets).forEach((sheet, index) => {
      if (sheet.disabled) return;
      let list;
      try { list = sheet.cssRules; } catch { return; }
      walk(list, { sheet: sheetLabel(sheet, index), layer: null });
    });
    return rules;
  }

  // Every rule that matches one target, with its most specific matching
  // selector; computed once per target and filtered per property.
  function matchedRules(rules, element, pseudo) {
    const found = [];
    for (const entry of rules) {
      let best = null;
      for (const selector of entry.selectors) {
        if (selector.pseudo !== pseudo) continue;
        let hit = false;
        try { hit = element.matches(selector.base); } catch { hit = false; }
        if (hit && (!best || compare(selector.spec, best.spec) > 0)) best = selector;
      }
      if (best) found.push({ entry, selector: best });
    }
    return found;
  }

  function candidatesFor(matched, property) {
    const found = [];
    for (const { entry, selector } of matched) {
      const value = entry.rule.style.getPropertyValue(property);
      if (!value) continue;
      found.push({ entry, selector, value, important: entry.rule.style.getPropertyPriority(property) === "important" });
    }
    return found;
  }

  // Today: no layers anywhere, so importance, then specificity, then order.
  // After the wrap: normal declarations rank layers first (unlayered above
  // every layer), important ones rank them in reverse (unlayered below).
  function winner(candidates, layered) {
    let best = null;
    let bestKey = null;
    for (const candidate of candidates) {
      const rank = candidate.entry.layer === null ? Infinity : (layerRank.get(candidate.entry.layer) ?? -1);
      const layerKey = !layered ? 0 : candidate.important ? -rank : rank;
      const key = [candidate.important ? 1 : 0, layerKey, ...candidate.selector.spec, candidate.entry.order];
      if (!best || compare(key, bestKey) > 0) { best = candidate; bestKey = key; }
    }
    return best;
  }

  function describe(candidate, inlineValue) {
    if (inlineValue) return { file: "inline style attribute", selector: "", value: inlineValue };
    if (!candidate) return null;
    return {
      sheet: candidate.entry.sheet,
      layer: candidate.entry.layer,
      selector: candidate.selector.text,
      specificity: candidate.selector.spec.join(","),
      important: candidate.important,
      value: candidate.value,
      ...(candidate.entry.container ? { container: candidate.entry.container } : {}),
    };
  }

  function pathOf(element) {
    const parts = [];
    let node = element;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.localName;
      if (node.id) part += `#${node.id}`;
      else {
        const classes = [...node.classList].slice(0, 3);
        if (classes.length) part += `.${classes.join(".")}`;
        const parent = node.parentElement;
        if (parent) {
          const same = [...parent.children].filter((child) => child.localName === node.localName);
          if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
        }
      }
      if (node.dataset?.window) part += `[data-window="${node.dataset.window}"]`;
      parts.unshift(part);
      if (node.id) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function visibleTargets() {
    const targets = [];
    for (const element of [document.documentElement, ...document.body.querySelectorAll("*"), document.body]) {
      if (element !== document.documentElement && element !== document.body
        && !element.checkVisibility({ visibilityProperty: true })) continue;
      for (const pseudo of PSEUDOS) {
        if (pseudo) {
          const content = getComputedStyle(element, pseudo).content;
          if (!content || content === "none" || content === "normal") continue;
        }
        targets.push([element, pseudo]);
      }
    }
    return targets;
  }

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

const registryWindow = {};
const vm = await import("node:vm");
vm.runInNewContext(read("app/core/theme-registry.js"), { window: registryWindow });
const allThemes = registryWindow.AISystem6Theme.themes.map(({ id }) => id);
const themes = argValue("--themes") ? argValue("--themes").split(",") : allThemes;

const candidates = auditCandidates();
const candidatePairs = candidates.map(({ earlier, later }) => [earlier, later]);

const server = await startAppServer(repositoryRoot);
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--force-color-profile=srgb", "--disable-gpu"] });
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
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", hasTouch: PHONE, isMobile: PHONE });
    // The saved-appearance boot appearance-snapshot.mjs uses; local model
    // probes answered offline so no window waits on developer software.
    await stubLocalModels(context);
    await context.addInitScript((id) => {
      localStorage.setItem("ai-system-6-theme", id);
      localStorage.removeItem("ai-system-6-liquid-glass");
    }, theme);
    const page = await context.newPage();
    context.on("page", (popup) => { if (popup !== page) popup.close().catch(() => {}); });
    page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => ["ready", "error"].includes(document.body.dataset.appReady), null, { timeout: 60000, polling: 100 });
    await page.evaluate(async (id) => {
      await window.AISystem6Theme.applyTheme(id, { experimental: true, persist: false, announce: false, modernFontPreference: false });
      if (typeof activateWorkspaceProfile === "function") await activateWorkspaceProfile("writing", { persist: false, announce: false });
    }, theme);
    // MultiFinder, as census:controls runs it: under the single-application
    // Finder, opening an application quits the one before, and its windows go.
    await enableMultiFinder(page);

    // Every registered window, as census:controls opens them.
    const windowNames = await page.evaluate(() => Object.keys(typeof windowRegistry === "object" ? windowRegistry : {}));
    const opened = [];
    const failed = [];
    for (const name of windowNames) {
      try {
        await Promise.race([
          page.evaluate((windowName) => openWindow(windowName), name),
          new Promise((_, reject) => setTimeout(() => reject(new Error("open timeout")), WINDOW_OPEN_TIMEOUT)),
        ]);
        const shown = await page.evaluate((windowName) => {
          const win = document.querySelector(`[data-window="${windowName}"]`);
          return Boolean(win && !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden"));
        }, name);
        (shown ? opened : failed).push(shown ? name : { window: name, error: "not shown after openWindow" });
      } catch (error) {
        failed.push({ window: name, error: String(error?.message || error).split("\n")[0] });
      }
    }
    // MultiFinder hides the windows of every application but the front one
    // (is-app-hidden), so after the walk only the last application would be on
    // screen. Every window that opened is shown again for the measurement --
    // a combined state no single click reaches, but each window keeps its own
    // DOM and classes. Then close anything modal an open left behind and open
    // every menu of the menu bar at once: their popovers are the other large
    // surface.
    const revealed = await page.evaluate((names) => {
      let count = 0;
      for (const name of names) {
        const win = document.querySelector(`[data-window="${name}"]`);
        if (win?.classList.contains("is-app-hidden")) { win.classList.remove("is-app-hidden"); count += 1; }
      }
      for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
      for (const menu of document.querySelectorAll(".menu-bar .menu")) menu.classList.add("is-open");
      return count;
    }, opened);
    await page.evaluate(() => window.AISystem6Theme.whenReady());
    await page.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')].every((link) => {
      try { return Boolean(link.sheet); } catch { return true; }
    }), null, { timeout: 20000, polling: 100 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready);

    await page.evaluate(`window.__layerFlips = (${installInstrument.toString()})(${JSON.stringify(layerOrder)})`);
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
