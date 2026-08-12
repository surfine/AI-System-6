// Audit 60-responsive.css for selector duplicates that already exist in base
// files (00-foundation … 50-apps). For each duplicate, classify by what its
// rule body actually does:
//
//   DEAD       — every property value matches the cascade winner from the
//                base files. Deleting the responsive copy changes nothing.
//   OVERRIDE   — at least one property value differs from base. Keeping the
//                responsive copy is intentional; cleanup requires merging.
//   ADDITIVE   — sets a property that no base rule with this selector sets.
//                Could be merged into base for clarity.
//   MIXED      — combination of OVERRIDE + ADDITIVE.
//
// Caveats:
//   * Pure string compare on property values. CSS shorthand expansion is
//     not simulated, so a `border-bottom: 1px solid X` versus `border: 1px
//     solid X; border-top: 0; …` won't match even when computed-equivalent.
//   * Only same top-level selector strings count as duplicates. Equivalent
//     compound selectors with different specificity / order are not matched.
//   * @media-nested rules are not considered duplicates of unscoped rules.
//
// Output: human-readable summary + categorized list. --json for machine use.
//
// Usage:
//   node tooling/audit-css-duplicates.mjs            (summary + DEAD list)
//   node tooling/audit-css-duplicates.mjs --full     (all categories listed)
//   node tooling/audit-css-duplicates.mjs --json     (machine-readable)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE_FILES = [
  "styles/00-foundation.css",
  "styles/10-windows.css",
  "styles/20-reader-docmap.css",
  "styles/30-surfaces.css",
  "styles/40-icons.css",
  "styles/50-apps.css",
];
const RESPONSIVE_FILE = "styles/60-responsive.css";

const args = new Set(process.argv.slice(2));
const fullList = args.has("--full");
const jsonOut = args.has("--json");

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Walk top-level rules. Returns [{ selectors:[], properties:{name:value}, line, file }].
// Skips nested at-rules' interiors at the top level but recurses into them
// so we can flag nested duplicates if needed (we don't, currently).
function extractTopLevelRules(text, file) {
  const clean = stripComments(text);
  const rules = [];
  let i = 0;
  let lineStartIndex = 0;
  let line = 1;

  // Helper to compute a line number for a character offset.
  function lineOf(idx) {
    // Recompute from scratch each time — text is bounded and call count low.
    let n = 1;
    for (let k = 0; k < idx; k++) if (clean[k] === "\n") n++;
    return n;
  }

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
      // Skip — at-rule bodies (e.g. @media) are not in the unscoped-duplicate
      // scope for this audit.
    } else if (selectorChunk) {
      const selectors = selectorChunk
        .split(",")
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const properties = {};
      // Split body by ';', then by first ':'. Skip nested blocks (rare in
      // raw selectors but possible with @supports inside; we drop them).
      const flat = body.replace(/\{[^}]*\}/g, "");
      for (const decl of flat.split(/;/)) {
        const colon = decl.indexOf(":");
        if (colon === -1) continue;
        const name = decl.slice(0, colon).trim();
        const value = decl.slice(colon + 1).trim().replace(/\s+/g, " ");
        if (!name || !/^-?[a-z-]/.test(name)) continue;
        // Preserve the LAST declaration if duplicated within the same rule.
        properties[name] = value;
      }
      rules.push({
        selectors,
        properties,
        line: lineOf(openIdx),
        file,
      });
    }
    i = j;
  }
  return rules;
}

// Build the per-selector cascade winner across all base files in load order.
function buildBaseCascade(allBaseRules) {
  // Map<selector, Map<propName, { value, file, line }>>
  const winners = new Map();
  for (const rule of allBaseRules) {
    for (const sel of rule.selectors) {
      if (!winners.has(sel)) winners.set(sel, new Map());
      const props = winners.get(sel);
      for (const [name, value] of Object.entries(rule.properties)) {
        props.set(name, { value, file: rule.file, line: rule.line });
      }
    }
  }
  return winners;
}

