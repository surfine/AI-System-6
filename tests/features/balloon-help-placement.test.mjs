// Where a help balloon stands.
//
// Balloon Help used to compute its position from a single anchor rectangle, and
// that one rectangle had to be three things at once: the object the tail points
// at, the box the balloon sits against, and the area it must avoid. The three
// pull in different directions, so the balloon landed on the pull-down menu it
// was explaining, and — once the menu was open — 294px away from the title it
// belonged to, with its tail on a command it had nothing to do with.
//
// The placement is now a pure function over rectangles, which is why this
// contract can hold it without a browser. Every case below is a measurement
// taken from the running app (viewport 1280x720, CSS pixels), so a regression
// here is a regression a person would see.
//
//   subject   the control the balloon explains
//   keepClear what it may not cover, weighted: the object itself, the panel it
//             opens, its peers
//   field     the viewport, inset
//
// The five rules, in priority order: point at the subject; do not cover the
// subject; do not cover what the subject opens; do not cover the subject's
// peers; then be as near as possible.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("balloon-help-placement");

const source = read("app/core/balloon-help.js");
const context = vm.createContext({ window: {}, document: {} });
vm.runInContext(source, context);

const { placeBalloonHelp } = context;
test.assert(typeof placeBalloonHelp === "function", "placement is a pure function the contract can call directly");

const FIELD = { left: 10, top: 10, right: 1270, bottom: 710 };
const SUBJECT_WEIGHT = 8;
const PANEL_WEIGHT = 4;
const PEER_WEIGHT = 1;

function rect(left, top, width, height, weight) {
  return { left, top, right: left + width, bottom: top + height, weight };
}

function box(placement, size) {
  return {
    left: placement.left,
    top: placement.top,
    right: placement.left + size.width,
    bottom: placement.top + size.height,
  };
}

function overlaps(a, b) {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}

function tailPoint(placement, size) {
  if (placement.side === "right") return { x: placement.left, y: placement.top + placement.tailTop };
  if (placement.side === "left") return { x: placement.left + size.width, y: placement.top + placement.tailTop };
  if (placement.side === "below") return { x: placement.left + placement.tailLeft, y: placement.top };
  return { x: placement.left + placement.tailLeft, y: placement.top + size.height };
}

// The tail goes on the edge that faces the subject. A tail on the wrong edge
// hands the explanation to a different object, which is worse than covering one.
function assertTailFacesSubject(placement, size, subject, label) {
  const rectangle = box(placement, size);
  const point = tailPoint(placement, size);
  const centerX = subject.left + (subject.width / 2);
  const centerY = subject.top + (subject.height / 2);
  const faces = {
    right: centerX <= rectangle.left,
    left: centerX >= rectangle.right,
    below: centerY <= rectangle.top,
    above: centerY >= rectangle.bottom,
  };
  test.assert(faces[placement.side] === true, `${label}: the tail is on the edge that faces the object`);
  // And at the point of that edge nearest the object, so a balloon that stepped
  // aside still reads as belonging to the thing up in the corner.
  const nearest = placement.side === "right" || placement.side === "left"
    ? Math.abs(point.y - Math.max(subject.top, Math.min(centerY, subject.bottom ?? centerY)))
    : Math.abs(point.x - centerX);
  test.assert(nearest <= Math.max(size.width, size.height), `${label}: the tail sits at the end of that edge nearest the object`);
}

