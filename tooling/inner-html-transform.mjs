// innerHTML transformer: convert raw innerHTML template sites to the html``
// discipline (app/core/strings.js). Promoted from the 2026-11-04/05 session
// tool after three repair rounds taught it these rules:
//
//   1. tag the outer template: `...` -> html`...`
//   2. strip escape wrappers: escapeFn(EXPR) -> EXPR
//   3. tag NESTED template literals with html and recurse — EXCEPT inside
//      protected spans (whitelisted markup-builder arguments, whose property
//      templates feed the builder as plain JS)
//   4. chain-wrap t(...) / markupFn(...) spans in html.raw(...) — owned
//      content (translations carry <br>; builders return trusted HTML)
//   5. drop a trailing .join("") on a map that now produces tagged templates
//      (the html helper flattens arrays itself)
//
// Safety rules bought with incidents, not negotiable:
//   * the call scanner checks the PRECEDING character explicitly — a
//     lookbehind at a slice start cannot see it, which once turned
//     `padStart(2, "0")` into `padStarhtml.raw(t(2, "0"))` (syntactically
//     legal, runtime-only failure, two of them hid in committed code);
//   * a prebuilt-markup variable interpolated at top level is data to the
//     transform and markup to the browser — the caller must list it in
//     --raw-ids, and the nested-template audit (grep [A-Za-z0-9_]html\. )
//     must run after every batch;
//   * already-tagged sites are skipped: the transform is idempotent.
//
// Usage:
//   node tooling/inner-html-transform.mjs <file> --lines 120,318 \
//     --escape-fns escapeHtml --text-fns t \
//     --markup-fns renderSystemIcon,markdownToSystemHtml \
//     [--raw-ids '{"${rows}": "${html.raw(rows)}"}']
// Line numbers are the assignment lines (1-based, the line whose first
// backtick opens the template). They must be read fresh per batch.

import { readFileSync, writeFileSync } from "node:fs";

const IDENT = "[A-Za-z_$][A-Za-z0-9_$]*";

export function skipTemplate(s, i) {
  i += 1;
  const n = s.length;
  while (i < n) {
    if (s[i] === "\\") { i += 2; continue; }
    if (s[i] === "`") return i + 1;
    if (s[i] === "$" && s[i + 1] === "{") {
      i = findMatching(s, i + 1, "{", "}") + 1;
      continue;
    }
    i += 1;
  }
  throw new Error("unterminated template");
}

export function findMatching(s, i, openCh, closeCh) {
  let depth = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === "'" || c === '"') { i = skipString(s, i, c); continue; }
    if (c === "`") { i = skipTemplate(s, i); continue; }
    if (c === openCh) depth += 1;
    else if (c === closeCh) {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  throw new Error(`unbalanced ${openCh}${closeCh}`);
}

function skipString(s, i, quote) {
  i += 1;
  const n = s.length;
  while (i < n) {
    if (s[i] === "\\") { i += 2; continue; }
    if (s[i] === quote) return i + 1;
    i += 1;
  }
  throw new Error("unterminated string");
}

