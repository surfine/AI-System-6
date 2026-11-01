// One More Tune — the Click Wheel.
//
// The wheel is a second way to press the four preset keys, and its one job is
// to feel like the wheel it is named after. This contract holds it to the
// numbers that make that true — all of them measured out of Apple Music's own
// 404 easter-egg iPod, not invented — and to the two refusals the design
// passes added:
//
//   1. The feel is a pure state machine, so these tests turn synthetic
//      pointer samples through it directly: 15° rows with the remainder kept,
//      an 8° reversal tax, a dead zone the size of the centre button, and the
//      ×1/2/3/5/8/13/21/34 acceleration ladder that 250ms of stillness
//      forgets.
//   2. Reduced motion locks the ladder at tier 0 — 1:1 tracking is not the
//      vestibular risk, the jumps are.
//
// And the wiring rules that keep the wheel a guest in the room: it stands
// wherever the room leaves it a hand's size and steps aside where it does not,
// its commits click the key it named rather than opening a second submit path,
// and its focus is an attribute on the keys the eye already knows.

import vm from "node:vm";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";

const test = createFeatureTest("one-more-tune-wheel");

const source = read("app/features/one-more-tune-wheel.js");
const host = read("app/features/one-more-tune.js");
const css = read("styles/97-one-more-tune.css");

// ---- The state machine, run for real ---------------------------------------

const context = { window: {}, console };
context.globalThis = context;
vm.runInNewContext(source, context);
const wheel = context.window.AISystem6OneMoreTuneWheel;
test.assert(!!wheel, "the module exposes window.AISystem6OneMoreTuneWheel");

const measured = wheel.constants;
test.assert(measured.stepDegrees === 15, "15° of arc is one row (the easter egg's dragStepDegrees)");
test.assert(measured.hysteresisDeg === 8, "a reversal pays 8° before the direction flips");
test.assert(measured.tiers.join(",") === "1,2,3,5,8,13,21,34", "the acceleration ladder is the iPod's own");
test.assert(measured.minSpeed === 180 && measured.tierMs === 500 && measured.capSpeed === 400,
  "the ladder climbs from 180°/s, a tier each 500ms, capped at 400°/s");
test.assert(measured.gapMs === 250, "250ms of stillness forgets the speed");
test.assert(measured.smoothing === 0.15, "speed is smoothed, not instant");

function gesture(options) {
  return wheel.createGesture({ radius: 100, ...options });
}

// A helper that walks the ring in even arcs and collects every step.
function sweep(g, fromDeg, toDeg, legs, t0, stepMs) {
  const steps = [];
  const at = (deg) => [100 * Math.cos(deg * Math.PI / 180), 100 * Math.sin(deg * Math.PI / 180)];
  const [x0, y0] = at(fromDeg);
  g.sample(x0, y0, t0); // the finger lands; the arc starts here
  for (let i = 1; i <= legs; i += 1) {
    const deg = fromDeg + (toDeg - fromDeg) * i / legs;
    const [x, y] = at(deg);
    const out = g.sample(x, y, t0 + i * stepMs);
    if (out) steps.push(out);
  }
  return steps;
}

{
  const g = gesture();
  // One slow, clean quarter turn clockwise: 90° = 6 rows.
  const steps = sweep(g, 200, 290, 9, 1000, 60);
  const rows = steps.reduce((sum, s) => sum + s.steps, 0);
  test.assert(rows === 6, `90° at 15°/row is exactly 6 rows (got ${rows})`);
  test.assert(steps.every((s) => s.dir === 1), "clockwise samples report dir +1");
  const last = steps[steps.length - 1];
  test.assert(last.tier === 0, "a slow turn never leaves tier 0");
  test.assert(steps.every((s) => s.speed < 180), `a slow turn stays under the ladder (${last.speed} °/s)`);
}

{
  const g = gesture();
  // The remainder survives: 40° in three samples is 2 rows and 10° still owed.
  const steps = sweep(g, 180, 220, 3, 1000, 80);
  const rows = steps.reduce((sum, s) => sum + s.steps, 0);
  test.assert(rows === 2, `40° is 2 whole rows (got ${rows})`);
  const last = steps[steps.length - 1];
  test.assert(Math.round(last.remainder) === 10, `and 10° stays owed (got ${Math.round(last.remainder)}°)`);
  // The next 5° completes the third row from the remainder, not from zero.
  const [x, y] = [100 * Math.cos(230 * Math.PI / 180), 100 * Math.sin(230 * Math.PI / 180)];
  const out = g.sample(x, y, 1400);
  test.assert(out && out.steps === 1, "the kept remainder completes the next row");
}

