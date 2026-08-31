// Ratcheting CSS budgets and theme-twin checks.
//
// Three families of checks:
// 1. Per-file !important + z-index budgets (ratchet, only allowed to shrink).
// 2. Inline element.style.<layout> count in app/ (ratchet).
// 3. Liquid-glass twins:
//    - Orphan check: every body.use-liquid-glass selector must reference a
//      class/id token that still exists somewhere in the non-theme CSS files.
//      Catches the case where a base selector gets renamed or deleted but
//      its liquid-glass override is left behind, drifting silently.
//    - Twin count ratchet: total number of liquid-glass twin selectors only
//      allowed to shrink. Pushes the codebase toward token-based theming
//      (override CSS variables in :root vs duplicating selectors).
//
// Updating any budget upward is a deliberate, reviewable edit to
// tooling/css-budget.json.
//
// Rationale and full skill: .claude/skills/css-no-pingpong/SKILL.md

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProjectPath } from "./lib/paths.mjs";
import { GEOMETRY_PROPERTIES, BORDER_SHORTHAND } from "./lib/appearance-geometry.mjs";
import { styleLayerByPath } from "./style-manifest.mjs";
import {
  applicationCssPrefixes,
  windowInterfaceRegistry,
} from "./interface-guidelines-contract.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const budget = JSON.parse(readFileSync(join(root, "tooling/css-budget.json"), "utf8"));
const failures = [];
const cliArgs = process.argv.slice(2);
const requestedCssFiles = [];

function normalizeRequestedCssFile(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  return normalized.startsWith("apps/desktop/")
    ? normalized.slice("apps/desktop/".length)
    : normalized;
}

for (let index = 0; index < cliArgs.length; index += 1) {
  const arg = cliArgs[index];
  if (arg === "--file") {
    const value = normalizeRequestedCssFile(cliArgs[index + 1]);
    if (!value || value.startsWith("--")) {
      console.error("NO  --file requires a path under apps/desktop/styles/.");
      process.exit(1);
    }
    requestedCssFiles.push(value);
    index += 1;
  } else if (arg === "--help") {
    console.log(`Usage:
  node tooling/verify-css.mjs
  node tooling/verify-css.mjs --file apps/desktop/styles/10-windows.css [--file apps/desktop/styles/00-foundation.css]

Without --file the release-grade gate checks every stylesheet. Repeated --file
arguments scope the normal edit loop to the styles owned by the current task.`);
    process.exit(0);
  } else {
    console.error(`NO  unknown CSS verification option: ${arg}`);
    process.exit(1);
  }
}

function ok(msg) { console.log(`OK  ${msg}`); }
function fail(msg) { failures.push(msg); console.error(`NO  ${msg}`); }

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function checkCssFile(relPath, budgets) {
  const text = readFileSync(resolveProjectPath(relPath), "utf8");
  const importantCount = countMatches(text, /!important/g);
  const zIndexCount = countMatches(text, /\bz-index\s*:/g);

  const importantBudget = budgets.important[relPath];
  if (importantBudget === undefined) {
    fail(`${relPath} has no !important budget entry; add one in tooling/css-budget.json`);
  } else if (importantCount > importantBudget) {
    fail(`${relPath}: !important = ${importantCount}, budget = ${importantBudget}. Stop adding overrides; fix specificity or move the rule out of the override layer.`);
  } else {
    ok(`${relPath}: !important ${importantCount}/${importantBudget}`);
  }

  const zBudget = budgets.zIndex[relPath];
  if (zBudget === undefined) {
    fail(`${relPath} has no z-index budget entry; add one in tooling/css-budget.json`);
  } else if (zIndexCount > zBudget) {
    fail(`${relPath}: z-index uses = ${zIndexCount}, budget = ${zBudget}. Reuse an existing layer or add a --z-* token instead.`);
  } else {
    ok(`${relPath}: z-index ${zIndexCount}/${zBudget}`);
  }
}

function checkCssBraceBalance(relPath) {
  const text = readFileSync(resolveProjectPath(relPath), "utf8");
  let depth = 0;
  let line = 1;
  let column = 0;
  let quote = "";
  let escaped = false;
  let inComment = false;
  let lastOpen = null;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    column += 1;

    if (char === "\n") {
      line += 1;
      column = 0;
    }

    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        i += 1;
        column += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "/" && next === "*") {
      inComment = true;
      i += 1;
      column += 1;
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      lastOpen = { line, column };
    } else if (char === "}") {
      if (depth === 0) {
        fail(`${relPath}: unmatched closing brace at ${line}:${column}. CSS files must be syntactically complete on their own; do not let a selector span file boundaries.`);
        return;
      }
      depth -= 1;
    }
  }

  if (inComment) {
    fail(`${relPath}: unterminated comment. CSS files must be syntactically complete on their own.`);
  } else if (quote) {
    fail(`${relPath}: unterminated string. CSS files must be syntactically complete on their own.`);
  } else if (depth !== 0) {
    const where = lastOpen ? `${lastOpen.line}:${lastOpen.column}` : "unknown";
    fail(`${relPath}: ${depth} unmatched opening brace(s), last opened at ${where}. CSS files must be syntactically complete on their own; do not let a selector span file boundaries.`);
  } else {
    ok(`${relPath}: balanced CSS blocks`);
  }
}

