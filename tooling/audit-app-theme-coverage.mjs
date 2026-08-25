#!/usr/bin/env node
// Registry-driven appearance coverage audit for AI System 6.
//
// The window registry lives in interface-guidelines-contract.mjs and covers
// static, dynamic, and lazy windows; app CSS lives in the numbered styles/
// files. This script answers the section-10 / section-22 question without
// maintaining a second hand-written app list:
//
//   For every registered window, which of its app-specific classes/prefixes
//   have CSS rules, do those rules consume semantic tokens, and do any of
//   them carry theme selectors (data-theme / data-theme-family /
//   use-liquid-glass)?
//
// A window whose CSS is token-based and has no child-theme selector inherits
// the parent appearance automatically. A window with child+app-specific
// selectors violates the Theme Family Contract (tooling/verify-css.mjs
// ratchet blocks exactly that class of selector).
//
// Usage:
//   node tooling/audit-app-theme-coverage.mjs
//   node tooling/audit-app-theme-coverage.mjs --json internal/evidence/drafts/theme-coverage/coverage.json

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applicationCssPrefixes,
  windowInterfaceRegistry,
} from "./interface-guidelines-contract.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const STYLES_DIR = join(root, "apps", "desktop", "styles");

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function splitSelectors(selectorChunk) {
  const selectors = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote = "";
  let escaped = false;
  for (const char of selectorChunk) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'") {
      current += char;
      quote = char;
      continue;
    }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    if (char === "," && parenDepth === 0 && bracketDepth === 0) {
      const trimmed = current.replace(/\s+/g, " ").trim();
      if (trimmed) selectors.push(trimmed);
      current = "";
      continue;
    }
    current += char;
  }
  const trimmed = current.replace(/\s+/g, " ").trim();
  if (trimmed) selectors.push(trimmed);
  return selectors;
}