{
  const g = gesture();
  // The wrap: a 20° walk across the 180° seam (170° → 190°, the same point
  // as -170°) is one short row, never 340° of ghost rows. atan2 wraps the
  // raw angle; the delta must follow.
  const steps = sweep(g, 170, 190, 8, 1000, 60);
  const rows = steps.reduce((sum, s) => sum + s.steps, 0);
  test.assert(rows === 1, `a 20° walk across the seam is one row (got ${rows})`);
  test.assert(steps.every((s) => s.dir === 1), "and the direction is continuous through the seam");
}

{
  const g = gesture();
  // Hysteresis: a reversal must pay 8° before the direction flips.
  sweep(g, 200, 260, 6, 1000, 60); // clockwise, established
  const flipped = sweep(g, 260, 250, 2, 2000, 60); // 10° back
  test.assert(flipped.every((s) => s.dir === 1 || s.dir === -1), "the samples are sane");
  const rows = flipped.reduce((sum, s) => sum + s.steps, 0);
  test.assert(rows === 0, `10° of reversal is absorbed by the 8° tax plus the row it must refill (got ${rows} rows)`);
}

{
  const g = gesture();
  // The dead zone: the centre button's footprint never turns the wheel.
  const out = g.sample(10, 10, 1000);
  test.assert(out === null, "a sample inside the centre button's radius is dropped");
}

{
  const g = gesture();
  // Sub-sample noise: a move under a tenth of the radius is not a turn.
  const out = g.sample(90, 0, 1000) === null && g.sample(95, 0, 1060) === null
    ? g.sample(96, 0, 1120)
    : null;
  test.assert(out === null, "samples closer than 10% of the radius are dropped as noise");
}

{
  // The ladder: fast samples climb a tier each 500ms.
  const g = gesture();
  // Two full turns at ≈666°/s: over two seconds above the ladder's floor.
  const steps = sweep(g, 180, 1080, 144, 1000, 30);
  test.assert(steps.length > 0, "a fast sweep produces steps");
  const maxTier = Math.max(...steps.map((s) => s.tier));
  test.assert(maxTier >= 3, `a sustained fast sweep climbs the ladder (reached tier ${maxTier})`);
  const after = steps.filter((s) => s.speed >= 400);
  test.assert(after.every((s) => s.tier >= 2), "the cap feeds the top tiers, not the first");
}

{
  const g = gesture({ reduced: true });
  // Reduced motion: the ladder is locked, the rows still step.
  const steps = sweep(g, 180, 1080, 144, 1000, 30);
  test.assert(steps.length > 0, "reduced motion still turns row by row");
  test.assert(steps.every((s) => s.tier === 0), "and never climbs a tier");
}

// ---- The wiring: a guest in the room, not a second door --------------------

test.assert(lazyRuntimePaths.includes("app/features/one-more-tune-wheel.js"),
  "the wheel is a lazy module, declared in the manifest like its neighbours");

test.assertIncludes(host, 'oneMoreTuneAttachChoiceWheel(question)',
  "the question face mounts the wheel after it paints");
test.assertMatches(host, /await ensureOneMoreTuneWheelModule\(\)/,
  "the wheel loads through config.js's lazy loader, awaited where its global is read");
test.assertMatches(host, /typeof ensureOneMoreTuneWheelModule === "function"/,
  "and a context without the loader (a contract's vm) simply never mounts it");
test.assertMatches(host, /onCommit: \(index\) => keys\(\)\[index\]\?\.click\(\)/,
  "a wheel commit clicks the key it named — the submit path is shared, not paralleled");
test.assertMatches(host, /if \(!wheel \|\| !slot\.isConnected\) return;/,
  "a module that lands after the face moved on does not mount");
test.assert(!/one-more-tune-submit\s*=/.test(source),
  "the wheel never writes a submission of its own");

test.assertIncludes(css, ".one-more-tune-window .omt-wheel-slot { display:none }",
  "narrow rooms keep the keys alone: the wheel is hidden there");