const stylesDir = join(root, "apps", "desktop", "styles");
const allCssFiles = readdirSync(stylesDir)
  .filter((name) => name.endsWith(".css"))
  .map((name) => `styles/${name}`)
  .sort();
const scopedCssCheck = requestedCssFiles.length > 0;
const cssFiles = scopedCssCheck
  ? [...new Set(requestedCssFiles)]
  : allCssFiles;

for (const relPath of cssFiles) {
  if (!/^styles\/[^/]+\.css$/.test(relPath) || !allCssFiles.includes(relPath)) {
    console.error(`NO  scoped CSS file must exist directly under apps/desktop/styles/: ${relPath}`);
    process.exit(1);
  }
}

cssFiles.forEach((relPath) => checkCssFile(relPath, budget));
cssFiles.forEach((relPath) => checkCssBraceBalance(relPath));

// --- Cascade-layer conformance ----------------------------------------------
//
// Each stylesheet owns exactly one @layer name (assigned in
// tooling/style-manifest.mjs); the cross-file layer ORDER is emitted by the
// build as a single preamble statement. A source file that opens someone
// else's layer — or ships its own bare `@layer a, b;` order statement — is
// jumping the cascade the same way a new !important would, so both fail here.
// Lane state: internal/agents/CSS-LAYER-LANE.md.

const LAYER_USE_PATTERN = /@layer\b([^;{]*)([;{])/g;
cssFiles.forEach((relPath) => {
  const assigned = styleLayerByPath[relPath];
  const text = stripComments(readFileSync(resolveProjectPath(relPath), "utf8"));
  const problems = [];
  for (const match of text.matchAll(LAYER_USE_PATTERN)) {
    const names = match[1].split(",").map((name) => name.trim()).filter(Boolean);
    if (match[2] === ";") {
      problems.push(
        `bare "@layer ${names.join(", ")};" order statement — the document order is emitted by the build from style-manifest.mjs`
      );
      continue;
    }
    if (!assigned) {
      problems.push(`file opens @layer but has no styleLayerByPath assignment in style-manifest.mjs`);
      continue;
    }
    if (names.length !== 1 || names[0] !== assigned) {
      problems.push(
        `opens @layer ${names.join(", ") || "(anonymous)"} — this file may only open @layer ${assigned}`
      );
    }
  }
  if (problems.length) {
    problems.forEach((problem) => fail(`${relPath}: ${problem}`));
  } else {
    ok(`${relPath}: cascade-layer usage conforms`);
  }
});

// Scrollbar regressions are especially expensive in this project: one broad
// selector can hit every nested pane, textarea, menu, and writing surface.
// Theme/tool-specific global scrollbars are allowed only in their owning files.
const BROAD_SCROLLBAR_ALLOWLIST = new Set([
  "styles/70-liquid-glass.css",
  "styles/90-endfield-terminal.css",
]);
const BROAD_SCROLLBAR_PATTERNS = [
  /(^|,)\s*\*::-[\w-]*scrollbar\b/m,
  /(^|,)\s*body\s+\*::-[\w-]*scrollbar\b/m,
  /(^|,)\s*html\s+\*::-[\w-]*scrollbar\b/m,
];

cssFiles
  .filter((path) => !BROAD_SCROLLBAR_ALLOWLIST.has(path))
  .forEach((path) => {
    const text = stripComments(readFileSync(resolveProjectPath(path), "utf8"));
    const offenders = BROAD_SCROLLBAR_PATTERNS
      .filter((pattern) => pattern.test(text))
      .map((pattern) => pattern.source);
    if (offenders.length) {
      fail(
        `${path}: broad scrollbar selector detected. Classic scrollbar styling must be opt-in/scoped to the owning surface; never use *::-webkit-scrollbar or body *::-webkit-scrollbar.`
      );
    } else {
      ok(`${path}: no broad default-theme scrollbar selector`);
    }
  });

// Catch CSS files that exist on disk but were not added to the budget.
if (!scopedCssCheck) {
  Object.keys(budget.important).forEach((relPath) => {
    if (!allCssFiles.includes(relPath)) {
      fail(`css-budget.json mentions ${relPath} but the file no longer exists; remove the stale entry`);
    }
  });
}

const INLINE_PATTERN = /\.style\.(top|left|right|bottom|width|height|padding|margin|maxWidth|maxHeight|minWidth|minHeight)\b/g;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "vendor") continue;
      walk(full, acc);
    } else if (entry.name.endsWith(".js")) {
      acc.push(full);
    }
  }
  return acc;
}

if (!scopedCssCheck) {
  let inlineTotal = 0;
  walk(join(root, "apps", "desktop", "app")).forEach((path) => {
    const text = readFileSync(path, "utf8");
    inlineTotal += countMatches(text, INLINE_PATTERN);
  });

  const inlineBudget = budget.inlineLayoutStyles.total;
  if (inlineTotal > inlineBudget) {
    fail(`app/: inline layout styles = ${inlineTotal}, budget = ${inlineBudget}. Use a class toggle or setProperty('--x', ...) instead of element.style.<layout> = ...`);
  } else {
    ok(`app/: inline layout styles ${inlineTotal}/${inlineBudget}`);
  }
}

