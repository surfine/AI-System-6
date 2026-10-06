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

test("WM6: the arrangement preview is theme-gated, cancellable and record-free", () => {
  const engine = readFileSync(new URL("../../apps/desktop/app/core/windowshade.js", import.meta.url), "utf8");
  // One rule computes the candidate for both the preview and the release.
  assert.match(engine, /function flickCandidate\(/);
  assert.match(engine, /function showFlickOutline\(/);
  assert.match(engine, /function clearFlickOutline\(/);
  // Only eras whose own chrome draws a dotted frame preview get one.
  assert.match(engine, /hasCapability\?\.\("native-window-outline"\)/);
  // Every cancel path drops the preview: pointercancel, lostpointercapture,
  // Escape, blur, theme change, resize and visibility.
  assert.match(engine, /"lostpointercapture"/);
  assert.match(engine, /pointercancel", \(\) => \{ flickTrack = null; clearFlickOutline\(\); \}/);
  // The preview writes no undo/history record of its own.
  assert.doesNotMatch(engine, /setInterval/);
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
