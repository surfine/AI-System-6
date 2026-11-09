// Which windows, in which appearances, a stylesheet change can reach.
//
// The cascade ledger (tooling/cascade-ledger.mjs) answers "did a different rule
// start winning anywhere", but a full walk opens all 83 registered windows per
// appearance and viewport, four to six minutes a cell, and twelve appearances
// at two viewports is two hours. This module narrows the walk from the diff,
// without a browser:
//
//   1. rules      Parse the stylesheet before and after and list the rules
//                 whose declarations changed (added, removed, edited, moved to
//                 another @media/@container/@layer context). A changed custom
//                 property adds every rule that reads it through var(),
//                 transitively; a changed @keyframes adds the rules that name
//                 it in an animation.
//   2. windows    A rule can only change an element its selector can match. The
//                 subject (last compound) of each selector is checked against
//                 the window inventory the baseline recorded (every tag, id and
//                 class present in each window; tooling/lib/cascade-page.mjs
//                 windowIndex). A subject that can be an ancestor of the
//                 windows (html, body, main.desktop, :root, *) reaches all of
//                 them. Pseudo-classes, attributes, :has() and :not() are
//                 ignored, which can only widen the answer.
//   3. appearances  A rule reaches an appearance when its sheet is loaded
//                 there (boot bundle everywhere; an era sheet by the recipe
//                 chain and capabilities, app/core/theme-registry.js
//                 appearanceStylePaths, or anywhere when a window's lazy loader
//                 asks for it) and its theme conditions hold there: data-theme,
//                 data-lineage, data-theme-family and the other attributes the
//                 registry projects on html and body, and the use-liquid-glass
//                 and use-modern-fonts classes, evaluated against each
//                 appearance's projection. :is()/:where() alternatives OR,
//                 a :not() of pure theme conditions excludes.
//
// Anything this cannot read with confidence is a full walk for the appearances
// it reaches: an @font-face, @import or @layer statement change, an unparsable
// sheet, a stylesheet outside the bundles, or (in tooling/cascade-changed.mjs)
// a change to the app's scripts or markup.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { desktopRoot } from "./paths.mjs";
import { lazyStyleBundles, styleRuntimePaths } from "../style-manifest.mjs";

// ---------------------------------------------------------------------------
// Stylesheet parsing
// ---------------------------------------------------------------------------

function stripComments(text) {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      out += " ";
      continue;
    }
    if (ch === "\"" || ch === "'") {
      const start = i;
      for (i += 1; i < text.length && text[i] !== ch; i += 1) if (text[i] === "\\") i += 1;
      out += text.slice(start, i + 1);
      continue;
    }
    out += ch;
  }
  return out;
}

/** Index just past the brace that closes the block opening at `open`. */
function blockEnd(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\"" || ch === "'") {
      for (i += 1; i < text.length && text[i] !== ch; i += 1) if (text[i] === "\\") i += 1;
    } else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("unbalanced braces");
}

/** Next `{`, `;` or `}` at paren depth 0, skipping strings. */
function nextStop(text, from) {
  let parens = 0;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\"" || ch === "'") {
      for (i += 1; i < text.length && text[i] !== ch; i += 1) if (text[i] === "\\") i += 1;
    } else if (ch === "(") parens += 1;
    else if (ch === ")") parens -= 1;
    else if (parens <= 0 && (ch === "{" || ch === ";" || ch === "}")) return i;
  }
  return text.length;
}

const squash = (value) => value.replace(/\s+/g, " ").trim();

function parseDeclarations(body) {
  const decls = new Map();
  for (const part of splitTopLevel(body, ";")) {
    const colon = part.indexOf(":");
    if (colon === -1) continue;
    const property = part.slice(0, colon).trim();
    if (!property) continue;
    const name = property.startsWith("--") ? property : property.toLowerCase();
    const value = squash(part.slice(colon + 1));
    // A repeated property is a fallback pair (display: -webkit-box; display:
    // flex); both halves are part of the declaration.
    decls.set(name, decls.has(name) ? `${decls.get(name)} ;; ${value}` : value);
  }
  return decls;
}

