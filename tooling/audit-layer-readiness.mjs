// Cascade-layer readiness audit.
//
// The per-file @layer migration (see internal/agents/CSS-LAYER-LANE.md) is
// safe exactly when no cross-file conflict is won by the EARLIER file through
// strictly higher specificity: once every file is wrapped in its own layer,
// layer order (= file order) decides cross-file conflicts and specificity only
// applies inside one file. Equal-specificity conflicts already resolve to the
// later file today, so they cannot flip.
//
// This audit lists the rule pairs that can still flip. It is a review list
// built from selector heuristics, not proof of a real conflict: two selectors
// count as co-matching when their rightmost compounds share a class/id token,
// or share an element name while the full selectors also share a class/id
// token (or one side is a near-global element rule). Pseudo-element
// mismatches (a box vs its ::before) and disjoint attribute values
// ([type="radio"] vs [type="url"]) are filtered out.
//
// Usage:
//   node tooling/audit-layer-readiness.mjs           # summary + counts
//   node tooling/audit-layer-readiness.mjs --full    # every flagged pair

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { desktopRoot } from "./lib/paths.mjs";
import { lazyStyleBundles, styleRuntimePaths } from "./style-manifest.mjs";

const showFull = process.argv.includes("--full");

// Cascade order: eager bundle order, then lazy sheets (they load last).
const cascadeOrder = [
  ...styleRuntimePaths,
  ...lazyStyleBundles.flatMap((bundle) => bundle.sources),
];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function splitTopLevel(chunk) {
  const out = [];
  let current = "";
  let paren = 0;
  let bracket = 0;
  for (const char of chunk) {
    if (char === "(") paren += 1;
    else if (char === ")") paren = Math.max(0, paren - 1);
    else if (char === "[") bracket += 1;
    else if (char === "]") bracket = Math.max(0, bracket - 1);
    if (char === "," && !paren && !bracket) {
      if (current.trim()) out.push(current.replace(/\s+/g, " ").trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) out.push(current.replace(/\s+/g, " ").trim());
  return out;
}

// [{selector, props}] — recurses into conditional at-rules, skips
// @keyframes/@font-face/@property bodies, ignores custom properties.
function extractRules(text) {
  const rules = [];
  walk(stripComments(text));
  return rules;

  function walk(chunk) {
    let i = 0;
    while (i < chunk.length) {
      const open = chunk.indexOf("{", i);
      if (open === -1) break;
      const head = chunk.slice(i, open).trim().replace(/^[;\s]+/, "");
      let depth = 1;
      let j = open + 1;
      while (j < chunk.length && depth > 0) {
        if (chunk[j] === "{") depth += 1;
        else if (chunk[j] === "}") depth -= 1;
        j += 1;
      }
      const body = chunk.slice(open + 1, j - 1);
      if (head.startsWith("@")) {
        if (/^@(media|supports|container|layer|scope)/.test(head)) walk(body);
      } else if (head) {
        addRule(head, body.includes("{") ? body.slice(0, body.indexOf("{")) : body);
        if (body.includes("{")) walk(body.slice(body.indexOf("{")));
      }
      i = j;
    }
  }

  function addRule(head, body) {
    const props = new Set();
    for (const declaration of body.split(";")) {
      const idx = declaration.indexOf(":");
      if (idx === -1) continue;
      const prop = declaration.slice(0, idx).trim().toLowerCase();
      if (/^[a-z-]+$/.test(prop) && !prop.startsWith("--")) props.add(prop);
    }
    if (!props.size) return;
    for (const selector of splitTopLevel(head)) rules.push({ selector, props });
  }
}

// Approximate specificity as one number (ids ≫ classes ≫ elements). :where()
// contributes zero; :not()/:is()/:has() contents are counted as written, which
// slightly overweights alternatives but compares consistently on both sides.
function specificity(selector) {
  let s = selector.replace(/:where\([^)]*\)/g, "");
  s = s.replace(/::?(not|is|has)\(/g, "(");
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes =
    (s.match(/\.[\w-]+/g) || []).length +
    (s.match(/\[[^\]]*\]/g) || []).length +
    (s.match(/:(?!:)[a-z-]+/g) || []).length;
  const pseudoElements = (s.match(/::[a-z-]+|:(?:before|after)\b/g) || []).length;
  const elements =
    (s.replace(/\([^)]*\)/g, " ").match(/(^|[\s>+~(])[a-z][\w-]*/g) || []).length +
    pseudoElements;
  return ids * 1_000_000 + classes * 1_000 + elements;
}

function rightmostCompound(selector) {
  let paren = 0;
  let bracket = 0;
  let cut = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const char = selector[i];
    if (char === "(") paren += 1;
    else if (char === ")") paren = Math.max(0, paren - 1);
    else if (char === "[") bracket += 1;
    else if (char === "]") bracket = Math.max(0, bracket - 1);
    else if (!paren && !bracket && (char === " " || char === ">" || char === "+" || char === "~")) cut = i + 1;
  }
  return selector.slice(cut);
}

