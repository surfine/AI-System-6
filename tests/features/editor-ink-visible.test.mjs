// The writer must be able to see their own words.
//
// Every writing surface (TeachText, the Question Sheet, the Outline, Section
// Drafts, the Review Desk, and the Quick Draft paper) is a textarea whose own
// text is `color: transparent`. Each glyph the writer sees is painted by the
// .mde-highlight overlay BEHIND that textarea. The arrangement buys live
// Markdown ink at the cost of one systemic hazard, and the hazard has already
// been paid for three separate times:
//
//   1. A programmatic `.value` write left the overlay holding the previous
//      text — session restore, AI results, revisions and clipping inserts all
//      write the textarea straight and fire no "input" event, so the paper
//      stayed blank while the words were there to select. Fixed by
//      watchControlWrites() in app/core/markdown-editor.js.
//   2. The browser's own opaque ::selection painted in the textarea's layer,
//      on top of the ink, so selecting a line made that line vanish.
//   3. Era field recipes painted a focus fill on any focused textarea. In Aqua
//      and Snow Leopard that fill is opaque white: clicking into the paper
//      erased the writing. In Liquid Glass it was a 42% white wash.
//
// One rule covers all three: NOTHING opaque may be painted in the textarea's
// own layer, and NOTHING may leave the overlay holding stale text. This
// contract holds that rule two ways — the repaint side by running the real
// module against a DOM whose textarea keeps `value` on its prototype the way a
// browser does, and the paint side by resolving the real cascade over the boot
// stylesheets for every writing surface, in every appearance, focused and not.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { styleRuntimePaths } from "../../tooling/style-manifest.mjs";
import { SHOWCASE_THEMES, WIDTHS } from "../appearance-snapshot-manifest.mjs";

const test = createFeatureTest("editor-ink-visible");

// ---------------------------------------------------------------------------
// 1. The overlay repaints. Real module, real prototype accessor.
// ---------------------------------------------------------------------------

// A textarea in a browser keeps `value` as an accessor on
// HTMLTextAreaElement.prototype, and watchControlWrites() wraps exactly that
// descriptor on the instance. A shim that stores `value` as a plain data
// property makes the guard a silent no-op and the test green for the wrong
// reason, so this DOM reproduces the prototype accessor instead.
function createEditorDom() {
  const frames = [];

  class Element {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.attributes = {};
      this.style = {
        setProperty() {},
        removeProperty() {},
        getPropertyValue: () => "",
      };
      this.innerHTML = "";
      this.scrollTop = 0;
      this.scrollLeft = 0;
      this.selectionStart = 0;
      this.selectionEnd = 0;
      this.__classes = new Set();
      this.__listeners = {};
    }

    get classList() {
      const set = this.__classes;
      return {
        add: (...names) => names.forEach((name) => set.add(name)),
        remove: (...names) => names.forEach((name) => set.delete(name)),
        contains: (name) => set.has(name),
        toggle: (name, force) => {
          const next = force === undefined ? !set.has(name) : Boolean(force);
          if (next) set.add(name); else set.delete(name);
          return next;
        },
      };
    }

    get className() { return [...this.__classes].join(" "); }
    set className(value) {
      this.__classes = new Set(String(value || "").trim().split(/\s+/).filter(Boolean));
    }

    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }

    append(...nodes) {
      nodes.forEach((node) => {
        if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((c) => c !== node);
        node.parentNode = this;
        this.children.push(node);
      });
    }

    insertBefore(node, reference) {
      const at = this.children.indexOf(reference);
      node.parentNode = this;
      this.children.splice(at < 0 ? this.children.length : at, 0, node);
      return node;
    }

    closest(selector) {
      const wanted = selector.replace(/^\./, "");
      let node = this;
      while (node) {
        if (node.__classes?.has(wanted)) return node;
        node = node.parentNode;
      }
      return null;
    }

    querySelector(selector) {
      const wanted = selector.replace(/^\./, "");
      const walk = (node) => {
        for (const child of node.children) {
          if (child.__classes?.has(wanted)) return child;
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(this);
    }

    querySelectorAll() { return []; }

    addEventListener(type, handler) { (this.__listeners[type] ||= []).push(handler); }
    dispatchEvent(event) {
      (this.__listeners[event?.type] || []).slice().forEach((handler) => handler.call(this, event));
      return true;
    }
  }

  class HTMLTextAreaElement extends Element {}
  Object.defineProperty(HTMLTextAreaElement.prototype, "value", {
    configurable: true,
    get() { return this.__value ?? ""; },
    set(next) { this.__value = String(next); },
  });

  const body = new Element("body");
  const context = {
    console,
    WeakMap,
    Math,
    Object,
    String,
    Number,
    Array,
    RegExp,
    Event: class { constructor(type) { this.type = type; } },
    HTMLTextAreaElement,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ fontSize: "15px", lineHeight: "24px", paddingLeft: "0px", paddingRight: "0px", paddingTop: "0px" }),
    document: {
      body,
      createElement: (tag) => (String(tag).toLowerCase() === "textarea" ? new HTMLTextAreaElement(tag) : new Element(tag)),
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(
    `${read("app/core/input-guard.js")}\n;\n${read("app/core/markdown-editor.js")}`,
    context,
  );

  const flush = () => {
    // paint() clears its own frame handle, so one drain is enough per beat.
    const queued = frames.splice(0, frames.length);
    queued.forEach((fn) => fn());
  };

  return { context, body, flush, Element, HTMLTextAreaElement };
}