// At-rules whose blocks hold more rules; their prelude becomes context.
const GROUPING = new Set(["media", "supports", "layer", "container", "document", "scope", "starting-style"]);

/**
 * Flatten a stylesheet into its rules.
 * Style rule: { kind: "style", context, selector, decls: Map(property -> value) }.
 * Block at-rule (@keyframes, @font-face, @property, @page...): { kind: "at", name, prelude, context, body }.
 * Statement (@layer a, b; @import ...): { kind: "statement", context, text }.
 */
export function parseStylesheet(source) {
  const text = stripComments(source);
  const rules = [];
  const walk = (start, end, context) => {
    let i = start;
    while (i < end) {
      const stop = nextStop(text, i);
      if (stop >= end) {
        if (squash(text.slice(i, end))) rules.push({ kind: "statement", context, text: squash(text.slice(i, end)) });
        return;
      }
      const prelude = squash(text.slice(i, stop));
      if (text[stop] === ";" || text[stop] === "}") {
        if (prelude) rules.push({ kind: "statement", context, text: prelude });
        i = stop + 1;
        continue;
      }
      const close = blockEnd(text, stop);
      const body = text.slice(stop + 1, close - 1);
      if (prelude.startsWith("@")) {
        const name = /^@([\w-]+)/.exec(prelude)[1].toLowerCase();
        const rest = prelude.slice(name.length + 1).trim();
        if (GROUPING.has(name)) walk(stop + 1, close - 1, [...context, `@${name} ${rest}`.trim()]);
        else rules.push({ kind: "at", name, prelude: rest, context, body: squash(body) });
      } else {
        rules.push({ kind: "style", context, selector: prelude, decls: parseDeclarations(body) });
      }
      i = close;
    }
  };
  walk(0, text.length, []);
  return rules;
}

function ruleKey(rule) {
  const where = rule.context.join(" | ");
  if (rule.kind === "style") return `${where} :: ${rule.selector}`;
  if (rule.kind === "at") return `${where} :: @${rule.name} ${rule.prelude}`;
  return `${where} :: ; ${rule.text}`;
}

/**
 * Rules that differ between two versions of one sheet.
 * Returns { style: [{ selector, context, properties: Set }], keyframes: Set(name),
 *           atomic: [description] } where atomic changes cannot be narrowed.
 */
export function diffStylesheets(beforeText, afterText) {
  const index = (rules) => {
    const map = new Map();
    for (const rule of rules) {
      let key = ruleKey(rule);
      // The same selector twice in one context is two rules; number them.
      for (let n = 2; map.has(key); n += 1) key = `${ruleKey(rule)} #${n}`;
      map.set(key, rule);
    }
    return map;
  };
  const before = index(parseStylesheet(beforeText || ""));
  const after = index(parseStylesheet(afterText || ""));
  const result = { style: [], keyframes: new Set(), atomic: [] };
  // Source order breaks specificity ties, so a rule that changed places
  // relative to the others is a change even with identical declarations: the
  // rules outside the longest run kept in the same order moved.
  for (const key of reordered([...before.keys()], [...after.keys()])) {
    const rule = after.get(key);
    if (rule.kind === "style") result.style.push({ selector: rule.selector, context: rule.context, properties: new Set(rule.decls.keys()) });
    else if (rule.kind === "at" && rule.name.endsWith("keyframes")) continue;
    else result.atomic.push(`moved: ${key.slice(0, 80)}`);
  }
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(key);
    const now = after.get(key);
    const rule = now || was;
    if (rule.kind === "style") {
      const a = was?.decls || new Map();
      const b = now?.decls || new Map();
      const properties = new Set([...a.keys(), ...b.keys()].filter((property) => a.get(property) !== b.get(property)));
      if (properties.size) result.style.push({ selector: rule.selector, context: rule.context, properties });
    } else if (rule.kind === "at") {
      if (was && now && was.body === now.body) continue;
      if (rule.name === "keyframes" || rule.name.endsWith("-keyframes")) result.keyframes.add(rule.prelude);
      else if (rule.name === "property") result.style.push({ selector: ":root", context: rule.context, properties: new Set([rule.prelude]) });
      else result.atomic.push(`@${rule.name} ${rule.prelude}`.trim());
    } else if (!was || !now) {
      result.atomic.push(rule.text.slice(0, 80));
    }
  }
  return result;
}

