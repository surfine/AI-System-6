import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../../apps/desktop/app/core/window-pin-controls.js", import.meta.url), "utf8");
function harness() {
  const windows = [];
  const pending = [];
  const hiddenAppIds = new Set();
  let z = 9000;
  const context = {
    window: {}, hiddenAppIds, getWindowAppId: (win) => win.dataset.window,
    document: { querySelectorAll: () => windows },
    MutationObserver: class {
      observe() {}
      disconnect() {}
      takeRecords() { return pending.splice(0); }
    },
    setWindowPinned(win, pinned) {
      if (!win.isConnected || win.classList.contains("is-hidden")) return false;
      context.window.AISystem6WindowPinControls.changed(win);
      if (pinned) { win.dataset.windowPinned = "true"; win.style.zIndex = ++z; }
      else delete win.dataset.windowPinned;
      return true;
    },
  };
  runInNewContext(source, context);
  function add(name, rank = 0, pinned = true) {
    const classes = new Set();
    const win = {
      isConnected: true, dataset: { window: name, ...(pinned ? { windowPinned: "true" } : {}) },
      style: { zIndex: rank }, classList: { contains: (name) => classes.has(name) },
      matches: (selector) => selector.split(", ").some((name) => classes.has(name.slice(1))),
      querySelector: () => ({ textContent: `Title ${name}` }), classes,
    };
    windows.push(win);
    return win;
  }
  return { api: context.window.AISystem6WindowPinControls, add, context, pending, hiddenAppIds };
}

test("suspend/restore preserves pin order and leaves ordinary windows alone", () => {
  const { api, add } = harness();
  const front = add("front", 30);
  const back = add("back", 10);
  const ordinary = add("ordinary", 20, false);
  assert.equal(api.entries()[0].title, "Title back");
  assert.equal(api.suspend(), true);
  assert.equal(api.isSuspended(), true);
  assert.equal(api.entries().length, 0);
  assert.equal(api.suspend(), false);
  api.restore();
  assert.equal(api.isSuspended(), false);
  assert.equal(back.dataset.windowPinned, "true");
  assert.equal(front.dataset.windowPinned, "true");
  assert.ok(Number(back.style.zIndex) < Number(front.style.zIndex));
  assert.equal(ordinary.dataset.windowPinned, undefined);
});

test("explicit edits while suspended win over restore, including same-state unpin", () => {
  const { api, add, context } = harness();
  const keepOff = add("off");
  const changed = add("changed");
  const newPin = add("new", 0, false);
  api.suspend();
  context.setWindowPinned(keepOff, false);
  context.setWindowPinned(changed, true);
  context.setWindowPinned(newPin, true);
  const changedRank = changed.style.zIndex;
  api.restore();
  assert.equal(keepOff.dataset.windowPinned, undefined);
  assert.equal(changed.style.zIndex, changedRank);
  assert.equal(newPin.dataset.windowPinned, "true");
});

test("closed, disconnected, hidden, minimized and close-reopened windows do not restore", () => {
  const { api, add, pending, hiddenAppIds } = harness();
  const closed = add("closed");
  const detached = add("detached");
  const hidden = add("hidden");
  const minimized = add("minimized");
  const reopened = add("reopened");
  api.suspend();
  closed.classes.add("is-hidden");
  detached.isConnected = false;
  hiddenAppIds.add("hidden");
  minimized.classes.add("is-minimized");
  pending.push({ target: reopened, oldValue: "window is-hidden" });
  api.restore();
  for (const win of [closed, detached, hidden, minimized, reopened]) assert.equal(win.dataset.windowPinned, undefined);
});

test("clear discards the suspended set and unpins newly pinned windows", () => {
  const { api, add, context } = harness();
  const old = add("old");
  const fresh = add("fresh", 0, false);
  api.suspend();
  context.setWindowPinned(fresh, true);
  api.clear();
  assert.equal(api.isSuspended(), false);
  assert.equal(api.restore(), false);
  assert.equal(old.dataset.windowPinned, undefined);
  assert.equal(fresh.dataset.windowPinned, undefined);
  assert.equal(api.suspend(), false);
});
