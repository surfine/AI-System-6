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
// scripts/css-budget.json.
//
// Rationale and full skill: .claude/skills/css-no-pingpong/SKILL.md

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const budget = JSON.parse(readFileSync(join(root, "scripts/css-budget.json"), "utf8"));
const failures = [];
const cliArgs = process.argv.slice(2);
const requestedCssFiles = [];

for (let index = 0; index < cliArgs.length; index += 1) {
  const arg = cliArgs[index];
  if (arg === "--file") {
    const value = String(cliArgs[index + 1] || "").replaceAll("\\", "/");
    if (!value || value.startsWith("--")) {
      console.error("NO  --file requires a path under styles/.");
      process.exit(1);
    }
    requestedCssFiles.push(value);
    index += 1;
  } else if (arg === "--help") {
    console.log(`Usage:
  node scripts/verify-css.mjs
  node scripts/verify-css.mjs --file styles/10-windows.css [--file styles/00-foundation.css]

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
  const text = readFileSync(join(root, relPath), "utf8");
  const importantCount = countMatches(text, /!important/g);
  const zIndexCount = countMatches(text, /\bz-index\s*:/g);

  const importantBudget = budgets.important[relPath];
  if (importantBudget === undefined) {
    fail(`${relPath} has no !important budget entry; add one in scripts/css-budget.json`);
  } else if (importantCount > importantBudget) {
    fail(`${relPath}: !important = ${importantCount}, budget = ${importantBudget}. Stop adding overrides; fix specificity or move the rule out of the override layer.`);
  } else {
    ok(`${relPath}: !important ${importantCount}/${importantBudget}`);
  }

  const zBudget = budgets.zIndex[relPath];
  if (zBudget === undefined) {
    fail(`${relPath} has no z-index budget entry; add one in scripts/css-budget.json`);
  } else if (zIndexCount > zBudget) {
    fail(`${relPath}: z-index uses = ${zIndexCount}, budget = ${zBudget}. Reuse an existing layer or add a --z-* token instead.`);
  } else {
    ok(`${relPath}: z-index ${zIndexCount}/${zBudget}`);
  }
}

function checkCssBraceBalance(relPath) {
  const text = readFileSync(join(root, relPath), "utf8");
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

const stylesDir = join(root, "styles");
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
    console.error(`NO  scoped CSS file must exist directly under styles/: ${relPath}`);
    process.exit(1);
  }
}

cssFiles.forEach((relPath) => checkCssFile(relPath, budget));
cssFiles.forEach((relPath) => checkCssBraceBalance(relPath));

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
    const text = stripComments(readFileSync(join(root, path), "utf8"));
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
  walk(join(root, "app")).forEach((path) => {
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
    const text = stripComments(readFileSync(join(root, path), "utf8"));
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
const THEME_FILES = new Set([
  LIQUID_FILE,
  APPEARANCE_FILE,
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

const liquidText = readFileSync(join(root, LIQUID_FILE), "utf8");
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
    const text = readFileSync(join(root, path), "utf8");
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
  fail(`scripts/css-budget.json is missing liquidGlassOrphanCount`);
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
  fail(`scripts/css-budget.json is missing liquidGlassTwinCount`);
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
  "liquid-glass",
]);
const appearanceText = readFileSync(join(root, APPEARANCE_FILE), "utf8");
const appearanceSelectors = extractSelectorLists(appearanceText);
const appearanceLimit = budget.appearanceThemeSelectorLimit;
if (typeof appearanceLimit !== "number") {
  fail("scripts/css-budget.json is missing appearanceThemeSelectorLimit");
}

const recipesByBase = new Map();
const appearanceOrphans = [];
for (const themeId of APPEARANCE_THEME_IDS) {
  const escapedId = themeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp(`^(?:html|body)\\[data-theme=["']${escapedId}["']\\](?:\\s+|$)`);
  const owned = appearanceSelectors.filter((selector) => prefix.test(selector));
  if (typeof appearanceLimit === "number" && owned.length > appearanceLimit) {
    fail(`${APPEARANCE_FILE}: ${themeId} selectors = ${owned.length}, limit = ${appearanceLimit}. Promote repeated values to semantic tokens or a family recipe.`);
  } else if (typeof appearanceLimit === "number") {
    ok(`${APPEARANCE_FILE}: ${themeId} selectors ${owned.length}/${appearanceLimit}`);
  }
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
  if (themes.size > 1) {
    fail(`${APPEARANCE_FILE}: duplicated per-theme recipe "${base}" in ${[...themes].join(", ")}. Use semantic tokens or data-theme-family.`);
  }
}

const familySelectors = appearanceSelectors.filter((selector) => /^(?:html|body)\[data-theme-family=/.test(selector));
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

const OUTSIDE_THEME_SELECTOR_PATTERN = /\b(?:body(?:\.use-liquid-glass|:not\(\.use-liquid-glass\))|(?:html|body)\[data-theme(?:-family)?=)/;
const outsideThemeBudgets = budget.themeSelectorsOutsideLiquid ?? {};
cssFiles
  .filter((path) => path !== LIQUID_FILE && path !== APPEARANCE_FILE)
  .forEach((path) => {
    const text = readFileSync(join(root, path), "utf8");
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

if (failures.length) {
  console.error(`\nCSS budget verification failed: ${failures.length} issue(s).`);
  console.error(`See .claude/skills/css-no-pingpong/SKILL.md for the rationale and rules.`);
  process.exit(1);
}

console.log("\nCSS budget verification passed.");
