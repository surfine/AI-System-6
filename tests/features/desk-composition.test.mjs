// The desk composition contract.
//
// On 2026-09-05 this file recorded an arithmetic answer to "how far apart do
// the two rails stand?": a composition width, declared once, that inset both
// the writing spine and the launcher toward a centred band so a 27-inch desk
// would not hold them 2318px apart.
//
// On 2026-09-14 the owner overturned that answer. The rails stand at the edges
// they name -- the writing route on the left, the launcher on the right -- and
// the room a large display buys is the room between them. What survives from
// the composition work is its second half: the reading measure. Both halves are
// arithmetic, and the numbers are read out of the shipped stylesheet.
//
// The avoidance function is still lifted out of window-manager.js and run,
// because the regression it guards is real in every width the walls do not sit
// on: a reservation computed from a rail's WIDTH rather than from where the
// rail IS leaves the work area running underneath it. The rails happen to be
// glued to the display again, but a phone's safe area still pushes the launcher
// in, and that is the case this file exercises.
//
// The painted result is measured by tooling/verify-device-matrix.mjs against a
// real WebKit, which now fails a rail that sits away from its edge. This file
// holds what that gate cannot see: why the numbers are the numbers.

import vm from "node:vm";
import { readFileSync, readdirSync } from "node:fs";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";
import { join } from "node:path";

const test = createFeatureTest("desk-composition");
const foundation = read("styles/00-foundation.css");
const windows = read("styles/10-windows.css");
const apps = read("styles/50-apps.css");
const readerStyles = read("styles/20-reader-docmap.css");
const surfaces = read("styles/30-surfaces.css");
const windowManager = read("app/core/window-manager.js");
const gate = readFileSync(join(root, "tooling/verify-device-matrix.mjs"), "utf8");

const MEASURE_TOKENS = ["--reading-measure"];
// The overturned decision's tokens. They are gone from the desk, and a rail
// that starts reading an inset again is that decision coming back by accident.
const RETIRED_TOKENS = ["--desk-composition-width", "--desk-side-inset"];

// ---- One declaration, in the one place tokens live -------------------------

const styleDir = join(root, "apps/desktop/styles");
const styleFiles = readdirSync(styleDir).filter((name) => name.endsWith(".css"));

for (const token of MEASURE_TOKENS) {
  const declaredIn = styleFiles.filter((name) => (
    new RegExp(`(^|[^-\\w])${token}\\s*:`, "m").test(readFileSync(join(styleDir, name), "utf8"))
  ));
  test.assert(
    declaredIn.length === 1 && declaredIn[0] === "00-foundation.css",
    `${token} is declared once, in 00-foundation.css (found in ${declaredIn.join(", ") || "no file"})`
  );
}

for (const token of RETIRED_TOKENS) {
  const declaredIn = styleFiles.filter((name) => (
    new RegExp(`(^|[^-\\w])${token}\\s*:`, "m").test(readFileSync(join(styleDir, name), "utf8"))
  ));
  test.assert(
    declaredIn.length === 0,
    `${token} no longer exists anywhere: the rails stand at the display's edges (found in ${declaredIn.join(", ")})`
  );
}

/** The declared value of a foundation token, as written. */
function declaration(name) {
  const match = foundation.match(new RegExp(`(?:^|[^-\\w])${name}\\s*:\\s*([^;]+);`, "m"));
  if (!match) throw new Error(`00-foundation.css no longer declares ${name}`);
  return match[1].trim();
}

// ---- The rails stand at the display's edges --------------------------------
//
// Neither rail reads an inset any more. The spine takes the 22px offset it
// always took at 1280, and the launcher takes the same offset from the right,
// with the sensor housing still able to push it clear.
test.assertIncludes(
  windows,
  "left: 22px;",
  "the writing spine stands on the display's left edge"
);
test.assertIncludes(
  apps,
  "right: max(22px, var(--safe-area-right));",
  "the launcher stands on the display's right edge, with the sensor housing still respected"
);

