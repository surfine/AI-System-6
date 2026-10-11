// Unified spec (2026-10-10) M01–M04 contract: media anchors and explorable
// explanations. M01: region anchors declare what the model actually saw,
// demand context for a rectangle, and keep OCR candidates as candidates. M02:
// question ranges freeze at submit; subtitle/visual/audio evidence kinds make
// different claims — subtitles alone never saw the picture. M03: reading
// pauses at the held position for a question and resumes only by the reader.
// M04: four finite templates, deterministic arithmetic with a named formula,
// model structure only, prose fallback when no template fits. Drives the REAL
// lazy module.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("media-reading-m0104");
const source = read("app/features/media-reading.js");

const context = { console, String, Number, JSON, Math, Array, Object, Set, Map, Error, Boolean, Promise, Date, RegExp };
context.globalThis = context; context.window = context;
context.clioRunHash = (t) => "h";
vm.createContext(context);
vm.runInContext(source, context, { filename: "media-reading.vm.js" });
const api = context.window.AISystem6MediaReading;
test.assert(!!api && typeof api.buildRegionAnchor === "function" && typeof api.compute === "function",
  "the media module installs its full surface");

// --- M01: region anchors.
const anchor = api.buildRegionAnchor({
  pageIndex: 0, box: [10, 20, 200, 100], originalWidth: 800, originalHeight: 600,
  sawWholeImage: false, context: ["legend", "axis-x"],
});
test.assert(!!anchor && anchor.sawWholeImage === false && anchor.contextSufficient === true,
  "a region anchor declares what the model saw and carries its context");
const naked = api.buildRegionAnchor({
  box: [10, 20, 200, 100], originalWidth: 800, originalHeight: 600, sawWholeImage: false,
});
test.assert(naked.contextSufficient === false,
  "a rectangle without legend/axis/footnote context says so");
test.assert(api.buildRegionAnchor({ box: [750, 20, 200, 100], originalWidth: 800, originalHeight: 600 }) === null,
  "a box outside the image is refused");
test.assert(api.buildRegionAnchor({ box: [10, 20], originalWidth: 800, originalHeight: 600 }) === null,
  "a malformed box is refused");

// OCR keeps candidates instead of guessing.
const ocr = api.ocrCandidates("预算 1200 万", [{ at: 3, options: ["2", "3"] }]);
test.assert(ocr.includes("[2|3]"), "an uncertain digit keeps its candidates inline");
test.assert(api.ocrCandidates("abc", [{ at: 99, options: ["x"] }]) === "abc",
  "an out-of-range candidate changes nothing");
test.assert(api.ocrCandidates("abc", [{ at: 0, options: [] }]) === "abc",
  "a candidate with no options changes nothing");

// --- M02: frozen ranges and honest evidence scopes.
const range = api.freezeQuestionRange({ startMs: 12000, endMs: 45000 });
test.assert(!!range && range.frozen === true && range.startMs === 12000,
  "the question range freezes at submit");
test.assert(api.freezeQuestionRange({ startMs: 50000, endMs: 45000 }) === null,
  "an inverted range is refused");
const subs = api.evidenceScope("subtitles-only");
test.assert(subs.sawPicture === false && subs.claim.includes("只依据字幕"),
  "subtitles alone never claim the picture was seen");
const visual = api.evidenceScope("visual");
test.assert(visual.sawPicture === true && visual.sawFullMotion === false && visual.heardAudio === false,
  "frames claim the picture, not full motion or audio");
const audio = api.evidenceScope("audio-track");
test.assert(audio.heardAudio === true && audio.sawPicture === false,
  "the audio track claims hearing, not seeing");
test.assert(api.evidenceScope("vibes") === null, "an invented evidence kind is refused");

// --- M03: read aloud pauses and holds.
const session = api.createReadAloudSession({ paragraphId: "p-3", sentenceIndex: 4 });
test.assert(!!session && session.state === "reading", "a session starts reading where it was pointed");
const paused = api.pauseForQuestion(session, "q-9");
test.assert(paused.state === "paused" && paused.pausedForQuestion === "q-9"
  && paused.heldAt.sentenceIndex === 4,
  "a question pauses at the held position");
test.assert(api.pauseForQuestion(paused, "q-10") === paused,
  "a paused session does not re-pause");
const resumed = api.resumeReading(paused);
test.assert(resumed.state === "reading" && resumed.paragraphId === "p-3" && resumed.sentenceIndex === 4
  && resumed.pausedForQuestion === null,
  "resume returns to the held position — the reader's own act");
test.assert(api.resumeReading(session) === null,
  "a reading session cannot resume (it never paused)");
test.assert(api.createReadAloudSession({ paragraphId: "  " }) === null,
  "a session without its paragraph is refused");

// --- M04: finite templates, deterministic arithmetic.
test.assert(Object.keys(api.TEMPLATES).length === 4
  && !!api.TEMPLATES["ratio-compare"] && !!api.TEMPLATES.timeline,
  "the four templates are the list");
const ratio = api.compute("ratio-compare", {
  leftValue: 1200, rightValue: 300, leftLabel: "全年预算", rightLabel: "单季预算",
});
test.assert(ratio.ok === true && ratio.result === 4 && ratio.formula === "1200 ÷ 300 = 4",
  "the arithmetic is this code's, with the formula named");
const convert = api.compute("unit-convert", { value: 2, fromUnit: "光年", toUnit: "分钟" });
test.assert(convert.ok === false && convert.reason === "no-rate",
  "a conversion without a tabulated rate is refused — no invented math");
const convert2 = api.compute("unit-convert", { value: 2, fromUnit: "小时", toUnit: "分钟" });
test.assert(convert2.ok === true && convert2.result === 120 && convert2.formula === "2 × 60 = 120",
  "a tabulated rate computes deterministically");
const timeline = api.compute("timeline", { events: [{ when: "2026-01", what: "立项" }] });
test.assert(timeline.ok === true && timeline.structure[0].what === "立项",
  "structure templates pass the model's data through as data");
test.assert(api.compute("ratio-compare", {
  leftValue: "很多", rightValue: 3, leftLabel: "甲", rightLabel: "乙",
}).reason === "non-numeric",
  "non-numeric values are refused before any arithmetic");
test.assert(api.compute("made-up", {}).reason === "unknown-template",
  "an invented template is refused");
const fallback = api.proseFallback("template-not-applicable");
test.assert(fallback.fallbackToProse === true,
  "the fallback returns to prose — never a forced visualization");

test.finish();
