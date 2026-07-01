// Classify every liquid-glass twin rule in styles/70-liquid-glass.css.
// Output a shopping list so agents can pick easy migration targets.
//
// Categories
//   easy        — only color/background/border/shadow/radius props.
//                 These can be moved to a CSS variable in :root with a
//                 body.use-liquid-glass override, deleting the twin entirely.
//   mixed       — has at least one "easy" prop and at least one structural
//                 prop. Tokenize the easy parts first; collocate the rest.
//   structural  — only structural props (top/left/width/height/padding/
//                 margin/grid/flex/display/transform/backdrop-filter/...).
//                 These cannot be tokenized as pure values; collocate next
//                 to the base rule when removing.
//   locale      — selector is qualified by html:lang(...). Treat with care:
//                 the theme + locale axis can hide more drift.
//   liquid-only — not a twin at all (selector exists only in liquid-glass,
//                 e.g. .sys-icon-liquid). Excluded from the migration target.
//
// Usage:
//   node scripts/audit-liquid-twins.mjs            (counts + top easy list)
//   node scripts/audit-liquid-twins.mjs --full     (all categories listed)
//   node scripts/audit-liquid-twins.mjs --json     (machine-readable)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const LIQUID = "styles/70-liquid-glass.css";
const args = new Set(process.argv.slice(2));
const fullList = args.has("--full");
const jsonOut = args.has("--json");

const VALUE_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "background-image",
  "background-blend-mode",
  "border",
  "border-color",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "box-shadow",
  "outline",
  "outline-color",
  "text-shadow",
  "opacity",
  "filter",
  "fill",
  "stroke",
]);

const STRUCTURAL_PROPS = new Set([
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "position",
  "display",
  "grid",
  "grid-template",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column",
  "grid-row",
  "flex",
  "flex-direction",
  "flex-wrap",
  "justify-content",
  "align-items",
  "align-self",
  "transform",
  "backdrop-filter",
  "-webkit-backdrop-filter",
  "gap",
  "row-gap",
  "column-gap",
]);

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

// Walk the file once, return an array of { selectors: string[], body: string }
// for each top-level rule. Handles @media etc. by descending into them.
function extractRules(text) {
  const clean = stripComments(text);
  const rules = [];
  function walk(slice) {
    let i = 0;
    while (i < slice.length) {
      const openIdx = slice.indexOf("{", i);
      if (openIdx === -1) break;
      const selectorChunk = slice.slice(i, openIdx).trim();
      let depth = 1;
      let j = openIdx + 1;
      while (j < slice.length && depth > 0) {
        const c = slice[j];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        j++;
      }
      const body = slice.slice(openIdx + 1, j - 1);
      if (selectorChunk.startsWith("@")) {
        walk(body);
      } else if (selectorChunk) {
        const selectors = splitSelectors(selectorChunk);
        rules.push({ selectors, body });
      }
      i = j;
    }
  }
  walk(clean);
  return rules;
}

const TWIN_PREFIX = /^(html:lang\([^)]+\)\s+)?body\.use-liquid-glass(\s|$)/;
const LIQUID_ONLY_BASE_PATTERNS = [
  /#liquid-glass-overlay\b/,
  /\.sys-icon-liquid\b/,
];

function classifySelector(selector) {
  const m = selector.match(TWIN_PREFIX);
  if (!m) return { kind: "liquid-only", base: null, localeQualified: false };
  const base = selector.slice(m[0].length).trim();
  const localeQualified = Boolean(m[1]);
  if (!base) return { kind: "body-only", base: null, localeQualified };
  if (LIQUID_ONLY_BASE_PATTERNS.some((pattern) => pattern.test(base))) {
    return { kind: "liquid-only", base: null, localeQualified };
  }
  return { kind: "twin", base, localeQualified };
}