// Returns [{ selectors: string[], body: string }] for top-level and nested
// (at-rule) rule blocks, preserving each rule's body for token extraction.
function extractRules(text) {
  const clean = stripComments(text);
  const rules = [];
  let i = 0;
  while (i < clean.length) {
    const openIdx = clean.indexOf("{", i);
    if (openIdx === -1) break;
    const selectorChunk = clean.slice(i, openIdx).trim();
    let depth = 1;
    let j = openIdx + 1;
    while (j < clean.length && depth > 0) {
      const c = clean[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      j++;
    }
    const body = clean.slice(openIdx + 1, j - 1);
    if (selectorChunk.startsWith("@")) {
      rules.push(...extractRules(body));
    } else if (selectorChunk) {
      rules.push({ selectors: splitSelectors(selectorChunk), body });
    }
    i = j;
  }
  return rules;
}

function classTokens(selector) {
  return Array.from(selector.matchAll(/\.([A-Za-z_-][\w-]*)/g)).map((match) => match[1]);
}

function tokenNames(body) {
  return Array.from(new Set(Array.from(body.matchAll(/var\(--([A-Za-z0-9_-]+)/g)).map((m) => `--${m[1]}`))).sort();
}

function windowPrefix(className) {
  let stem = className;
  if (stem.endsWith("-window")) stem = stem.slice(0, -"-window".length);
  else if (stem.endsWith("-panel")) stem = stem.slice(0, -"-panel".length);
  return stem.endsWith("-") ? stem : `${stem}-`;
}

const html = readFileSync(join(root, "apps/desktop/index.html"), "utf8");
const staticWindows = new Map();
for (const match of html.matchAll(/class="([^"]+)"[^>]*data-window="([^"]+)"[^>]*aria-labelledby="([^"]+)"/g)) {
  const classes = match[1].split(/\s+/).filter(Boolean);
  const id = match[2];
  const appClasses = classes.filter((c) => c !== "window" && !c.startsWith("is-"));
  staticWindows.set(id, {
    id,
    classes: appClasses,
    label: match[3],
  });
}

const windows = Object.entries(windowInterfaceRegistry).map(([id, contract]) => {
  const staticWindow = staticWindows.get(id);
  return {
    id,
    classes: staticWindow?.classes || [],
    prefixes: [...new Set([
      ...(contract.cssPrefixes || []),
      ...(staticWindow?.classes || []).map(windowPrefix),
    ])].sort(),
    label: staticWindow?.label || id,
    sourceKind: contract.sourceKind,
    mountPath: contract.mountPath,
  };
});

const cssFiles = readdirSync(STYLES_DIR)
  .filter((name) => name.endsWith(".css"))
  .sort();

const allRules = [];
for (const fileName of cssFiles) {
  const fileRules = extractRules(readFileSync(join(STYLES_DIR, fileName), "utf8"));
  allRules.push({ fileName, rules: fileRules });
}

const THEME_SELECTOR = /(?:html|body)\[data-theme(?:-family)?=["']|body\.use-liquid-glass/;
const CHILD_THEME_SELECTOR = /\[data-theme="(?:platinum|snow-leopard|yosemite)"\]/;
const budget = JSON.parse(readFileSync(join(root, "tooling/css-budget.json"), "utf8"));
const childAppPrefixes = applicationCssPrefixes;
const childAppAllowlist = new Set(budget.childAppSpecificAllowlist || []);
const sharedPrimitives = new Set([".window", ".window-pane"]);

function allowlistedChildToken(classToken, themeId) {
  // The ratchet (verify-css.mjs) accepts both bare and theme-qualified
  // entries ("yosemite:.finder-item"); the audit must honor the same forms or
  // it will flag sanctioned system-level exceptions (e.g. the Finder/desktop
  // selection recipes in the Yosemite split) as new app-specific debt.
  return childAppAllowlist.has(classToken)
    || childAppAllowlist.has(`platinum:${classToken}`)
    || (themeId && childAppAllowlist.has(`${themeId}:${classToken}`));
}

function isChildAppSpecific(themeSelector, tokens) {
  if (!themeSelector || !CHILD_THEME_SELECTOR.test(themeSelector)) return false;
  const themeMatch = themeSelector.match(/\[data-theme="(platinum|snow-leopard|yosemite)"\]/);
  const themeId = themeMatch ? themeMatch[1] : null;
  return tokens.some((token) => {
    const classToken = `.${token}`;
    if (sharedPrimitives.has(classToken) || token.startsWith("is-")) return false;
    if (allowlistedChildToken(classToken, themeId)) return false;
    return childAppPrefixes.some((prefix) => token.startsWith(prefix));
  });
}

function analyzeWindow(window) {
  const exact = new Set(window.classes);
  const matched = [];
  for (const { fileName, rules } of allRules) {
      for (const rule of rules) {
      for (const selector of rule.selectors) {
        const tokens = classTokens(selector);
        const hits = tokens.filter((token) => (
          exact.has(token) || window.prefixes.some((prefix) => token.startsWith(prefix))
        ));
        if (!hits.length) continue;
        const themeSelector = THEME_SELECTOR.test(selector) ? selector : null;
        matched.push({
          file: fileName,
          selector,
          hits,
          theme: Boolean(themeSelector),
          themeSelector,
          childAppSpecific: isChildAppSpecific(themeSelector, tokens),
          tokens: tokenNames(rule.body),
        });
      }
    }
  }
  const childAppSpecific = matched.filter((entry) => entry.childAppSpecific);
  const familySelectors = matched.filter((entry) => (
    entry.themeSelector && /data-theme-family=/.test(entry.themeSelector)
  ));
  const liquidSelectors = matched.filter((entry) => (
    entry.themeSelector && !/data-theme-family=/.test(entry.themeSelector) && !entry.childAppSpecific
  ));
  const consumed = Array.from(new Set(matched.flatMap((entry) => entry.tokens))).sort();
  return {
    id: window.id,
    label: window.label,
    sourceKind: window.sourceKind,
    mountPath: window.mountPath,
    classes: window.classes,
    prefixes: window.prefixes,
    ruleCount: matched.length,
    childAppSpecific: childAppSpecific.length,
    familySelectors: familySelectors.length,
    liquidSelectors: liquidSelectors.length,
    tokenConsumers: matched.filter((entry) => entry.tokens.length).length,
    hardCodedOnly: matched.filter((entry) => entry.tokens.length === 0).length,
    consumedTokens: consumed,
    samples: matched.slice(0, 6).map((entry) => ({
      file: entry.file,
      selector: entry.selector,
      theme: entry.theme,
    })),
  };
}

const results = windows.map(analyzeWindow);
const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  registrySource: "tooling/interface-guidelines-contract.mjs windowInterfaceRegistry",
  windowCount: windows.length,
  sourceKinds: Object.fromEntries(["static", "dynamic", "lazy"].map((kind) => [
    kind,
    windows.filter((window) => window.sourceKind === kind).length,
  ])),
  windowsWithCss: results.filter((w) => w.ruleCount > 0).length,
  windowsWithChildAppSpecific: results.filter((w) => w.childAppSpecific > 0).map((w) => w.id),
  windowsWithFamilySelectors: results.filter((w) => w.familySelectors > 0).map((w) => ({
    id: w.id,
    count: w.familySelectors,
  })),
  windowsWithLiquidSelectors: results.filter((w) => w.liquidSelectors > 0).map((w) => ({
    id: w.id,
    count: w.liquidSelectors,
  })),
  windowsWithNoSemanticTokens: results.filter((w) => w.ruleCount > 0 && w.tokenConsumers === 0).map((w) => w.id),
  appTokenUsage: aggregateTokens(results),
};

function aggregateTokens(results) {
  const counts = new Map();
  for (const window of results) {
    for (const token of window.consumedTokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([token, windows]) => ({ token, windows }))
    .sort((a, b) => b.windows - a.windows);
}

const args = process.argv.slice(2);
const jsonIndex = args.indexOf("--json");
if (jsonIndex !== -1 && args[jsonIndex + 1]) {
  const outputPath = args[jsonIndex + 1];
  mkdirSync(dirname(join(root, outputPath)), { recursive: true });
  writeFileSync(join(root, outputPath), `${JSON.stringify({ summary, windows: results }, null, 2)}\n`);
  console.log(`OK  coverage JSON: ${outputPath}`);
}

console.log(`Registered windows: ${summary.windowCount}`);
console.log(`Windows with app CSS rules: ${summary.windowsWithCss}`);
console.log(`Windows with child+app-specific theme selectors: ${summary.windowsWithChildAppSpecific.length} (${summary.windowsWithChildAppSpecific.join(", ") || "none"})`);
console.log(`Windows with family theme selectors: ${summary.windowsWithFamilySelectors.length}`);
for (const entry of summary.windowsWithFamilySelectors) {
  console.log(`  ${entry.id}: ${entry.count}`);
}
console.log(`Windows with Liquid Glass twin selectors: ${summary.windowsWithLiquidSelectors.length}`);
console.log(`Windows with layout-only app CSS (no era-material tokens; pure shared primitives): ${summary.windowsWithNoSemanticTokens.length} (${summary.windowsWithNoSemanticTokens.join(", ") || "none"})`);
console.log("\nTop app-token consumers (token: window count):");
for (const entry of summary.appTokenUsage.slice(0, 25)) {
  console.log(`  ${entry.token}: ${entry.windows}`);
}