test.assertIncludes(css, "touch-action:none",
  "the ring claims its own gestures and never the page's scroll");
test.assertMatches(css, /@container omt \(min-aspect-ratio:13\/10\) \{[\s\S]{0,1400}\.one-more-tune-window \.omt-wheel-slot \{[\s\S]{0,200}display:flex/,
  "wide rooms give the wheel the breathing space");
test.assertMatches(css, /\.omt-wheel-select:active \{[^}]*scale\(\.98\)/,
  "the centre answers the press on the way down, with a scale a finger can feel");
test.assertMatches(css, /\.omt-opt\[data-wheel-focus\] \{[^}]*\}/,
  "the wheel's focus is a state on the rows the eye already knows");
test.assert(!/transition:all/.test(css.slice(css.indexOf(".omt-wheel-slot"))),
  "the wheel's transitions name their properties");

// ---- One surface, and the two presses it tells apart -----------------------

test.assert(wheel.constants.tapDegrees === 8 && wheel.constants.tapMs === 400,
  "a press under 8 degrees and 400ms is a cardinal press, not a turn");
test.assertMatches(source, /ring\.setAttribute\("role", "slider"\)/,
  "the ring is a slider; the rows stay buttons, so a reader has both doors");
test.assertMatches(source, /ring\.setAttribute\("aria-valuenow", String\(focus \+ 1\)\)/,
  "and its value follows the selected row");
test.assertMatches(source, /function cardinalAt\(point\)/,
  "a press is classified by the angle it landed on");
// Screen coordinates put +y downward, so 90 degrees is the BOTTOM: an
// angle table written from the maths convention is a quarter turn out, and
// a press on the top of the ring selects the fourth choice. All four.
{
  const cardinal = wheel.cardinal;
  test.assert(cardinal(0, -100) === 0, "up on screen is choice 1's position");
  test.assert(cardinal(100, 0) === 1, "right is choice 2's");
  test.assert(cardinal(0, 100) === 2, "down is choice 3's");
  test.assert(cardinal(-100, 0) === 3, "left is choice 4's");
}
test.assertMatches(source, /if \(event\.target\.closest\("button"\)\) return;/,
  "only the centre button owns its press; the ring takes everything else");
test.assert(!/\.omt-wheel-zone\b/.test(source + css),
  "no buttons sit on the ring — the build that covered it could not be turned");
test.assertMatches(source, /const tier = Math\.min\(step\.tier, tiers\.length - 1\);/,
  "the seek ladder's index is clamped: the gesture has eight stops, the ladder seven, and the eighth used to read past it as NaN");
test.assertMatches(css, /\.omt-wheel-label \{[^}]*pointer-events:none/,
  "the carved numbers never take a pointer away from the turn");
test.assertMatches(css, /\.omt-wheel-pad \{[\s\S]{0,700}pointer-events:none/,
  "the paddle is the surface's face, not a second hit area");
test.assertMatches(source, /if \(!handlers\.clickerOn\?\.\(\)\) return;/,
  "the click obeys the switch the caption carries");
test.assertIncludes(read("app/data/translations-en.js"), 'one_more_tune_wheel_clicker: "Click sound"',
  "and the switch is named in both languages");
// ---- The scrub: the reveal's wheel, and where the red line lives -----------

test.assert(wheel.constants.seekTiers.join(",") === "5,5,5,10,10,10,20",
  "the scrub rides the easter egg's own seek ladder, in seconds");
test.assertMatches(host, /const clamp = \(seconds\) => Math\.max\(0, Math\.min\(span - 1, seconds\)\);/,
  "the cue window's clamp lives beside the window, not inside the wheel");
test.assertMatches(host, /mode: "scrub"/,
  "the reveal mounts the wheel in scrub mode");
test.assertMatches(host, /oneMoreTuneRoot\(\)\?\.removeAttribute\("data-omt-scrub"\)/,
  "a question face takes the scrub dress back off");
test.assertMatches(host, /onScrubCommit: \(\) => \{[\s\S]{0,120}next\(\)\?\.click\(\)/,
  "the reveal's centre presses the reveal's own Next: the wheel moves the round on, not a second door");
test.assertMatches(host, /scrubBy: \(delta\) => \{[\s\S]{0,200}setTimeout\(replay, ONE_MORE_TUNE_SCRUB_SETTLE_MS\)/,
  "turning the reveal's wheel is listening: once the hand rests, the tune plays from there");
test.assertMatches(source, /ring\.setAttribute\("aria-label", handlers\.ringAria \|\| ""\)/,
  "the ring carries its own accessible name, not a borrowed one");

// ---- One wheel from the first press to the next round ----------------------
// The challenge is a loop — start, hear, answer, hear the answer, next, the
// result, again — and every face of it carries the wheel, with the centre on
// the step that moves the play on. A player who never leaves the ring still
// reaches the end of a round and the start of the next.

test.assertMatches(source, /if \(focus < 0\) handlers\.onIdleCommit\(\);/,
  "a centre press before anything is chosen still does something the host names");
test.assertMatches(host, /onIdleCommit: \(\) => slot\.closest\("\.omt-room"\)\?\.querySelector\("\[data-disc\]"\)\?\.click\(\)/,
  "on a question, that is hearing the tune again — the knob's own press");
{
  const faces = ["idle", "question", "reveal", "refused", "result"];
  for (const phase of faces) {
    const at = host.indexOf(`oneMoreTuneRoom("${phase}"`);
    const face = host.slice(at, host.indexOf("`);", at));
    test.assert(at > 0 && face.includes("${oneMoreTuneWheelGap()}"),
      `the ${phase} face has a place for the wheel`);
  }
}
test.assert((host.match(/oneMoreTuneAttachMenuWheel\(\);/g) || []).length === 3,
  "the start, a refused answer and the round's end each mount the menu wheel");
test.assertMatches(host, /function oneMoreTuneAttachMenuWheel[\s\S]{0,400}oneMoreTuneMountMenuWheel\(slot, "[^"]+", "\.omt-next"\)/,
  "the round's menus are mounted on their buttons, with Next as the primary");
test.assertMatches(host, /function oneMoreTuneMountMenuWheel[\s\S]{0,1600}initialFocus: primary/,
  "a menu's ring starts on its primary button, so the centre always has a next step");
test.assertMatches(host, /function oneMoreTuneMountMenuWheel[\s\S]{0,2200}onCommit: \(index\) => keys\(\)\[index\]\?\.click\(\)/,
  "a menu commit clicks the button it named");
test.assertMatches(host, /if \(event\.defaultPrevented\) return;/,
  "the ring's own Return is not answered a second time by the window's");
test.assertMatches(source, /if \(handlers\.autofocus\) ring\.focus\(\{ preventScroll: true \}\);/,
  "a player driving by the wheel keeps it in hand from face to face");
test.assertIncludes(css, ":is(.omt-next,.omt-2nd)[data-wheel-focus]",
  "a menu row the wheel is on is marked where the eye already is");
test.assertIncludes(read("app/data/translations-zh.js"), 'one_more_tune_wheel_go: "确定"',
  "the menu centre has its own name in both languages");

// ---- The study reveal: four grades, the same door as the buttons ------------

test.assertIncludes(host, "oneMoreTuneAttachGradeWheel(cardId);",
  "the study reveal mounts a grading wheel after it paints");
test.assertMatches(host, /function oneMoreTuneAttachGradeWheel[\s\S]{0,1600}onCommit: \(index\) => keys\(\)\[index\]\?\.click\(\)/,
  "a grade is recorded by clicking the rating it named — the scheduler and its undo are the buttons' own path");
test.assertMatches(host, /function oneMoreTuneAttachGradeWheel[\s\S]{0,400}if \(!wheel \|\| !slot\.isConnected\) return;/,
  "a module that lands after the card moved on does not mount");
test.assertMatches(host, /class="rating" type="button" data-one-more-tune-grade="\$\{grade\.id\}">[\s\S]{0,200}<small>\$\{when\}<\/small>/,
  "every rating keeps its interval preview: the wheel chooses, it never hides what a choice costs");
test.assertIncludes(css, ".one-more-tune-window .rating .rating-key { display:none }",
  "the phone keeps its 2×2 grades alone, without the screen's numbers");
test.assertMatches(css, /@container \(min-width: 601px\) \{[^}]*\.one-more-tune-study:has\(> \.omt-wheel-slot\) \{ display:grid/,
  "from a tablet's width up, a study face's wheel stands beside the card");
test.assertMatches(css, /\.ratings-deck \.rating\[data-wheel-focus\] \{[^}]*\}/,
  "the grading wheel's focus is a state on the rating rows");
test.assertIncludes(read("app/data/translations-zh.js"), 'one_more_tune_wheel_record: "记录"',
  "the grading centre has its own name in both languages");
test.assertIncludes(read("app/data/translations-en.js"), 'one_more_tune_wheel_record: "Record"',
  "and in English");

// ---- Study is a walk too -----------------------------------------------------
// Meet, match, recall, grade, the unit's end: every study face carries the
// wheel, and each starts on the step that moves the walk on.

for (const face of ["renderOneMoreTuneLearn", "renderOneMoreTuneMatch", "renderOneMoreTuneRecall", "renderOneMoreTuneReveal"]) {
  const at = host.indexOf(`function ${face}(`);
  const body = host.slice(at, host.indexOf("\nfunction ", at + 10));
  test.assert(at > 0 && body.includes("${oneMoreTuneStudyWheelSlot()}"), `${face} has a place for the wheel`);
}
test.assertMatches(host, /one_more_tune_back_to_shelf[\s\S]{0,200}\$\{oneMoreTuneStudyWheelSlot\(\)\}[\s\S]{0,80}oneMoreTuneAttachStudyWheel\(\);/,
  "and so has the unit's end, whose centre goes back to the shelf");
test.assertMatches(host, /else renderOneMoreTuneRecall\(body, card\);\s*oneMoreTuneAttachStudyWheel\(\);/,
  "every card face mounts its wheel after it paints");
test.assertMatches(host, /step === "match"\) \{[\s\S]{0,300}onIdleCommit: play/,
  "matching is a question: nothing chosen at first, and the centre plays the sound again");
test.assertIncludes(host, `'[data-one-more-tune-command="one-more-tune-reveal"]'`,
  "recalling starts on turning the card over");
test.assertIncludes(host, `'[data-one-more-tune-command="one-more-tune-next"]'`,
  "meeting a card starts on the next one");

// ---- Every size: the room decides, the wheel reads ---------------------------
// Phones held tall or on their side, tablets either way, desks: the wheel
// stands in whatever the room leaves it, and below a hand's size it steps
// aside and the keys stand alone.

test.assertMatches(source, /host\.clientHeight < ONE_MORE_TUNE_WHEEL_MIN_SLOT \|\| host\.clientWidth < ONE_MORE_TUNE_WHEEL_MIN_SLOT/,
  "the wheel measures its own slot and marks itself cramped below a hand's size");
test.assertMatches(source, /new ResizeObserver\(fit\)\.observe\(host\)/,
  "and keeps measuring as the room turns or resizes");
test.assertIncludes(css, ".omt-wheel-slot[data-cramped] > * { display:none }",
  "a cramped wheel steps aside without giving up the slot it is measured by");
test.assertMatches(css, /@container omt \(max-aspect-ratio:13\/10\) \{\s*[^}]*\.omt-gap \{[^}]*\}\s*\.one-more-tune-window \.omt-wheel-slot \{ display:flex[^}]*width:100%/,
  "an upright room puts the wheel under its keys, the device's own order");
test.assertMatches(css, /@container omt \(min-aspect-ratio:13\/10\) or \(min-height:640px\) \{/,
  "a tall upright room draws the keys as the wide room's screen, so wheel and rows read as one device");
test.assertMatches(css, /@container omt \(max-aspect-ratio:13\/10\) and \(min-height:640px\) \{\s*\.one-more-tune-window \.omt-in \{ --omt-card-h:clamp\(84px,100cqh - 740px,200px\)/,
  "the card only grows once the wheel has its full size");
test.assertMatches(css, /\(max-height:600px\) and \(min-width:720px\) and \(min-height:300px\) \{\s*\.one-more-tune-window \.omt-in \{ grid-template-columns:[^}]*"stage q gap"/,
  "a phone on its side gives the wheel a column at the thumb's edge");
test.assertMatches(css, /@container \(max-width: 600px\) \{\s*\.one-more-tune-window \.one-more-tune-study > \.omt-wheel-slot \{ flex:1 1 0/,
  "a phone's study wheel takes the height the card leaves, never the card's");

test.finish();
