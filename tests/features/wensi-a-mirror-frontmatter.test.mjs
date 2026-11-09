// 文思泉涌 lane A · the mirror layer's front-matter ink.
//
// A blog document opens with a --- fence of keys the site's generator reads.
// On surfaces that ask for it (attachMarkdownHighlight's `frontMatter`
// option), the overlay paints that fence as data: keys carry the ink, each
// value shows its own kind -- a date reads as a date, a tag list as tags --
// and the fences themselves are machinery that recedes. Two rules hold the
// feature to the layer's own contract: nothing outside the opening fence may
// change, and nothing painted may move a metric, because the overlay sits
// under a transparent textarea and any advance it adds takes the caret with
// it.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("wensi-a-mirror-frontmatter");
const editor = read("app/core/markdown-editor.js");
const appsCss = read("styles/50-apps.css");

// --- The real module against a small DOM, as editor-ink-visible does -------
function createDom() {
  const frames = [];

  class Element {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.attributes = {};
      this.style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" };
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
    getAttribute(name) { return this.attributes?.[name] ?? null; }
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

  const byId = new Map();
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
      getElementById: (id) => byId.get(id) || null,
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${read("app/core/input-guard.js")}\n;\n${editor}`, context);

  const flush = () => {
    const queued = frames.splice(0, frames.length);
    queued.forEach((fn) => fn());
  };
  return { context, body, flush, Element, HTMLTextAreaElement, byId };
}

function attach(value, options) {
  const dom = createDom();
  const pane = new dom.Element("div");
  dom.body.append(pane);
  const textarea = new dom.HTMLTextAreaElement("textarea");
  textarea.value = value;
  pane.append(textarea);
  dom.context.attachMarkdownHighlight(textarea, options);
  dom.flush();
  const overlay = textarea.parentNode.querySelector(".mde-highlight");
  return { dom, overlay, textarea };
}

const DOCUMENT = [
  "---",
  "title: 一篇日更",
  "date: 2026-11-08",
  "tags: [随笔, 城市]",
  "voice: readonly",
  "description: 一句更长的说明，逗号很多，所以它不是标签列表，是一段普通的数据值，就这么长。",
  "---",
  "",
  "# 正文从这里开始",
  "",
  "正文段落。",
].join("\n");

// --- The painted fence ------------------------------------------------------

const painted = attach(DOCUMENT, { frontMatter: true });
const html = painted.overlay.innerHTML;

test.assert(
  /<span class="md-fm-key">title<\/span>/.test(html),
  "a front-matter key carries the ink as md-fm-key",
);
test.assert(
  /<span class="md-fm-date">2026-11-08<\/span>/.test(html),
  "a YYYY-MM-DD value reads as a date",
);
test.assert(
  /<span class="md-fm-tags">\[随笔, 城市\]<\/span>/.test(html),
  "a bracketed tag list reads as tags",
);
test.assert(
  /<span class="md-fm-value">readonly<\/span>/.test(html),
  "a plain value recedes to the marker ink",
);
test.assert(
  /<span class="md-fm-value">一句更长的说明/.test(html),
  "a comma'd sentence is prose, not a tag list, because its items run long",
);
test.assert(
  (html.match(/<span class="md-marker">---<\/span>/g) || []).length === 2,
  "both fences recede like every other marker",
);
test.assert(
  /<span class="md-heading">正文从这里开始<\/span>/.test(html),
  "the body below the closing fence paints as ordinary markdown",
);
test.assert(
  !/md-fm-/.test(html.split("正文从这里开始")[1] || ""),
  "nothing below the closing fence carries front-matter ink",
);

// --- The option is opt-in ---------------------------------------------------

const plain = attach(DOCUMENT);
test.assert(
  !/md-fm-/.test(plain.overlay.innerHTML),
  "a surface that did not ask for front matter paints none",
);

const unterminated = attach(["---", "title: 没有闭合围栏", "", "正文。"].join("\n"), { frontMatter: true });
test.assert(
  !/md-fm-/.test(unterminated.overlay.innerHTML),
  "an unterminated fence is not front matter; the lines stay ordinary markdown",
);

// --- The caret can stand on it ---------------------------------------------
//
// The four front-matter rules may distinguish values by colour and wash only:
// a font, width, letter-spacing or margin there would widen the run and take
// the caret off the glyph it stands on.
for (const className of ["md-fm-key", "md-fm-date", "md-fm-tags", "md-fm-value"]) {
  const rule = appsCss.match(new RegExp(`\\.${className} \\{[^}]*\\}`))?.[0] || "";
  test.assert(rule.length > 0, `.${className} is styled`);
  test.assert(
    !/\b(font|width|margin|padding|letter-spacing|border)\b/.test(rule),
    `.${className} moves no metric`,
  );
}
test.assert(
  /--md-weight-stroke/.test(appsCss.match(/\.md-fm-key \{[^}]*\}/)?.[0] || ""),
  "the key's weight arrives as a stroke, the way headings take theirs",
);

// --- Format commands reach the future window -------------------------------
//
// mdeFormatTarget resolves a window by data-window to the textarea Format
// acts on. 文思泉涌's entry is the contract's id, and a missing window
// resolves to null rather than a false target.
{
  const dom = createDom();
  const active = new dom.Element("div");
  active.__classes.add("window");
  active.__classes.add("is-active");
  active.dataset.window = "wensiQuanyong";
  const textarea = new dom.HTMLTextAreaElement("textarea");
  textarea.id = "wensi-body";
  dom.byId.set("wensi-body", textarea);
  dom.body.append(active, textarea);
  dom.context.document.querySelector = (selector) =>
    selector.includes("is-active") ? active : null;
  const target = dom.context.mdeFormatTarget(false);
  test.assert(
    target === textarea,
    "a wensiQuanyong window resolves to the contract's #wensi-body for Format commands",
  );
  const absent = createDom();
  absent.context.document.querySelector = () => null;
  test.assert(
    absent.context.mdeFormatTarget(false) === null,
    "no window means no Format target",
  );
}

test.finish();
