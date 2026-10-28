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
// And the wiring rules that keep the wheel a guest in the room: it mounts
// only on wide rooms (the CSS owns that), its commits click the key it named
// rather than opening a second submit path, and its focus is an attribute on
// the keys the eye already knows.

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
test.assertIncludes(read("app/data/translations-zh.js"), 'one_more_tune_wheel_replay: "重听"',
  "the scrub's centre has its own name in both languages");
test.assertMatches(source, /ring\.setAttribute\("aria-label", handlers\.ringAria \|\| ""\)/,
  "the ring carries its own accessible name, not a borrowed one");

test.finish();
