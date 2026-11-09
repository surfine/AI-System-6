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
//   * Same-file later shadowing is NOT simulated: a rule in 60-responsive
//     whose value a LATER 60-responsive rule overrides (e.g. a line-height
//     restated at :2829 after :543) is reported by what it matches in the
//     base files, not by its fate inside this file. Read the file order when
//     acting on a verdict.
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
  "apps/desktop/styles/00-foundation.css",
  "apps/desktop/styles/10-windows.css",
  "apps/desktop/styles/20-reader-docmap.css",
  "apps/desktop/styles/30-surfaces.css",
  "apps/desktop/styles/40-icons.css",
  "apps/desktop/styles/50-apps.css",
];
const RESPONSIVE_FILE = "apps/desktop/styles/60-responsive.css";

const args = new Set(process.argv.slice(2));
const fullList = args.has("--full");
const jsonOut = args.has("--json");

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

// cleanOffset -> raw line, so reported lines match the editor. Comments are
// stripped for PARSING only; a position in the stripped text still has a
// well-defined origin in the raw file. (The audit used to count lines in the
// comment-stripped text itself, and every printed line number was off by the
// stripped comments above it — an offset trap that cost two misanchored
// deletions on 2026-11-04 before this map existed.)
function buildCleanToRawLineMap(text) {
  const map = [1]; // map[cleanOffset] = raw line; cleanOffset 0 starts on raw line 1
  let rawLine = 1;
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      // The comment contributes no clean characters, but its newlines still
      // advance the raw line for whatever follows it.
      for (let k = i; k < stop; k++) if (text[k] === "\n") rawLine++;
      i = stop;
      continue;
    }
    if (text[i] === "\n") {
      rawLine++;
      map.push(rawLine);
    } else {
      map.push(rawLine);
    }
    i++;
  }
  return map;
}