// --- Token source check ------------------------------------------------------
//
// Only styles/00-foundation.css may define top-level :root {} or html {}
// blocks. Theme files may only override via body.<theme-class> {} (which
// scopes to a state, not the document root). Without this rule, three
// competing html {} blocks accumulated in 00-foundation.css + 60-responsive.css
// and the actual default-theme values for --ink, --shade, --control-radius
// etc. depended on which block loaded last — a silent-cascade trap that
// invited the same value to be redefined repeatedly across files.

const TOKEN_SOURCE_FILE = "styles/00-foundation.css";
const TOKEN_ROOT_BLOCK_PATTERN = /^(html|:root)\s*\{/m;

cssFiles
  .filter((path) => path !== TOKEN_SOURCE_FILE)
  .forEach((path) => {
    const text = stripComments(readFileSync(resolveProjectPath(path), "utf8"));
    // Strip the body of every "<selectors> { ... }" pair, then look for top-level
    // html{}/:root{} declarations. We accept selectors like html:lang(...) {} or
    // html .x {} — these are scoped, not root-token redefinitions.
    const lines = text.split("\n");
    const offenders = [];
    let depth = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (depth === 0) {
        const trimmed = line.trimStart();
        if (
          /^html\s*\{/.test(trimmed) ||
          /^:root\s*\{/.test(trimmed)
        ) {
          offenders.push(i + 1);
        }
      }
      for (const ch of line) {
        if (ch === "{") depth++;
        else if (ch === "}") depth = Math.max(0, depth - 1);
      }
    }
    if (offenders.length) {
      fail(
        `${path}: top-level html{} or :root{} block at line ${offenders.join(", ")}. Token defaults live only in ${TOKEN_SOURCE_FILE}; theme overrides go in body.<theme-class>{}.`
      );
    } else {
      ok(`${path}: no token-source redefinition`);
    }
  });

// --- Liquid-glass twin checks ------------------------------------------------

const LIQUID_FILE = "styles/70-liquid-glass.css";
const APPEARANCE_FILE = "styles/65-appearance-themes.css";
// The Aqua partial is a family-owned split of the Appearance layer (zero
// visual diff by contract); its per-era recipes must be counted by the same
// ratchet, otherwise Snow Leopard/Aqua selector walls grow invisibly.
const APPEARANCE_FILES = [APPEARANCE_FILE, "styles/67-aqua-appearance.css"];
const THEME_FILES = new Set([
  LIQUID_FILE,
  APPEARANCE_FILE,
  "styles/67-aqua-appearance.css",
  // Theme-scoped files that don't participate in twinning. Bureaucracy/meme
  // and Endfield Terminal are standalone surfaces, not base/theme pairs.
  "styles/80-bureaucracy-meme.css",
  "styles/90-endfield-terminal.css",
]);

// Drop /* ... */ comments before any parsing.
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

// Crude rule extractor: for each top-level "<selectors> { ... }" block returns
// the selectors array. Skips at-rule blocks like @media by descending into
// their bodies. Not a full CSS parser but adequate for selector enumeration.
function extractSelectorLists(text) {
  const clean = stripComments(text);
  const lists = [];
  let i = 0;
  while (i < clean.length) {
    const openIdx = clean.indexOf("{", i);
    if (openIdx === -1) break;
    const selectorChunk = clean.slice(i, openIdx).trim();
    // Find the matching close brace, tracking nesting (for @media etc).
    let depth = 1;
    let j = openIdx + 1;
    while (j < clean.length && depth > 0) {
      const c = clean[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      j++;
    }
    if (selectorChunk.startsWith("@")) {
      // At-rule: recurse into body so nested rules still get extracted.
      const body = clean.slice(openIdx + 1, j - 1);
      lists.push(...extractSelectorLists(body));
    } else if (selectorChunk) {
      lists.push(...splitSelectors(selectorChunk));
    }
    i = j;
  }
  return lists;
}

// Pull every .class and #id token from a selector string.
function extractClassIdTokens(selector) {
  return Array.from(selector.matchAll(/[.#][A-Za-z_-][\w-]*/g)).map((m) => m[0]);
}

const TWIN_PREFIX = /^(html:lang\([^)]+\)\s+)?body\.use-liquid-glass(\s|$)/;
const LIQUID_ONLY_BASE_PATTERNS = [
  /#liquid-glass-overlay\b/,
  /\.sys-icon-liquid\b/,
];

function classifyLiquidSelector(selector) {
  const m = selector.match(TWIN_PREFIX);
  if (!m) return { kind: "liquid-only", base: null };
  const base = selector.slice(m[0].length).trim();
  if (!base) return { kind: "body-only", base: null };
  if (LIQUID_ONLY_BASE_PATTERNS.some((pattern) => pattern.test(base))) {
    return { kind: "liquid-only", base: null };
  }
  return { kind: "twin", base };
}

const liquidText = readFileSync(resolveProjectPath(LIQUID_FILE), "utf8");
const liquidSelectors = extractSelectorLists(liquidText);
const twinBaseSelectors = [];
for (const sel of liquidSelectors) {
  const info = classifyLiquidSelector(sel);
  if (info.kind === "twin") twinBaseSelectors.push(info.base);
}
const twinCount = twinBaseSelectors.length;

const baseClassIds = new Set();
allCssFiles
  .filter((path) => !THEME_FILES.has(path))
  .forEach((path) => {
    const text = readFileSync(resolveProjectPath(path), "utf8");
    extractSelectorLists(text).forEach((sel) => {
      extractClassIdTokens(sel).forEach((tok) => baseClassIds.add(tok));
    });
  });

const orphanTwins = [];
for (const baseSel of new Set(twinBaseSelectors)) {
  const tokens = extractClassIdTokens(baseSel);
  // Element-only selectors (e.g. "button", "input[type=\"text\"]") have no
  // class/id tokens. Skip them — they always "exist" in base by definition.
  if (!tokens.length) continue;
  const missing = tokens.filter((tok) => !baseClassIds.has(tok));
  if (missing.length) orphanTwins.push({ baseSel, missing });
}

const orphanBudget = budget.liquidGlassOrphanCount;
if (typeof orphanBudget !== "number") {
  fail(`tooling/css-budget.json is missing liquidGlassOrphanCount`);
} else if (orphanTwins.length > orphanBudget) {
  fail(
    `${LIQUID_FILE}: orphan twin selectors = ${orphanTwins.length}, budget = ${orphanBudget}. ` +
      `Some twin base class/id no longer appears in any non-theme CSS file. New orphans usually mean a base selector was renamed or deleted while leaving its liquid-glass override behind. First 10:`
  );
  orphanTwins.slice(0, 10).forEach(({ baseSel, missing }) => {
    fail(`  body.use-liquid-glass ${baseSel}   (missing: ${missing.join(", ")})`);
  });
  if (orphanTwins.length > 10) {
    fail(`  … and ${orphanTwins.length - 10} more`);
  }
  fail(
    `  Either restore the base selector, delete the orphan twin, or — if you intentionally cleaned one up — lower liquidGlassOrphanCount in css-budget.json.`
  );
} else {
  ok(`${LIQUID_FILE}: orphan twin selectors ${orphanTwins.length}/${orphanBudget}`);
}

const twinBudget = budget.liquidGlassTwinCount;
if (typeof twinBudget !== "number") {
  fail(`tooling/css-budget.json is missing liquidGlassTwinCount`);
} else if (twinCount > twinBudget) {
  fail(
    `${LIQUID_FILE}: twin selectors = ${twinCount}, budget = ${twinBudget}. ` +
      `Prefer migrating pure-value overrides to CSS variables in :root (theme = value swap, not selector duplication). ` +
      `See CLAUDE.md → CSS Stability.`
  );
} else {
  ok(`${LIQUID_FILE}: twin selectors ${twinCount}/${twinBudget}`);
}

// --- Multi-era Appearance checks -------------------------------------------
//
// New historical themes start token-first. A per-era recipe selector is
// permitted only in the owning Appearance file, is capped, must reference a
// real base primitive, and may not be copied across themes. Shared recipes use
// data-theme-family; repeated per-era selectors are evidence of a missing
// semantic token or family recipe.

const APPEARANCE_THEME_IDS = Object.freeze([
  "classic",
  "platinum",
  "aqua",
  "snow-leopard",
  "yosemite",
  "liquid-glass",
]);
const appearanceSelectors = APPEARANCE_FILES.flatMap((relPath) =>
  extractSelectorLists(readFileSync(resolveProjectPath(relPath), "utf8"))
);
// Structural recipe checks (orphans, duplicates) stay scoped to the main
// Appearance file: 67's aqua/snow-leopard era recipes intentionally pair the
// same shared primitives, and pruning them is a separate selector-wall task.
const appearanceSelectors65 = extractSelectorLists(
  readFileSync(resolveProjectPath(APPEARANCE_FILE), "utf8")
);
const appearanceThemeSelectorLimit = budget.appearanceThemeSelectorLimit;
const appearanceThemeSelectorLimits = budget.appearanceThemeSelectorLimits
  ?? Object.fromEntries(APPEARANCE_THEME_IDS.map((id) => [id, appearanceThemeSelectorLimit]));
if (Object.values(appearanceThemeSelectorLimits).some((value) => typeof value !== "number")) {
  fail("tooling/css-budget.json is missing appearanceThemeSelectorLimit(s)");
}

const recipesByBase = new Map();
const appearanceOrphans = [];
for (const themeId of APPEARANCE_THEME_IDS) {
  const escapedId = themeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp(`^(?:html|body)\\[data-theme=["']${escapedId}["']\\](?:\\s+|$)`);
  const owned = appearanceSelectors.filter((selector) => prefix.test(selector));
  const limit = appearanceThemeSelectorLimits[themeId];
  if (typeof limit === "number" && owned.length > limit) {
    fail(`${APPEARANCE_FILES.join(", ")}: ${themeId} selectors = ${owned.length}, limit = ${limit}. Promote repeated values to semantic tokens or a family recipe.`);
  } else if (typeof limit === "number") {
    ok(`${APPEARANCE_FILES.join(", ")}: ${themeId} selectors ${owned.length}/${limit}`);
  }
}

// Structural recipes (orphans, duplicates) stay scoped to the main
// Appearance file: 67's aqua/snow-leopard era recipes intentionally pair the
// same shared primitives, and pruning them is a separate selector-wall task.
// A base shared by a theme and its recipeBase parent is the documented
// derivation delta (classic->platinum, aqua->snow-leopard,
// liquid-glass->yosemite), not a copy-paste duplicate.
const RECIPE_PARENTS = Object.freeze({
  platinum: "classic",
  "snow-leopard": "aqua",
  yosemite: "liquid-glass",
});
for (const themeId of APPEARANCE_THEME_IDS) {
  const escapedId = themeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp(`^(?:html|body)\\[data-theme=["']${escapedId}["']\\](?:\\s+|$)`);
  const owned = appearanceSelectors65.filter((selector) => prefix.test(selector));
  for (const selector of owned) {
    const base = selector.replace(prefix, "").trim();
    if (!base) continue;
    const themeSet = recipesByBase.get(base) || new Set();
    themeSet.add(themeId);
    recipesByBase.set(base, themeSet);
    const missing = extractClassIdTokens(base).filter((token) => !baseClassIds.has(token));
    if (missing.length) appearanceOrphans.push({ themeId, base, missing });
  }
}

for (const [base, themes] of recipesByBase) {
  // Icon painters are per-era by design: the same semantic icon id maps to a
  // different per-theme asset (systemIcon(id) -> theme painter), so the same
  // .sys-icon base is expected in every era. The duplicate check targets
  // structural recipes that should have been promoted to a token or a family
  // recipe, not the icon dispatch layer.
  if (/\.sys-icon\b|\[data-system-icon=/.test(base)) continue;
  const themeList = [...themes];
  // Order-independent parent check: at most one member may lack its
  // recipeBase in the set (that member is the root of the derivation chain).
  const hasParentInSet = (themeId) => Boolean(
    RECIPE_PARENTS[themeId] && themeList.includes(RECIPE_PARENTS[themeId])
  );
  const derivedFromParent = themeList.length <= 1
    || themeList.filter(hasParentInSet).length >= themeList.length - 1;
  if (themeList.length > 1 && !derivedFromParent) {
    fail(`${APPEARANCE_FILES.join(", ")}: duplicated per-theme recipe "${base}" in ${themeList.join(", ")}. Use semantic tokens or data-theme-family.`);
  }
}

const familySelectors = appearanceSelectors65.filter((selector) => /^(?:html|body)\[data-theme-family=/.test(selector));
for (const selector of familySelectors) {
  const base = selector.replace(/^(?:html|body)\[data-theme-family=["'][^"']+["']\]\s*/, "").trim();
  const missing = extractClassIdTokens(base).filter((token) => !baseClassIds.has(token));
  if (missing.length) appearanceOrphans.push({ themeId: "family", base, missing });
}

if (appearanceOrphans.length) {
  appearanceOrphans.slice(0, 10).forEach(({ themeId, base, missing }) => {
    fail(`${APPEARANCE_FILE}: orphan ${themeId} recipe "${base}" (missing: ${missing.join(", ")})`);
  });
} else {
  ok(`${APPEARANCE_FILE}: no orphan theme recipes`);
}

// --- Child-theme app-specific recipe ratchet --------------------------------
//
// Derived appearances (Platinum, Snow Leopard, Yosemite) inherit their
// parent's DOM, interaction, and layout semantics and own only an era delta:
// geometry, font, color, bevel, shadow, selection, scrollbar, window chrome,
// era material. A child recipe whose base references a registered app-window
// class is app-specific knowledge — it means every new business app needs a
// per-child-era patch, and the three-family model has failed. Such selectors
// may only decrease. A genuine system-level historical exception (for example
// a Desk Accessory that is really a system component) goes into
// budget.childAppSpecificAllowlist with a justification.
const CHILD_THEME_IDS = ["platinum", "snow-leopard", "yosemite"];
const SHARED_WINDOW_PRIMITIVES = new Set([".window", ".window-pane"]);
const childAppAllowlist = new Set(budget.childAppSpecificAllowlist || []);
const childAppPrefixes = applicationCssPrefixes;
const childAppViolations = [];
let childAppSpecificCount = 0;
for (const themeId of CHILD_THEME_IDS) {
  const escapedId = themeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp(`^(?:html|body)\\[data-theme=["']${escapedId}["']\\](?:\\s+|$)`);
  for (const selector of appearanceSelectors) {
    if (!prefix.test(selector)) continue;
    const base = selector.replace(prefix, "").trim();
    const appTokens = extractClassIdTokens(base).filter((token) => {
      if (SHARED_WINDOW_PRIMITIVES.has(token) || /^\.is-/.test(token)) return false;
      if (childAppAllowlist.has(token) || childAppAllowlist.has(`${themeId}:${token}`)) return false;
      const className = token.replace(/^[.#]/, "");
      return childAppPrefixes.some((appPrefix) => className.startsWith(appPrefix));
    });
    if (!appTokens.length) continue;
    childAppSpecificCount += 1;
    childAppViolations.push({ themeId, selector, appTokens });
  }
}
const childAppBudget = budget.childAppSpecificSelectorLimit;
if (typeof childAppBudget !== "number") {
  fail("tooling/css-budget.json is missing childAppSpecificSelectorLimit");
} else if (childAppSpecificCount > childAppBudget) {
  fail(
    `${APPEARANCE_FILE}: child+app-specific selectors = ${childAppSpecificCount}, budget = ${childAppBudget}. ` +
      `A child appearance must understand system controls, not business apps; promote the app surface to semantic tokens or a family recipe. Violations:`
  );
  childAppViolations.slice(0, 10).forEach(({ themeId, selector, appTokens }) => {
    fail(`  ${themeId}: ${selector}   (app classes: ${appTokens.join(", ")})`);
  });
  fail("  Add a justified allowlist entry in tooling/css-budget.json only for a system-level historical exception.");
} else {
  ok(`${APPEARANCE_FILE}: child+app-specific selectors ${childAppSpecificCount}/${childAppBudget} across ${Object.keys(windowInterfaceRegistry).length} registered windows`);
}

const OUTSIDE_THEME_SELECTOR_PATTERN = /\b(?:body(?:\.use-liquid-glass|:not\(\.use-liquid-glass\))|(?:html|body)\[data-theme(?:-family)?=)/;
const outsideThemeBudgets = budget.themeSelectorsOutsideLiquid ?? {};
cssFiles
  .filter((path) => path !== LIQUID_FILE && path !== APPEARANCE_FILE)
  .forEach((path) => {
    const text = readFileSync(resolveProjectPath(path), "utf8");
    const count = extractSelectorLists(text).filter((sel) =>
      OUTSIDE_THEME_SELECTOR_PATTERN.test(sel)
    ).length;
    if (count === 0 && outsideThemeBudgets[path] === undefined) return;
    const allowed = outsideThemeBudgets[path];
    if (typeof allowed !== "number") {
      fail(
        `${path}: theme selectors outside ${LIQUID_FILE} = ${count}, but no themeSelectorsOutsideLiquid budget exists. ` +
          `Move theme overrides to ${LIQUID_FILE} or add an explicit allowlist budget.`
      );
    } else if (count > allowed) {
      fail(
        `${path}: theme selectors outside ${LIQUID_FILE} = ${count}, budget = ${allowed}. ` +
          `Keep Liquid Glass/default theme forks from spreading outside the theme layer.`
      );
    } else {
      ok(`${path}: theme selectors outside ${LIQUID_FILE} ${count}/${allowed}`);
    }
  });

// --- Appearance geometry ratchet ---------------------------------------------
//
// Six appearances only multiply the verification matrix where they carry
// LAYOUT. A declaration that recolors or re-materials a surface cannot move
// anything, so its correctness is a token diff — cheap, deterministic, and
// already covered by tests/visual-snapshot.json. A declaration that sets
// geometry makes that appearance a separate layout at that spot, and only an
// eye or a pixel snapshot can check it.
//
// Measured 2026-08-21: of 5,969 declarations across the three appearance files,
// 846 set geometry. Those are the entire reason the matrix multiplies — not the
// six appearances, and not the 10,166 lines. This ratchet freezes that number
// and lets it only fall, so a new feature can never add a cell to the matrix.
//
// Draining it is follow-up work, and it is NOT a sweep. The obvious candidate —
// rewriting `border: 1px solid <color>` as border-color — was tried and rejected:
// base .btn draws `var(--system-control-line) solid`, and that token is 1.5px
// under body.use-modern-fonts, so Platinum's literal 1px is a deliberate
// override rather than a duplicate. Converting it blindly would have changed
// Platinum + modern fonts silently, which is the exact failure this budget
// exists to stop. Drain a site when you are touching it anyway and can show the
// base rule it inherits; the honest form is usually a per-appearance token
// override, which this counter does not charge for. An era typeface or an era
// title-bar height is real geometry and stays.

// GEOMETRY_PROPERTIES and BORDER_SHORTHAND moved to lib/appearance-geometry.mjs
// (imported at the top of this file): the same vocabulary this ratchet charges
// is what appearance-token-check.mjs probes in the browser, and two copies of
// the list would let the two gates disagree about what layout is.

/**
 * Count the declarations in one stylesheet that can move something on screen.
 *
 * Custom properties are never charged: a token is a value, and swapping a value
 * is what an appearance is allowed to do. A border shorthand is charged only
 * when it changes the hairline's width — every appearance draws 1px and merely
 * recolors it, so those are reported separately as the drainable pile.
 */
function countAppearanceGeometry(relPath) {
  const css = stripComments(readFileSync(resolveProjectPath(relPath), "utf8"));
  let geometry = 0;
  let hairline = 0;
  const tally = new Map();
  for (const block of css.match(/\{[^{}]*\}/g) || []) {
    for (const declaration of block.slice(1, -1).split(";")) {
      const colon = declaration.indexOf(":");
      if (colon < 0) continue;
      const property = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).trim();
      if (!value || property.startsWith("--")) continue;
      if (!/^[a-zA-Z][-a-zA-Z0-9]*$/.test(property)) continue;
      if (BORDER_SHORTHAND.test(property)) {
        // `border: 0` removes the hairline, which is a layout decision.
        if (/^0(\s|$)/.test(value)) { geometry += 1; tally.set(property, (tally.get(property) || 0) + 1); }
        else if (/^1px\b/.test(value)) hairline += 1;
        else { geometry += 1; tally.set(property, (tally.get(property) || 0) + 1); }
        continue;
      }
      if (!GEOMETRY_PROPERTIES.has(property)) continue;
      geometry += 1;
      tally.set(property, (tally.get(property) || 0) + 1);
    }
  }
  const worst = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([property, count]) => `${property} ${count}`).join(", ");
  return { geometry, hairline, worst };
}

/**
 * Top-level rules in an appearance sheet that carry no appearance prefix.
 *
 * Such a rule ships to all six appearances from inside a theme file, where
 * neither this ratchet nor the liquid-glass twin audit can say it does not
 * belong — both only reason about prefixed selectors. Twenty geometry
 * declarations reached every appearance that way before anyone noticed.
 *
 * A rule that declares nothing but custom properties is exempt: the sprite-cell
 * mappings (`[data-system-icon="…"] { --sx: 0 }`) are theme-independent data by
 * design, and a token cannot lay anything out. Only a real property authored
 * without a prefix is the shape this looks for.
 */
function countUnprefixedRules(relPath) {
  const css = stripComments(readFileSync(resolveProjectPath(relPath), "utf8"));
  const offenders = [];
  let index = 0;
  let depth = 0;
  let selectorStart = 0;
  while (index < css.length) {
    const char = css[index];
    if (char === "{") {
      if (depth === 0) {
        const selectorText = css.slice(selectorStart, index).trim();
        let braces = 0;
        let end = index;
        for (let scan = index; scan < css.length; scan += 1) {
          if (css[scan] === "{") braces += 1;
          else if (css[scan] === "}") { braces -= 1; if (!braces) { end = scan; break; } }
        }
        if (selectorText && !selectorText.startsWith("@")) {
          const selectors = selectorText.split(",").map((one) => one.trim()).filter(Boolean);
          const body = css.slice(index + 1, end);
          const declaresRealProperty = body.split(";").some((declaration) => {
            const colon = declaration.indexOf(":");
            if (colon < 0) return false;
            const property = declaration.slice(0, colon).trim();
            return /^[a-zA-Z-]+$/.test(property) && !property.startsWith("--");
          });
          if (declaresRealProperty
            && selectors.length
            && selectors.every((one) => !/use-liquid-glass|\[data-theme/.test(one))) {
            offenders.push(selectors[0].replace(/\s+/g, " ").slice(0, 70));
          }
        }
        index = end + 1;
        selectorStart = index;
        continue;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth <= 0) { depth = 0; selectorStart = index + 1; }
    }
    index += 1;
  }
  return offenders;
}

const APPEARANCE_GEOMETRY_FILES = [
  APPEARANCE_FILE,
  "styles/67-aqua-appearance.css",
  LIQUID_FILE,
];

// Theme Lab's cost to the appearance sheets, ratcheted. A specimen made of
// theme-lab-* classes is a second wardrobe every era has to sew, and the copy
// drifts from the shipping control it stands for. Converting a specimen to the
// real component lowers this; nothing may raise it.
// Era token coverage. A token two eras set is a period decision the appearance
// system expects every era to answer; a token one era sets is that era's own
// quirk. Coverage is how many of the first kind an era answers, following its
// recipe chain, and it is what makes a seventh appearance cheap: the number is
// its worklist, and Theme Lab shows the same list on screen.
//
// The rule is asymmetric on purpose. A NEW era must answer all of them, because
// arriving complete is the whole point. The six that exist arrived before this
// gate and carry real debt, so each is held to a count that may only fall — the
// same ratchet shape the replica budget uses. A gate that is red on the day it
// lands teaches people to ignore it.
function eraTokenCoverage() {
  const registry = readFileSync(resolveProjectPath("apps/desktop/app/core/theme-registry.js"), "utf8");
  const ids = [...registry.matchAll(/\bid:\s*"([a-z-]+)"/g)].map((match) => match[1]);
  const bases = [...registry.matchAll(/\brecipeBase:\s*(?:"([a-z-]+)"|null)/g)].map((match) => match[1] || null);
  const parent = new Map(ids.map((id, index) => [id, bases[index] ?? null]));
  const sources = APPEARANCE_GEOMETRY_FILES
    .map((relPath) => readFileSync(resolveProjectPath(relPath), "utf8"))
    .join("\n");
  const own = new Map();
  for (const id of ids) {
    const blocks = id === "liquid-glass"
      ? /body\.use-liquid-glass\s*\{([^}]*)\}/g
      : new RegExp(`(?:html|body)\\[data-theme="${id}"\\][^{]*\\{([^}]*)\\}`, "g");
    const tokens = new Set();
    for (const block of sources.matchAll(blocks)) {
      for (const declaration of block[1].matchAll(/(--[a-z0-9-]+)\s*:/g)) {
        // Theme Lab's own furniture is not something an appearance owes.
        if (!declaration[1].startsWith("--theme-lab-")) tokens.add(declaration[1]);
      }
    }
    own.set(id, tokens);
  }
  const seen = new Map();
  for (const tokens of own.values()) {
    for (const name of tokens) seen.set(name, (seen.get(name) || 0) + 1);
  }
  const period = new Set([...seen].filter(([, count]) => count >= 2).map(([name]) => name));
  const missing = new Map();
  for (const id of ids) {
    const answered = new Set();
    for (let cursor = id; cursor; cursor = parent.get(cursor)) {
      for (const name of own.get(cursor) || []) if (period.has(name)) answered.add(name);
    }
    missing.set(id, [...period].filter((name) => !answered.has(name)).sort());
  }
  return { ids, period, missing };
}

const coverageBudgets = budget.eraTokenCoverage;
if (!coverageBudgets || typeof coverageBudgets !== "object") {
  fail("tooling/css-budget.json is missing eraTokenCoverage");
} else if (!scopedCssCheck || APPEARANCE_GEOMETRY_FILES.some((f) => cssFiles.includes(f))) {
  const { ids, period, missing } = eraTokenCoverage();
  for (const id of ids) {
    if (coverageBudgets.baselineEra === id) {
      ok(`${id}: baseline appearance, defines the defaults the other eras answer`);
      continue;
    }
    const allowed = coverageBudgets.missing?.[id];
    const found = missing.get(id) || [];
    if (typeof allowed !== "number") {
      if (found.length) {
        fail(
          `${id}: a new appearance must answer every period token — ${found.length} of ${period.size} unanswered. `
            + `Theme Lab's Tokens tab lists them. First few: ${found.slice(0, 6).join(", ")}`
        );
      } else {
        ok(`${id}: new appearance answers all ${period.size} period tokens`);
      }
      continue;
    }
    if (found.length > allowed) {
      fail(
        `${id}: unanswered period tokens = ${found.length}, budget = ${allowed}. `
          + `An era may only get more complete. Newly unanswered: ${found.slice(0, 6).join(", ")}`
      );
    } else {
      ok(`${id}: unanswered period tokens ${found.length}/${allowed}`);
    }
  }
}

const replicaBudgets = budget.themeLabReplicaMentions;
if (!replicaBudgets || typeof replicaBudgets !== "object") {
  fail("tooling/css-budget.json is missing themeLabReplicaMentions");
} else if (!scopedCssCheck || APPEARANCE_GEOMETRY_FILES.some((f) => cssFiles.includes(f))) {
  for (const relPath of APPEARANCE_GEOMETRY_FILES) {
    const allowed = replicaBudgets[relPath];
    if (typeof allowed !== "number") {
      fail(`${relPath} has no themeLabReplicaMentions budget entry; add one in tooling/css-budget.json`);
      continue;
    }
    const found = (readFileSync(resolveProjectPath(relPath), "utf8").match(/theme-lab/g) || []).length;
    if (found > allowed) {
      fail(
        `${relPath}: theme-lab mentions = ${found}, budget = ${allowed}. `
          + `An era dressing a Theme Lab replica is dressing the same object twice, and only the copy is on the board. `
          + `Convert the specimen to the shipping component and move its era metrics onto that component's tokens.`
      );
    } else {
      ok(`${relPath}: Theme Lab replica mentions ${found}/${allowed}`);
    }
  }
}

const geometryBudgets = budget.appearanceGeometry;
if (!geometryBudgets || typeof geometryBudgets !== "object") {
  const measured = Object.fromEntries(
    APPEARANCE_GEOMETRY_FILES.map((relPath) => {
      const { geometry, hairline } = countAppearanceGeometry(relPath);
      return [relPath, { geometry, hairline }];
    })
  );
  fail(
    "tooling/css-budget.json is missing appearanceGeometry. Measured now:\n"
      + JSON.stringify(measured, null, 2)
  );
} else if (!scopedCssCheck || APPEARANCE_GEOMETRY_FILES.some((f) => cssFiles.includes(f))) {
  for (const relPath of APPEARANCE_GEOMETRY_FILES) {
    const allowed = geometryBudgets[relPath];
    if (!allowed || typeof allowed.geometry !== "number" || typeof allowed.hairline !== "number") {
      fail(`${relPath} has no appearanceGeometry budget entry; add one in tooling/css-budget.json`);
      continue;
    }
    const { geometry, hairline, worst } = countAppearanceGeometry(relPath);
    if (geometry > allowed.geometry) {
      fail(
        `${relPath}: geometry declarations = ${geometry}, budget = ${allowed.geometry}. `
          + `An appearance that sets layout becomes its own layout to verify — that is what makes the `
          + `matrix multiply. Move the value to a token, or put the rule in the base sheet. `
          + `Heaviest here: ${worst}.`
      );
    } else {
      ok(`${relPath}: appearance geometry ${geometry}/${allowed.geometry}`);
    }
    const unprefixed = countUnprefixedRules(relPath);
    const unprefixedBudget = allowed.unprefixed;
    if (typeof unprefixedBudget !== "number") {
      fail(`${relPath} has no appearanceGeometry.unprefixed budget; measured ${unprefixed.length}`);
    } else if (unprefixed.length > unprefixedBudget) {
      fail(
        `${relPath}: unprefixed top-level rules = ${unprefixed.length}, budget = ${unprefixedBudget}. `
          + `A rule with no appearance prefix ships to all six appearances from inside a theme sheet, `
          + `where neither this ratchet nor the twin audit can see that it does not belong. `
          + `Move it to the base sheet that owns its selector. First: ${unprefixed.slice(0, 3).join(" | ")}`
      );
    } else {
      ok(`${relPath}: unprefixed top-level rules ${unprefixed.length}/${unprefixedBudget}`);
    }

    if (hairline > allowed.hairline) {
      fail(
        `${relPath}: 1px border shorthands = ${hairline}, budget = ${allowed.hairline}. `
          + `Set border-color and leave the width in the base sheet, so the hairline stays one layout.`
      );
    } else {
      ok(`${relPath}: 1px border shorthands ${hairline}/${allowed.hairline}`);
    }
  }
}

if (failures.length) {
  console.error(`\nCSS budget verification failed: ${failures.length} issue(s).`);
  console.error(`See .claude/skills/css-no-pingpong/SKILL.md for the rationale and rules.`);
  process.exit(1);
}

console.log("\nCSS budget verification passed.");