const dom = createEditorDom();
const pane = new dom.Element("div");
dom.body.append(pane);
const textarea = new dom.HTMLTextAreaElement("textarea");
textarea.value = "the first line the writer typed";
pane.append(textarea);

dom.context.attachMarkdownHighlight(textarea);
dom.flush();

const surface = textarea.parentNode;
const overlay = surface.querySelector(".mde-highlight");

test.assert(
  surface?.__classes.has("mde-surface") && textarea.__classes.has("mde-input"),
  "attaching a writing surface wraps the textarea in .mde-surface and marks it .mde-input",
);
test.assert(
  Boolean(overlay) && overlay.innerHTML.includes("the first line the writer typed"),
  "the overlay behind the textarea carries the ink the writer can see",
);

// (a) A programmatic value write repaints the overlay. Session restore, AI
// results, revisions and clipping inserts all take this path and fire no
// "input" event.
textarea.value = "text restored from the project disk";
dom.flush();
test.assert(
  overlay.innerHTML.includes("text restored from the project disk"),
  "a programmatic value write repaints the overlay — the writer sees restored text, not a blank page",
);
test.assert(
  Boolean(Object.getOwnPropertyDescriptor(textarea, "value")?.set),
  "the repaint rides an own accessor over the prototype's, so no call site has to remember a refresh",
);

// The IME writes the composing characters into the value without going through
// that setter, so the composition events must repaint too.
Object.getOwnPropertyDescriptor(dom.HTMLTextAreaElement.prototype, "value")
  .set.call(textarea, "pinyin in flight");
textarea.dispatchEvent(new dom.context.Event("compositionupdate"));
dom.flush();
test.assert(
  overlay.innerHTML.includes("pinyin in flight"),
  "characters an IME is still composing reach the overlay, not just the transparent textarea",
);

// A scroll must move the ink with the caret, or the writer reads one part of
// the document while typing into another.
textarea.scrollTop = 240;
textarea.scrollLeft = 12;
textarea.dispatchEvent(new dom.context.Event("scroll"));
test.assert(
  overlay.scrollTop === 240 && overlay.scrollLeft === 12,
  "scrolling the textarea scrolls the ink with it",
);

// The explicit repaint the rest of the app calls when state outside the editor
// must make sure the paper shows what the textarea holds.
test.assert(
  dom.context.mdeRepaintHighlight(textarea) === true,
  "a surface outside the editor can ask for a repaint and be told it happened",
);
test.assert(
  dom.context.mdeRepaintHighlight(new dom.HTMLTextAreaElement("textarea")) === false,
  "the repaint request reports honestly when the textarea carries no overlay",
);

