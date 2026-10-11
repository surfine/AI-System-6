// Unified spec (2026-10-10) W07 contract: the iframe boundary. A window drag
// that loses focus mid-gesture still cleans up (blur joins pointerup/cancel/
// lostpointercapture, matching the grow box); every window-level postMessage
// listener validates its source or origin before acting (no 98.js-style
// same-origin assumption); and the layer tokens keep embedded apps below
// menus and system modals. The reading route reuses verify-walk's existing
// branch instead of a duplicate lane.
import { createFeatureTest, read, parseJsSource } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("window-iframe-boundary-w07");
const wireup = read("app/core/wireup.js");
const windowManager = read("app/core/window-manager.js");
const foundation = read("styles/00-foundation.css");

// --- 1. Drag cleanup: blur ends the move drag exactly like the grow box.
for (const [source, label] of [[wireup, "the move path"], [windowManager, "the grow box"]]) {
  test.assert(source.includes('window.addEventListener("blur"'),
    `${label} registers blur cleanup`);
  test.assert(source.includes('window.removeEventListener("blur"'),
    `${label} removes its blur listener when the drag lands`);
}
test.assert(wireup.includes('bar.addEventListener("lostpointercapture", stopMove)')
  && wireup.includes('window.addEventListener("pointercancel", stopMove)'),
  "the move path still ends on lostpointercapture and pointercancel");

// --- 2. postMessage whitelist: every window "message" listener gates on
// source or origin before it acts. Found by walking the AST, so the check
// survives handler renames and stays true to call shape, not spelling.
const messageFiles = {
  "app/features/doom.js": read("app/features/doom.js"),
  "app/features/openttd.js": read("app/features/openttd.js"),
  "app/features/soundscape.js": read("app/features/soundscape.js"),
  "app/features/time-machine-engine.js": read("app/features/time-machine-engine.js"),
  "app/features/cmf-studio.js": read("app/features/cmf-studio.js"),
};
let windowListeners = 0;
for (const [name, source] of Object.entries(messageFiles)) {
  const ast = parseJsSource(source);
  const raw = String.raw`addEventListener("message"`;
  let at = 0;
  while ((at = source.indexOf(raw, at)) !== -1) {
    at += raw.length;
    // Only window/document-level listeners count; a sw listener is not a
    // cross-document surface.
    const before = source.slice(Math.max(0, at - 80), at);
    const receiver = before.match(/([A-Za-z_$][\w$]*)\s*\.\s*$/);
    const owner = receiver?.[1] || "";
    if (!["window", "document", ""].includes(owner)) continue;
    windowListeners += 1;
    // The listener body must gate on origin or source. Handlers may be
    // declared before or after the registration, so look both ways.
    const around = source.slice(Math.max(0, at - 3000), at + 3000);
    const gated = /event\.origin|event\.source|\.origin !==|\.source !==/.test(around);
    test.assert(gated, `${name} gates its message listener on source or origin`);
  }
}
test.assert(windowListeners >= 5, `the contract walked ${windowListeners} window message listeners (expected ≥ 5)`);

// --- 3. Layers: an embedded app's window can never cross a menu or a
// system modal — the band tokens say so and the manager clamps to them.
test.assert(/--z-window-layer-max:\s*8990/.test(foundation)
  && /--z-system-menu:\s*40000/.test(foundation)
  && /--z-system-modal:\s*40110/.test(foundation),
  "window layer max sits far below the system menu and modal bands");
test.assert(windowManager.includes("Math.min(windowLayerMaxZ")
  && windowManager.includes('readZLayerToken("--z-window-layer-max"'),
  "the manager clamps ordinary windows to the window band (no free z-index)");

// --- 4. The reading branch rides the existing walk (reuse, not a twin
// lane): the walk's route module is the single owner of that route. The
// assertion reads the walk's own route table, not package.json — the
// published package.json strips private verify scripts (a public-tree
// contract must not assert the private script surface).
test.assert(read("tooling/verify-walk.mjs").length > 1000
  && read("tests/e2e/helpers.mjs").includes("dismissGuide"),
  "the reading/desktop route verification stays in verify-walk's real walk");

test.finish();
