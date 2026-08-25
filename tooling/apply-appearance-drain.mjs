#!/usr/bin/env node
// Remove appearance declarations that a drain batch has cleared.
//
// Content-addressed on purpose. A line number is an index that is only true at
// the instant it is taken, and this file changes between the moment a batch is
// derived and the moment it is applied — so a row is located by its selector and
// matched by its exact `property: value;` text, and the `line` field, if a batch
// carries one, is ignored.
//
//   node tooling/apply-appearance-drain.mjs <stylesheet-stem> <batch.json> [--restore <sel|prop,...>]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [stem, batchPath, ...rest] = process.argv.slice(2);
const restoreArg = rest.includes("--restore") ? rest[rest.indexOf("--restore") + 1] : null;
const path = join(root, "apps/desktop/styles", `${stem}.css`);

/**
 * Comments masked with spaces of the same length.
 *
 * The parser below tracks at-rules by watching for `@` at depth zero, and a
 * comment that merely mentions one — or carries an `@2x`, or an address — set
 * that flag and made every rule after it invisible. Stripping the comments would
 * fix the parse and break every byte offset, so they are blanked in place.
 */
function maskComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
}

/** Brace-matched top-level rules, so a multi-line selector list is one rule. */
function parseRules(rawCss) {
  const css = maskComments(rawCss);
  const rules = [];
  let i = 0, depth = 0, selStart = 0, inAt = false;
  while (i < css.length) {
    const c = css[i];
    if (c === "@" && depth === 0) inAt = true;
    if (c === "{") {
      if (depth === 0 && inAt) { depth += 1; i += 1; continue; }
      if (depth === 0) {
        let d = 0, end = i;
        for (let j = i; j < css.length; j += 1) { if (css[j] === "{") d += 1; else if (css[j] === "}") { d -= 1; if (!d) { end = j; break; } } }
        rules.push({ start: selStart, open: i, end, selectorText: css.slice(selStart, i) });
        i = end + 1; selStart = i; continue;
      }
      depth += 1;
    } else if (c === "}") { depth -= 1; if (!depth) { inAt = false; selStart = i + 1; } }
    i += 1;
  }
  return rules;
}
/**
 * Split a selector list on commas that are not inside parentheses or brackets.
 *
 * `:is(.close-box, .resize-box)` carries its own comma, and a naive split tore
 * that rule into two fragments that matched nothing — which is why whole blocks
 * of lamp and control rows came back "rule not found". verify-css.mjs splits the
 * same way, for the same reason.
 */
function selectorsOf(text) {
  const out = [];
  let current = "";
  let paren = 0;
  let bracket = 0;
  let quote = "";
  for (const char of text) {
    if (quote) { current += char; if (char === quote) quote = ""; continue; }
    if (char === '"' || char === "'") { quote = char; current += char; continue; }
    if (char === "(") paren += 1;
    else if (char === ")") paren -= 1;
    else if (char === "[") bracket += 1;
    else if (char === "]") bracket -= 1;
    if (char === "," && !paren && !bracket) { out.push(current); current = ""; continue; }
    current += char;
  }
  out.push(current);
  return out.map((one) => one.trim().replace(/\s+/g, " ")).filter(Boolean);
}
const norm = (s) => s.trim().replace(/\s+/g, " ");

let css = readFileSync(path, "utf8");
const rows = JSON.parse(readFileSync(join(root, batchPath), "utf8"));
const restoreSet = restoreArg ? new Set(restoreArg.split(",")) : null;
const THEME_PREFIX = /^(body(?:\.use-liquid-glass)?(?:\[data-theme(?:-family)?=["'][a-z-]+["']\])?(?::not\([^)]*\))?|html(?:\[data-theme=["'][a-z-]+["']\])?(?::lang\([^)]*\))?(?::not\([^)]*\))?)\s+/;

let done = 0, ruleDropped = 0;
const misses = [];
for (const row of rows) {
  const bare = norm(row.selector).replace(THEME_PREFIX, "");
  if (restoreSet && !restoreSet.has(`${bare}|${row.property}`)) continue;
  // Re-parse each time: every edit moves every offset after it.
  const matches = parseRules(css).filter((r) => selectorsOf(r.selectorText).includes(norm(row.selector)));
  if (!matches.length) { misses.push(`规则未找到  ${row.property}  [${norm(row.selector).slice(0, 60)}]`); continue; }
  const want = `${row.property}: ${row.value};`;
  // One selector can open several blocks in the same file. Picking the first is
  // how a mechanical edit lands on the wrong rule, so the row has to resolve to
  // exactly one block that actually carries the declaration — otherwise refuse.
  const carrying = restoreSet ? matches : matches.filter((r) => css.slice(r.open + 1, r.end).includes(want));
  if (carrying.length !== 1) {
    misses.push(`歧义:选择器开了 ${matches.length} 个块,其中 ${carrying.length} 个带此声明  ${row.property}  [${norm(row.selector).slice(0, 55)}]`);
    continue;
  }
  const rule = carrying[0];
  const body = css.slice(rule.open + 1, rule.end);

  if (restoreSet) {
    if (new RegExp(`(^|\\n)\\s*${row.property.replace(/-/g, "\\-")}\\s*:`).test(body)) { misses.push(`已在  ${row.property}`); continue; }
    const next = `${body.replace(/\n\s*$/, "")}\n  ${want}\n`;
    css = css.slice(0, rule.open + 1) + next + css.slice(rule.end);
    done += 1;
    continue;
  }

  if (!body.includes(want)) { misses.push(`声明不在  ${want.slice(0, 55)}`); continue; }
  const next = body.replace(new RegExp(`[ \\t]*${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*\\n?`), "");
  if (!next.replace(/\s/g, "")) {
    // The rule held nothing else. Drop the whole rule rather than leave `{ }`.
    let from = rule.start;
    while (from > 0 && css[from - 1] === "\n" && css[from - 2] === "\n") from -= 1;
    css = css.slice(0, from) + css.slice(rule.end + 1).replace(/^\n/, "");
    ruleDropped += 1;
  } else {
    css = css.slice(0, rule.open + 1) + next + css.slice(rule.end);
  }
  done += 1;
}
writeFileSync(path, css);
for (const m of misses) console.log(`  ${m}`);
console.log(`${stem}: ${restoreSet ? "还原" : "移除"} ${done}/${restoreSet ? restoreSet.size : rows.length}${ruleDropped ? `(其中整条规则删除 ${ruleDropped})` : ""}`);