// ---------------------------------------------------------------------------
// 2. Nothing opaque is painted in the textarea's own layer.
//
// This half resolves the real cascade rather than reading selectors for their
// spelling: the three shipped defects were all cascade facts (an era rule that
// out-specified the base transparent rule), and a source grep cannot see one.
// ---------------------------------------------------------------------------

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Split a selector list on commas that are not inside (), [] or "".
function splitTop(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (ch === separator && depth === 0) { parts.push(current); current = ""; continue; }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

// Every style rule in a sheet, with the at-rule preludes that wrap it.
function eachRule(css, visit, conditions = []) {
  let index = 0;
  while (index < css.length) {
    const open = css.indexOf("{", index);
    if (open === -1) return;
    const raw = css.slice(index, open);
    const prelude = raw.slice(raw.lastIndexOf(";") + 1).trim();
    let depth = 1;
    let cursor = open + 1;
    while (cursor < css.length && depth > 0) {
      const ch = css[cursor];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      cursor += 1;
    }
    const body = css.slice(open + 1, cursor - 1);
    if (prelude.startsWith("@")) {
      if (/^@(media|supports|layer|container)\b/i.test(prelude)) {
        eachRule(body, visit, prelude.startsWith("@media") ? [...conditions, prelude] : conditions);
      }
    } else if (prelude) {
      visit(prelude, body, conditions);
    }
    index = cursor;
  }
}

// Width is the only media feature this gate models. Anything else (hover,
// pointer, prefers-*) counts as matching, so an unmodelled query can only make
// the gate consider MORE rules — it can never hide a fill.
function mediaApplies(conditions, width) {
  return conditions.every((prelude) => {
    for (const [, feature, value] of prelude.matchAll(/\((min-width|max-width)\s*:\s*(\d+)px\)/g)) {
      const px = Number(value);
      if (feature === "min-width" && width < px) return false;
      if (feature === "max-width" && width > px) return false;
    }
    return true;
  });
}

// A compound selector: tag, #id, .class, [attr], [attr="value"], pseudo-classes
// (with their arguments) and at most one pseudo-element.
function parseCompound(text) {
  const parsed = { tag: null, id: null, classes: [], attrs: [], pseudos: [], pseudoElement: null, supported: true };
  let index = 0;
  while (index < text.length) {
    const ch = text[index];
    if (ch === "*") { index += 1; continue; }
    if (ch === "#" || ch === ".") {
      const match = /^[#.]([\w-]+)/.exec(text.slice(index));
      if (!match) { parsed.supported = false; break; }
      if (ch === "#") parsed.id = match[1]; else parsed.classes.push(match[1]);
      index += match[0].length;
      continue;
    }
    if (ch === "[") {
      const close = text.indexOf("]", index);
      if (close === -1) { parsed.supported = false; break; }
      const inner = text.slice(index + 1, close);
      const match = /^([\w-]+)(?:([~|^$*]?=)"?([^"\]]*)"?)?$/.exec(inner.trim());
      if (!match) parsed.supported = false;
      else parsed.attrs.push({ name: match[1], operator: match[2] || null, value: match[3] ?? null });
      index = close + 1;
      continue;
    }
    if (ch === ":") {
      const isElement = text[index + 1] === ":";
      const start = index + (isElement ? 2 : 1);
      const nameMatch = /^[\w-]+/.exec(text.slice(start));
      if (!nameMatch) { parsed.supported = false; break; }
      let end = start + nameMatch[0].length;
      let args = null;
      if (text[end] === "(") {
        let depth = 1;
        let cursor = end + 1;
        while (cursor < text.length && depth > 0) {
          if (text[cursor] === "(") depth += 1;
          else if (text[cursor] === ")") depth -= 1;
          cursor += 1;
        }
        args = text.slice(end + 1, cursor - 1);
        end = cursor;
      }
      if (isElement) parsed.pseudoElement = nameMatch[0];
      else parsed.pseudos.push({ name: nameMatch[0], args });
      index = end;
      continue;
    }
    const tagMatch = /^[\w-]+/.exec(text.slice(index));
    if (!tagMatch) { parsed.supported = false; break; }
    parsed.tag = tagMatch[0].toLowerCase();
    index += tagMatch[0].length;
  }
  return parsed;
}

// Split a complex selector into [{ combinator, compound }] left to right.
function parseComplex(selector) {
  const parts = [];
  let current = "";
  let combinator = null;
  let depth = 0;
  const push = () => {
    if (!current.trim()) return;
    parts.push({ combinator, compound: parseCompound(current.trim()) });
    current = "";
    combinator = null;
  };
  for (let index = 0; index < selector.length; index += 1) {
    const ch = selector[index];
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (depth === 0 && /\s/.test(ch)) { push(); combinator = combinator || " "; continue; }
    if (depth === 0 && (ch === ">" || ch === "+" || ch === "~")) { push(); combinator = ch; continue; }
    current += ch;
  }
  push();
  return parts;
}