// The rails' own geometry, read from the source rather than typed: a change to
// the spine's width or to either offset moves every number below.
const spineOffset = Number.parseFloat(/\.writing-spine-panel \{[\s\S]*?\n {2}left: (\d+)px;/.exec(windows)?.[1]);
const spineWidth = Number.parseFloat(/\.writing-spine-panel \{[\s\S]*?\n {2}width: (\d+)px;/.exec(windows)?.[1]);
const columnOffset = Number.parseFloat(/right: max\((\d+)px, var\(--safe-area-right\)\);/.exec(apps)?.[1]);
const columnWidth = Number.parseFloat(/--desktop-icon-width: (\d+)px;/.exec(foundation)?.[1]);
const railsOwnWidth = spineOffset + spineWidth + columnOffset + columnWidth;
test.assert(
  railsOwnWidth === 242,
  `the rails' own geometry accounts for 242px (${spineOffset}+${spineWidth}+${columnOffset}+${columnWidth}=${railsOwnWidth})`
);

/** The clear distance between the spine's inner edge and the launcher's. */
const railsApart = (display) => Math.round(display - railsOwnWidth);

// Measured in WebKit on 2026-09-14, after the overturn, at six display widths:
// the gap is the display less the rails' own 242px, and it grows with the
// display instead of stopping at a ceiling. These are the widths the decision
// was taken for; a rail that stops following its edge changes them here first.
const MEASURED = [
  { display: 1280, railsApart: 1038 },
  { display: 1512, railsApart: 1270 },
  { display: 1920, railsApart: 1678 },
  { display: 2240, railsApart: 1998 },
  { display: 2560, railsApart: 2318 },
  { display: 3008, railsApart: 2766 },
];
for (const { display, railsApart: expected } of MEASURED) {
  const actual = railsApart(display);
  test.assert(
    actual === expected,
    `a ${display}px desk holds the rails ${expected}px apart (computed ${actual})`
  );
}
test.assert(
  railsApart(3008) > railsApart(2560),
  "a wider display buys room between the rails, which is what the overturn was for"
);

// The gate that measures the painted result carries the same edge offset these
// two rules have to satisfy. Keep them facing each other: an offset moved on
// one side should fail here, at the number, rather than two hours later in
// WebKit.
const gateEdgeOffset = Number.parseFloat(/const RAIL_EDGE_OFFSET = (\d+);/.exec(gate)?.[1]);
test.assert(
  Number.isFinite(gateEdgeOffset) && gateEdgeOffset === spineOffset && gateEdgeOffset === columnOffset,
  `the device matrix pins the same edge offset the rails use (${gateEdgeOffset} vs ${spineOffset}/${columnOffset})`
);
test.assertIncludes(
  gate,
  'failed.push("rails-at-the-edges")',
  "and a real browser is what proves the rails actually sit on those edges"
);

// ---- The work area, actually computed --------------------------------------
//
// This is the regression, and it is why this file executes rather than greps.
// getDesktopAvoidanceInsets() reserves the strip a new or zoomed window may not
// occupy. While the launcher was glued to the display's right edge, its WIDTH
// and its DISTANCE FROM THE EDGE were the same number, so a width-based
// reservation was correct by accident. The moment the column followed the
// composition inset, a width-based figure left the work area running underneath
// it and a zoomed window covered the launcher on a 27-inch display.
//
// So the real function is lifted out of the shipped source and run.

const avoidanceSource = windowManager.slice(
  windowManager.indexOf("function getDesktopAvoidanceInsets("),
  windowManager.indexOf("// The Writing Flow toolbox is part of the usable desk"),
);
test.assert(
  avoidanceSource.length > 200 && avoidanceSource.trimEnd().endsWith("}"),
  "the avoidance function was located whole in the shipped source"
);

/**
 * Run the real function against a stubbed desk.
 *
 * `spine` and `icons` are rects in desk coordinates; either may be null to
 * stand for a rail that is not on screen.
 */
function avoidance({ display, spine, icons, margin = 18, spineGap = 18, iconGap = 48 }) {
  const rect = (box) => ({ ...box, right: box.left + box.width });
  const element = (box, visible = true) => (box ? {
    classList: { contains: () => false },
    getBoundingClientRect: () => rect(box),
    computed: { position: visible ? "absolute" : "static", display: visible ? "flex" : "none" },
  } : null);
  const desktop = {
    classList: { contains: () => false },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: display, height: 900, right: display, bottom: 900 }),
    computed: { position: "absolute", display: "block" },
  };
  const spineElement = element(spine);
  const iconElement = element(icons);
  const context = vm.createContext({
    Math,
    document: {
      querySelector: (selector) => {
        if (selector === ".desktop") return desktop;
        if (selector === ".writing-spine-panel") return spineElement;
        if (selector === ".spine-flow-toolbox") return null;
        // The NeXTSTEP dock stands where the Classic launcher column does; a
        // desk that is not wearing that appearance has no such element.
        if (selector === ".nextstep-dock") return null;
        if (selector === ".icon-column") return iconElement;
        throw new Error(`the desk stub does not know the selector: ${selector}`);
      },
    },
    getComputedStyle: (node) => node.computed,
  });
  vm.runInContext(
    `${avoidanceSource}\nglobalThis.result = getDesktopAvoidanceInsets(${JSON.stringify({ margin, spineGap, iconGap })});`,
    context,
  );
  return context.result;
}

// A 27-inch desk as it now ships: the launcher sits against the display's
// right edge, so its width and its distance from the edge are again the same
// number — which is exactly why the reservation cannot be allowed to be a
// width-derived figure. The next case is the one that still tells them apart.
const launcher27 = { left: 2560 - 22 - columnWidth, top: 18, width: columnWidth };
const wide = avoidance({ display: 2560, spine: null, icons: launcher27 });
test.assert(
  wide.right === 2560 - launcher27.left + 48,
  `the right reservation is measured from where the launcher IS (${wide.right}px to its near edge)`
);

