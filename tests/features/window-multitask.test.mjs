import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("../../apps/desktop/app/core/windowshade.js", import.meta.url), "utf8");
async function harness(count = 2) {
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
const event = (type, extra = {}) => ({ type, preventDefault() {}, stopPropagation() {}, ...extra });

test("split refuses insufficient space before writing and rolls back second-window rejection", async () => {
  const h = await harness();
  const original = h.geometry();
  h.context.getComputedStyle = () => ({ position: "absolute", visibility: "visible", minWidth: "900px", minHeight: "80px" });
  assert.equal(h.api.split(...h.wins).ok, false);
  assert.equal(h.writes(), 0);
  assert.deepEqual(h.geometry(), original);
  h.context.getComputedStyle = () => ({ position: "absolute", visibility: "visible", minWidth: "100px", minHeight: "80px" });
  h.reject(true);
  assert.equal(h.api.split(...h.wins).ok, false);
  assert.equal(h.writes(), 2);
  assert.deepEqual(h.geometry(), original);
  assert.equal(h.api.pairState(h.wins[0]), null);
});

test("split batch undo restores both geometry and preceding slide relation", async () => {
  const h = await harness();
  assert.ok(h.api.slide(h.wins[0], "left").ok);
  const original = h.geometry();
  assert.ok(h.api.split(...h.wins).ok);
  assert.ok(h.api.pairState(h.wins[1]));
  assert.equal(h.api.slideState(h.wins[0]), null);
  assert.ok(h.api.dispatch(h.wins[1], "undo").ok);
  assert.deepEqual(h.geometry(), original);
  assert.equal(h.api.pairState(h.wins[0]), null);
  assert.equal(h.api.slideState(h.wins[0]).side, "left");
});

test("separator keyboard moves 16px, Shift moves 48px and Home equalizes", async () => {
  const h = await harness();
  assert.ok(h.api.split(...h.wins).ok);
  const initial = h.geometry()[0].width;
  const key = (key, shiftKey = false) => h.document.querySelector("[data-split-separator]").dispatchEvent(event("keydown", { key, shiftKey }));
  key("ArrowRight");
  assert.equal(h.geometry()[0].width, initial + 16);
  key("ArrowLeft", true);
  assert.equal(h.geometry()[0].width, initial - 32);
  key("Home");
  assert.equal(h.geometry()[0].width, initial);
});

test("slide replacement restores occupant home and hidden/exit changes remain undoable", async () => {
  const h = await harness();
  const home = h.geometry();
  assert.ok(h.api.slide(h.wins[0], "right").ok);
  assert.ok(h.api.slide(h.wins[1], "right").ok);
  assert.deepEqual(h.geometry()[0], home[0]);
  assert.equal(h.api.slideState(h.wins[0]), null);
  assert.ok(h.api.dispatch(h.wins[0], "undo").ok);
  assert.equal(h.api.slideState(h.wins[0]).side, "right");
  assert.ok(h.api.slideVisibility(h.wins[0], true).ok);
  assert.equal(h.wins[0].classList.contains("is-slide-hidden"), true);
  assert.ok(h.api.slideVisibility(h.wins[0], false).ok);
  assert.equal(h.wins[0].classList.contains("is-slide-hidden"), false);
  assert.ok(h.api.exitSlide(h.wins[0]).ok);
  assert.deepEqual(h.geometry()[0], home[0]);
  assert.ok(h.api.dispatch(h.wins[0], "undo").ok);
  assert.equal(h.api.slideState(h.wins[0]).side, "right");
  h.wins.forEach((win) => assert.equal(win.querySelector("textarea").value, "Unsaved document"));
});

test("separator pointer cancellation restores both windows without replacing document nodes", async () => {
  const h = await harness();
  assert.ok(h.api.split(...h.wins).ok);
  const before = h.geometry();
  const documents = h.wins.map((win) => win.querySelector("textarea"));
  h.document.querySelector("[data-split-separator]").dispatchEvent(event("pointerdown", { button: 0, pointerId: 7, clientX: 600 }));
  h.document.dispatchEvent(event("pointermove", { pointerId: 7, clientX: 700 }));
  assert.notDeepEqual(h.geometry(), before);
  h.document.dispatchEvent(event("pointercancel", { pointerId: 7 }));
  assert.deepEqual(h.geometry(), before);
  assert.ok(h.api.pairState(h.wins[0]));
  assert.ok(h.api.canUndo(h.wins[0]), "cancelling a drag preserves the prior split undo");
  h.wins.forEach((win, i) => { assert.equal(win.querySelector("textarea"), documents[i]); assert.equal(documents[i].value, "Unsaved document"); });
});


test("undoing a tile does not resurrect an unrelated exited slide", async () => {
  const h = await harness(3);
  assert.ok(h.api.slide(h.wins[2], "right").ok);
  assert.ok(h.api.tile(h.wins.slice(0, 2)).ok);
  assert.ok(h.api.exitSlide(h.wins[2]).ok);
  const home = h.geometry()[2];
  assert.ok(h.api.dispatch(h.wins[0], "undo").ok);
  assert.equal(h.api.slideState(h.wins[2]), null, "unrelated relation edits survive batch undo");
  assert.deepEqual(h.geometry()[2], home);
});

test("zero-motion separator release retains prior undo; closing a member cancels live drag", async () => {
  const h = await harness();
  assert.ok(h.api.split(...h.wins).ok);
  const before = h.geometry();
  const press = () => h.document.querySelector("[data-split-separator]").dispatchEvent(event("pointerdown", { button: 0, pointerId: 7, clientX: 600 }));
  press();
  h.document.dispatchEvent(event("pointerup", { pointerId: 7 }));
  assert.ok(h.api.canUndo(h.wins[0]));
  press();
  h.document.dispatchEvent(event("pointermove", { pointerId: 7, clientX: 700 }));
  h.api.detach(h.wins[0], true);
  h.wins[0].classList.add("is-hidden");
  h.document.dispatchEvent(event("pointerup", { pointerId: 7 }));
  assert.equal(h.api.pairState(h.wins[1]), null);
  assert.deepEqual(h.geometry(), before);
});


test("viewport resize rejects a partial pair update atomically", async () => {
  const h = await harness();
  assert.ok(h.api.split(...h.wins).ok);
  const before = h.geometry();
  h.document.querySelector(".desktop").getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 840, width: 1000, height: 840 });
  h.context.innerWidth = 1000;
  h.reject(true);
  h.fireWindow("resize");
  assert.deepEqual(h.geometry(), before, "a rejected second frame must not leave a half-resized pair");
});