// Element model: one synthetic node per writing surface, with its real
// ancestors read out of index.html.
function matchesCompound(element, compound) {
  if (!compound.supported) return { matched: false, supported: false };
  if (compound.pseudoElement !== (element.pseudoElement || null)) return { matched: false, supported: true };
  if (compound.tag && compound.tag !== element.tag) return { matched: false, supported: true };
  if (compound.id && compound.id !== element.id) return { matched: false, supported: true };
  for (const name of compound.classes) if (!element.classes.has(name)) return { matched: false, supported: true };
  for (const attr of compound.attrs) {
    const actual = element.attrs[attr.name];
    if (actual === undefined) return { matched: false, supported: true };
    if (attr.value !== null && attr.operator === "=" && actual !== attr.value) return { matched: false, supported: true };
  }
  let supported = true;
  for (const pseudo of compound.pseudos) {
    if (pseudo.name === "not") {
      for (const inner of splitTop(pseudo.args || "", ",")) {
        const result = matchesSelector(inner, element);
        if (!result.supported) supported = false;
        if (result.matched) return { matched: false, supported };
      }
      continue;
    }
    if (pseudo.name === "is" || pseudo.name === "where" || pseudo.name === "matches") {
      let any = false;
      for (const inner of splitTop(pseudo.args || "", ",")) {
        const result = matchesSelector(inner, element);
        if (!result.supported) supported = false;
        if (result.matched) any = true;
      }
      if (!any) return { matched: false, supported };
      continue;
    }
    if (pseudo.name === "focus" || pseudo.name === "focus-within" || pseudo.name === "focus-visible") {
      if (!element.states.has("focus")) return { matched: false, supported };
      continue;
    }
    if (pseudo.name === "root") {
      if (element.tag !== ":root") return { matched: false, supported };
      continue;
    }
    // Every other state (:hover, :disabled, :checked, :placeholder-shown, …)
    // is one this element is never in while a writer is typing into it.
    return { matched: false, supported };
  }
  return { matched: true, supported };
}

function matchesSelector(selector, element) {
  const parts = parseComplex(selector);
  if (!parts.length) return { matched: false, supported: false };
  let supported = true;
  const last = parts[parts.length - 1];
  const tail = matchesCompound(element, last.compound);
  if (!tail.supported) supported = false;
  if (!tail.matched) return { matched: false, supported };

  let index = parts.length - 2;
  let candidates = [element.parent];
  while (index >= 0) {
    const { combinator } = parts[index + 1];
    if (combinator === "+" || combinator === "~") return { matched: false, supported };
    const part = parts[index];
    let found = null;
    if (combinator === ">") {
      const parent = candidates[0];
      if (parent) {
        const result = matchesCompound(parent, part.compound);
        if (!result.supported) supported = false;
        if (result.matched) found = parent.parent;
      }
    } else {
      let node = candidates[0];
      while (node) {
        const result = matchesCompound(node, part.compound);
        if (!result.supported) supported = false;
        if (result.matched) { found = node.parent; break; }
        node = node.parent;
      }
    }
    if (!found && !(found === null && index === 0 && false)) {
      if (found === null) return { matched: false, supported };
    }
    candidates = [found];
    index -= 1;
  }
  return { matched: true, supported };
}

function specificity(selector) {
  let a = 0;
  let b = 0;
  let c = 0;
  for (const part of parseComplex(selector)) {
    const { compound } = part;
    if (compound.id) a += 1;
    b += compound.classes.length + compound.attrs.length;
    if (compound.tag) c += 1;
    if (compound.pseudoElement) c += 1;
    for (const pseudo of compound.pseudos) {
      if (pseudo.name === "where") continue;
      if (pseudo.name === "is" || pseudo.name === "not" || pseudo.name === "matches") {
        let best = [0, 0, 0];
        for (const inner of splitTop(pseudo.args || "", ",")) {
          const one = specificity(inner);
          if (one[0] > best[0] || (one[0] === best[0] && (one[1] > best[1] || (one[1] === best[1] && one[2] > best[2])))) best = one;
        }
        a += best[0]; b += best[1]; c += best[2];
        continue;
      }
      b += 1;
    }
  }
  return [a, b, c];
}