// ---------------------------------------------------------------------------
// A. A menu title whose menu has not been pulled down yet.
// Measured: subject 8,3 34x24 · balloon 10,39 300x73 · the menu that opens
// underneath is 8,27 190x686. The old placer put the balloon on the first three
// commands, because a menu that has not opened is in no rectangle at all.
{
  const subject = { left: 8, top: 3, width: 34, height: 24 };
  const size = { width: 300, height: 73 };
  const predictedPanel = rect(8, 27, 190, FIELD.bottom - 27, PANEL_WEIGHT);
  // The other menu titles, measured across the bar: a balloon level with the
  // menu bar would be sitting on them.
  const keepClear = [
    rect(8, 3, 34, 24, SUBJECT_WEIGHT),
    predictedPanel,
    rect(43, 3, 77, 24, PEER_WEIGHT),
    rect(131, 3, 23, 24, PEER_WEIGHT),
    rect(176, 3, 24, 24, PEER_WEIGHT),
    rect(224, 3, 80, 24, PEER_WEIGHT),
    rect(320, 3, 51, 24, PEER_WEIGHT),
    rect(973, 3, 163, 24, PEER_WEIGHT),
    rect(1160, 3, 104, 24, PEER_WEIGHT),
  ];
  const placement = placeBalloonHelp({ subject, keepClear, field: FIELD, size });
  const rectangle = box(placement, size);

  test.assert(!overlaps(rectangle, predictedPanel), "A: a closed menu's balloon leaves room for the menu that is about to open");
  test.assert(rectangle.top >= 27, "A: it stays clear of the menu bar it hangs from");
  test.assert(rectangle.top <= 27 + 40, "A: and stays on the menu bar's own row instead of sliding down the screen");
  test.assert(placement.overlap === 0, "A: it covers nothing it was told to keep clear");
  assertTailFacesSubject(placement, size, subject, "A");
}

// ---------------------------------------------------------------------------
// B. The same title with the menu open. Measured panel: 8,27 190x686.
// The old placer centred the balloon on the panel: 210,321, which is 294px from
// the title it explains.
{
  const subject = { left: 8, top: 3, width: 34, height: 24 };
  const size = { width: 300, height: 73 };
  const panel = rect(8, 27, 190, 686, PANEL_WEIGHT);
  const keepClear = [
    rect(8, 3, 34, 24, SUBJECT_WEIGHT),
    panel,
    rect(43, 3, 77, 24, PEER_WEIGHT),
    rect(224, 3, 80, 24, PEER_WEIGHT),
    rect(320, 3, 51, 24, PEER_WEIGHT),
  ];
  const placement = placeBalloonHelp({ subject, keepClear, field: FIELD, size });
  const rectangle = box(placement, size);

  test.assert(!overlaps(rectangle, panel), "B: an open menu is not covered by the balloon explaining its title");
  test.assert(Math.abs(rectangle.top - subject.top) <= 40, "B: the balloon stays level with the title, not with the middle of the menu");
  // The anchor-centred placer put the balloon at 210,321: 479px from the middle
  // of the title, and 294px below it.
  test.assert(placement.distance < 400, "B: it is much nearer the title than the anchor-centred placer's 479px");
  assertTailFacesSubject(placement, size, subject, "B");
}

// ---------------------------------------------------------------------------
// C. A command inside that open menu. Measured subject: 14,256 178x30.
// The balloon belongs beside its own command, not beside the middle of the menu.
{
  const subject = { left: 14, top: 256, width: 178, height: 30 };
  const size = { width: 300, height: 56 };
  const panel = rect(8, 27, 190, 686, PANEL_WEIGHT);
  const keepClear = [rect(14, 256, 178, 30, SUBJECT_WEIGHT), panel];
  const placement = placeBalloonHelp({ subject, keepClear, field: FIELD, size });
  const rectangle = box(placement, size);

  test.assert(!overlaps(rectangle, panel), "C: a command's balloon does not cover the menu the command is in");
  const tail = tailPoint(placement, size);
  test.assert(tail.y >= subject.top - 4 && tail.y <= subject.top + subject.height + 4, "C: the tail points at that command's own row");
  assertTailFacesSubject(placement, size, subject, "C");
}

// ---------------------------------------------------------------------------
// D. A desktop icon in the icon column, which is where the touch hint
// "Tap again to open." appears. Measured: subject 1174,214 84x88 · balloon
// 1136,314 134x40 · the next icon 1174,306 84x88, completely covered — on a
// touch screen, by the thing the finger reaches for next.
{
  const subject = { left: 1174, top: 214, width: 84, height: 88 };
  const size = { width: 134, height: 40 };
  const iconAbove = rect(1174, 126, 84, 88, PEER_WEIGHT);
  const iconBelow = rect(1174, 306, 84, 88, PEER_WEIGHT);
  const keepClear = [rect(1174, 214, 84, 88, SUBJECT_WEIGHT), iconAbove, iconBelow];
  const placement = placeBalloonHelp({ subject, keepClear, field: FIELD, size });
  const rectangle = box(placement, size);

  test.assert(!overlaps(rectangle, iconBelow), "D: the hint does not cover the next icon in the column");
  test.assert(!overlaps(rectangle, iconAbove), "D: nor the one above it");
  test.assert(placement.overlap === 0, "D: a column of icons still leaves the balloon somewhere clear");
  assertTailFacesSubject(placement, size, subject, "D");
}

