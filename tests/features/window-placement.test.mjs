// New windows preserve the user's spatial memory: existing frames never move.
// A clear desktop slot wins; a diagonal cascade is the deterministic fallback.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("window-placement");
const foundation = read("styles/00-foundation.css");
const responsive = read("styles/60-responsive.css");
const windowManager = read("app/core/window-manager.js");

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return null;
  // The body opens at ") {": a default parameter such as `options = {}`
  // would otherwise be taken for the body.
  const bodyStart = source.indexOf(") {", start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return null;
}

for (const token of [
  "--window-placement-edge",
  "--window-placement-gap",
  "--window-placement-step-x",
  "--window-placement-step-y",
]) {
  test.assertIncludes(foundation, token, `${token} has one shared geometry source`);
}

test.assertIncludes(
  windowManager,
  "function placeNewWindowAvoidingVisibleWindows(win)",
  "one desktop placement policy owns ordinary new windows",
);
test.assertMatches(
  windowManager,
  // The exclusion list gained is-minimized with the NeXTSTEP dock. What this
  // contract owns is "every visible old window, not only the same app", so it
  // allows further state filters between the app-hidden and collapsed ones.
  /querySelectorAll\("\.window\[data-window\]:not\(\.is-hidden\):not\(\.is-app-hidden\)(?::not\(\.is-[a-z-]+\))*:not\(\.is-collapsed\)"\)[\s\S]{0,120}?peer !== win/,
  "placement considers every visible old window, not only the same app",
);
test.assertMatches(
  windowManager,
  /peers\.every\(\(\{ rect: peerRect \}\) => !rectsOverlap\(candidateRect, peerRect, gap\)\)/,
  "a clear slot includes the shared breathing gap",
);
test.assertMatches(
  windowManager,
  /originColumn \+ rung[\s\S]{0,180}?originRow \+ rung/,
  "the overlap fallback advances down and right as a staircase",
);
test.assertMatches(
  windowManager,
  /a\.conflicts - b\.conflicts \|\| a\.overlap - b\.overlap \|\| a\.rung - b\.rung/,
  "when overlap is unavoidable the least-covered staircase frame wins",
);
// Re-arranging keeps the launcher reachable. Tile Windows reserved the right
// edge from the column's WIDTH while every other placement path measures where
// the column IS: on a 2560pt desk whose column starts 470px from the edge that
// reserved 132px, and the last tiled column landed under the launcher.
const tileSource = readFunction(windowManager, "tileWindows");
test.assert(Boolean(tileSource), "tileWindows reads as one function");
test.assertIncludes(
  tileSource || "",
  "desktop.clientWidth - avoidance.left - avoidance.right - padding",
  "tiling reserves the launcher by the measured inset",
);
test.assertNotIncludes(tileSource || "", "iconRect.width", "tiling no longer sizes the launcher gutter from the column's width");
// Reserving the launcher is not enough on its own: a writing window holds a
// 540px paper floor, so two columns of them need 1098px of a 1024pt desk that
// has 612 to give, and the right-hand column landed on the icons anyway. The
// grid asks the windows what width they can take before it chooses columns.
test.assertIncludes(tileSource || "", "getComputedStyle(win).minWidth", "the grid reads each window's own minimum width");
test.assertIncludes(tileSource || "", "Math.min(Math.ceil(Math.sqrt(count)), maxCols)", "and never asks for more columns than those minimums allow");

const overlapSource = readFunction(windowManager, "windowPlacementOverlapArea");
const overlapArea = overlapSource ? Function(`return (${overlapSource})`)() : null;
test.assert(
  overlapArea?.(
    { left: 0, top: 0, right: 100, bottom: 100 },
    { left: 114, top: 0, right: 214, bottom: 100 },
    14,
  ) === 0,
  "exactly one breathing gap is accepted as clear space",
);
test.assert(
  overlapArea?.(
    { left: 0, top: 0, right: 100, bottom: 100 },
    { left: 113, top: 0, right: 213, bottom: 100 },
    14,
  ) > 0,
  "one pixel inside the breathing gap counts as a collision",
);

