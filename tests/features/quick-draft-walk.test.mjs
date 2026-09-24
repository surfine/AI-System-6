// Walk intake preserves the writer's words and requires an explicit File
// Floppy confirmation. Exercise the actual pure helpers and intake function.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
const test = createFeatureTest("quick-draft-walk");
const source = read("app/core/walk-transcript.js");
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const walk = context.window.AISystem6WalkTranscript;
const body = "河边屏幕看得清。标记。国行没有本地模型，记一下\n\n  原话里的空格，不改。";
const parsed = walk.parseWalkEnvelope(`【散步】2026-09-25 17:02 · 46 分钟\r\n${body}`);
test.assert(parsed.meta === "2026-09-25 17:02 · 46 分钟" && parsed.body === body, "header removed, internal transcript spacing preserved exactly");
test.assert(walk.parseWalkEnvelope(body).meta === "" && walk.parseWalkEnvelope(body).body === body, "a header is optional");
test.assert(walk.parseWalkEnvelope(`【Walk】2026-9-5 7:02\n${body}`).body === body, "English envelope preserves the same body");
const marks = walk.findSpokenMarks(body);
test.assert(marks.length === 2 && marks[0].quote === "河边屏幕看得清" && marks[1].quote === "国行没有本地模型", "spoken marks keep the immediately preceding completed sentence");
test.assert(marks.every((mark) => body.includes(mark.quote) && body.slice(mark.index).startsWith(mark.word)), "quotes and marker offsets point to exact original substrings");
test.assert(walk.findSpokenMarks("标记。记一下。记下来。mark this").length === 0, "bare markers do not invent quotes");
test.assert(walk.findSpokenMarks("My words, mark this")[0]?.quote === "My words", "English marker preserves its preceding words");
test.assert(walk.findSpokenMarks("这一句、记下来")[0]?.quote === "这一句", "the remaining Chinese marker trims only the trailing separator");
const material = walk.walkMaterialText({ body, marks, labels: { marksHeading: "Marks:", transcriptHeading: "Transcript:" } });
test.assert(material.startsWith("Marks:\n1. 河边屏幕看得清\n2. 国行没有本地模型\n\nTranscript:\n") && material.endsWith(body), "marked quotations precede the complete verbatim transcript");
test.assert(walk.walkMaterialText({ body, marks: [] }) === body, "unmarked material is exactly the original body");
const fileName = walk.walkFileName({ meta: "2026-9-5 7:02", prefix: "Walk" });
test.assert(fileName === "Walk 2026-09-05 07.02.txt" && !/[:/]/.test(fileName), "metadata time yields a portable filename");
test.assert(walk.walkFileName({ now: new Date(2026, 8, 25, 17, 2), prefix: "Walk" }) === "Walk 2026-09-25 17.02.txt", "undated input uses the supplied local clock");

const intake = read("app/features/quick-draft-intake.js");
const functionSource = intake.slice(intake.indexOf("async function returnFromWalk()"), intake.indexOf("async function importChatScreenshots()"));
let answer = "yes";
let input = `【Walk】2026-09-25 17:02\n${body}`;
let mounted = [];
let status = "";
let refreshed = 0;
let fail = false;
const intakeContext = vm.createContext({
  window: context.window,
  File,
  console,
  collectRefs() {},
  t: (key, ...args) => `${key}:${args.join("|")}`,
  showInputDialog: async () => input,
  showSystemModal: async () => answer,
  insertFilesIntoFileFloppy: async (files, options) => {
    if (fail) return null;
    mounted.push({ files, options });
    return { mountedFileNames: [files[0].name] };
  },
  setQuickDraftStatus: (value) => { status = value; },
  activeProjectQuickDraft: () => ({ record: {} }),
  normalizeQuickDraftRecord: (record) => record,
  renderSourceMap: () => { refreshed += 1; },
  updateSourceCount: () => { refreshed += 1; },
});
vm.runInContext(functionSource, intakeContext);
for (const declined of ["cancel", "no", true]) {
  answer = declined;
  test.assert(await intakeContext.returnFromWalk() === false && mounted.length === 0, "only the modal's yes value permits importing");
}
answer = "yes";
test.assert(await intakeContext.returnFromWalk() === true && mounted.length === 1 && refreshed === 2, "confirmed import refreshes sources after a real mount");
test.assert(mounted[0].options.source === "quickDraft" && mounted[0].options.openAfter === "", "import stays in File Floppy without opening another editor");
test.assert((await mounted[0].files[0].text()).endsWith(body), "the actual imported File contains the complete original transcript");
input = "【散步】2026-09-25";
test.assert(await intakeContext.returnFromWalk() === false && status.startsWith("quick_draft_walk_empty"), "header-only input reports empty instead of importing");
input = null;
test.assert(await intakeContext.returnFromWalk() === false && mounted.length === 1, "cancelled input imports nothing");
input = body;
fail = true;
test.assert(await intakeContext.returnFromWalk() === false && status.startsWith("quick_draft_walk_failed"), "failed mount reports failure without claiming success");

const html = read("index.html");
const handoff = read("app/features/quick-draft-handoff.js");
for (const file of ["tooling/runtime-manifest.mjs", "app/core/config.js"]) {
  const contents = read(file);
  test.assertIncludes(contents, '"app/core/walk-transcript.js",\n  "app/features/draft-desk.js"', "walk helpers load immediately before the lazy desk");
}
const manifest = read("tooling/runtime-manifest.mjs");
test.assert(manifest.indexOf('"app/core/walk-transcript.js"') > manifest.indexOf("export const lazyRuntimePaths"), "walk helpers remain outside the eager runtime");
test.assertNotMatches(html, /<script[^>]+walk-transcript/, "walk helper is not an eager script tag");
test.assertIncludes(handoff.slice(handoff.indexOf("const QUICK_DRAFT_COMMAND_NAMES")), '"quick-draft-walk-return"', "walk action is registered as a command");
test.assertIncludes(handoff, "return window.AISystem6QuickDraft.returnFromWalk?.()", "runtime command reaches intake");
test.assertIncludes(html, 'data-action="quick-draft-walk-return" data-i18n="quick_draft_walk_return"', "add-material menu exposes the walk row");
test.assertIncludes(read("app/data/menus.js"), 'menuItem("quick-draft-walk-return", "quick_draft_walk_return")', "menu bar mirrors walk intake");
const availableSource = handoff.slice(handoff.indexOf("function quickDraftCommandAvailable"), handoff.indexOf("function runQuickDraftRuntimeCommand"));
for (const front of ["quickDraft", "lightroom", "teachtext"]) {
  const availability = vm.createContext({ document: { querySelector: () => ({ dataset: { window: front } }) }, window: { AISystem6QuickDraft: {} } });
  vm.runInContext(availableSource, availability);
  test.assert(availability.quickDraftCommandAvailable("quick-draft-walk-return") === (front === "quickDraft"), "walk command belongs only to the front Quick Draft window");
}
const keys = new Set(`${functionSource}\n${html}`.match(/quick_draft_walk_[a-z_]+/g));
for (const lang of ["en", "zh"]) {
  const translation = read(`app/data/translations-${lang}.js`);
  for (const key of keys) test.assertIncludes(translation, `${key}:`, `${key} has a ${lang} translation`);
}
test.finish();