// Extract the set of CSS property names that the rule body declares.
function extractPropertyNames(body) {
  const props = new Set();
  // Strip nested blocks (e.g. @supports inside a rule, rare but possible).
  const flat = body.replace(/\{[^}]*\}/g, "");
  const decls = flat.split(/;/);
  for (const d of decls) {
    const colonIdx = d.indexOf(":");
    if (colonIdx === -1) continue;
    const name = d.slice(0, colonIdx).trim().toLowerCase();
    if (name && /^(--|-?[a-z])/.test(name)) props.add(name);
  }
  return props;
}

function classifyProps(props) {
  let valueOnly = 0;
  let structural = 0;
  let other = 0;
  for (const p of props) {
    if (VALUE_PROPS.has(p)) valueOnly++;
    else if (STRUCTURAL_PROPS.has(p)) structural++;
    else other++;
  }
  return { valueOnly, structural, other, total: props.size };
}

function categorize(props) {
  const c = classifyProps(props);
  if (c.total === 0) return "empty";
  if (c.structural > 0 && c.valueOnly === 0 && c.other === 0) return "structural";
  if (c.valueOnly > 0 && c.structural === 0 && c.other === 0) return "easy";
  if (c.valueOnly > 0 && c.structural > 0) return "mixed";
  return "other";
}

const text = readFileSync(join(root, LIQUID), "utf8");
const rules = extractRules(text);

const entries = [];
for (const rule of rules) {
  for (const sel of rule.selectors) {
    const info = classifySelector(sel);
    if (info.kind === "liquid-only") {
      entries.push({ kind: "liquid-only", selector: sel, base: null, props: [], category: "n/a", localeQualified: false });
      continue;
    }
    if (info.kind === "body-only") continue;
    const props = extractPropertyNames(rule.body);
    const category = info.localeQualified ? "locale" : categorize(props);
    entries.push({
      kind: "twin",
      selector: sel,
      base: info.base,
      props: [...props].sort(),
      category,
      localeQualified: info.localeQualified,
    });
  }
}

const buckets = {
  easy: [],
  mixed: [],
  structural: [],
  locale: [],
  other: [],
  empty: [],
  "liquid-only": [],
};
for (const e of entries) {
  const key = e.kind === "liquid-only" ? "liquid-only" : e.category;
  if (!buckets[key]) buckets[key] = [];
  buckets[key].push(e);
}

if (jsonOut) {
  console.log(JSON.stringify({ totals: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])), buckets }, null, 2));
  process.exit(0);
}

function printBucket(name, items, opts = {}) {
  console.log(`\n=== ${name} (${items.length}) ===`);
  if (!items.length) return;
  const limit = opts.limit ?? (fullList ? items.length : 15);
  for (const e of items.slice(0, limit)) {
    if (e.kind === "liquid-only") {
      console.log(`  ${e.selector}`);
    } else {
      const propSummary = e.props.length <= 4
        ? e.props.join(", ")
        : `${e.props.slice(0, 3).join(", ")}, +${e.props.length - 3} more`;
      console.log(`  body.use-liquid-glass ${e.base}`);
      console.log(`    → ${propSummary}`);
    }
  }
  if (items.length > limit) console.log(`  … ${items.length - limit} more (run with --full to list)`);
}

console.log(`Liquid-glass twin audit: ${LIQUID}`);
console.log(`Total rule-selector pairs analyzed: ${entries.length}`);
console.log(`  twins: ${entries.filter((e) => e.kind === "twin").length}`);
console.log(`  liquid-only (not a twin): ${buckets["liquid-only"].length}`);

printBucket("EASY — pure value overrides (migrate to :root + body.use-liquid-glass value swap)", buckets.easy);
printBucket("MIXED — value + structural; tokenize the value props, collocate the rest", buckets.mixed);
printBucket("STRUCTURAL — cannot tokenize as pure values; collocate next to base rule", buckets.structural);
printBucket("LOCALE — html:lang(...) qualified; theme × locale axis", buckets.locale);
printBucket("OTHER — properties outside both lists (font, transition, cursor, etc.); inspect by hand", buckets.other);
printBucket("EMPTY rules (probably stale, candidates for deletion)", buckets.empty);

console.log(`\nMigration priority: start with EASY. See .claude/skills/css-no-pingpong/SKILL.md for the recipe.`);