// Walk top-level rules. Returns [{ selectors:[], properties:{name:value}, line, file }].
// Skips nested at-rules' interiors at the top level but recurses into them
// so we can flag nested duplicates if needed (we don't, currently).
function extractTopLevelRules(text, file) {
  const clean = stripComments(text);
  const cleanLine = buildCleanToRawLineMap(text);
  const rules = [];
  let i = 0;
  let lineStartIndex = 0;
  let line = 1;

  // The raw-file line for a clean-text offset (map is index-aligned: every
  // non-comment character of the raw text pushes one entry).
  function lineOf(idx) {
    return cleanLine[idx] ?? 1;
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
    if (selectorChunk.startsWith("@media")) {
      // Base @media rules JOIN the comparison, tagged with their condition:
      // a responsive top-level property that a base media rule sets to a
      // different value would silently regress that breakpoint if "merged
      // into base" — the audit must say so (SHADES-MEDIA) rather than read
      // as a safe additive.
      const condition = selectorChunk.slice(selectorChunk.indexOf("(")).trim();
      const inner = body;
      let k = 0;
      while (k < inner.length) {
        const innerOpen = inner.indexOf("{", k);
        if (innerOpen === -1) break;
        const innerSel = inner.slice(k, innerOpen).trim();
        let d2 = 1; let m = innerOpen + 1;
        while (d2) {
          if (inner[m] === "{") d2++;
          else if (inner[m] === "}") d2--;
          m++;
        }
        if (innerSel && !innerSel.startsWith("@")) {
          const mediaSelectors = innerSel
            .split(",")
            .map((x) => x.replace(/\s+/g, " ").trim())
            .filter(Boolean);
          const mediaProps = {};
          for (const decl of inner.slice(innerOpen + 1, m - 1).split(/;/)) {
            const colon = decl.indexOf(":");
            if (colon === -1) continue;
            const name = decl.slice(0, colon).trim();
            const value = decl.slice(colon + 1).trim().replace(/\s+/g, " ");
            if (!name || !/^-?[a-z-]/.test(name)) continue;
            mediaProps[name] = value;
          }
          rules.push({ selectors: mediaSelectors, properties: mediaProps, line: lineOf(openIdx), file, media: condition });
        }
        k = m;
      }
    } else if (selectorChunk.startsWith("@")) {
      // Other at-rules (@supports, @keyframes, ...) stay out of scope.
    } else if (selectorChunk) {
      // Split on TOP-LEVEL commas only: a comma inside :where()/ :is()/
      // :not() parentheses is part of ONE selector, and splitting it used to
      // turn ".window .x:where(.a, .b)" into ".window .x:where(.a" — a shard
      // that matched nothing and made the pair look like a phantom additive.
      const selectors = [];
      {
        let depth = 0, piece = "";
        for (const ch of selectorChunk) {
          if (ch === "(") depth++;
          else if (ch === ")") depth--;
          if (ch === "," && depth === 0) {
            const pieceTrimmed = piece.replace(/\s+/g, " ").trim();
            if (pieceTrimmed) selectors.push(pieceTrimmed);
            piece = "";
          } else piece += ch;
        }
        const last = piece.replace(/\s+/g, " ").trim();
        if (last) selectors.push(last);
      }
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
  // Map<selector, Map<propName, { value, file, line }>> plus a media-shadow
  // map: base @media properties a merger must not stomp on.
  const winners = new Map();
  const mediaWinners = new Map(); // normalized condition -> selector -> props
  const mediaShadows = new Map(); // selector -> prop -> every base @media value (any condition)
  for (const rule of allBaseRules) {
    for (const sel of rule.selectors) {
      if (rule.media) {
        const cond = rule.media.replace(/\s+/g, " ");
        if (!mediaWinners.has(cond)) mediaWinners.set(cond, new Map());
        const props = mediaWinners.get(cond);
        if (!props.has(sel)) props.set(sel, new Map());
        for (const [name, value] of Object.entries(rule.properties)) {
          props.get(sel).set(name, { value, file: rule.file, line: rule.line, media: rule.media });
          if (!mediaShadows.has(sel)) mediaShadows.set(sel, new Map());
          mediaShadows.get(sel).set(name, { value, file: rule.file, line: rule.line, media: rule.media });
        }
        continue;
      }
      if (!winners.has(sel)) winners.set(sel, new Map());
      const props = winners.get(sel);
      for (const [name, value] of Object.entries(rule.properties)) {
        props.set(name, { value, file: rule.file, line: rule.line, media: rule.media });
      }
    }
  }
  return { winners, mediaShadows, mediaWinners };
}

function classifyResponsiveRule(rule, baseCascade) {
  // Per-selector verdict. A multi-selector rule will get one per selector;
  // we report the worst (most "alive") verdict for the whole rule.
  const { winners, mediaShadows, mediaWinners } = baseCascade;
  const perSelector = [];
  const ruleCondition = rule.media ? rule.media.replace(/\s+/g, " ") : null;
  for (const sel of rule.selectors) {
    let baseProps;
    if (ruleCondition !== null) {
      // Media-scoped responsive rule: only a base rule under the SAME
      // condition is a cascade peer (base loads first, responsive wins);
      // unconditional base values are the floor the media value already
      // beats, and a different condition is a different context entirely.
      baseProps = mediaWinners.get(ruleCondition)?.get(sel);
      if (!baseProps) {
        perSelector.push({ sel, kind: "no-base-match", media: ruleCondition });
        continue;
      }
    } else {
      baseProps = winners.get(sel);
    }
    if (!baseProps) {
      perSelector.push({ sel, kind: "no-base-match" });
      continue;
    }
    const mediaProps = ruleCondition === null ? mediaShadows.get(sel) : undefined;
    const diffs = [];
    const additive = [];
    const shadesMedia = [];
    for (const [name, value] of Object.entries(rule.properties)) {
      if (!baseProps.has(name)) {
        const shadow = mediaProps?.get(name);
        if (shadow && shadow.value !== value) {
          shadesMedia.push({ name, value, media: shadow.media, mediaValue: shadow.value });
        } else {
          additive.push({ name, value });
        }
      } else if (baseProps.get(name).value !== value) {
        diffs.push({ name, was: baseProps.get(name).value, now: value });
      }
    }
    const hasDiff = diffs.length > 0;
    const hasAdd = additive.length > 0;
    let kind;
    if (shadesMedia.length) kind = "shades-media";
    else if (!hasDiff && !hasAdd) kind = "dead";
    else if (hasDiff && hasAdd) kind = "mixed";
    else if (hasDiff) kind = "override";
    else kind = "additive";
    perSelector.push({ sel, kind, diffs, additive, shadesMedia });
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
      shadesMedia: v.shadesMedia || [],
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
  shadesMedia: entries.filter((e) => e.kind === "shades-media").length,
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
    } else if (kind === "shades-media") {
      const sample = e.shadesMedia.slice(0, 2).map((m) => `${m.name}: ${m.value} vs ${m.media} ${m.mediaValue}`).join("; ");
      detail = `  ${sample}`;
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
console.log(`  SHADES-MEDIA (a base @media rule sets the property differently - merging into base would regress that breakpoint): ${totals.shadesMedia}`);

printBucket("DEAD — safe to delete the responsive copy", "dead");
printBucket("SHADES-MEDIA — do NOT merge into base; a base media rule owns this property at a breakpoint", "shades-media");
printBucket("ADDITIVE — could merge into base file", "additive");
printBucket("OVERRIDE — manual review; intentional theme/state override", "override", { limit: 10 });
printBucket("MIXED — split: dead/additive parts can move, override parts stay", "mixed", { limit: 10 });

console.log(`\nThis script only compares declared property names string-by-string.`);
console.log(`Before deleting any "DEAD" entry, verify with visual-snapshot diff.`);