function compareSpecificity(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

// --- The sheets, read once. ---

const sheets = styleRuntimePaths.map((path) => ({ path, css: stripComments(read(path)) }));
const rules = [];
sheets.forEach(({ path, css }, sheetIndex) => {
  eachRule(css, (selectorList, body, conditions) => {
    const declarations = splitTop(body, ";")
      .map((declaration) => {
        const colon = declaration.indexOf(":");
        if (colon === -1) return null;
        return {
          property: declaration.slice(0, colon).trim().toLowerCase(),
          value: declaration.slice(colon + 1).trim(),
        };
      })
      .filter(Boolean);
    if (!declarations.length) return;
    rules.push({ path, sheetIndex, order: rules.length, selectorList, conditions, declarations });
  });
});

// --- Token tables, one per appearance. ---

const THEME_SCOPES = {
  classic: [":root", "html", "body"],
  platinum: [":root", "html", "body", 'body[data-theme="platinum"]'],
  aqua: [":root", "html", "body", 'body[data-theme="aqua"]'],
  "snow-leopard": [":root", "html", "body", 'body[data-theme="snow-leopard"]'],
  yosemite: [":root", "html", "body", 'body[data-theme="yosemite"]'],
  "liquid-glass": [":root", "html", "body", 'body[data-theme="liquid-glass"]', "body.use-liquid-glass"],
};

function tokenTable(theme) {
  const scopes = new Set(THEME_SCOPES[theme]);
  const tokens = new Map();
  for (const rule of rules) {
    if (rule.conditions.length) continue;
    const selectors = splitTop(rule.selectorList, ",");
    if (!selectors.some((selector) => scopes.has(selector.replace(/\s+/g, " ")))) continue;
    for (const { property, value } of rule.declarations) {
      if (property.startsWith("--")) tokens.set(property, value);
    }
  }
  return tokens;
}

// --- Value resolution: var() chains, then the alpha of the resulting colour. ---

function resolveVars(value, tokens, seen = new Set()) {
  let out = "";
  let index = 0;
  while (index < value.length) {
    const at = value.indexOf("var(", index);
    if (at === -1) { out += value.slice(index); break; }
    out += value.slice(index, at);
    let depth = 1;
    let cursor = at + 4;
    while (cursor < value.length && depth > 0) {
      if (value[cursor] === "(") depth += 1;
      else if (value[cursor] === ")") depth -= 1;
      cursor += 1;
    }
    const args = splitTop(value.slice(at + 4, cursor - 1), ",");
    const name = args[0];
    const fallback = args.slice(1).join(",");
    if (tokens.has(name) && !seen.has(name)) {
      out += resolveVars(tokens.get(name), tokens, new Set([...seen, name]));
    } else if (fallback) {
      out += resolveVars(fallback, tokens, seen);
    } else {
      out += "«unresolved»";
    }
    index = cursor;
  }
  return out.trim();
}

const NAMED_ALPHA = { transparent: 0, none: 0, white: 1, black: 1, currentcolor: 1, inherit: null, initial: 0, unset: 0 };

function colorAlpha(value) {
  const text = value.trim().toLowerCase();
  if (text in NAMED_ALPHA) return NAMED_ALPHA[text];
  if (/^#[0-9a-f]{8}$/.test(text)) return parseInt(text.slice(7, 9), 16) / 255;
  if (/^#[0-9a-f]{4}$/.test(text)) return parseInt(text.slice(4, 5).repeat(2), 16) / 255;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(text)) return 1;
  const rgb = /^rgba?\(([^)]*)\)$/.exec(text);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 4) return 1;
    const alpha = parts[3];
    return alpha.endsWith("%") ? parseFloat(alpha) / 100 : parseFloat(alpha);
  }
  const mix = /^color-mix\(\s*in\s+[\w-]+\s*,(.*)\)$/s.exec(text);
  if (mix) {
    const parts = splitTop(mix[1], ",");
    if (parts.length !== 2) return null;
    const read = (part) => {
      const percent = /\s(\d+(?:\.\d+)?)%$/.exec(part);
      const color = percent ? part.slice(0, percent.index).trim() : part.trim();
      return { weight: percent ? parseFloat(percent[1]) / 100 : null, alpha: colorAlpha(color) };
    };
    const left = read(parts[0]);
    const right = read(parts[1]);
    if (left.alpha === null || right.alpha === null) return null;
    const leftWeight = left.weight ?? (right.weight === null ? 0.5 : 1 - right.weight);
    const rightWeight = right.weight ?? (1 - leftWeight);
    return left.alpha * leftWeight + right.alpha * rightWeight;
  }
  if (/gradient\(/.test(text) || text.includes("«unresolved»")) return null;
  return 1;
}

// --- The writing surfaces, with their real ancestors from index.html. ---

const html = read("index.html");
const WRITING_SURFACES = [
  { id: "teachtext-body", label: "TeachText" },
  { id: "review-desk-body", label: "Review Desk" },
  { id: "question-sheet-body", label: "Question Sheet" },
  { id: "outline-content", label: "Outline" },
  { id: "draft-body", label: "Section Drafts" },
];

// Read the open-tag stack above an id, so the ancestor classes this cascade
// runs against are the markup's, not a hand-copied list that can go stale.
function ancestorChain(id) {
  const target = `id="${id}"`;
  const stack = [];
  const tagPattern = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let match;
  while ((match = tagPattern.exec(html))) {
    const [, closing, tag, attrs, selfClosing] = match;
    if (attrs.includes(target)) {
      const classes = /class="([^"]*)"/.exec(attrs)?.[1] || "";
      return { chain: stack.slice(), classes: classes.split(/\s+/).filter(Boolean) };
    }
    if (closing) stack.pop();
    else if (!selfClosing && !/^(br|hr|img|input|meta|link|source|track)$/i.test(tag)) {
      const classes = /class="([^"]*)"/.exec(attrs)?.[1] || "";
      const dataTheme = null;
      stack.push({ tag: tag.toLowerCase(), classes: classes.split(/\s+/).filter(Boolean), dataTheme });
    }
  }
  return null;
}

