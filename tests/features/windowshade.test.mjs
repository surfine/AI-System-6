import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../../apps/desktop/app/core/windowshade.js", import.meta.url), "utf8");
const scope = {};
runInNewContext(source, scope);
const p = scope.AISystem6WindowShadePolicy;
const plain = (value) => JSON.parse(JSON.stringify(value));
const box = { left: 18, top: 42, width: 1200, height: 840 };

test("released left and right ladders wrap locally, not to an invented display", () => {
  for (const direction of ["left", "right"]) {
    let current = null;
    for (const suffix of ["Half", "TwoThirds", "Third", "Half", "TwoThirds", "Third", "Half"]) {
      current = p.nextSide(current, direction);
      assert.equal(current, direction + suffix);
    }
    assert.equal(p.nextSide(direction === "left" ? "rightThird" : "leftThird", direction), direction + "Half");
    assert.equal(p.nextSide("unknown", direction), direction + "Half");
  }
  assert.equal(p.nextSide(null, "up"), null);
});

test("0.8 second key-turn boundary matches WindowShade's KeyTurn", () => {
  for (const horizontal of ["left", "right"]) {
    for (const vertical of ["up", "down"]) {
      const expected = (vertical === "up" ? "top" : "bottom") + (horizontal === "left" ? "Left" : "Right");
      for (const time of [0, 1, 400, 800]) assert.equal(p.keyTurn(horizontal, time, vertical), expected);
      for (const time of [-1, 800.001, 900, NaN, Infinity, undefined]) assert.equal(p.keyTurn(horizontal, time, vertical), null);
    }
  }
  assert.equal(p.keyTurn("up", 0, "down"), null);
});

test("partitions are in the desktop coordinate system, with one gap", () => {
  const left = plain(p.targetFrame("leftHalf", box));
  const right = plain(p.targetFrame("rightHalf", box));
  assert.deepEqual(left, { left: 18, top: 42, width: 596, height: 840 });
  assert.deepEqual(right, { left: 622, top: 42, width: 596, height: 840 });
  assert.equal(right.left - left.left - left.width, 8);
  assert.deepEqual(plain(p.targetFrame("fill", box)), box);
  assert.equal(p.targetFrame("leftThird", box).width, 396);
  assert.equal(p.targetFrame("rightTwoThirds", box).left, 422);
});

test("minimum-size refusal never manufactures a larger out-of-bounds frame", () => {
  assert.equal(p.targetFrame("leftThird", box, { minWidth: 540 }), null);
  assert.equal(p.targetFrame("topLeft", box, { minHeight: 500 }), null);
  assert.ok(p.targetFrame("leftHalf", box, { minWidth: 596 }));
  assert.equal(p.targetFrame("leftHalf", box, { minWidth: 597 }), null);
  for (const key of ["gap", "minWidth", "minHeight", "aspect"]) {
    for (const value of [NaN, Infinity, -1, "8"]) assert.equal(p.targetFrame("fill", box, { [key]: value }), null);
  }
});

test("aspect-locked canvases fit inside their slot and keep the requested corner", () => {
  const r = p.targetFrame("bottomRight", box, { aspect: 16 / 9, minWidth: 200, minHeight: 100 });
  assert.ok(r);
  assert.ok(Math.abs(r.width / r.height - 16 / 9) < 0.01);
  assert.equal(r.left + r.width, box.left + box.width);
  assert.equal(r.top + r.height, box.top + box.height);
  assert.equal(p.targetFrame("leftThird", box, { aspect: 16 / 9, minHeight: 500 }), null);
});

test("invalid area or action is a refusal, never NaNpx or a silent default", () => {
  for (const area of [null, {}, { ...box, width: 0 }, { ...box, height: -1 }, { ...box, left: Infinity }, { ...box, top: NaN }, { ...box, width: "1200" }]) {
    assert.equal(p.targetFrame("fill", area), null);
    assert.equal(p.reachableFrame(box, area), null);
  }
  for (const action of ["unknown", "__proto__", "constructor", "toString", "undo"]) {
    assert.equal(p.targetFrame(action, box), null);
  }
});

test("recovery preserves original dimensions, including an oversized document", () => {
  const big = { left: -300, top: 2000, width: 1900, height: 1400 };
  assert.deepEqual(plain(p.reachableFrame(big, box)), { left: 18, top: 42, width: 1900, height: 1400 });
  const inside = { left: 30, top: 80, width: 400, height: 200 };
  assert.deepEqual(plain(p.reachableFrame(inside, box)), inside);
  assert.deepEqual(plain(p.reachableFrame({ ...inside, left: 4000, top: -200 }, box)), { left: 818, top: 42, width: 400, height: 200 });
});

