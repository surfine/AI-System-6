#!/usr/bin/env node
// Find appearance declarations the base cascade already provides.
//
// A candidate is not a proof — the drain is proven by tooling/computed-style-probe.mjs
// and the appearance snapshot. This only narrows the search, and it encodes the
// three ways a declaration looked redundant and was not:
//
//   1. It out-specifies a MORE specific base rule. `.composer` beats
//      `.assistant-window .composer { border: 0 }`. Equal base value is irrelevant.
//   2. The base compared against was stale. 60-responsive.css is the LAST base
//      sheet, and 66-theme-lab.css is the base for every `.theme-lab-*`.
//   3. A feature contract pins the literal text. A redundant declaration a test
//      names is a commitment, not dead weight.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const styles = join(root, "apps/desktop/styles");
const BASE = ["00-foundation", "10-windows", "20-reader-docmap", "22-time-machine", "30-surfaces",
  "40-icons", "50-apps", "60-responsive", "66-theme-lab"];
const APPEARANCE = ["65-appearance-themes", "67-aqua-appearance", "70-liquid-glass"];
const GEOMETRY = new Set(["width","height","min-width","max-width","min-height","max-height","padding","padding-top","padding-right","padding-bottom","padding-left","padding-inline","padding-block","margin","margin-top","margin-right","margin-bottom","margin-left","margin-inline","margin-block","position","top","right","bottom","left","inset","display","flex","flex-direction","flex-wrap","gap","row-gap","column-gap","align-items","align-self","align-content","justify-content","justify-items","justify-self","order","font-size","font-family","font-weight","line-height","letter-spacing","border-width","overflow","overflow-x","overflow-y","white-space","aspect-ratio","transform","box-sizing","float","vertical-align","text-indent","grid-template-columns","grid-template-rows","grid-column","grid-row","border","border-top","border-right","border-bottom","border-left"]);

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
function topLevelRules(css) {
  const out = []; let i = 0, depth = 0, selStart = 0, atDepth = -1;
  const close = (s, open) => { let d = 0; for (let j = open; j < s.length; j += 1) { if (s[j] === "{") d += 1; else if (s[j] === "}") { d -= 1; if (!d) return j; } } return s.length; };
  while (i < css.length) {
    const c = css[i];
    if (c === "@" && depth === 0) atDepth = 0;
    if (c === "{") {
      if (depth === 0 && atDepth === 0) { atDepth = 1; depth += 1; i += 1; continue; }
      if (depth === 0) { const sel = css.slice(selStart, i).trim(); const end = close(css, i); out.push({ sel, body: css.slice(i + 1, end) }); i = end + 1; selStart = i; continue; }
      depth += 1;
    } else if (c === "}") { depth -= 1; if (!depth) { atDepth = -1; selStart = i + 1; } }
    i += 1;
  }
  return out;
}
const declarations = (body) => body.split(";").map((d) => {
  const c = d.indexOf(":");
  if (c < 0) return null;
  const prop = d.slice(0, c).trim();
  const value = d.slice(c + 1).trim();
  return prop && value && /^[a-zA-Z-]+$/.test(prop) ? { prop, value: value.replace(/\s+/g, " ") } : null;
}).filter(Boolean);

/** Rough CSS specificity, enough to answer "is this base rule more specific". */
function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const cls = (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const els = (sel.replace(/[.#][\w-]+|\[[^\]]+\]|::?[\w-]+(\([^)]*\))?/g, " ").match(/[a-zA-Z][\w-]*/g) || []).length;
  return ids * 10000 + cls * 100 + els;
}

const baseRules = [];
for (const f of BASE) for (const rule of topLevelRules(strip(readFileSync(join(styles, `${f}.css`), "utf8"))))
  for (const sel of rule.sel.split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean))
    for (const d of declarations(rule.body)) baseRules.push({ file: f, sel, spec: specificity(sel), ...d });

const lastValue = new Map();
for (const r of baseRules) lastValue.set(`${r.sel}|${r.prop}`, r);

// Ground already proven unsafe by measurement, so the finder never re-proposes
// it. A guard can be sharpened forever; a measured refutation is final.
const knownUnsafe = new Set(
  JSON.parse(readFileSync(join(root, ".drain-known-unsafe.json"), "utf8"))
    .entries.map((e) => `${e.selector}|${e.property}`)
);

// Every feature contract's text, so a pinned declaration is never proposed.
const contracts = readdirSync(join(root, "tests/features"))
  .filter((n) => n.endsWith(".mjs"))
  .map((n) => readFileSync(join(root, "tests/features", n), "utf8")).join("\n");

const THEME_PREFIX = /^(body(?:\.use-liquid-glass)?(?:\[data-theme(?:-family)?=["'][a-z-]+["']\])?(?::not\([^)]*\))?|html(?:\[data-theme=["'][a-z-]+["']\])?(?::lang\([^)]*\))?(?::not\([^)]*\))?)\s+/;

const hits = [];
let scanned = 0;
for (const file of APPEARANCE) {
  for (const rule of topLevelRules(strip(readFileSync(join(styles, `${file}.css`), "utf8")))) {
    const sels = rule.sel.split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
    if (!sels.length) continue;
    for (const d of declarations(rule.body)) {
      if (!GEOMETRY.has(d.prop)) continue;
      scanned += 1;
      const bares = sels.map((s) => s.replace(THEME_PREFIX, ""));
      if (bares.some((b) => knownUnsafe.has(`${b}|${d.prop}`))) continue;
      // Trap 2: compare against the LAST base declaration, across every base sheet.
      const bases = bares.map((b) => lastValue.get(`${b}|${d.prop}`));
      if (!bases.every((b) => b && b.value === d.value)) continue;
      // Trap 1: a more specific base rule that disagrees takes over on deletion.
      const shadowed = bares.some((bare, index) => baseRules.some((r) =>
        r.prop === d.prop && r.value !== d.value && r.spec > bases[index].spec
        && (r.sel === bare || r.sel.startsWith(`${bare}.`) || r.sel.startsWith(`${bare}:`) || r.sel.endsWith(` ${bare}`))));
      if (shadowed) continue;
      // Trap 3: a contract names the literal declaration.
      if (contracts.includes(`${d.prop}: ${d.value}`) && contracts.includes(bares[0])) continue;
      hits.push({ file, selector: sels[0], sels, property: d.prop, value: d.value, base: bases[0].file });
    }
  }
}
console.log(`扫描几何声明 ${scanned} 条,候选 ${hits.length} 条`);
const byFile = {};
for (const h of hits) (byFile[h.file] ||= []).push(h);
for (const [f, list] of Object.entries(byFile)) console.log(`  ${f}: ${list.length}  (基础表来源: ${[...new Set(list.map((h) => h.base))].join(", ")})`);
writeFileSync(join(root, ".drain-candidates.json"), `${JSON.stringify(hits, null, 1)}\n`);
const probes = [...new Map(hits.map((h) => [`${h.selector.replace(THEME_PREFIX, "")}|${h.prop}`, { selector: h.selector.replace(THEME_PREFIX, ""), property: h.prop }])).values()];
const registry = await import(join(root, "tooling/interface-guidelines-contract.mjs"));
writeFileSync(join(root, ".drain-targets.json"), `${JSON.stringify({ windows: Object.keys(registry.windowInterfaceRegistry), probes }, null, 1)}\n`);
console.log(`探针目标 ${probes.length} 组`);
