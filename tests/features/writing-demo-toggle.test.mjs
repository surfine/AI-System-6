// The two demo rows in Applications → Extras are toggles: Play becomes Stop
// while the demo runs, and the row has to keep its icon on both sides of that
// swap. It did not. The row is rendered from data, so its name span carries no
// i18n id, and the old swap fell back to writing the *button's* textContent —
// which in a real DOM removes every child, taking the icon with it. The bug
// survived a green 148-test browser suite because no spec covered that row.
//
// This contract runs the real module against a DOM stub faithful in the one
// way that matters: assigning textContent to an element clears its children.
// Milliseconds, no browser, and it fails on the old code.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-demo-toggle");
const writingDemo = read("app/features/writing-demo.js");

function makeElement({ className = "", dataset = {}, text = "" } = {}) {
  const element = {
    className,
    dataset: { ...dataset },
    children: [],
    _text: text,
    appendChild(child) {
      element.children.push(child);
      return child;
    },
    get textContent() {
      return element._text;
    },
    // A real DOM drops an element's children when you assign textContent. That
    // assignment is what erased the icon, so the stub has to reproduce it.
    set textContent(value) {
      element.children.length = 0;
      element._text = value;
    },
    querySelector(selector) {
      if (selector === "span[data-i18n]") {
        return element.children.find((child) => child.dataset.i18n) || null;
      }
      if (selector === ".finder-item-label") {
        return element.children.find((child) => child.className.split(" ").includes("finder-item-label")) || null;
      }
      if (selector === ".finder-list-name-cell span:not(.sys-icon)") {
        const cell = element.children.find((child) => child.className.split(" ").includes("finder-list-name-cell"));
        return cell?.children.find((child) => !child.className.split(" ").includes("sys-icon")) || null;
      }
      if (selector === ".sys-icon[data-system-icon]") {
        const direct = element.children.find((child) => child.dataset.systemIcon);
        if (direct) return direct;
        for (const child of element.children) {
          const nested = child.querySelector?.(selector);
          if (nested) return nested;
        }
        return null;
      }
      return null;
    },
  };
  return element;
}

/**
 * The markup `renderStaticFinderWindow` writes for an Applications row: the
 * system icon, then the name span. `labelClass: false` is the same row before
 * that span was named; `labelSpan: "bare"` is a hand-written row; `labelSpan:
 * "none"` is a row with nothing but its icon.
 */
function makeRow({ action, labelSpan = "named", labelText }) {
  const button = makeElement({ dataset: { staticFinderAction: action } });
  button.appendChild(makeElement({
    className: "sys-icon sys-icon-finder",
    dataset: { systemIcon: "writingDemo" },
  }));
  if (labelSpan === "named") {
    button.appendChild(makeElement({ className: "finder-item-label", text: labelText }));
  } else if (labelSpan === "bare") {
    button.appendChild(makeElement({ text: labelText }));
  }
  return button;
}

function createRuntime(rows) {
  const hydrated = [];
  const context = vm.createContext({
    console,
    structuredClone,
    // The module's top level reads the desk's own collections (its teaser
    // snapshot names them), so the context carries the same empty desk the
    // other demo contracts use.
    projects: [],
    chatFolders: [],
    chatFiles: [],
    scraps: [],
    trashItems: [],
    projectCdItems: [],
    projectReferences: [],
    ragChunks: [],
    activeProjectId: "",
    isProjectMounted: false,
    document: {
      querySelectorAll: (selector) => {
        if (selector.includes("play-writing-demo")) return rows.live;
        if (selector.includes("play-teaser-demo")) return rows.teaser;
        return [];
      },
      createElement: () => makeElement(),
    },
    currentLanguage: "en",
    t: (key) => key,
    hydrateSystemIcons: (root) => hydrated.push(root),
    window: { addEventListener: () => {}, removeEventListener: () => {} },
  });
  vm.runInContext(writingDemo, context);
  return { context, hydrated };
}

function iconOf(row) {
  return row.querySelector(".sys-icon[data-system-icon]");
}

function labelOf(row) {
  return row.querySelector(".finder-item-label") || row.querySelector(".finder-list-name-cell span:not(.sys-icon)");
}

function checkToggle({ runtime, row, running, runningLabel, idleLabel, idleGlyph }) {
  runtime.context.writingDemoSetButtons(running);
  const icon = iconOf(row);
  test.assert(!!icon, "the row still has its icon through the label swap");
  test.assert(
    labelOf(row)?.textContent === (running ? runningLabel : idleLabel),
    `the row reads "${running ? runningLabel : idleLabel}" in ${running ? "the running" : "the idle"} state`
  );
  test.assert(
    icon?.dataset.systemIcon === (running ? "pause" : idleGlyph),
    `the icon answers the state (${running ? "pause" : idleGlyph})`
  );
}