function buildElement(surface, theme, focused) {
  const found = ancestorChain(surface.id);
  if (!found) return null;
  let parent = null;
  const root = { tag: "html", id: null, classes: new Set(), attrs: {}, states: new Set(), parent: null };
  parent = root;
  for (const node of found.chain) {
    const classes = new Set(node.classes);
    const attrs = {};
    if (node.tag === "body") {
      attrs["data-theme"] = theme;
      attrs["data-theme-family"] = theme;
      if (theme === "liquid-glass") classes.add("use-liquid-glass");
    }
    parent = { tag: node.tag, id: null, classes, attrs, states: new Set(), parent };
  }
  // attachMarkdownHighlight() inserts .mde-surface between the textarea and its
  // parent, and marks the textarea .mde-input. The cascade the writer meets is
  // the one over THAT tree, not over the static markup.
  const mdeSurface = { tag: "div", id: null, classes: new Set(["mde-surface"]), attrs: {}, states: new Set(), parent };
  return {
    tag: "textarea",
    id: surface.id,
    classes: new Set([...found.classes, "mde-input"]),
    attrs: {},
    states: new Set(focused ? ["focus"] : []),
    parent: mdeSurface,
  };
}

// --- The cascade itself. ---

// An inset box-shadow paints inside the textarea's own box, over the ink, so it
// belongs in the same list as a background. An outset one does not.
const INK_LAYER_PROPERTIES = ["background", "background-color", "background-image", "backdrop-filter", "-webkit-backdrop-filter", "box-shadow"];