function classifyResponsiveRule(rule, baseCascade) {
  // Per-selector verdict. A multi-selector rule will get one per selector;
  // we report the worst (most "alive") verdict for the whole rule.
  const perSelector = [];
  for (const sel of rule.selectors) {
    const baseProps = baseCascade.get(sel);
    if (!baseProps) {
      perSelector.push({ sel, kind: "no-base-match" });
      continue;
    }
    const diffs = [];
    const additive = [];
    for (const [name, value] of Object.entries(rule.properties)) {
      if (!baseProps.has(name)) {
        additive.push({ name, value });
      } else if (baseProps.get(name).value !== value) {
        diffs.push({ name, was: baseProps.get(name).value, now: value });
      }
    }
    const hasDiff = diffs.length > 0;
    const hasAdd = additive.length > 0;
    let kind;
    if (!hasDiff && !hasAdd) kind = "dead";
    else if (hasDiff && hasAdd) kind = "mixed";
    else if (hasDiff) kind = "override";
    else kind = "additive";
    perSelector.push({ sel, kind, diffs, additive });
  }
  return perSelector;
}

// --- main ---

const baseRules = BASE_FILES.flatMap((f) =>
  extractTopLevelRules(readFileSync(join(root, f), "utf8"), f)
);
const baseCascade = buildBaseCascade(baseRules);

const responsiveRules = extractTopLevelRules(
  readFileSync(join(root, RESPONSIVE_FILE), "utf8"),
  RESPONSIVE_FILE
);

// Flag each (rule × selector) pair.
const entries = [];
for (const rule of responsiveRules) {
  const verdicts = classifyResponsiveRule(rule, baseCascade);
  for (const v of verdicts) {
    entries.push({
      file: rule.file,
      line: rule.line,
      sel: v.sel,
      kind: v.kind,
      diffs: v.diffs || [],
      additive: v.additive || [],
      propCount: Object.keys(rule.properties).length,
    });
  }
}

const totals = {
  dead: entries.filter((e) => e.kind === "dead").length,
  override: entries.filter((e) => e.kind === "override").length,
  additive: entries.filter((e) => e.kind === "additive").length,
  mixed: entries.filter((e) => e.kind === "mixed").length,
  noBase: entries.filter((e) => e.kind === "no-base-match").length,
};

if (jsonOut) {
  console.log(JSON.stringify({ totals, entries }, null, 2));
  process.exit(0);
}

function printBucket(label, kind, opts = {}) {
  const items = entries.filter((e) => e.kind === kind);
  console.log(`\n=== ${label} (${items.length}) ===`);
  if (!items.length) return;
  const limit = opts.limit ?? (fullList ? items.length : 20);
  for (const e of items.slice(0, limit)) {
    let detail = "";
    if (kind === "override" || kind === "mixed") {
      const sample = e.diffs.slice(0, 2).map((d) => `${d.name}: ${d.was} → ${d.now}`).join("; ");
      const more = e.diffs.length > 2 ? ` +${e.diffs.length - 2} more` : "";
      detail = `  ${sample}${more}`;
    } else if (kind === "additive") {
      const sample = e.additive.slice(0, 2).map((a) => `${a.name}: ${a.value}`).join("; ");
      const more = e.additive.length > 2 ? ` +${e.additive.length - 2} more` : "";
      detail = `  adds: ${sample}${more}`;
    }
    console.log(`  ${e.file}:${e.line}  ${e.sel}${detail}`);
  }
  if (items.length > limit) console.log(`  … ${items.length - limit} more (run with --full)`);
}

console.log(`Duplicate audit: ${RESPONSIVE_FILE} vs base files`);
console.log(`Total (selector × responsive-rule) pairs: ${entries.length}`);
console.log(`  DEAD       (responsive copy identical to base cascade): ${totals.dead}`);
console.log(`  OVERRIDE   (responsive copy changes existing base values): ${totals.override}`);
console.log(`  ADDITIVE   (responsive copy adds new properties to base): ${totals.additive}`);
console.log(`  MIXED      (override + additive): ${totals.mixed}`);
console.log(`  NO-MATCH   (selector exists only in responsive): ${totals.noBase}`);

printBucket("DEAD — safe to delete the responsive copy", "dead");
printBucket("ADDITIVE — could merge into base file", "additive");
printBucket("OVERRIDE — manual review; intentional theme/state override", "override", { limit: 10 });
printBucket("MIXED — split: dead/additive parts can move, override parts stay", "mixed", { limit: 10 });

console.log(`\nThis script only compares declared property names string-by-string.`);
console.log(`Before deleting any "DEAD" entry, verify with visual-snapshot diff.`);