test("parity surfaces pin and peek through the shared WindowShade / window-core APIs", () => {
  const engine = readFileSync(new URL("../../apps/desktop/app/core/windowshade.js", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../../apps/desktop/app/core/windowshade-entry.js", import.meta.url), "utf8");
  const manager = readFileSync(new URL("../../apps/desktop/app/core/window-manager.js", import.meta.url), "utf8");
  const finder = readFileSync(new URL("../../apps/desktop/app/core/multi-finder.js", import.meta.url), "utf8");
  const session = readFileSync(new URL("../../apps/desktop/app/core/working-session.js", import.meta.url), "utf8");
  assert.match(manager, /function setWindowPinned\(/);
  assert.match(manager, /function beginPeek\(/);
  assert.match(manager, /function endPeek\(/);
  assert.match(manager, /function commitPeek\(/);
  assert.match(manager, /windowStackLayer/);
  assert.match(engine, /action === "pin" \|\| action === "unpin"/);
  assert.match(entry, /beginPeek/);
  assert.match(entry, /220/);
  assert.match(finder, /function applicationWindowPresentation\(/);
  assert.match(finder, /function restoreApplicationWindow\(/);
  assert.match(session, /pinned:\s*typeof isWindowPinned/);
  assert.match(session, /setWindowPinned\(win, !!entry\.pinned\)/);
  // Hardening (2026-10-06). The size a shade saved is restored by one function
  // the shade verb, the orphan release and reopening an already-shaded window
  // all call, so a reused DOM cannot open at the stub's height; the layer bands
  // are reserved by role rather than by whatever number was inline; the session
  // projects full-screen geometry and layer through read-only accessors; and the
  // ⌘` walk follows live membership instead of a stale name list.
  const fullscreen = readFileSync(new URL("../../apps/desktop/app/core/window-fullscreen.js", import.meta.url), "utf8");
  assert.match(manager, /function restoreWindowShadeDimensions\(/);
  assert.equal(
    (manager.match(/restoreWindowShadeDimensions\(win\)/g) || []).length >= 3,
    true,
    "the shade verb, the orphan release and the reopen path share one restore",
  );
  assert.match(manager, /function windowUsesCssLayer\(/);
  assert.match(manager, /function reservedWindowLayerZ\(/);
  assert.match(fullscreen, /function frameForPersistence\(/);
  assert.match(fullscreen, /function layerForPersistence\(/);
  assert.match(session, /function restoreWindowSessionPresentation\(/);
  assert.match(session, /restoreWindowSessionPresentation\(win, entry\)/);
  assert.match(session, /frameForPersistence\?\.\(win\)/);
  assert.match(session, /layerForPersistence\?\.\(win\)/);
  assert.match(finder, /const membershipChanged = /);
});

test("title-bar flick and wheel classifiers stay web-honest", () => {
  assert.equal(p.flickMinimumSpeed, 1800);
  assert.equal(p.classifyFlick({ dx: 0, dy: -80, speed: 2000, followed: true }), "shade");
  assert.equal(p.classifyFlick({ dx: 0, dy: 80, speed: 2000, followed: true }), "fill");
  assert.equal(p.classifyFlick({ dx: 0, dy: 80, speed: 2000, followed: true, collapsed: true }), "expand");
  assert.equal(p.classifyFlick({ dx: -90, dy: 10, speed: 2000, followed: true }), "leftHalf");
  assert.equal(p.classifyFlick({ dx: 90, dy: 10, speed: 2000, followed: true }), "rightHalf");
  assert.equal(p.classifyFlick({ dx: 0, dy: -80, speed: 1799, followed: true }), null);
  assert.equal(p.classifyFlick({ dx: 0, dy: -80, speed: 2000, followed: false }), null);
  assert.equal(p.classifyFlick({ dx: 0, dy: -10, speed: 2000, followed: true }), null);
  assert.equal(p.classifyWheel({ deltaY: 40 }), "shade");
  assert.equal(p.classifyWheel({ deltaY: -40, collapsed: true }), "expand");
  assert.equal(p.classifyWheel({ deltaY: -40 }), "fill");
  assert.equal(p.classifyWheel({ deltaY: 40, ctrlKey: true }), null);
  assert.equal(p.classifyWheel({ deltaY: 40, metaKey: true }), null);
  assert.equal(p.classifyWheel({ deltaY: 4 }), null);
  const engine = readFileSync(new URL("../../apps/desktop/app/core/windowshade.js", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../../apps/desktop/app/core/windowshade-entry.js", import.meta.url), "utf8");
  assert.match(engine, /setGesturesEnabled/);
  assert.match(engine, /classifyFlick/);
  assert.match(engine, /classifyWheel/);
  assert.match(entry, /AISystem6WindowShadeLoaded/);
  assert.match(entry, /Finger count/);
});

test("WM6: WheelEvent units are normalized and a stream never claims to prove fingers", () => {
  // deltaMode 1 (lines) and 2 (pages) are normalized to pixels before the same
  // threshold, so a one-line wheel is not silently dropped.
  assert.equal(p.classifyWheel({ deltaY: 1, deltaMode: 1 }), "shade");
  assert.equal(p.classifyWheel({ deltaY: 0.5, deltaMode: 0 }), null);
  assert.equal(p.classifyWheel({ deltaY: -1, deltaMode: 2, collapsed: true }), "expand");
  // ctrl/meta and defaultPrevented still refuse, whatever the unit.
  assert.equal(p.classifyWheel({ deltaY: 40, deltaMode: 2, ctrlKey: true }), null);
});

async function previewHarness(count = 2) {
  const { createAppBootVm } = await import("../helpers/app-boot-vm.mjs");
  const h = createAppBootVm();
  await h.settleBoot();
  h.document.querySelectorAll(".window[data-window]").forEach((win) => win.classList.add("is-hidden"));
  h.document.querySelectorAll('.system-modal, dialog, [aria-modal="true"]').forEach((el) => { el.getClientRects = () => []; });
  const desktop = h.document.querySelector(".desktop");
  desktop.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 840, width: 1200, height: 840 });
  desktop.clientLeft = desktop.clientTop = desktop.scrollLeft = desktop.scrollTop = 0;
  h.context.innerWidth = 1200;
  h.context.innerHeight = 840;
  h.context.isNarrowViewport = () => false;
  h.context.getDesktopAvoidanceInsets = () => ({ left: 0, right: 0, bottom: 0 });
  h.context.deskBottomReserve = () => 0;
  h.context.getComputedStyle = () => ({ position: "absolute", visibility: "visible", minWidth: "100px", minHeight: "80px" });
  h.context.isResizableWindow = () => true;
  h.context.aspectRatioForWindow = () => 0;
  h.context.isCenteredSystemWindow = () => false;
  h.context.scheduleWorkingSessionSave = () => {};
  h.context.updateMenuState = () => {};
  h.context.focusWindow = () => {};
  const wins = Array.from({ length: count }, (_, index) => {
    const win = h.document.createElement("section");
    win.className = "window";
    win.dataset.window = `tile-contract-${index}`;
    win.offsetParent = desktop;
    const values = new Map();
    // A CSSStyleDeclaration adapter: geometry is derived from the styles the
    // production engine writes, rather than echoing its requested result.
    win.__style = {
      [Symbol.iterator]: function* () { yield* values.keys(); },
      setProperty: (key, value) => values.set(key, String(value)),
      removeProperty: (key) => values.delete(key),
      getPropertyValue: (key) => values.get(key) || "",
      getPropertyPriority: () => "",
    };
    for (const [key, value] of Object.entries({ left: 70 + index * 100, top: 90 + index * 50, width: 350, height: 220 })) win.style.setProperty(key, `${value}px`);
    win.getBoundingClientRect = () => Object.fromEntries(["left", "top", "width", "height"].map((key) => [key, parseFloat(win.style.getPropertyValue(key))]));
    win.getClientRects = () => [win.getBoundingClientRect()];
    const title = h.document.createElement("header");
    title.className = "title-bar";
    title.getBoundingClientRect = () => ({ height: 22 });
    win.append(title);
    desktop.append(win);
    return win;
  });
  let reject = false;
  let writes = 0;
  h.context.placeWindowForExplicitLayout = (win, frame) => {
    if (Object.keys(frame).length) writes++;
    for (const [key, value] of Object.entries(frame)) {
      if (reject && win === wins[1] && key === "width") continue;
      win.style.setProperty(key, `${value}px`);
    }
  };
  h.context.setWindowLayerZ = () => {};
  h.context.applicationWindowTitle = (win) => win.dataset.window;
  h.context.refreshApplicationLifecycle = () => {};
  h.context.applicationWindowPresentation = () => "open";
  wins.forEach((win) => { const field = h.document.createElement("textarea"); field.value = "Unsaved document"; win.append(field); });
  const windowListeners = new Map();
  h.context.addEventListener = (name, handler) => { const listeners = windowListeners.get(name) || []; listeners.push(handler); windowListeners.set(name, listeners); };
  h.run(source);
  const api = h.context.AISystem6WindowShade;
  const geometry = () => wins.map((win) => win.getBoundingClientRect());
  return { ...h, api, wins, geometry, fireWindow: (name) => windowListeners.get(name)?.forEach((listener) => listener()), reject: (value) => { reject = value; }, writes: () => writes };
}
test("WM6: all twelve eras execute cancellable target previews without layout or undo writes", async () => {
  const h = await previewHarness();
  const win = h.wins[0];
  const bar = win.querySelector(":scope > .title-bar");
  let now = 0;
  h.context.performance.now = () => now;
  const themes = ["classic", "system-7", "platinum", "drawing-board", "aqua", "tiger", "snow-leopard", "lion", "yosemite", "big-sur", "liquid-glass", "nextstep"];
  const send = (type, more = {}) => h.document.dispatchEvent({ type, target: bar, button: 0, pointerId: 42,
    preventDefault() {}, stopPropagation() {}, ...more });
  for (const theme of themes) {
    h.context.AISystem6Theme = { getCurrentTheme: () => theme, hasCapability: () => false };
    win.offsetLeft = 70; win.offsetTop = 90;
    now += 1000;
    send("pointerdown", { clientX: 200, clientY: 100 });
    now += 20;
    win.offsetLeft = 170;
    const before = h.geometry();
    const writes = h.writes();
    send("pointermove", { clientX: 300, clientY: 100 });
    const outline = h.document.querySelector(".window-arrangement-outline");
    assert.ok(outline, `${theme} shows a target even without native-window-outline capability`);
    assert.equal(outline.dataset.windowOutlineAction, "rightHalf");
    assert.ok(h.document.querySelector(".window-gesture-hint"));
    assert.deepEqual(h.geometry(), before, "preview leaves the frame untouched");
    assert.equal(h.writes(), writes, "preview performs no arrangement writes");
    assert.equal(h.api.canUndo(win), false);
    send("pointercancel");
    assert.equal(h.document.querySelector(".window-arrangement-outline"), null);
    assert.equal(h.document.querySelector(".window-gesture-hint"), null);
    assert.equal(h.api.canUndo(win), false);
  }
});

test("2200 deterministic odd-sized layouts stay finite, positive, inside the usable desk", () => {
  for (let index = 0; index < 200; index++) {
    const area = { left: (index * 37) % 200, top: (index * 13) % 100, width: 901 + index * 3, height: 481 + index * 7 };
    for (const action of Object.keys(p.slots)) {
      const r = p.targetFrame(action, area);
      assert.ok(r && Object.values(r).every(Number.isFinite));
      assert.ok(r.width > 0 && r.height > 0);
      assert.ok(r.left >= area.left && r.top >= area.top);
      assert.ok(r.left + r.width <= area.left + area.width);
      assert.ok(r.top + r.height <= area.top + area.height);
    }
  }
});

test("tile refuses the whole plan when a fixed window cannot fit", () => {
  assert.equal(p.tileFrames([{ fixed: true, width: 1201, height: 100 }, { minWidth: 20, minHeight: 20 }], box), null);
  assert.equal(p.tileFrames([{ minWidth: 1201 }, { minWidth: 20 }], box), null);
});

test("tile preserves fixed sizes, minimums and aspect without overlaps", () => {
  const specs = [{ fixed: true, width: 300, height: 200 }, { minWidth: 250, minHeight: 100, aspect: 16 / 9 }, { minWidth: 200, minHeight: 150 }];
  const frames = p.tileFrames(specs, box);
  assert.ok(frames);
  assert.equal(frames[0].width, 300);
  assert.equal(frames[0].height, 200);
  assert.ok(Math.abs(frames[1].width / frames[1].height - 16 / 9) < 0.01);
  frames.forEach((frame, index) => {
    assert.ok(frame.left >= box.left && frame.top >= box.top);
    assert.ok(frame.left + frame.width <= box.left + box.width);
    assert.ok(frame.top + frame.height <= box.top + box.height);
    assert.ok(frame.width >= (specs[index].minWidth || 1));
    assert.ok(frame.height >= (specs[index].minHeight || 1));
    frames.slice(index + 1).forEach((other) => assert.ok(
      frame.left + frame.width <= other.left || other.left + other.width <= frame.left
      || frame.top + frame.height <= other.top || other.top + other.height <= frame.top,
      "each pair occupies disjoint space",
    ));
  });
});

test("tile commits one undo group and rolls the entire group back on a rejected frame", async () => {
  const { createAppBootVm } = await import("../helpers/app-boot-vm.mjs");
  const h = createAppBootVm();
  await h.settleBoot();
  h.document.querySelectorAll(".window[data-window]").forEach((win) => win.classList.add("is-hidden"));
  h.document.querySelectorAll('.system-modal, dialog, [aria-modal="true"]').forEach((el) => { el.getClientRects = () => []; });
  const desktop = h.document.querySelector(".desktop");
  desktop.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 840, width: 1200, height: 840 });
  desktop.clientLeft = desktop.clientTop = desktop.scrollLeft = desktop.scrollTop = 0;
  h.context.innerWidth = 1200;
  h.context.innerHeight = 840;
  h.context.isNarrowViewport = () => false;
  h.context.getDesktopAvoidanceInsets = () => ({ left: 0, right: 0, bottom: 0 });
  h.context.deskBottomReserve = () => 0;
  h.context.getComputedStyle = () => ({ position: "absolute", visibility: "visible", minWidth: "100px", minHeight: "80px" });
  h.context.isResizableWindow = () => true;
  h.context.aspectRatioForWindow = () => 0;
  h.context.isCenteredSystemWindow = () => false;
  h.context.scheduleWorkingSessionSave = () => {};
  h.context.updateMenuState = () => {};
  h.context.focusWindow = () => {};
  const wins = [0, 1].map((index) => {
    const win = h.document.createElement("section");
    win.className = "window";
    win.dataset.window = `tile-contract-${index}`;
    win.offsetParent = desktop;
    const values = new Map();
    // A CSSStyleDeclaration adapter: geometry is derived from the styles the
    // production engine writes, rather than echoing its requested result.
    win.__style = {
      [Symbol.iterator]: function* () { yield* values.keys(); },
      setProperty: (key, value) => values.set(key, String(value)),
      removeProperty: (key) => values.delete(key),
      getPropertyValue: (key) => values.get(key) || "",
      getPropertyPriority: () => "",
    };
    for (const [key, value] of Object.entries({ left: 70 + index * 100, top: 90 + index * 50, width: 350, height: 220 })) win.style.setProperty(key, `${value}px`);
    win.getBoundingClientRect = () => Object.fromEntries(["left", "top", "width", "height"].map((key) => [key, parseFloat(win.style.getPropertyValue(key))]));
    win.getClientRects = () => [win.getBoundingClientRect()];
    const title = h.document.createElement("header");
    title.className = "title-bar";
    title.getBoundingClientRect = () => ({ height: 22 });
    win.append(title);
    desktop.append(win);
    return win;
  });
  let reject = false;
  let writes = 0;
  h.context.placeWindowForExplicitLayout = (win, frame) => {
    if (Object.keys(frame).length) writes++;
    for (const [key, value] of Object.entries(frame)) {
      if (reject && win === wins[1] && key === "width") continue;
      win.style.setProperty(key, `${value}px`);
    }
  };
  h.run(source);
  const api = h.context.AISystem6WindowShade;
  const geometry = () => wins.map((win) => win.getBoundingClientRect());
  const original = geometry();
  assert.ok(api.tile(wins).ok);
  assert.notDeepEqual(geometry(), original);
  assert.ok(wins.every((win) => api.canUndo(win)));
  assert.ok(api.dispatch(wins[1], "undo").ok);
  assert.deepEqual(geometry(), original, "undo from either member restores every member");
  assert.ok(wins.every((win) => !api.canUndo(win)));
  reject = true;
  writes = 0;
  assert.equal(api.tile(wins).ok, false);
  assert.equal(writes, 2, "the later member rejects after an earlier member was written");
  assert.deepEqual(geometry(), original, "rollback restores all exact original geometry");
  assert.ok(wins.every((win) => !api.canUndo(win)), "failed tile creates no undo history");
  reject = false;
  h.context.isResizableWindow = () => false;
  wins[1].style.setProperty("width", "1500px");
  const tooLarge = geometry();
  writes = 0;
  assert.equal(api.tile(wins).ok, false);
  assert.equal(writes, 0, "no-room is decided before any placement writes");
  assert.deepEqual(geometry(), tooLarge);
  h.context.isResizableWindow = () => true;
  wins[1].style.setProperty("width", "350px");
  assert.ok(api.tile(wins).ok);
  wins[0].style.setProperty("left", "500px");
  const userMoved = geometry();
  assert.equal(api.dispatch(wins[1], "undo").ok, false, "a changed batch member invalidates group undo");
  assert.deepEqual(geometry(), userMoved, "stale undo never clobbers the user's later move");

});