const placementFunctions = [
  "rectsOverlap",
  "windowPlacementMetric",
  "windowPlacementOverlapArea",
  "windowPlacementRect",
  "windowHasOwnedPlacement",
  "controlStripPlacementReserve",
  "deskDockReserve",
  "deskBottomReserve",
  "placeNewWindowAvoidingVisibleWindows",
].map((name) => readFunction(windowManager, name)).join("\n");
const desktopRect = { left: 0, top: 25, right: 800, bottom: 625, width: 800, height: 600 };
const oldWindow = {
  dataset: { window: "old" },
  style: { zIndex: "20" },
  getBoundingClientRect: () => ({ left: 18, top: 43, right: 318, bottom: 263, width: 300, height: 220 }),
};
const newWindowStyles = {};
const newWindow = {
  dataset: { window: "new" },
  style: { zIndex: "21" },
  getBoundingClientRect: () => ({ left: 18, top: 43, right: 318, bottom: 263, width: 300, height: 220 }),
};
const placementRuntime = Function("environment", `
  const {
    document, getComputedStyle, writerMode, isPortraitDocumentFlow,
    isCenteredSystemWindow, writingLayoutWindowNames,
    isAssistantSidecarWindow, isDeskAccessoryPlacementWindow,
    getDesktopAvoidanceInsets, writingSpineAlignedTopForWindow,
    clampNumber, setInlineStyleValue
  } = environment;
  ${placementFunctions}
  return placeNewWindowAvoidingVisibleWindows;
`)({
  document: {
    documentElement: {},
    // The Dock is off in this scenario, so its reserve reads 0 and every
    // frame below is what the desk produced before the Dock existed.
    body: { classList: { contains: () => false } },
    querySelector: (selector) => selector === ".desktop" ? { getBoundingClientRect: () => desktopRect } : null,
    querySelectorAll: () => [oldWindow, newWindow],
  },
  getComputedStyle: () => ({
    getPropertyValue: (property) => ({
      "--window-placement-edge": "18px",
      "--window-placement-gap": "14px",
      "--window-placement-step-x": "28px",
      "--window-placement-step-y": "24px",
    })[property] || "",
  }),
  writerMode: false,
  isPortraitDocumentFlow: () => false,
  // Which windows own their placement is a registry property now; this
  // scenario has none of them, which is what the empty set used to say.
  isCenteredSystemWindow: () => false,
  writingLayoutWindowNames: new Set(),
  isAssistantSidecarWindow: () => false,
  isDeskAccessoryPlacementWindow: () => false,
  getDesktopAvoidanceInsets: ({ margin }) => ({ left: margin, right: 0 }),
  writingSpineAlignedTopForWindow: (_win, fallback) => fallback,
  clampNumber: (value, min, max) => Math.max(min, Math.min(max, value)),
  setInlineStyleValue: (_win, property, value) => { newWindowStyles[property] = value; },
});
test.assert(
  placementRuntime(newWindow) === true
    && newWindowStyles.left === "18px"
    && newWindowStyles.top === "252px",
  "a new cross-app window takes the nearest clear slot without moving the old frame",
);
test.assertIncludes(
  windowManager,
  'placeNewWindowAvoidingVisibleWindows(win);\n      clampWindowToViewport(win);',
  "delayed title alignment rechecks collision clearance and keeps the window in the viewport",
);
test.assertIncludes(
  windowManager,
  'win.dataset.userPositioned === "true"',
  "reopening a user-positioned window preserves spatial memory",
);

