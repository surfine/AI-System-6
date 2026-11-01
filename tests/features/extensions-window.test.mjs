// The Extensions window shell (M8 slice 0, section 0.3): one lazy module with
// four tabs (Skills / Memory / Roles / Waiting for you) on the Control Panel's
// own tablist, entered from the Apple menu beside About. Empty for now; counts
// come from providers the later slices register. The boot floppy budget does
// not rise.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { admissionRows, createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("extensions-window");
const html = read("index.html");
const config = read("app/core/config.js");
const registry = read("app/core/window-registry.js");
const manifest = read("tooling/runtime-manifest.mjs");
const module_ = read("app/features/extensions-window.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// --- Lazy, one module -------------------------------------------------------------

test.assertNotIncludes(html, 'data-window="extensions"', "the window's markup does not ride the boot HTML");
test.assertNotIncludes(registry, "extensions:", "no hand-written registry record: the admission table's api row derives it, lazy ensure and attach included");
test.assertIncludes(config, 'createLazyModuleLoader("AISystem6ExtensionsLoaded", ["app/core/application-shell.js", "app/core/agent-tool-registry.js", "app/core/agent-roles.js", "app/features/extensions-window.js", "app/features/extensions-library.js"], false, ["styles.extensions.css"])', "one loader brings the shell, the tool list, the window, its library and its sheet");
test.assert(manifest.indexOf('"app/features/extensions-window.js"') > manifest.indexOf("lazyRuntimePaths"), "the module is in lazyRuntimePaths");
test.assertIncludes(manifest, "app/features/extensions-window.js", "the manifest names the module");
test.assertIncludes(read("tooling/style-manifest.mjs"), 'output: "styles.extensions.css"', "the sheet is a lazy bundle");
test.assertNotMatches(read("tooling/runtime-manifest.mjs").split("lazyRuntimePaths")[0], /extensions-window|extensions-library|agent-tool-registry|agent-roles/, "none of the files is in an eager list");
const rows = admissionRows();
test.assert(rows.extensions?.app === "system" && rows.extensions?.api === "AISystem6Extensions" && rows.extensions?.repaint === "renderExtensions", "the admission table declares the window and its language repaint");

// --- Apple menu ---------------------------------------------------------------------

const apple = html.slice(html.indexOf('class="menu-popover apple-menu-popover"'));
test.assertIncludes(apple.slice(0, 900), 'data-menu-condition="extensions-has-content" data-action="open-extensions" data-i18n="extensions_menu">Extensions…</button>', "the Apple menu row sits next to About, and stays hidden while no tab has content");
test.assertIncludes(read("app/core/window-manager.js"), '"extensions-has-content":', "the menu asks the writer's skills, memories and waiting suggestions (Roles is the built-in set)");
test.assertIncludes(read("app/core/actions.js"), '"open-extensions":"extensions"', "the opener command is registered");
test.assertIncludes(en, 'extensions_menu: "Extensions…"', "English menu string");
test.assertIncludes(zh, 'extensions_menu: "扩充功能…"', "Chinese menu string");

// --- Tabs and counts render -----------------------------------------------------------

test.assertIncludes(module_, 'class="system-tabs control-chooser extensions-tabs" role="tablist"', "the tab rail is the Control Panel's tablist");
test.assertNotMatches(module_, /indexedDB|localStorage|sessionStorage|openDatabase/, "the shell touches no storage");

// A small tree the module can build into: the boot VM's DOM shim does not keep
// parent/child structure, so this one does, and the shell's createWindow is
// replaced by a stand-in that makes the three parts the module looks up.
class Node_ {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.listeners = {}; this.className = ""; this._text = "";
    this.classList = { toggle: (name, on) => { const set = new Set(this.className.split(/\s+/).filter(Boolean)); on ? set.add(name) : set.delete(name); this.className = [...set].join(" "); } };
  }
  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  focus() {}
  matches(selector) {
    if (selector.startsWith(".")) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    const data = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (data) {
      const key = data[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return key in this.dataset && (data[2] === undefined || this.dataset[key] === data[2]);
    }
    return false;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const built = [];
const fakeDocument = {
  createElement: (tag) => new Node_(tag),
  querySelector: (selector) => built.flatMap((node) => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)])[0] || null,
};
const fakeShell = {
  createWindow(options) {
    const node = new Node_("section");
    node.dataset.window = options.windowName;
    const tabs = new Node_("div"); tabs.className = "system-tabs control-chooser extensions-tabs";
    const panel = new Node_("div"); panel.id = "extensions-panel";
    const title = new Node_("h2"); title.id = "extensions-title"; title.dataset.i18n = options.titleKey;
    node.append(title, tabs, panel);
    built.push(node);
    return node;
  },
};
test.assertIncludes(module_, 'windowName: "extensions"', "the module builds the window named extensions");
test.assertIncludes(module_, 'id="extensions-panel"', "the panel the stand-in provides is the one the module declares");
const ctx = { window: null, document: fakeDocument, console, currentLanguage: "en", t: (key) => ({ extensions_menu: "Extensions…" })[key] || key, openWindow: async () => true };
ctx.window = ctx; ctx.window.AISystem6ApplicationShell = fakeShell;
Object.assign(ctx, { document: fakeDocument, currentLanguage: "en" });
vm.createContext(ctx);
vm.runInContext(read("app/features/extensions-window.js"), ctx, { filename: "extensions-window.js" });
const api = ctx.window.AISystem6Extensions;
test.assert(api && JSON.stringify(api.tabIds) === JSON.stringify(["skills", "memory", "roles", "waiting"]), "the module installs four tabs in order");
const win = fakeDocument.querySelector('[data-window="extensions"]');
test.assert(!!win, "the window is built once the module loads");
const tabs = [...win.querySelectorAll("[data-extensions-tab]")];
test.assert(tabs.length === 4 && tabs.every((tab) => tab.getAttribute("role") === "tab"), "four tab buttons render");
api.render();
const labels = () => tabs.map((tab) => tab.querySelector(".control-chooser-label").textContent);
test.assert(JSON.stringify(labels()) === JSON.stringify(["Skills", "Memory", "Roles", "Waiting for you (0)"]), `labels render with the waiting count at zero (${labels()})`);
test.assert(JSON.stringify(api.counts()) === JSON.stringify({ skills: 0, memory: 0, roles: 0, waiting: 0 }), "every count is zero until a slice fills it");
test.assert(win.querySelector(".extensions-empty"), "the empty state shows");
api.setCountProvider("waiting", () => 3);
api.render();
test.assert(labels()[3] === "Waiting for you (3)" && api.counts().waiting === 3, "a registered provider's count shows on the tab");
api.showTab("roles");
test.assert(tabs[2].getAttribute("aria-selected") === "true" && tabs[0].getAttribute("aria-selected") === "false", "choosing a tab selects it");
api.setCountProvider("waiting", () => -4);
test.assert(api.counts().waiting === 0, "a negative or odd count reads as zero");

// --- Budget does not rise ------------------------------------------------------------------

const budget = JSON.parse(readFileSync(new URL("../../site/data/floppy-budget.json", import.meta.url), "utf8"));
test.assert(budget.budgetBytes === 2959872, "the System Floppy Budget is unchanged (2,959,872 bytes)");
test.assert(budget.budgetBytes - budget.bytes >= 0, "the recorded boot size fits the budget");

test.finish();
