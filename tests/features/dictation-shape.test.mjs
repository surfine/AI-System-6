// The shape of speech — structure only, never a word.
//
// Dictated text has no shape, and giving it one is what the person who just
// stopped talking least wants to do. This command does it locally: it inserts
// line breaks and nothing else. The competing products in this space do the
// opposite — they delete filler, repair false starts, tighten clauses — which
// is the one thing this product forbids, so the promise is enforced in code
// rather than in a prompt, and enforced here rather than in a comment.
//
// The module is pure text, so it runs in a bare vm. Halfway down, the shaper is
// swapped for a word-changing one to prove the gate actually stops it.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("dictation-shape");
const source = read("app/core/dictation-shape.js");
const pad = read("app/features/dictation-pad.js");
const config = read("app/core/config.js");
const manifest = read("tooling/runtime-manifest.mjs");
const wireup = read("app/core/wireup.js");
const handles = read("app/core/dom-handles.js");
const appJs = read("app.js");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// ---- The module is a pure text layer, and stays one -------------------------

test.assertNotIncludes(source, "document.", "the shaper never touches the DOM");
test.assertNotIncludes(source, "fetch(", "the shaper never reaches a model");
test.assertNotIncludes(source, "t(\"", "the shaper never touches translations");
test.assertIncludes(source, "function dictationShapeIsVerbatim", "the verbatim gate lives with the shaper");
test.assertIncludes(source, "function shapeDictationText", "one door, and it may return null");

// ---- It is not a model, and it is not a rewriter ----------------------------

test.assertIncludes(manifest, '"app/core/dictation-shape.js"', "the shaper is a lazy module, not boot weight");
test.assertNotIncludes(manifest, 'appModulePaths = [\n  "app/core/dictation-shape.js"', "the shaper does not enter the boot bundle");
test.assertIncludes(
  config,
  '"app/core/dictation-shape.js",\n  "app/features/dictation-pad.js",',
  "the shaper travels with the pad that calls it",
);
test.assertIncludes(wireup, "withDictationPad(() => shapeDictationTranscript())", "a boot-time control resolves the lazy command at click time");
test.assertNotMatches(wireup, /addEventListener\("click", shapeDictationTranscript\)/, "no bare reference to the lazy command survives at boot");
test.assertIncludes(handles, 'const dictationShapeButton = document.querySelector("#dictation-shape");', "the Shape control has a DOM handle");
test.assertIncludes(handles, "    dictationShapeButton,", "the handle leaves dom-handles");
test.assertIncludes(appJs, "  dictationShapeButton,", "the handle is destructured, or boot dies while every other test stays green");
test.assertIncludes(html, 'id="dictation-shape" data-i18n="dictation_shape"', "the Dictation Pad carries the Shape command");

// The command is explicit and undoable, never automatic.
test.assertIncludes(pad, "function shapeDictationTranscript", "shaping is a command the writer presses");
test.assertIncludes(pad, "mdeApply(dictationRawInput", "shaping goes through execCommand, so Cmd+Z puts the run-on back");
test.assertIncludes(pad, 't("dictation_shape_refused")', "a refused shaping is visible, not silent");
test.assertNotMatches(pad, /onresult[\s\S]{0,400}shapeDictationTranscript/, "recording never shapes behind the writer's back");

test.assertIncludes(en, "Not one word changed", "the English pad says what it did and did not do");
test.assertIncludes(zh, "一个字都没改", "the Chinese pad says what it did and did not do");
test.assertIncludes(en, "dictation_shape_refused:", "English carries the refusal line");
test.assertIncludes(zh, "dictation_shape_refused:", "Chinese carries the refusal line");

// ---- The shaper itself, run for real ---------------------------------------

const context = vm.createContext({});
vm.runInContext(source, context);

// A genuinely messy transcript: filler words, self-interruption, "第一…第二…
// 第三", and one question with its answer stuck to it.
const messy = "嗯那个我先说一下啊其实这个事情吧我们上周就聊过了但是当时没定下来。然后我今天又想了想，怎么说呢，就是emmm我觉得还是得分几步走。第一我们得先把接口定下来，不然后面全白做。第二是排期，我这边其实是有点担心的，因为，就是，测试那边人不够嘛。第三，也不是说一定要这么做啊，就是我建议先做一个小的版本出来看看。那你觉得这个排期靠谱吗？我觉得基本上还行吧，就是可能要加两天缓冲。反正就这样，我先把文档写一下，然后周三我们再对一次。";
const shaped = context.shapeDictationText(messy);

test.assert(shaped !== null, "a messy transcript shapes");
test.assert(shaped.replace(/\n/g, "") === messy, "strip the line breaks and the transcript comes back character for character");
test.assert(shaped !== messy, "shaping actually produced structure");
test.assert(context.dictationShapeBlockCount(shaped) >= 3, "the run becomes several blocks, not one");