export function topLevelInterpolations(body) {
  const spans = [];
  let i = 0;
  const n = body.length;
  while (i < n) {
    if (body[i] === "$" && body[i + 1] === "{") {
      const j = findMatching(body, i + 1, "{", "}");
      spans.push([i, j + 1]);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return spans;
}

function callHits(expr, names) {
  const hits = [];
  const pattern = new RegExp(`(?<![\\w$.])(${names.join("|")})\\s*\\(`, "g");
  for (const m of expr.matchAll(pattern)) {
    const openParen = expr.indexOf("(", m.index);
    const close = findMatching(expr, openParen, "(", ")");
    hits.push({ start: m.index, end: close + 1, name: m[1], openParen, close });
  }
  return hits;
}

function consumeChain(expr, end) {
  const n = expr.length;
  let at = end;
  for (;;) {
    let j = at;
    while (j < n && /\s/.test(expr[j])) j += 1;
    if (j < n && expr[j] === "." && expr[j + 1] !== ".") {
      const m = new RegExp(IDENT).exec(expr.slice(j + 1));
      if (!m) break;
      let k = j + 1 + m[0].length;
      if (expr[k] === "(") k = findMatching(expr, k, "(", ")") + 1;
      at = k;
      continue;
    }
    if (j < n && expr[j] === "?" && expr[j + 1] === ".") {
      const m = new RegExp(IDENT).exec(expr.slice(j + 2));
      if (!m) break;
      let k = j + 2 + m[0].length;
      if (expr[k] === "(") k = findMatching(expr, k, "(", ")") + 1;
      at = k;
      continue;
    }
    break;
  }
  return at;
}

function stripEscapes(expr, escapeFns) {
  for (let round = 0; round < 12; round++) {
    const hits = callHits(expr, escapeFns);
    if (!hits.length) return expr;
    const { start, end, openParen, close } = hits[0];
    expr = expr.slice(0, start) + expr.slice(openParen + 1, close) + expr.slice(end);
  }
  throw new Error("escape nesting too deep");
}

function tagNestedTemplates(expr, config) {
  const protectedSpans = callHits(expr, config.markupFns)
    .map(({ start, end }) => [start, end]);
  let out = "";
  let i = 0;
  const n = expr.length;
  while (i < n) {
    if (protectedSpans.some(([a, b]) => i >= a && i < b)) {
      const [, b] = protectedSpans.find(([a, b]) => i >= a && i < b);
      out += expr.slice(i, b);
      i = b;
      continue;
    }
    const c = expr[i];
    if (c === "'" || c === '"') {
      const j = skipString(expr, i, c);
      out += expr.slice(i, j);
      i = j;
      continue;
    }
    if (c === "`") {
      const j = skipTemplate(expr, i);
      const body = expr.slice(i + 1, j - 1);
      out += "html`" + processTemplateBody(body, config) + "`";
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function wrapChains(expr, config) {
  const names = [...config.textFns, ...config.markupFns];
  if (!names.length) return expr;
  const protectedSpans = [];
  for (const { start, end, name } of callHits(expr, config.markupFns)) {
    protectedSpans.push([start, consumeChain(expr, end)]);
    void name;
  }
  for (const m of expr.matchAll(/html\.raw\(/g)) {
    const openParen = expr.indexOf("(", m.index);
    const close = findMatching(expr, openParen, "(", ")");
    protectedSpans.push([m.index, close + 1]);
  }
  protectedSpans.sort((a, b) => a[0] - b[0]);
  let out = "";
  let i = 0;
  const n = expr.length;
  while (i < n) {
    const span = protectedSpans.find(([a, b]) => i >= a && i < b);
    if (span) {
      out += expr.slice(i, span[1]);
      i = span[1];
      continue;
    }
    // THE lookbehind rule: a call name is a call only when the character
    // before it cannot continue an identifier/property chain. Comparing
    // expr[i-1] explicitly is the whole point — a regex anchored at a slice
    // start cannot see this character, and that is how padStart lost its tail.
    const rest = expr.slice(i);
    const m = new RegExp(`^(${names.join("|")})\\s*\\(`).exec(rest);
    if (m && !(i > 0 && /[\w$.]/.test(expr[i - 1]))) {
      const openParen = i + rest.indexOf("(");
      const close = findMatching(expr, openParen, "(", ")");
      const chainEnd = consumeChain(expr, close + 1);
      out += "html.raw(" + expr.slice(i, chainEnd) + ")";
      protectedSpans.push([i, chainEnd]);
      i = chainEnd;
      continue;
    }
    if (expr[i] === "`") {
      const j = skipTemplate(expr, i);
      out += expr.slice(i, j);
      i = j;
      continue;
    }
    if (expr[i] === "'" || expr[i] === '"') {
      const j = skipString(expr, i, expr[i]);
      out += expr.slice(i, j);
      i = j;
      continue;
    }
    out += expr[i];
    i += 1;
  }
  return out;
}

// Protected spans are computed ONCE on the original expression and every
// phase runs on the outside segments only. Stripping escapes globally BEFORE
// the span pass (the session tool's order) rewrote builder-argument data -
// a behavior change hiding inside a "zero-behavior-change" transform.
export function processExpression(expr, config) {
  const protectedSpans = callHits(expr, config.markupFns)
    .map(({ start, end }) => [start, consumeChain(expr, end)]);
  const segments = [];
  let i = 0;
  const n = expr.length;
  while (i < n) {
    const span = protectedSpans.find(([a, b]) => i >= a && i < b);
    if (span) {
      segments.push({ text: expr.slice(i, span[1]), protect: true });
      i = span[1];
      continue;
    }
    // find the next protected span start, or the end
    let next = n;
    for (const [a] of protectedSpans) {
      if (a > i && a < next) next = a;
    }
    segments.push({ text: expr.slice(i, next), protect: false });
    i = next;
  }
  let out = "";
  for (const segment of segments) {
    if (segment.protect) {
      // A markup-builder call interpolated raw in the original template
      // passed its trusted HTML straight through; html.raw preserves that
      // pass-through under the tagging discipline.
      out += "html.raw(" + segment.text + ")";
      continue;
    }
    let piece = stripEscapes(segment.text, config.escapeFns);
    piece = tagNestedTemplates(piece, config);
    piece = wrapChains(piece, config);
    for (const [from, to] of Object.entries(config.rawIds ?? {})) {
      const bareFrom = from.replace(/^\$\{/, "").replace(/\}$/, "");
      const bareTo = to.replace(/^\$\{/, "").replace(/\}$/, "");
      if (piece === bareFrom) piece = bareTo;
    }
    if (piece.endsWith('.join("")') && piece.includes("html`") && piece.includes(".map(")) {
      piece = piece.slice(0, -'.join("")'.length);
    }
    out += piece;
  }
  return out;
}

export function processTemplateBody(body, config) {
  let out = "";
  let last = 0;
  for (const [start, end] of topLevelInterpolations(body)) {
    out += body.slice(last, start);
    const inner = body.slice(start + 2, end - 1);
    out += "${" + processExpression(inner, config) + "}";
    last = end;
  }
  out += body.slice(last);
  return out;
}

// One site: locate the template whose opening backtick sits on `lineNo`,
// process its body, tag the outer template. Idempotent: a site already
// tagged (the assignment line reads `= html\``) is skipped with a note.
export function transformSite(src, lineNo, config) {
  const lines = src.split("\n");
  const line = lines[lineNo - 1];
  if (!line) throw new Error(`line ${lineNo} does not exist`);
  const tickAt = line.indexOf("`");
  if (tickAt === -1) throw new Error(`line ${lineNo} has no backtick`);
  let charIndex = lines.slice(0, lineNo - 1).join("\n").length + (lineNo > 1 ? 1 : 0) + tickAt;
  if (src.slice(Math.max(0, charIndex - 5), charIndex).endsWith("html")) {
    return { src, changed: false, note: `line ${lineNo} already tagged` };
  }
  const close = skipTemplate(src, charIndex);
  const body = src.slice(charIndex + 1, close - 1);
  const processed = processTemplateBody(body, config);
  let out = src.slice(0, charIndex + 1) + processed + src.slice(close - 1);
  out = out.slice(0, charIndex) + "html" + out.slice(charIndex);
  return { src: out, changed: true, note: `line ${lineNo} transformed` };
}

export function transformFile(src, lineNumbers, config) {
  // Descending: later lines first so earlier line numbers stay valid.
  let out = src;
  const notes = [];
  for (const lineNo of [...lineNumbers].sort((a, b) => b - a)) {
    const result = transformSite(out, lineNo, config);
    out = result.src;
    notes.push(result.note);
  }
  return { src: out, notes };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const args = process.argv.slice(2);
  const file = args[0];
  const readFlag = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  if (!file || !readFlag("--lines")) {
    console.error("usage: node tooling/inner-html-transform.mjs <file> --lines 120,318 --escape-fns ... --text-fns ... --markup-fns ... [--raw-ids json]");
    process.exit(2);
  }
  const config = {
    escapeFns: (readFlag("--escape-fns") || "escapeHtml").split(","),
    textFns: (readFlag("--text-fns") || "t").split(","),
    markupFns: (readFlag("--markup-fns") || "").split(",").filter(Boolean),
    rawIds: readFlag("--raw-ids") ? JSON.parse(readFlag("--raw-ids")) : {},
  };
  const lineNumbers = readFlag("--lines").split(",").map(Number).filter(Boolean);
  const src = readFileSync(file, "utf8");
  const { src: out, notes } = transformFile(src, lineNumbers, config);
  writeFileSync(file, out);
  notes.forEach((note) => console.log(`  ${note}`));
}
