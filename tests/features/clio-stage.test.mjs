// ClioStage is a Marp slides.md workspace. It should stay a one-action,
// non-blocking path from source material to a reviewable slide deck.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clio-stage");
const clioStage = read("app/features/clio-stage.js");
const windowManager = read("app/core/window-manager.js");
const slidesExport = read("app/features/slides-export.js");
const marpDeckPrompt = read("app/content/ai-prompts/other-apps/marp-deck.md");
const marpConvertPrompt = read("app/content/ai-prompts/other-apps/marp-convert.md");
const marpRepairPrompt = read("app/content/ai-prompts/other-apps/marp-repair.md");
const clioStageStyles = read("styles/20-reader-docmap.css");
const index = read("index.html");
const dictionary = read("app/data/system-dictionary.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const app = readAppSurface(["app/features/slides-export.js", "app/features/clio-stage.js", "app/features/export-import.js"]);

test.assertIncludes(clioStage, "function parseClioStageMarpDocument(markdown)", "ClioStage keeps a parser for Marp slides.md");
test.assertIncludes(clioStage, "function splitClioStageSlides(lines)", "ClioStage splits slides locally");
test.assertIncludes(clioStage, "!inFence && line.trim() === \"---\"", "ClioStage does not split slide separators inside code fences");
test.assertIncludes(clioStage, "slideMeta: normalizedSlides.map(extractClioStageSlideMeta)", "ClioStage attaches slide metadata without replacing the slides array");
test.assertIncludes(clioStage, "function extractClioStageSlideMeta(slideMarkdown = \"\")", "ClioStage extracts notes and directives from Marp comments");
test.assertIncludes(clioStage, "notes: directives.notes || \"\"", "Speaker notes are stored as slide metadata");
test.assertIncludes(clioStage, "function clioStageSlideNotes(index)", "Cue View can read notes for the current slide");
test.assertIncludes(clioStage, "clio-stage-cue-notes", "Cue View renders notes separately from the slide body");
test.assertIncludes(clioStage, "function clioStageRenderableSlideMarkdown(slideMarkdown = \"\")", "Slide View still renders comment-stripped Markdown");
test.assertIncludes(clioStage, "function clioStageSlideClasses(index)", "Slide View maps Marp _class directives to local template classes");
test.assertIncludes(clioStage, "\"lead\", \"divider\", \"quote\", \"contrast\", \"evidence\", \"takeaway\"", "ClioStage supports the generated visual rhythm classes");
test.assertIncludes(clioStageStyles, "container-type: size", "Slide View scales against the stage viewport instead of the browser window");
test.assertIncludes(clioStageStyles, "font-size: clamp(28px, 6.2cqw, 54px)", "Slide text uses container-responsive sizing for readable resized windows");
test.assertIncludes(windowManager, "function placeClioStageDefaultWindow(win)", "ClioStage has a dedicated default desktop placement");
test.assertIncludes(windowManager, "getDesktopAvoidanceInsets({ margin, spineGap: 18, iconGap: 132 })", "ClioStage avoids the fixed right icon column when it opens");
test.assertIncludes(windowManager, 'name === "clioStage" && !writerMode && placeClioStageDefaultWindow(win)', "openWindow applies ClioStage placement before generic cascade positioning");

test.assertIncludes(slidesExport, "function buildMarpStoryPassSummary(source)", "Marp generation includes an automatic Story Pass");
test.assertIncludes(slidesExport, "do not interview the user or ask for confirmation", "Story Pass remains non-blocking and asks the user no setup questions");
test.assertIncludes(slidesExport, "section.lead", "Generated Marp frontmatter includes a lead slide treatment");
test.assertIncludes(slidesExport, "section.divider", "Generated Marp frontmatter includes section divider treatment");
test.assertIncludes(slidesExport, "section.quote", "Generated Marp frontmatter includes quote slide treatment");
test.assertIncludes(slidesExport, "section.evidence", "Generated Marp frontmatter includes evidence slide treatment");
test.assertIncludes(slidesExport, "section.takeaway", "Generated Marp frontmatter includes takeaway slide treatment");
test.assertIncludes(marpDeckPrompt, "Do not interview or request confirmation", "The file-backed generation prompt remains non-blocking");
test.assertIncludes(marpDeckPrompt, "lead、divider、quote、evidence、takeaway", "Generation prompt tells the model how to vary slide classes");
test.assertIncludes(marpDeckPrompt, "<!-- header: Section / Topic -->", "Generation prompt supports sparse breadcrumb headers");
test.assertIncludes(marpDeckPrompt, "<!-- notes: ... -->", "Generated decks can include speaker notes without crowding slides");
test.assertIncludes(marpDeckPrompt, "不得编造事实、名称、数字、例子、图片、来源或结论", "Generation remains source-grounded");
test.assertIncludes(marpConvertPrompt, "用仅含 --- 的一行分隔幻灯片", "Generation still follows Marp slide separators");
test.assertIncludes(slidesExport, "function buildMarpRepairPrompt", "Marp generation has a repair pass instead of silently accepting malformed decks");
test.assertIncludes(marpRepairPrompt, "每页必须有真实可见内容；不要空白 slide", "repair prompt directly addresses empty-slide failures");
test.assertIncludes(slidesExport, "validateMarpSkillMarkdown(markdown, source.markdown)", "ClioStage generation validates repaired Marp before opening");
test.assertIncludes(slidesExport, "prompt = buildMarpRepairPrompt(source, markdown, validation)", "ClioStage generation retries with validation errors instead of deleting blank slides");
test.assertIncludes(slidesExport, "prompt = buildMarpRepairPrompt(source, markdown, validation, { aiSlides: true })", "AI slides draft generation also repairs validation failures");
test.assertIncludes(slidesExport, "empty_slide:${split.emptySlides.join(\",\")}", "ClioStage Marp validation detects empty slides");
test.assertNotIncludes(slidesExport, "removeEmptyMarpSlides", "empty slide handling is not a silent deletion pass");

test.assertIncludes(index, 'id="clio-stage-source-view"', "ClioStage keeps Source View");
test.assertIncludes(index, 'id="clio-stage-document-view"', "ClioStage keeps Document View");
test.assertIncludes(index, 'id="clio-stage-slide-view"', "ClioStage keeps Slide View");
test.assertIncludes(index, 'id="clio-stage-cue-view"', "ClioStage keeps Cue View");
test.assertIncludes(index, 'id="clio-stage-ask-form"', "Ask Deck remains available");

test.assertIncludes(app, "ensureClioStageModule()", "ClioStage remains lazy-loaded");
test.assertIncludes(app, "openCurrentReaderInClioStage", "Reader can still hand Marp slides to ClioStage");
test.assertIncludes(app, "generateMarpMarkdownAndOpenClioStage", "TeachText can still generate and open Marp slides");
test.assertIncludes(app, "openSelectedProjectCdInClioStage", "Project CD can still hand Marp slides to ClioStage");
test.assertNotIncludes(index, "clio-stage-story-pass-form", "Story Pass does not add a blocking form");
test.assertIncludes(dictionary, 'id: "clio-stage"', "System Help exposes the production ClioStage workflow");
test.assertIncludes(dictionary, "Build evidence in ClioChart, send the chosen projection to ClioStage", "System Help documents the Chart-to-Stage handoff");
test.assertIncludes(clioStage, 't("clio_stage_slides_count"', "slide counts use localized copy");
test.assertIncludes(clioStage, 't("clio_stage_notes")', "Cue View notes use localized copy");
for (const key of ["clio_stage_slides_count", "clio_stage_notes"]) {
  test.assertIncludes(en, `${key}:`, `English includes ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese includes ${key}`);
}

test.assertIncludes(clioStage, 'registerAskBarSource("clioStage", describeClioStageAskScope)', "ClioStage asks through the shared ask bar");
test.assertIncludes(clioStage, 'return { ready: false };', "ClioStage hides its ask bar until a deck is open");

test.finish();
