import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("application-shell");
const source = read("app/core/application-shell.js");
const manifest = read("tooling/runtime-manifest.mjs");

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = "";
    this.id = "";
    this.innerHTML = "";
    this.textContent = "";
    this.type = "";
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

const desktop = new FakeElement("div");
const windows = [];
desktop.append = (...children) => {
  windows.push(...children);
  desktop.children.push(...children);
};
const document = {
  createElement: (tagName) => new FakeElement(tagName),
  querySelector: (selector) => selector === ".desktop" ? desktop : null,
  querySelectorAll: (selector) => selector === "[data-window]" ? windows : [],
};
const context = vm.createContext({ window: {}, document });
vm.runInContext(source, context);

const created = context.window.AISystem6ApplicationShell.createWindow({
  windowName: "fixtureApp",
  windowClass: "fixture-window",
  labelledBy: "fixture-title",
  titleKey: "fixture_title",
  title: "Fixture",
  statusClass: "compact-status-bar",
  statusHtml: '<span role="status"></span>',
  paneClass: "fixture-pane",
  paneHtml: "<p>Fixture content</p>",
});

test.assert(created.className === "window fixture-window is-hidden", "dynamic apps receive the shared window class anatomy");
test.assert(created.dataset.window === "fixtureApp", "the shell owns one stable data-window identity");
test.assert(created.attributes.get("aria-labelledby") === "fixture-title", "the shared title labels the managed window");
test.assert(created.applicationTitleBar.className === "title-bar", "the shell reuses the shared title-bar primitive");
test.assert(created.applicationStatusBar.className === "details-bar compact-status-bar", "the shell reuses the declared shared status layout");
test.assert(created.applicationPane.className === "window-pane fixture-pane", "the shell reuses the shared pane primitive");
test.assert(created.applicationTitleBar.children.map((child) => child.className).join(",") === "close-box,,resize-box,shade-box", "resizable apps receive close, zoom, and shade controls in canonical order");
test.assert(context.window.AISystem6ApplicationShell.createWindow({ windowName: "fixtureApp", labelledBy: "other" }) === created, "mounting the same dynamic app reuses its managed window");
test.assertIncludes(manifest, '"app/core/application-shell.js"', "the shared shell loads before eager and lazy dynamic applications");

for (const file of [
  "app/features/sideask-pad.js",
  "app/features/image-prompt-studio.js",
  "app/features/micropolis.js",
  "app/features/openttd.js",
  "app/features/doom.js",
]) {
  test.assertIncludes(read(file), "AISystem6ApplicationShell.createWindow", `${file} builds through the shared six-appearance shell`);
}

test.finish();
