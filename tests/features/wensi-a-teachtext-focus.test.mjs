// 文思泉涌 lane A · TeachText's 专注模式 menu toggle.
//
// The ⌥⌘F cycle walks off -> typewriter -> sentence, which is how a writer
// explores the states but not how one turns focus on for the day and off
// again. The Writing menu therefore carries a checked toggle beside it: one
// row that answers "is focus on", keyed ⇧⌥⌘F, TeachText's scope. It owns no
// second preference -- it reads and writes the same stored mode the cycle and
// every writing surface use, so the checkmark, the cycle and the desk's
// writing-focus quieting can never disagree.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("wensi-a-teachtext-focus");
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const windowManager = read("app/core/window-manager.js");
const editor = read("app/core/markdown-editor.js");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

// --- The engine the toggle drives, executed for real -----------------------
//
// The handler's whole decision is off <-> sentence handed to mdeSetFocusMode,
// so the contract runs the real module and holds that handoff to its word:
// the mode lands on the surface, the stored preference follows, and the
// cycle's states stay reachable around it.
function createFocusDom() {
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
    set className(value) { this.__classes = new Set(String(value || "").trim().split(/\s+/).filter(Boolean)); }
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
  const store = new Map();
  const body = new Element("body");
  const context = {
    console, WeakMap, Math, Object, String, Number, Array, RegExp,
    Event: class { constructor(type) { this.type = type; } },
    HTMLTextAreaElement,
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ fontSize: "15px", lineHeight: "24px", paddingLeft: "0px", paddingRight: "0px", paddingTop: "0px" }),
    document: {
      body,
      createElement: (tag) => (String(tag).toLowerCase() === "textarea" ? new HTMLTextAreaElement(tag) : new Element(tag)),
      getElementById: () => null,
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${read("app/core/input-guard.js")}\n;\n${editor}`, context);
  const flush = () => frames.splice(0, frames.length).forEach((fn) => fn());
  return { context, body, store, flush, Element, HTMLTextAreaElement };
}

{
  const dom = createFocusDom();
  const pane = new dom.Element("div");
  dom.body.append(pane);
  const textarea = new dom.HTMLTextAreaElement("textarea");
  pane.append(textarea);
  dom.context.attachMarkdownHighlight(textarea);
  dom.flush();
  const surface = textarea.closest(".mde-surface");

  test.assert(
    dom.context.mdeSetFocusMode(textarea, "sentence") === "sentence" && surface.dataset.mdeFocusMode === "sentence",
    "turning the toggle on lands sentence focus on the real surface",
  );
  test.assert(
    dom.store.get("ai-system6-writing-focus") === "sentence",
    "the on state persists under the one preference key the cycle and the desk read",
  );
  test.assert(
    dom.context.mdeSetFocusMode(textarea, "off") === "off" && surface.dataset.mdeFocusMode === "off" && dom.store.get("ai-system6-writing-focus") === "off",
    "turning the toggle off clears the surface and the stored preference",
  );
  test.assert(
    dom.context.mdeStoredFocusMode() === "off" && dom.context.mdeCycleFocusMode(textarea) === "typewriter",
    "the cycle still owns its three states around the toggle's two",
  );
}

// The action: a TeachText-scoped command in the same style as its neighbours.
const row = actions.match(/\{ id: "writing-focus-toggle"[^\n]*\}/)?.[0] || "";
test.assert(row.length > 0, "the toggle is a declared action row");
test.assert(row.includes('action: "toggle-writing-focus"'), "it dispatches toggle-writing-focus");
test.assert(row.includes('scope: ["teachText"]'), "it is scoped to TeachText, as the 工单 names");
test.assert(row.includes('display: "⇧⌥⌘F"'), "its key reads ⇧⌥⌘F, styled like the rows beside it");
test.assert(
  !/"(?:⌘|⌥|⇧)[^"]*"[^]*keyCaps: true/.test(row) || row.includes("keyCaps: true") === false,
  "it follows the neighbouring focus row, which carries no keyCaps",
);

// The handler: resolve the writing surface the way the cycle does, then hand
// the decision to mdeSetFocusMode. No second storage key may appear here --
// the preference already lives in ai-system6-writing-focus.
const handler = actions.match(/function toggleWritingFocusMode\(\) \{[\s\S]*?\n\}/)?.[0] || "";
test.assert(handler.length > 0, "the handler exists");
test.assert(handler.includes('current === "off" ? "sentence" : "off"'), "off turns on to sentence focus; anything else turns off");
test.assert(handler.includes("mdeSetFocusMode(textarea,"), "the mode change goes through mdeSetFocusMode, which stores the preference");
test.assert(handler.includes("mdeStoredFocusMode()"), "the current state reads from the stored preference when the surface has none");
test.assert(!handler.includes("localStorage"), "the handler writes no second localStorage key");
test.assert(actions.includes('"toggle-writing-focus": toggleWritingFocusMode,'), "the command is registered in the action map");

// The menu row, beside the cycle in the Writing menu every writing window shows.
test.assert(
  menus.includes('menuItem("toggle-writing-focus", "focus_mode_toggle", "writing-focus-toggle")'),
  "the Writing menu carries the toggle row with its label and shortcut",
);

// The checkmark: the menu sync reads the one stored preference, exactly as it
// reads the line-spacing choice two lines above.
const sync = windowManager.match(/if \(action === "toggle-writing-focus"\) \{[\s\S]*?\n    \}/)?.[0] || "";
test.assert(sync.length > 0, "the menu sync answers for the toggle row");
test.assert(sync.includes('!== "off"'), "the checkmark means a focus state is on");
test.assert(sync.includes("is-checked"), "the row takes the shared checked style");
test.assert(sync.includes("mdeStoredFocusMode()"), "and falls back to the stored preference when no surface is open");

// The strings: both languages, beside the cycle row they extend.
test.assert(translationsEn.includes('focus_mode_toggle: "Focus Mode"'), "the English string exists");
test.assert(translationsZh.includes('focus_mode_toggle: "专注模式"'), "the Chinese string exists");

// The mode the toggle turns on is one mdeSetFocusMode already understands,
// and the cycle still owns its three states untouched.
test.assert(editor.includes('const next = asked === "sentence" || asked === "typewriter" ? asked : "off";'), "mdeSetFocusMode still gates the states");
test.assert(editor.includes('const next = current === "off" ? "typewriter" : current === "typewriter" ? "sentence" : "off";'), "the cycle keeps its three states");

test.finish();
