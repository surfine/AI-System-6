import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const peekSource = readFileSync(new URL("../../apps/desktop/app/core/window-peek.js", import.meta.url), "utf8");
const entrySource = readFileSync(new URL("../../apps/desktop/app/core/windowshade-entry.js", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("../../apps/desktop/app/core/window-manager.js", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../../apps/desktop/app/core/window-registry.js", import.meta.url), "utf8");
const manifestSource = readFileSync(new URL("../../tooling/runtime-manifest.mjs", import.meta.url), "utf8");
const vectors = JSON.parse(readFileSync(new URL("../fixtures/glance-vectors.json", import.meta.url), "utf8"));

const scope = { window: {}, performance: { now: () => 0 } };
runInNewContext(peekSource, scope);
const api = scope.AISystem6WindowPeek;
const plain = (value) => JSON.parse(JSON.stringify(value));
const KINDS = new Set(["prewarm", "open", "close", "discard"]);

function step(intent, step) {
  const { method, at } = step;
  if (method === "entered") return intent.entered(step.id, at);
  if (method === "clicked") return intent.clicked(step.id, at);
  if (method === "menuSelected") return intent.menuSelected(step.id, at);
  if (method === "sample") return intent.sample(step.sample || {}, at);
  if (method === "block") return intent.block(step.id);
  if (method === "unblock") return intent.unblock(step.id);
  if (method === "forget") return intent.forget(step.id);
  if (method === "cancel") return intent.cancel();
  throw new Error(`Unknown glance-vector method: ${method}`);
}

test("the ported GlanceIntent reproduces every source scenario", () => {
  assert.ok(api && typeof api.GlanceIntent === "function");
  assert.ok(vectors.scenarios.length >= 9);
  for (const scenario of vectors.scenarios) {
    const intent = new api.GlanceIntent();
    for (const vector of scenario.steps) {
      const actual = plain(step(intent, vector));
      assert.deepEqual(actual, vector.expect, `${scenario.name} @ ${vector.method} ${vector.at ?? ""}`);
      for (const effect of actual) assert.ok(KINDS.has(effect.kind), `unexpected effect ${effect.kind}`);
    }
  }
});

test("the intent is event-driven: one deadline, never a polling interval", () => {
  const intent = new api.GlanceIntent();
  assert.equal(intent.nextDeadline(), null);
  intent.entered("a", 0);
  assert.equal(intent.nextDeadline(), 220);
  intent.sample({ strip: "a" }, 300);
  assert.equal(intent.activeID, "a");
  assert.equal(intent.nextDeadline(), null);
  assert.doesNotMatch(peekSource, /setInterval/);
  assert.equal((peekSource.match(/setTimeout/g) || []).length, 1);
});

test("the preview is read-only by restoring the exact prior inert / aria-hidden", () => {
  // Never blanket-set false: the prior inert boolean and the prior aria-hidden
  // string (including "absent") are both recorded and put back.
  assert.match(peekSource, /node\.inert = true/);
  assert.match(peekSource, /node\.inert = inert/);
  assert.match(peekSource, /getAttribute\("aria-hidden"\)/);
  assert.match(peekSource, /removeAttribute\("aria-hidden"\)/);
  assert.doesNotMatch(peekSource, /\.inert = false/);
  // The window stays logically collapsed; the module never toggles the shade.
  assert.doesNotMatch(peekSource, /toggleCollapsed/);
});

test("only a declared same-dom-readonly window may show a DOM preview", () => {
  assert.match(registrySource, /preview: "same-dom-readonly"/);
  assert.match(registrySource, /function windowPreviewCapability\(/);
  assert.match(peekSource, /capability\(win\) !== "same-dom-readonly"/);
  // The display adapter refuses passwords, cross-origin frames and shaded-off
  // windows even before the capability check.
  assert.match(peekSource, /input\[type='password'\]/);
  assert.match(peekSource, /iframe/);
  assert.match(peekSource, /windowShadePeek === "false"/);
});

test("window-manager owns geometry; window-peek owns the read-only presentation", () => {
  assert.match(managerSource, /function beginPeek\(/);
  assert.match(managerSource, /function endPeek\(/);
  assert.match(managerSource, /function commitPeek\(/);
  // The eager manager must not also inert content, or the adapter's restore
  // would put back an already-`true` value.
  const begin = managerSource.slice(managerSource.indexOf("function beginPeek("), managerSource.indexOf("function isWindowPeeking("));
  assert.doesNotMatch(begin, /inert/);
});

test("the entry forwards every cancel and blocks re-arming after Escape", () => {
  assert.match(entrySource, /AISystem6WindowPeekLoaded/);
  assert.match(entrySource, /api\.move\(sample\)/);
  assert.match(entrySource, /blockUntilLeave/);
  assert.match(entrySource, /menuHandoff/);
  assert.match(entrySource, /commitPeek/);
  // No flat peek timer survives in the entry: the timing lives in GlanceIntent.
  assert.doesNotMatch(entrySource, /peekArm|clearPeekArm|peekTimer/);
  assert.doesNotMatch(entrySource, /setTimeout\([^)]*220/);
});

test("window-peek is a lazy module, never on the boot disk", () => {
  assert.match(manifestSource, /"app\/core\/window-peek\.js"/);
  const lazyBlock = manifestSource.slice(manifestSource.indexOf("lazyRuntimePaths"));
  assert.match(lazyBlock, /"app\/core\/window-peek\.js"/);
  assert.match(peekSource, /window\.AISystem6WindowPeekLoaded/);
});

function coldEntryHarness(collapsed = true) {
  const listeners = new Map();
  const windowListeners = new Map();
  const moves = [], actions = [];
  let finishPeek;
  const peekLoaded = new Promise((resolve) => { finishPeek = resolve; });
  const win = { isConnected: true, dataset: { window: "cold-window" }, className: "window is-active",
    classList: { contains: (name) => name === "is-collapsed" && collapsed }, getAttribute: () => "" };
  const bar = { parentElement: win, closest: (selector) => selector === ".window[data-window] > .title-bar" ? bar : null };
  const context = {
    window: { addEventListener: (name, fn) => windowListeners.set(name, fn) },
    document: { hidden: false, addEventListener: (name, fn) => { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
      querySelector: (selector) => selector.includes("is-active") ? win : null },
    isNarrowViewport: () => false, writerMode: false, cancelAllWindowPeeks() {}, console,
    ensureLazySystemModule: (path) => path.endsWith("window-peek.js") ? peekLoaded : Promise.resolve(),
  };
  runInNewContext(entrySource, context);
  const send = (name, extra = {}) => {
    const event = { target: bar, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
    (listeners.get(name) || []).forEach((fn) => fn(event));
    return event;
  };
  return { send, context, moves, actions,
    blur: () => windowListeners.get("blur")(),
    finishPeek: async () => {
      context.window.AISystem6WindowPeek = { move: (sample) => moves.push(sample), cancel() {} };
      finishPeek(); await peekLoaded; await Promise.resolve();
    },
    finishEngine: () => { context.window.AISystem6WindowShade = { eligible: () => true, dispatch: (_win, action) => actions.push(action) }; },
  };
}

test("cold hover completion cannot replay preview intent cancelled by Escape or blur", async () => {
  for (const cancel of ["escape", "blur"]) {
    const h = coldEntryHarness();
    h.send("pointerover");
    if (cancel === "escape") h.send("keydown", { key: "Escape" });
    else h.blur();
    await h.finishPeek();
    assert.equal(h.moves.length, 0, `${cancel} invalidates the outstanding sample`);
  }
  const h = coldEntryHarness();
  h.send("pointerover");
  await h.finishPeek();
  assert.equal(h.moves.length, 1, "an uncancelled cold hover still reaches the preview adapter");
});

test("the first line-unit wheel gesture commits after the engine finishes loading", async () => {
  const h = coldEntryHarness(false);
  const event = h.send("wheel", { deltaY: 1, deltaMode: 1 });
  assert.equal(event.defaultPrevented, true);
  h.finishEngine();
  await new Promise(setImmediate);
  assert.deepEqual(h.actions, ["shade"]);
});