// Structure, one kind at a time.
const lines = shaped.split("\n");
test.assert(lines.some((line) => line.startsWith("第一")), "the counted items each get their own line");
test.assert(lines.some((line) => line.startsWith("第二")), "the second item is a line of its own");
test.assert(lines.some((line) => line.startsWith("第三")), "the third item is a line of its own");
test.assert(
  shaped.includes("第一我们得先把接口定下来，不然后面全白做。\n第二"),
  "counted items sit together as one list, not as separate paragraphs",
);
test.assert(
  shaped.includes("那你觉得这个排期靠谱吗？\n我觉得基本上还行吧"),
  "an answer sits directly under its question",
);
test.assert(/\n\n/.test(shaped), "unrelated stretches are separated by a blank line");

// The words this product keeps on purpose, and the competing products delete.
for (const filler of ["嗯那个", "其实", "就是", "emmm", "怎么说呢", "嘛", "啊", "反正"]) {
  test.assert(shaped.includes(filler), `the spoken word "${filler}" survives shaping`);
}

// Speech recognition often returns no punctuation at all. The numbers the
// speaker counted off are then the only boundary there is.
const unpunctuated = "行我就随便讲讲啊第一个事情是我们那个页面加载太慢了第二个是搜索的结果不太准第三个我忘了等我想想";
const shapedRun = context.shapeDictationText(unpunctuated);
test.assert(shapedRun.replace(/\n/g, "") === unpunctuated, "an unpunctuated run stays verbatim");
test.assert(shapedRun.split("\n").length >= 3, "an unpunctuated run still finds its counted items");

// English behaves the same way.
const english = "so um I wanted to say, actually we talked about this last week but nothing was decided. First we have to lock the interface. Second is the schedule, I'm honestly a bit worried. So does the schedule look realistic? I think it's basically fine.";
const shapedEnglish = context.shapeDictationText(english);
test.assert(shapedEnglish.replace(/\n/g, "") === english, "English shaping is verbatim too");
test.assert(shapedEnglish.split("\n").length >= 3, "English finds its structure");
test.assert(shapedEnglish.includes("um"), "an English filler word survives shaping");

// Idempotent: shaping shaped text is a no-op, so pressing twice never drifts.
test.assert(context.shapeDictationText(shaped) === shaped, "shaping already-shaped text changes nothing");
test.assert(context.shapeDictationText(shapedRun) === shapedRun, "shaping an already-shaped run changes nothing");
test.assert(context.shapeDictationText(shapedEnglish) === shapedEnglish, "shaping already-shaped English changes nothing");

// Text the writer already broke into paragraphs keeps its breaks.
const preShaped = "第一句。第二句。\n\n另起一段的话。";
test.assert(context.shapeDictationText(preShaped).includes("\n\n另起一段的话。"), "a line break the writer made is kept");

// Nothing in, nothing out.
test.assert(context.shapeDictationText("") === "", "an empty transcript shapes to an empty transcript");
test.assert(context.shapeDictationText("   ") === "   ", "whitespace is not structure and is left alone");

// ---- The mutation: prove the gate is real, not decorative -------------------
//
// This is the whole contract. Swap the shaper for one that does what the
// dictation cleanup products on the market do — delete the filler words — and
// the gate must throw the entire result away rather than hand the writer a
// tidier version of their own sentence. If this assertion ever passes with a
// non-null result, the promise in the module header is worthless.
const realShaper = context.dictationShapeRun;

context.dictationShapeRun = (text) => String(text).replace(/其实|就是|emmm|怎么说呢/g, "");
test.assert(context.shapeDictationText(messy) === null, "a shaper that deletes filler words is refused outright");

context.dictationShapeRun = (text) => `${String(text)}。`;
test.assert(context.shapeDictationText(messy) === null, "a shaper that adds a single character is refused");

context.dictationShapeRun = (text) => String(text).replace("我觉得还是得分几步走", "建议分步实施");
test.assert(context.shapeDictationText(messy) === null, "a shaper that tightens one clause is refused");

context.dictationShapeRun = (text) => String(text).replace(/。/g, "\n");
test.assert(context.shapeDictationText(messy) === null, "a shaper that converts punctuation into a break is refused");

context.dictationShapeRun = (text) => String(text).replace(/ /g, "\n");
test.assert(context.shapeDictationText(english) === null, "a shaper that swallows a space is refused");

context.dictationShapeRun = () => { throw new Error("shaper exploded"); };
test.assert(context.shapeDictationText(messy) === null, "a shaper that throws lands nothing rather than half a transcript");

// The real shaper still passes with the gate exactly as it stands.
context.dictationShapeRun = realShaper;
test.assert(context.shapeDictationText(messy) === shaped, "the real shaper passes its own gate");

test.finish();