// The rendered row: icon + named label span. Play, stop, play again.
{
  const row = makeRow({ action: "play-writing-demo", labelText: "Play Live Demo" });
  const runtime = createRuntime({ live: [row], teaser: [] });
  checkToggle({ runtime, row, running: true, runningLabel: "writing_demo_stop", idleLabel: "guide_play_demo", idleGlyph: "writingDemo" });
  checkToggle({ runtime, row, running: false, runningLabel: "writing_demo_stop", idleLabel: "guide_play_demo", idleGlyph: "writingDemo" });
  test.assert(iconOf(row)?.dataset.systemIcon === "writingDemo", "the row's own artwork comes back when the demo stops");
  test.assert(runtime.hydrated.length > 0, "the swapped glyph is re-rendered, not left as an empty span");
}

// The 30-second tour toggles the same way on its own row.
{
  const row = makeRow({ action: "play-teaser-demo", labelText: "30-Second Tour" });
  const runtime = createRuntime({ live: [], teaser: [row] });
  runtime.context.writingDemoSetTeaserButtons(true);
  test.assert(!!iconOf(row), "the tour row keeps its icon while the tour runs");
  test.assert(labelOf(row)?.textContent === "teaser_demo_stop", "the tour row offers Stop while it runs");
  test.assert(iconOf(row)?.dataset.systemIcon === "pause", "the tour row shows the pause glyph while it runs");
  runtime.context.writingDemoSetTeaserButtons(false);
  test.assert(labelOf(row)?.textContent === "guide_play_teaser_demo", "the tour row returns to its idle label");
  test.assert(iconOf(row)?.dataset.systemIcon === "writingDemo", "the tour row returns to its own artwork");
}

// Markup without the label class: the name span is still found, and the icon
// survives. Before the fix the fallback was the button itself, so this row lost
// its icon and wore the label as its only text.
{
  const row = makeRow({ action: "play-writing-demo", labelSpan: "bare", labelText: "Play Live Demo" });
  const runtime = createRuntime({ live: [row], teaser: [] });
  runtime.context.writingDemoSetButtons(true);
  test.assert(!!iconOf(row), "an unnamed name span still leaves the icon alone");
  test.assert(row.children.length === 2, "the row keeps both of its children");
  test.assert(row.textContent !== "writing_demo_stop", "the label never lands on the button itself");
}

// A row with no label span at all: nothing is swapped, and nothing is erased.
{
  const row = makeRow({ action: "play-writing-demo", labelSpan: "none" });
  const runtime = createRuntime({ live: [row], teaser: [] });
  runtime.context.writingDemoSetButtons(true);
  test.assert(!!iconOf(row), "a row without a label span keeps its icon");
  test.assert(row.children.length === 1, "a row without a label span is left alone rather than emptied");
}

// The Finder rebuilds these rows from data on every open, view change and
// language flip; a running demo has to repaint its Stop state onto the fresh
// markup instead of leaving an idle Play row behind.
{
  const row = makeRow({ action: "play-writing-demo", labelText: "Play Live Demo" });
  const runtime = createRuntime({ live: [row], teaser: [] });
  test.assert(
    typeof runtime.context.writingDemoSyncFinderToggles === "function",
    "the Finder has something to call after it rebuilds a row"
  );
  if (typeof runtime.context.writingDemoSyncFinderToggles === "function") {
    // `writingDemoRun` is a top-level `let`: it lives in the context's lexical
    // scope, not as a property, so it is set the way the module itself would.
    vm.runInContext("writingDemoRun = { mode: 'full', stopped: false }", runtime.context);
    runtime.context.writingDemoSyncFinderToggles();
    test.assert(labelOf(row)?.textContent === "writing_demo_stop", "a re-render during a run repaints Stop");
    test.assert(iconOf(row)?.dataset.systemIcon === "pause", "a re-render during a run repaints the pause glyph");
    vm.runInContext("writingDemoRun = { mode: 'full', stopped: true }", runtime.context);
    runtime.context.writingDemoSyncFinderToggles();
    test.assert(labelOf(row)?.textContent === "guide_play_demo", "a stopped run is not painted back as running");
    test.assert(iconOf(row)?.dataset.systemIcon === "writingDemo", "a stopped run leaves the idle artwork");
  }
}

// The module publishes that repaint so the Finder can call it after rendering.
test.assertIncludes(writingDemo, "syncToggleState: writingDemoSyncFinderToggles", "the Finder can ask for the current toggle state");

test.finish();