// A phone held sideways reports a safe-area inset, and the launcher is pushed
// that far in from the edge while staying the same width. A width-derived
// reservation would leave the work area running underneath it here.
const safeAreaInset = 60;
const launcherWithSafeArea = { left: 2560 - safeAreaInset - columnWidth, top: 18, width: columnWidth };
const insetDesk = avoidance({ display: 2560, spine: null, icons: launcherWithSafeArea });
test.assert(
  insetDesk.right === 2560 - launcherWithSafeArea.left + 48,
  `the reservation follows the launcher in past the safe area (${insetDesk.right}px)`
);
test.assert(
  insetDesk.right > columnWidth + 48,
  `and is larger than the launcher is wide (${insetDesk.right} > ${columnWidth + 48}) — a width was the regression once already`
);
// Stated as the defect rather than as the formula: the work area must end
// before the launcher begins, or a zoomed window is drawn underneath it.
test.assert(
  2560 - insetDesk.right < launcherWithSafeArea.left,
  `a zoomed window stops at ${2560 - insetDesk.right}px, clear of the launcher at ${launcherWithSafeArea.left}px`
);

// With the launcher on the display edge the two figures agree exactly. This is
// the boundary a width-based implementation would still pass, kept rather than
// deleted so the difference between the two questions stays visible.
const glued = avoidance({ display: 1280, spine: null, icons: { left: 1280 - columnWidth, top: 18, width: columnWidth } });
test.assert(
  glued.right === columnWidth + 48,
  "with the launcher on the display edge, position and width give the same answer — which is why this went unnoticed"
);

// The left rail is reserved the same way, from its far edge.
const spined = avoidance({
  display: 2560,
  spine: { left: 22, top: 18, width: spineWidth },
  icons: launcher27,
});
test.assert(
  spined.left === 22 + spineWidth + 18,
  `the left reservation clears the spine where it stands (${spined.left}px)`
);
// The two reservations together may never eat the desk: what is left is the
// gap between the rails, less the two gaps the function itself adds.
test.assert(
  2560 - spined.left - spined.right === railsApart(2560) - 18 - 48,
  "the reserved work area is exactly the gap between the rails, less the two rail gaps"
);

// A rail that is not on screen reserves nothing but the margin.
const bare = avoidance({ display: 1440, spine: null, icons: null });
test.assert(bare.left === 18 && bare.right === 0, "with neither rail on screen the whole desk is work area");

// ---- The reading measure ----------------------------------------------------
//
// One token, applied through var() by every surface that reads. A literal here
// is the failure mode: the second copy is the one that drifts.
test.assert(
  declaration("--reading-measure") === "72ch",
  `the reading measure is 72 characters (declared ${declaration("--reading-measure")})`
);
test.assertIncludes(
  readerStyles,
  ".reader-content > * {\n  max-width: var(--reading-measure);\n  margin-inline: auto;\n}",
  "the Reader caps and centres its prose through the token, not a literal"
);
test.assertIncludes(
  surfaces,
  "max-width: var(--reading-measure);",
  "System Help's running text reads at the same measure, through the same token"
);

// Endfield Terminal is not on the desk: it is a full-bleed lazily loaded skin
// with its own monospace type scale, and its 72ch is the same round number
// arrived at separately rather than this token spelled out. It is named here
// instead of being waved through by a loose pattern, so the NEXT literal fails.
const MEASURE_LITERAL_OUTSIDE_THE_DESK = ["90-endfield-terminal.css"];
const literalMeasure = styleFiles.filter((name) => (
  !MEASURE_LITERAL_OUTSIDE_THE_DESK.includes(name)
  && /(?:max-width|width)\s*:\s*72ch/.test(readFileSync(join(styleDir, name), "utf8"))
));
test.assert(
  literalMeasure.length === 0,
  `no desk stylesheet restates the measure as a literal 72ch (found in ${literalMeasure.join(", ") || "none"})`
);
// The allowance is itself a ratchet: if that sheet ever stops carrying its own
// copy, this line has to be removed rather than left standing as cover.
const staleAllowances = MEASURE_LITERAL_OUTSIDE_THE_DESK.filter((name) => (
  !styleFiles.includes(name) || !/(?:max-width|width)\s*:\s*72ch/.test(readFileSync(join(styleDir, name), "utf8"))
));
test.assert(
  staleAllowances.length === 0,
  `every named literal-measure exception is still real (stale: ${staleAllowances.join(", ") || "none"})`
);

// Measured 2026-09-05: the column is a constant 537px from 1280x800 to
// 3008x1692 — it was 956 and 2236 before. The painted number is the matrix
// gate's to check; what belongs here is that the constant clears the ceiling
// that gate enforces, so a bigger measure fails at the token first.
const MEASURED_READING_COLUMN = 537;
const maxReadingMeasure = Number.parseFloat(/const MAX_READING_MEASURE = (\d+);/.exec(gate)?.[1]);
test.assert(
  Number.isFinite(maxReadingMeasure) && MEASURED_READING_COLUMN <= maxReadingMeasure,
  `the measured 537px column is inside the matrix's ${maxReadingMeasure}px reading limit`
);
test.assertIncludes(
  gate,
  'failed.push("reading-measure")',
  "and a real browser is what proves the column actually stops there"
);

test.finish();