/** Keys present in both lists that are not on the longest common ordered run. */
function reordered(beforeKeys, afterKeys) {
  const position = new Map(afterKeys.map((key, index) => [key, index]));
  const common = beforeKeys.filter((key) => position.has(key));
  // Longest increasing subsequence of after-positions, in before order.
  const tails = [];
  const tailIndex = [];
  const previous = new Array(common.length).fill(-1);
  common.forEach((key, i) => {
    const value = position.get(key);
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < value) lo = mid + 1; else hi = mid; }
    tails[lo] = value;
    tailIndex[lo] = i;
    previous[i] = lo > 0 ? tailIndex[lo - 1] : -1;
  });
  const kept = new Set();
  for (let i = tailIndex[tails.length - 1] ?? -1; i !== -1; i = previous[i]) kept.add(common[i]);
  return common.filter((key) => !kept.has(key));
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Split on `separator` outside (), [] and strings. */
export function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\"" || ch === "'") {
      for (i += 1; i < text.length && text[i] !== ch; i += 1) if (text[i] === "\\") i += 1;
    } else if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0 && ch === separator) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** Compounds of one complex selector, combinators dropped. */
function compounds(complex) {
  const out = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < complex.length; i += 1) {
    const ch = complex[i];
    if (ch === "\\") { current += complex.slice(i, i + 2); i += 1; continue; }
    if (ch === "\"" || ch === "'") {
      const start = i;
      for (i += 1; i < complex.length && complex[i] !== ch; i += 1) if (complex[i] === "\\") i += 1;
      current += complex.slice(start, i + 1);
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (depth === 0 && /[\s>+~]/.test(ch)) {
      if (current) out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

const unescape = (name) => name.replace(/\\(.)/g, "$1");

/**
 * Parse one compound into { tag, ids, classes, attrs: [{name, op, value}],
 * pseudos: [{name, arg}] }. Pseudo-elements are dropped.
 */
export function parseCompound(compound) {
  const parsed = { tag: null, ids: [], classes: [], attrs: [], pseudos: [] };
  const ident = /^(?:\\.|[^\s.#[\]:>+~,()*|"'=\\])+/u;
  let i = 0;
  const lead = /^(?:\*|(?:\\.|[^\s.#[\]:>+~,()*|"'=\\])+)/u.exec(compound);
  if (lead) {
    if (lead[0] !== "*") parsed.tag = lead[0].toLowerCase();
    i = lead[0].length;
  }
  while (i < compound.length) {
    const ch = compound[i];
    if (ch === "#" || ch === ".") {
      const match = ident.exec(compound.slice(i + 1));
      const name = match ? unescape(match[0]) : "";
      (ch === "#" ? parsed.ids : parsed.classes).push(name);
      i += 1 + (match ? match[0].length : 0);
    } else if (ch === "[") {
      let end = i + 1;
      for (let depth = 1; end < compound.length && depth; end += 1) {
        if (compound[end] === "\"" || compound[end] === "'") {
          const quote = compound[end];
          for (end += 1; end < compound.length && compound[end] !== quote; end += 1) if (compound[end] === "\\") end += 1;
        } else if (compound[end] === "[") depth += 1;
        else if (compound[end] === "]") depth -= 1;
      }
      const inner = compound.slice(i + 1, end - 1).trim();
      const attr = /^([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^\s\]]+))\s*([is])?)?$/i.exec(inner);
      if (attr) parsed.attrs.push({ name: attr[1].toLowerCase(), op: attr[2] || null, value: attr[3] ?? attr[4] ?? attr[5] ?? null });
      i = end;
    } else if (ch === ":") {
      const element = compound[i + 1] === ":";
      const start = i + (element ? 2 : 1);
      const match = ident.exec(compound.slice(start));
      const name = match ? match[0].toLowerCase() : "";
      let end = start + name.length;
      let arg = null;
      if (compound[end] === "(") {
        let depth = 0;
        let close = end;
        for (; close < compound.length; close += 1) {
          if (compound[close] === "(") depth += 1;
          else if (compound[close] === ")") { depth -= 1; if (!depth) break; }
        }
        arg = compound.slice(end + 1, close);
        end = close + 1;
      }
      const legacyElement = ["before", "after", "first-line", "first-letter"].includes(name);
      if (!element && !legacyElement) parsed.pseudos.push({ name, arg });
      i = end;
    } else {
      i += 1;
    }
  }
  return parsed;
}

/**
 * What an element must carry to be the subject of `selectorList`: a list of
 * alternatives, each { tags, ids, classes } that must all be present. An
 * alternative with nothing in it matches any element.
 */
export function subjectRequirements(selectorList) {
  const out = [];
  for (const complex of splitTopLevel(selectorList, ",")) {
    const parts = compounds(complex);
    const subject = parseCompound(parts[parts.length - 1] || "*");
    const base = {
      tags: subject.tag ? [subject.tag] : [],
      ids: subject.ids,
      classes: subject.classes,
    };
    if (subject.pseudos.some((pseudo) => pseudo.name === "root")) base.tags = ["html"];
    // :is()/:where() in the subject: one of its arguments has to hold too.
    const alternatives = subject.pseudos.filter((pseudo) => ["is", "where", "matches", "-webkit-any"].includes(pseudo.name) && pseudo.arg);
    let combos = [base];
    for (const pseudo of alternatives) {
      const next = [];
      for (const inner of subjectRequirements(pseudo.arg)) {
        for (const combo of combos) {
          next.push({
            tags: [...combo.tags, ...inner.tags],
            ids: [...combo.ids, ...inner.ids],
            classes: [...combo.classes, ...inner.classes],
          });
        }
      }
      // Past this many combinations, stop narrowing: any element.
      combos = next.length > 64 ? [{ tags: [], ids: [], classes: [] }] : next;
    }
    out.push(...combos);
  }
  return out;
}

const satisfies = (requirement, tokens) => requirement.tags.every((tag) => tokens.tags.has(tag))
  && requirement.ids.every((id) => tokens.ids.has(id))
  && requirement.classes.every((name) => tokens.classes.has(name));

const tokenSets = (entry) => ({ tags: new Set((entry?.tags || []).map((tag) => tag.toLowerCase())), ids: new Set(entry?.ids || []), classes: new Set(entry?.classes || []) });

/**
 * Windows of one baseline whose elements can be the subject of `selector`.
 * Returns { all: true } when the subject can be an ancestor of the windows,
 * else { windows: Set }. `inheritsDown: false` (a rule that only sets custom
 * properties) lets an ancestor subject count as "(ancestors)" alone (html,
 * body, the desktop): the cell it declares lives there, and the readers carry
 * the rest.
 */
export function windowsForSelector(selector, index, { inheritsDown = true } = {}) {
  const ancestors = tokenSets(index.ancestors);
  const windows = new Set();
  const inventories = Object.entries(index.inventory).map(([name, entry]) => [name, tokenSets(entry)]);
  const any = (alternatives, tokens) => alternatives.some((requirement) => satisfies(requirement, tokens));
  for (const complex of splitTopLevel(selector, ",")) {
    const parts = compounds(complex);
    const subject = subjectRequirements(parts[parts.length - 1] || "*");
    // Every other compound names an ancestor or a sibling: it has to exist in
    // the same window, or above the windows (html, body, the desktop).
    const context = parts.slice(0, -1).map((part) => subjectRequirements(part));
    const contextHolds = (tokens) => context.every((alternatives) => any(alternatives, tokens) || any(alternatives, ancestors));
    if (any(subject, ancestors) && context.every((alternatives) => any(alternatives, ancestors))) {
      if (inheritsDown) return { all: true, windows };
      windows.add("(ancestors)");
    }
    for (const [name, tokens] of inventories) {
      if (any(subject, tokens) && contextHolds(tokens)) windows.add(name);
    }
  }
  return { all: false, windows };
}

// ---------------------------------------------------------------------------
// Appearances
// ---------------------------------------------------------------------------

const THEME_ATTRIBUTES = new Set([
  "data-theme", "data-theme-family", "data-theme-base", "data-lineage", "data-menu-bar-model",
  "data-finder-layout", "data-selection-model", "data-alert-layout", "data-color-mode",
]);
const THEME_CLASSES = new Set(["use-liquid-glass", "use-modern-fonts"]);

let projectionCache = null;

/**
 * What each appearance projects on html and body, and which lazy appearance
 * sheets it loads, read by running app/core/theme-registry.js against a stub
 * document, so the answer follows the registry rather than a copy of it.
 */
export function themeProjections() {
  if (projectionCache) return projectionCache;
  const element = () => {
    const classes = new Set();
    return {
      dataset: {},
      classes,
      classList: {
        toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
      },
    };
  };
  const html = element();
  const body = element();
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const document = { documentElement: html, body, addEventListener() {}, querySelector: () => null };
  const win = { localStorage: storage, matchMedia: () => ({ matches: false, addEventListener() {} }), document, dispatchEvent() {}, CustomEvent: class {} };
  win.window = win;
  vm.runInNewContext(readFileSync(join(desktopRoot, "app/core/theme-registry.js"), "utf8"), { window: win, ...win });
  const api = win.AISystem6Theme;
  const projections = new Map();
  for (const theme of api.themes) {
    api.applyTheme(theme.id, { experimental: true, persist: false, announce: false, modernFontPreference: false });
    api.syncFontStrategy?.(false);
    const attributes = Object.fromEntries(Object.entries(body.dataset)
      .map(([key, value]) => [`data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(value)]));
    projections.set(theme.id, { attributes, classes: new Set(body.classes), sheets: api.appearanceStylePaths(theme.id) });
  }
  projectionCache = projections;
  return projections;
}

function attributeHolds({ name, op, value }, attributes) {
  const actual = attributes[name];
  if (actual === undefined) return false;
  if (!op) return true;
  switch (op) {
    case "=": return actual === value;
    case "~=": return actual.split(/\s+/).includes(value);
    case "|=": return actual === value || actual.startsWith(`${value}-`);
    case "^=": return actual.startsWith(value);
    case "$=": return actual.endsWith(value);
    case "*=": return actual.includes(value);
    default: return true;
  }
}

/** Could `complex` match in the appearance whose projection this is? */
function complexCanMatch(complex, projection) {
  for (const compound of compounds(complex)) {
    const parsed = parseCompound(compound);
    for (const attr of parsed.attrs) {
      if (THEME_ATTRIBUTES.has(attr.name) && !attributeHolds(attr, projection.attributes)) return false;
    }
    for (const name of parsed.classes) {
      if (THEME_CLASSES.has(name) && !projection.classes.has(name)) return false;
    }
    for (const pseudo of parsed.pseudos) {
      if (!pseudo.arg) continue;
      if (["is", "where", "matches", "-webkit-any"].includes(pseudo.name)) {
        if (!splitTopLevel(pseudo.arg, ",").some((inner) => complexCanMatch(inner, projection))) return false;
      } else if (pseudo.name === "not") {
        // Only a :not() made of theme conditions alone is read; it excludes
        // the appearances where those conditions hold.
        for (const inner of splitTopLevel(pseudo.arg, ",")) {
          const parts = compounds(inner);
          if (parts.length !== 1) continue;
          const negated = parseCompound(parts[0]);
          const pure = (!negated.tag || negated.tag === "html" || negated.tag === "body")
            && negated.ids.length === 0 && negated.pseudos.length === 0
            && (negated.attrs.length + negated.classes.length) > 0
            && negated.attrs.every((attr) => THEME_ATTRIBUTES.has(attr.name))
            && negated.classes.every((name) => THEME_CLASSES.has(name));
          if (pure && negated.attrs.every((attr) => attributeHolds(attr, projection.attributes))
            && negated.classes.every((name) => projection.classes.has(name))) return false;
        }
      }
    }
  }
  return true;
}

/** Appearances in which some selector of the list can match. */
export function selectorThemes(selectorList, projections = themeProjections()) {
  const out = new Set();
  const complexes = splitTopLevel(selectorList, ",");
  for (const [id, projection] of projections) {
    if (complexes.some((complex) => complexCanMatch(complex, projection))) out.add(id);
  }
  return out;
}

/** "styles/70-liquid-glass.css" -> the appearances that load it. */
export function sheetThemes(file, projections = themeProjections(), { windowLoaded = windowLoadedSheets() } = {}) {
  const all = new Set(projections.keys());
  if (styleRuntimePaths.includes(file)) return all;
  const bundle = lazyStyleBundles.find((entry) => entry.sources.includes(file));
  if (!bundle) return null;
  const owners = new Set([...projections].filter(([, projection]) => projection.sheets.includes(bundle.output)).map(([id]) => id));
  // Not an appearance sheet (a window's own lazy CSS), or an appearance sheet a
  // window's loader also requests (Theme Lab reads every era's rules): it can
  // be on the page in any appearance.
  if (!owners.size || windowLoaded.has(bundle.output)) return all;
  return owners;
}

/** Lazy sheets a window's module loader requests (app/core/config.js). */
export function windowLoadedSheets() {
  const text = readFileSync(join(desktopRoot, "app/core/config.js"), "utf8");
  const found = new Set();
  for (const match of text.matchAll(/createLazyModuleLoader\([^\n]*?\[([^\]]*)\]\s*\)/g)) {
    for (const name of match[1].matchAll(/"(styles\.[\w-]+\.css)"/g)) found.add(name[1]);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const VAR_USE = /var\(\s*(--[\w-]+)/g;

/**
 * Plan the targeted ledger for a set of changed stylesheets.
 *
 * @param {Array<{ file: string, before: string, after: string }>} sheets
 *   file is relative to apps/desktop ("styles/50-apps.css"); before/after the
 *   texts ("" for an added or deleted sheet).
 * @param {object} options
 *   indexFor(theme, viewport) -> the baseline's window index, or null
 *   viewports: ["1440x960", "390x844"]
 *   allSheets: [{ file, text }] every stylesheet as it is now (custom-property readers)
 * @returns {{ cells: Array<{ theme, viewport, windows: string[] | null, why: string[] }>, notes: string[] }}
 *   windows null means every window (a full walk of that cell).
 */
export function planCascadeImpact(sheets, { indexFor, viewports, allSheets, projections = themeProjections() }) {
  const notes = [];
  const themes = [...projections.keys()];
  // Per theme: windows, or "all"; and why.
  const reach = new Map(themes.map((theme) => [theme, { all: false, subjects: [], why: new Set() }]));
  const everywhere = (themeSet, reason) => {
    for (const theme of themeSet) { reach.get(theme).all = true; reach.get(theme).why.add(reason); }
  };

  const readers = new Map();
  const animated = [];
  for (const { file, text } of allSheets) {
    let rules;
    try { rules = parseStylesheet(text); } catch { continue; }
    for (const rule of rules) {
      // A keyframe step that reads a token: the token reaches whoever animates with it.
      if (rule.kind === "at" && rule.name.endsWith("keyframes")) {
        for (const match of rule.body.matchAll(VAR_USE)) {
          if (!readers.has(match[1])) readers.set(match[1], []);
          readers.get(match[1]).push({ file, keyframes: rule.prelude });
        }
        continue;
      }
      if (rule.kind !== "style") continue;
      for (const [property, value] of rule.decls) {
        for (const match of value.matchAll(VAR_USE)) {
          if (!readers.has(match[1])) readers.set(match[1], []);
          readers.get(match[1]).push({ file, rule, property });
        }
        if (/^animation(?:-name)?$/.test(property)) animated.push({ file, rule, value });
      }
    }
  }

  // A subject: a selector in a file whose matched elements need comparing.
  const addSubject = (file, selector, themeScope, inheritsDown, reason) => {
    const fileThemes = sheetThemes(file, projections);
    if (!fileThemes) { everywhere(themeScope, `${file} is not in the style manifest`); return; }
    const selected = selectorThemes(selector, projections);
    for (const theme of themeScope) {
      if (!fileThemes.has(theme) || !selected.has(theme)) continue;
      reach.get(theme).subjects.push({ file, selector, inheritsDown, reason });
    }
  };

  for (const { file, before, after } of sheets) {
    let diff;
    try { diff = diffStylesheets(before, after); } catch (error) {
      everywhere(themes, `${file} did not parse (${error.message})`);
      continue;
    }
    const fileThemes = sheetThemes(file, projections);
    if (!fileThemes) { everywhere(themes, `${file} is not in the style manifest`); continue; }
    for (const atomic of diff.atomic) everywhere(fileThemes, `${file}: ${atomic}`);
    for (const change of diff.style) {
      const scope = new Set([...selectorThemes(change.selector, projections)].filter((theme) => fileThemes.has(theme)));
      const custom = [...change.properties].filter((property) => property.startsWith("--"));
      const plain = [...change.properties].filter((property) => !property.startsWith("--"));
      const label = `${file} :: ${squash(change.selector).slice(0, 90)}`;
      addSubject(file, change.selector, scope, plain.length > 0, `${label} {${[...change.properties].slice(0, 4).join(", ")}}`);
      // Custom properties: whoever reads them, transitively, in the
      // appearances the declaration reaches.
      const seen = new Set();
      const queue = [...custom];
      while (queue.length) {
        const name = queue.shift();
        if (seen.has(name)) continue;
        seen.add(name);
        for (const reader of readers.get(name) || []) {
          if (reader.keyframes) {
            for (const user of animated.filter(({ value }) => value.split(/[\s,]+/).includes(reader.keyframes))) {
              addSubject(user.file, user.rule.selector, scope, true, `${label} via ${name} in @keyframes ${reader.keyframes}`);
            }
            continue;
          }
          addSubject(reader.file, reader.rule.selector, scope, !reader.property.startsWith("--"), `${label} via ${name}`);
          if (reader.property.startsWith("--")) queue.push(reader.property);
        }
      }
    }
    for (const name of diff.keyframes) {
      const users = animated.filter(({ value }) => value.split(/[\s,]+/).includes(name));
      for (const user of users) addSubject(user.file, user.rule.selector, fileThemes, true, `${file}: @keyframes ${name}`);
    }
  }

  const cells = [];
  for (const theme of themes) {
    const entry = reach.get(theme);
    if (!entry.all && !entry.subjects.length) continue;
    for (const viewport of viewports) {
      const why = [...entry.why];
      if (entry.all) { cells.push({ theme, viewport, windows: null, why }); continue; }
      const index = indexFor(theme, viewport);
      if (!index) {
        cells.push({ theme, viewport, windows: null, why: [...why, "no window index in the baseline"] });
        continue;
      }
      const windows = new Set();
      let all = false;
      const rules = [...new Map(entry.subjects.map((subject) => [`${subject.file}\u0000${subject.selector}`, [subject.file, subject.selector]])).values()];
      for (const subject of entry.subjects) {
        const found = windowsForSelector(subject.selector, index, { inheritsDown: subject.inheritsDown });
        if (found.all) { all = true; why.push(`${subject.reason} reaches every window`); break; }
        if (found.windows.size) why.push(subject.reason);
        found.windows.forEach((name) => windows.add(name));
      }
      if (all) { cells.push({ theme, viewport, windows: null, why: why.slice(-1) }); continue; }
      if (!windows.size) continue;
      cells.push({ theme, viewport, windows: [...windows].sort(), why: [...new Set(why)], rules });
    }
  }
  return { cells, notes };
}