const viewportClampFunctions = [
  "keyboardInsetValue",
  "windowPlacementMetric",
  "controlStripPlacementReserve",
  "deskDockReserve",
  "clampWindowToViewport",
  "reconcileVisibleSystemWindowsToViewport",
].map((name) => readFunction(windowManager, name)).join("\n");
const narrowStyles = { left: "184px", top: "18px", height: "496px", maxHeight: "496px" };
const narrowWindow = {
  dataset: { userPositioned: "false" },
  getBoundingClientRect: () => {
    const left = Number.parseFloat(narrowStyles.left);
    const top = Number.parseFloat(narrowStyles.top);
    const height = Number.parseFloat(narrowStyles.height);
    return { left, right: left + 390, top, bottom: top + height, width: 390, height };
  },
};
let viewportWrites = 0;
const clampRuntime = Function("environment", `
  const { document, window, getComputedStyle, setInlineStyleValue } = environment;
  ${viewportClampFunctions}
  return { clampWindowToViewport, reconcileVisibleSystemWindowsToViewport };
`)({
  document: {
    documentElement: { clientWidth: 390, clientHeight: 844 },
    body: { classList: { contains: () => false } },
    querySelector: (selector) => (
      selector === ".menu-bar" ? { getBoundingClientRect: () => ({ bottom: 22 }) } : null
    ),
    querySelectorAll: () => [narrowWindow],
  },
  window: { innerWidth: 390, innerHeight: 844 },
  getComputedStyle: () => ({ getPropertyValue: () => "0px" }),
  setInlineStyleValue: (_win, property, value) => { viewportWrites += 1; narrowStyles[property] = value; },
});
clampRuntime.reconcileVisibleSystemWindowsToViewport();
test.assert(
  narrowStyles.left === "0px" && Number.parseFloat(narrowStyles.height) <= 810,
  "a system-positioned full-width window is brought wholly on-screen after a wide-to-phone resize",
);
const writesBeforeUserWindow = viewportWrites;
const userWindow = {
  dataset: { userPositioned: "true" },
  getBoundingClientRect: () => ({ left: 184, right: 574, top: 18, bottom: 514, width: 390, height: 496 }),
};
clampRuntime.clampWindowToViewport(userWindow);
test.assert(viewportWrites === writesBeforeUserWindow, "viewport reconciliation never overwrites a user-positioned desktop frame");
test.assertIncludes(
  windowManager,
  "writingLayoutWindowNames.has(name)",
  "the writing-route pair keeps its dedicated split owner",
);
test.assertIncludes(
  windowManager,
  "isAssistantSidecarWindow(name)",
  "assistant sidecars keep their source-adjacent owner",
);
test.assertIncludes(
  windowManager,
  "isDeskAccessoryPlacementWindow(name)",
  "Desk Accessories keep their shared stack owner",
);
test.assertIncludes(
  windowManager,
  "isPortraitDocumentFlow()",
  "phone layouts bypass desktop coordinates",
);
test.assertIncludes(
  responsive,
  ".window.is-mobile-dialog:not(.is-hidden):not(.is-collapsed)",
  "phone dialogs remain compact overlays above their owning page",
);
test.assertMatches(
  foundation,
  /\.system-modal \{[\s\S]{0,180}?top: 50%;[\s\S]{0,80}?left: 50%;/,
  "native system modals retain one centered blocking position",
);
test.assertMatches(
  foundation,
  /\.finder-operation-modal \{[\s\S]{0,180}?top: 50%;[\s\S]{0,80}?left: 50%;/,
  "Finder operation modals retain one centered blocking position",
);

// The Dock lives along the bottom edge. While it is shown, every path that
// decides a system-placed window's bottom must stop above its band; while it
// is hidden, every one of those paths must produce exactly the frame it did
// before the Dock existed (a reserve of 0). A dozen functions each write a
// bottom or height limit, and missing one is the realistic regression, so each
// is pinned by name and the shared reserve is pinned by value.
const dockReserveFunctions = [
  "clampWindowToViewport",
  "zoomWindow",
  "maximizeWindow",
  "placeClioStageDefaultWindow",
  "fitFinderWindowToContents",
  "placeFinderCascadeWindow",
  "arrangeOutlineTeachTextSplit",
  "arrangeWritingPairSplit",
  "arrangeSoloWritingWindow",
  "arrangeDeskAccessories",
  "placeAssistantSidecarWindow",
  "startWindowResize",
];

const deskDockReserveSource = readFunction(windowManager, "deskDockReserve");
const deskBottomReserveSource = readFunction(windowManager, "deskBottomReserve");
test.assert(Boolean(deskDockReserveSource), "deskDockReserve reads as one function");
test.assert(Boolean(deskBottomReserveSource), "deskBottomReserve reads as one function");
test.assertIncludes(
  deskDockReserveSource || "",
  "desk-dock-shown",
  "the Dock reserve is armed by the body class the Dock module toggles",
);
test.assertIncludes(
  deskBottomReserveSource || "",
  "deskDockReserve()",
  "default placement reserves the taller of the Control Strip and the Dock",
);
test.assertIncludes(
  windowManager,
  "deskBottomReserve()",
  "placeNewWindowAvoidingVisibleWindows carries the Dock into its stripReserve",
);
test.assertIncludes(
  windowManager,
  "bottom: deskDockReserve()",
  "getDesktopAvoidanceInsets reports the Dock band as the work area's bottom inset",
);

for (const name of dockReserveFunctions) {
  test.assertIncludes(
    readFunction(windowManager, name) || "",
    "deskDockReserve()",
    `${name} keeps system placement above the Dock`,
  );
}

// Value-level: the reserve must be exactly the CSS custom property while the
// Dock is shown, and exactly 0 the moment the class is gone -- even if a stale
// property is left on the body. That second half is what makes a hidden Dock
// reproduce every frame it produced before it existed.
const dockBodyClasses = new Set();
const dockBodyProperties = {};
const dockReserveValues = {
  body: { classList: { contains: (name) => dockBodyClasses.has(name) } },
};
const dockReserveRuntime = Function("environment", `
  const { document, getComputedStyle, windowPlacementMetric } = environment;
  ${readFunction(windowManager, "controlStripPlacementReserve")}
  ${deskDockReserveSource}
  ${deskBottomReserveSource}
  return { deskDockReserve, deskBottomReserve };
`)({
  document: { body: dockReserveValues.body },
  getComputedStyle: () => ({
    getPropertyValue: (property) => dockBodyProperties[property] || "",
  }),
  windowPlacementMetric: (property, fallback) => {
    const value = Number.parseFloat(dockBodyProperties[property]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  },
});
test.assert(
  dockReserveRuntime.deskDockReserve() === 0 && dockReserveRuntime.deskBottomReserve() === 0,
  "with the Dock hidden no placement reserves a bottom band",
);
dockBodyClasses.add("desk-dock-shown");
dockBodyProperties["--desk-dock-reserve"] = "64px";
test.assert(
  dockReserveRuntime.deskDockReserve() === 64 && dockReserveRuntime.deskBottomReserve() === 64,
  "with the Dock shown system placement reserves exactly its measured band",
);
dockBodyClasses.delete("desk-dock-shown");
test.assert(
  dockReserveRuntime.deskDockReserve() === 0 && dockReserveRuntime.deskBottomReserve() === 0,
  "hiding the Dock reserves nothing again even while its property stays set",
);

// A new route window is default-placed and a spine title alignment is queued
// for the next frames; the writing route then lays it out explicitly (TeachText
// under Section Drafts). The queued alignment must yield to that layout: when
// it ran anyway it pulled TeachText back to the spine line, exactly over
// Section Drafts, in every appearance (2026-09-26).
{
  const queued = [];
  const aligned = [];
  const runtime = Function("environment", `
    const { requestAnimationFrame, setTimeout } = environment;
    const window = { setTimeout };
    let writerMode = false;
    const isPortraitDocumentFlow = () => false;
    const clearFinderContentFit = () => {};
    const windowFrameValue = (value, fallback = "") => value ?? fallback;
    const applyWindowFrame = (win, frame) => { win.frame = frame; };
    const markWindowUserPositioned = () => {};
    const markWindowSystemPositioned = () => {};
    const placeNewWindowAvoidingVisibleWindows = () => {};
    const clampWindowToViewport = () => {};
    const alignWindowTitleBottomToWritingSpine = (win) => environment.aligned.push(win.id);
    ${windowManager.match(/const explicitLayoutGeneration = new WeakMap\(\);/)?.[0] || ""}
    ${readFunction(windowManager, "placeWindowForExplicitLayout")}
    ${readFunction(windowManager, "scheduleWritingSpineTitleAlignment")}
    return { placeWindowForExplicitLayout, scheduleWritingSpineTitleAlignment };
  `)({ requestAnimationFrame: (fn) => queued.push(fn), setTimeout: (fn) => queued.push(fn), aligned });
  const drain = () => { while (queued.length) queued.shift()(); };
  const solo = { id: "questionSheet", dataset: {}, classList: { remove() {} } };
  runtime.scheduleWritingSpineTitleAlignment(solo);
  drain();
  test.assert(aligned.includes("questionSheet"), "a window nothing re-lays out still gets its spine title alignment");
  const lower = { id: "teachText", dataset: {}, classList: { remove() {} } };
  runtime.scheduleWritingSpineTitleAlignment(lower);
  runtime.placeWindowForExplicitLayout(lower, { top: "387px", height: "353px" });
  drain();
  test.assert(!aligned.includes("teachText") && lower.frame?.top === "387px", "an explicit route layout written after scheduling keeps its frame");
}

test.finish();
