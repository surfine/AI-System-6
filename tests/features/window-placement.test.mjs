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
  const bodyStart = source.indexOf("{", start);
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
  /querySelectorAll\("\.window:not\(\.is-hidden\):not\(\.is-app-hidden\):not\(\.is-collapsed\)"\)[\s\S]{0,120}?peer !== win/,
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
    centeredSystemWindowNames, writingLayoutWindowNames,
    isAssistantSidecarWindow, isDeskAccessoryPlacementWindow,
    getDesktopAvoidanceInsets, writingSpineAlignedTopForWindow,
    clampNumber, setInlineStyleValue
  } = environment;
  ${placementFunctions}
  return placeNewWindowAvoidingVisibleWindows;
`)({
  document: {
    documentElement: {},
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
  centeredSystemWindowNames: new Set(),
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
  'if (win.dataset.systemPositioned === "true") placeNewWindowAvoidingVisibleWindows(win);',
  "delayed title alignment rechecks collision clearance",
);
test.assertIncludes(
  windowManager,
  'win.dataset.userPositioned === "true"',
  "reopening a user-positioned window preserves spatial memory",
);
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

test.finish();