function analyzeSelector(selector) {
  const compound = rightmostCompound(selector);
  const compoundSansFunctions = compound.replace(/\([^)]*\)/g, "");
  const pseudoElement = (compoundSansFunctions.match(/::[\w-]+|:(?:before|after)\b/) || [null])[0]
    ?.replace(/^:+/, "");
  const attrs = new Map();
  for (const attr of compound.match(/\[([\w-]+)(?:[~|^$*]?=("[^"]*"|'[^']*'|[^\]]*))?\]/g) || []) {
    const m = attr.match(/^\[([\w-]+)(?:[~|^$*]?=(.*))?\]$/);
    if (m && m[2] !== undefined) attrs.set(m[1], m[2].replace(/["'\]]/g, ""));
  }
  return {
    selector,
    spec: specificity(selector),
    compoundTokens: new Set(compoundSansFunctions.match(/[.#][\w-]+/g) || []),
    element: (compound.match(/^[a-z][\w-]*/) || [null])[0],
    allTokens: new Set(selector.match(/[.#][\w-]+/g) || []),
    pseudoElement: pseudoElement || null,
    attrs,
  };
}

const allRules = [];
cascadeOrder.forEach((path, fileIndex) => {
  const text = readFileSync(join(desktopRoot, path), "utf8");
  for (const rule of extractRules(text)) {
    allRules.push({ ...rule, ...analyzeSelector(rule.selector), path, fileIndex });
  }
});

// Bucket by rightmost class/id token and by rightmost element name so the
// pairwise scan only visits candidates that can co-match at all.
const buckets = new Map();
allRules.forEach((rule, index) => {
  for (const token of rule.compoundTokens) {
    if (!buckets.has(token)) buckets.set(token, []);
    buckets.get(token).push(index);
  }
  if (rule.element) {
    const key = `<${rule.element}>`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  }
});

function attrsCompatible(a, b) {
  for (const [name, value] of a.attrs) {
    const other = b.attrs.get(name);
    if (other !== undefined && other !== value) return false;
  }
  return true;
}

const seen = new Set();
const flips = [];
for (const [token, indices] of buckets) {
  const elementBucket = token.startsWith("<");
  for (const iA of indices) {
    for (const iB of indices) {
      if (iA >= iB) continue;
      const a = allRules[iA];
      const b = allRules[iB];
      if (a.fileIndex === b.fileIndex) continue;
      const [earlier, later] = a.fileIndex < b.fileIndex ? [a, b] : [b, a];
      if (earlier.spec <= later.spec) continue;
      if ((earlier.pseudoElement || null) !== (later.pseudoElement || null)) continue;
      if (!attrsCompatible(earlier, later)) continue;
      if (elementBucket) {
        const shareCompoundToken = [...earlier.compoundTokens].some((t) => later.compoundTokens.has(t));
        if (!shareCompoundToken) {
          const shareAnyToken = [...earlier.allTokens].some((t) => later.allTokens.has(t));
          const nearGlobalSide = earlier.allTokens.size === 0 || later.allTokens.size === 0;
          if (!shareAnyToken && !nearGlobalSide) continue;
        }
      }
      const sharedProps = [...earlier.props].filter((p) => later.props.has(p));
      if (!sharedProps.length) continue;
      const key = `${earlier.path}|${earlier.selector}|${later.path}|${later.selector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flips.push({ earlier, later, sharedProps });
    }
  }
}

flips.sort((a, b) =>
  a.earlier.path.localeCompare(b.earlier.path) || a.later.path.localeCompare(b.later.path)
);

const byPair = new Map();
for (const flip of flips) {
  const key = `${flip.earlier.path} -> ${flip.later.path}`;
  if (!byPair.has(key)) byPair.set(key, []);
  byPair.get(key).push(flip);
}

console.log(`Cascade-layer flip candidates: ${flips.length}`);
console.log(
  "(earlier file currently wins by specificity; a per-file @layer wrap would flip the winner)\n"
);
for (const [pair, list] of byPair) {
  console.log(`${pair}: ${list.length}`);
  const sample = showFull ? list : list.slice(0, 3);
  for (const { earlier, later, sharedProps } of sample) {
    console.log(`    [${sharedProps.join(",")}]`);
    console.log(`      earlier(${earlier.spec}): ${earlier.selector}`);
    console.log(`      later(${later.spec}):   ${later.selector}`);
  }
  if (!showFull && list.length > 3) console.log(`    … ${list.length - 3} more (--full)`);
}