test("reduced motion preserves side placement, split and gesture target feedback", async () => {
  const h = await harness();
  h.context.matchMedia = (query) => ({ matches: query === "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} });
  assert.ok(h.api.slide(h.wins[0], "left").ok);
  assert.equal(h.api.slideState(h.wins[0]).side, "left");
  assert.ok(h.api.split(...h.wins).ok);
  assert.ok(h.api.pairState(h.wins[0]));
  assert.ok(h.document.querySelector("[data-split-separator]"));
  h.api.detach(h.wins[0]);
  const win = h.wins[0], bar = win.querySelector(":scope > .title-bar");
  let now = 0;
  h.context.performance.now = () => now;
  win.offsetLeft = 100; win.offsetTop = 100;
  h.document.dispatchEvent(event("pointerdown", { target: bar, button: 0, pointerId: 43, clientX: 200, clientY: 100 }));
  now = 20; win.offsetLeft = 200;
  const before = h.geometry();
  h.document.dispatchEvent(event("pointermove", { target: bar, pointerId: 43, clientX: 300, clientY: 100 }));
  assert.equal(h.document.querySelector(".window-arrangement-outline")?.dataset.windowOutlineAction, "rightHalf");
  assert.ok(h.document.querySelector(".window-gesture-hint"));
  assert.deepEqual(h.geometry(), before);
  h.document.dispatchEvent(event("pointercancel", { target: bar, pointerId: 43 }));
  assert.equal(h.document.querySelector(".window-arrangement-outline"), null);
});

test("clear pins stays available during suspension and removes the restore action", async () => {
  const h = await harness();
  const pinSource = readFileSync(new URL("../../apps/desktop/app/core/window-pin-controls.js", import.meta.url), "utf8");
  h.run(pinSource);
  const pins = h.context.AISystem6WindowPinControls;
  assert.ok(h.context.setWindowPinned(h.wins[0], true));
  assert.equal(pins.entries().length, 1);
  assert.ok(h.api.dispatch(h.wins[0], "pinSuspend").ok);
  assert.equal(pins.entries().length, 0);
  assert.equal(pins.isSuspended(), true);
  assert.equal(h.api.available(h.wins[0], "pinClear"), true);
  assert.equal(h.api.available(h.wins[0], "pinRestore"), true);
  assert.ok(h.api.dispatch(h.wins[0], "pinClear").ok);
  assert.equal(pins.isSuspended(), false);
  assert.equal(h.api.available(h.wins[0], "pinRestore"), false);
  assert.equal(pins.restore(), false);
  assert.equal(pins.entries().length, 0);
});