// ---------------------------------------------------------------------------
// E. A window's close box: the balloon must not cover the title or the other
// three title-bar controls.
{
  const subject = { left: 60, top: 120, width: 16, height: 16 };
  const size = { width: 220, height: 52 };
  const title = rect(120, 118, 300, 20, PEER_WEIGHT);
  const zoom = rect(560, 120, 16, 16, PEER_WEIGHT);
  const shade = rect(536, 120, 16, 16, PEER_WEIGHT);
  const keepClear = [rect(60, 120, 16, 16, SUBJECT_WEIGHT), title, zoom, shade];
  const placement = placeBalloonHelp({ subject, keepClear, field: FIELD, size });
  const rectangle = box(placement, size);

  test.assert(!overlaps(rectangle, title), "E: a close box explains itself without covering the window's title");
  test.assert(!overlaps(rectangle, zoom) && !overlaps(rectangle, shade), "E: nor the other title-bar controls");
  assertTailFacesSubject(placement, size, subject, "E");
}

// ---------------------------------------------------------------------------
// F. A phone in portrait. The menu is position:fixed and nearly full width
// (60-responsive.css), so the balloon has to leave the whole upper screen.
{
  const field = { left: 10, top: 10, right: 365, bottom: 802 };
  const subject = { left: 8, top: 4, width: 34, height: 20 };
  const size = { width: 260, height: 92 };
  const panel = rect(4, 28, 367, 420, PANEL_WEIGHT);
  const keepClear = [rect(8, 4, 34, 20, SUBJECT_WEIGHT), panel];
  const placement = placeBalloonHelp({ subject, keepClear, field, size });
  const rectangle = box(placement, size);

  test.assert(!overlaps(rectangle, panel), "F: on a phone the balloon leaves the full-width menu panel");
  test.assert(
    rectangle.left >= field.left && rectangle.top >= field.top
      && rectangle.right <= field.right && rectangle.bottom <= field.bottom,
    "F: and stays completely inside the screen",
  );
}

// ---------------------------------------------------------------------------
// G. Nothing in the way: the balloon keeps the familiar callout below the
// object. The repair must not move balloons that were never misplaced.
{
  const subject = { left: 600, top: 300, width: 120, height: 24 };
  const size = { width: 240, height: 48 };
  const keepClear = [rect(600, 300, 120, 24, SUBJECT_WEIGHT)];
  const placement = placeBalloonHelp({ subject, keepClear, field: FIELD, size });

  test.assert(placement.from === "below", "G: with room on every side the balloon still hangs below its object");
  test.assert(placement.top === 336, "G: one gap below, exactly as before");
  test.assert(placement.side === "below", "G: and the tail stays on top, pointing up at the object");
}

// ---------------------------------------------------------------------------
// The wiring that the pure function cannot prove.
const balloon = source;
const foundation = read("styles/00-foundation.css");
const appEntry = read("app.js");
const actions = read("app/core/actions.js");

test.assertIncludes(balloon, "function refreshBalloonHelpPlacement()", "a showing balloon can be re-placed when the world moves under it");
test.assertIncludes(appEntry, "refreshBalloonHelpPlacement()", "pulling a menu down re-places the balloon instead of waiting for the pointer");
test.assertIncludes(actions, "refreshBalloonHelpPlacement()", "closing the menus re-places it too");
test.assertIncludes(balloon, "function rememberBalloonHelpPanelSizes()", "a panel is measured while it is open, so the closed panel can be predicted next time");
test.assertIncludes(balloon, "forgetBalloonHelpPanelSizes();", "a language switch drops sizes measured from the other language's menus");
test.assertIncludes(balloon, "BALLOON_HELP_NARROW_WIDTH = 200", "near beats wide: the balloon narrows before it travels");
test.assertIncludes(foundation, "var(--balloon-help-max-width,", "the stylesheet lets the placer narrow it");
test.assertNotIncludes(balloon, "function balloonHelpAnchorRect", "the single anchor that had to be three things at once is gone");

test.finish();