function winningDeclarations(element, width) {
  const winners = new Map();
  const unsupported = [];
  for (const rule of rules) {
    if (!mediaApplies(rule.conditions, width)) continue;
    const painted = rule.declarations.filter((declaration) => INK_LAYER_PROPERTIES.includes(declaration.property));
    if (!painted.length) continue;
    for (const selector of splitTop(rule.selectorList, ",")) {
      const result = matchesSelector(selector, element);
      if (!result.supported && result.matched) unsupported.push(`${rule.path}: ${selector}`);
      if (!result.matched) continue;
      const weight = specificity(selector);
      for (const declaration of painted) {
        const property = declaration.property === "background" ? "background-color" : declaration.property;
        const previous = winners.get(property);
        if (!previous || compareSpecificity(weight, previous.weight) >= 0) {
          winners.set(property, { weight, order: rule.order, value: declaration.value, where: `${rule.path} — ${selector}` });
        }
        if (declaration.property === "background") {
          // The shorthand also resets the image; the source order is what
          // decides whether a later background-image can put one back.
          const image = winners.get("background-image");
          if (!image || compareSpecificity(weight, image.weight) >= 0) {
            winners.set("background-image", { weight, order: rule.order, value: /gradient\(|url\(/.test(declaration.value) ? declaration.value : "none", where: `${rule.path} — ${selector}` });
          }
        }
      }
    }
  }
  return { winners, unsupported };
}

const unsupportedSelectors = new Set();
const fills = [];
const missingSelection = [];
const opaqueSelection = [];

for (const theme of SHOWCASE_THEMES) {
  const tokens = tokenTable(theme);
  for (const surface of WRITING_SURFACES) {
    for (const focused of [false, true]) {
      const element = buildElement(surface, theme, focused);
      if (!element) { fills.push(`${surface.id} is not in index.html`); continue; }
      for (const { width } of WIDTHS) {
        const { winners, unsupported } = winningDeclarations(element, width);
        unsupported.forEach((entry) => unsupportedSelectors.add(entry));
        for (const property of ["background-color", "background-image", "backdrop-filter", "-webkit-backdrop-filter", "box-shadow"]) {
          const winner = winners.get(property);
          if (!winner) continue;
          const resolved = resolveVars(winner.value, tokens);
          const inert = property.endsWith("filter")
            ? /^none$/i.test(resolved)
            : property === "background-image"
              ? /^none$/i.test(resolved)
              : property === "box-shadow"
                ? !/\binset\b/i.test(resolved)
                : colorAlpha(resolved) === 0;
          if (inert) continue;
          fills.push(
            `${theme}/${surface.label}${focused ? " (focused)" : ""}@${width}px: ${property}: ${resolved} — ${winner.where}`,
          );
        }
      }

      // The selection is painted in the same layer. It may carry the era's
      // colour, but it must let the ink behind it read through.
      if (focused) continue;
      const selectionElement = { ...element, pseudoElement: "selection" };
      const { winners } = winningDeclarations(selectionElement, WIDTHS[WIDTHS.length - 1].width);
      const winner = winners.get("background-color");
      if (!winner) { missingSelection.push(`${theme}/${surface.label}`); continue; }
      const alpha = colorAlpha(resolveVars(winner.value, tokens));
      if (alpha === null || alpha <= 0 || alpha >= 1) {
        opaqueSelection.push(`${theme}/${surface.label}: ${resolveVars(winner.value, tokens)} (alpha ${alpha}) — ${winner.where}`);
      }
    }
  }
}

test.assert(
  unsupportedSelectors.size === 0,
  `every selector that can reach a writing surface is one this cascade understands${unsupportedSelectors.size ? `: ${[...unsupportedSelectors].join("; ")}` : ""}`,
);
test.assert(
  fills.length === 0,
  `no appearance paints a fill in the writing textarea's own layer, focused or not${fills.length ? `: ${fills.slice(0, 8).join(" | ")}` : ""}`,
);
test.assert(
  missingSelection.length === 0,
  `every writing surface declares its own ::selection, so the browser's opaque default never lands on the ink${missingSelection.length ? `: ${missingSelection.join(", ")}` : ""}`,
);
test.assert(
  opaqueSelection.length === 0,
  `every appearance's writing selection stays translucent, so selected words stay readable${opaqueSelection.length ? `: ${opaqueSelection.join(" | ")}` : ""}`,
);

// The transparent textarea is the whole arrangement; a sheet that gives it back
// its own ink would double every glyph against the overlay behind it.
const selectionRule = /\.mde-surface\s*>\s*\.mde-input::selection\s*\{[^}]*\}/.exec(read("styles/50-apps.css"));
test.assert(
  Boolean(selectionRule) && /color:\s*transparent/.test(selectionRule[0]),
  "the selection keeps the textarea's own text transparent, so it tints the ink instead of printing over it",
);

test.finish();
