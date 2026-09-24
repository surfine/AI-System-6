// Scrapbook keeps user-curated project material. Users can add a blank
// project-scoped scrap directly, without routing through Reader, ClioTalk, or
// another app first.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("scrapbook");
const scrapbook = read("app/features/scrapbook.js");
const app = readAppSurface(["app/core/actions.js", "app/features/scrapbook.js"]);
const html = read("index.html");
const responsive = read("styles/60-responsive.css");
const dragDrop = read("app/core/drag-drop.js");

// A picture could only get in through the Clip Picture button, while every
// other surface in the product took a drop. The Question Sheet's photo branch
// is the pattern; this is the same rule one surface over.
test.assertIncludes(
  dragDrop,
  "#scrap-form, #scrap-pictures",
  "a picture dropped in the Scrapbook is routed to the clip path"
);
test.assertIncludes(
  dragDrop,
  "return clipPictureToScrapbook(scrapbookPictures);",
  "and it goes through the same function the Clip Picture button calls"
);

test.assertIncludes(app, 'data-action="new-note"', "Scrapbook exposes a direct New Scrap action");
test.assertIncludes(app, 'data-i18n="new_scrap"', "direct Scrapbook creation has a localized visible label");
test.assertIncludes(app, '"new-note": () => createScrap(null, "")', "New Scrap creates a blank project-scoped scrap");
test.assertIncludes(scrapbook, "if (!getActiveProject())", "manual scraps still require a mounted Project Hard Disk");
test.assertIncludes(scrapbook, "source: options.source || null", "manual scraps can exist without a Reader or app source");
test.assertIncludes(html, 'class="visually-hidden" for="scrapbook-question"', "Scrapbook keeps its Ask label accessible without taking a content row");
test.assertIncludes(responsive, ".scrap-list:has(.scrap-empty-card)", "an empty phone Scrapbook gives space back to the editor");
test.assertIncludes(html, '<form id="scrapbook-ask-form" class="ask-bar" data-ask-source="scrapbook">', "Scrapbook asks through the shared ask bar");
test.assertIncludes(scrapbook, 't("ask_scope_scraps", selected.length) : t("ask_scope_all_scraps", count)', "Scrapbook still derives the clips carried into SideAsk");

// One answer to "which scraps are showing" -- stack, then filter -- for the
// list, the System 6 page rail and the in-place row refresh alike.
const apps = read("styles/50-apps.css");
test.assertIncludes(html, 'id="scrap-filter" class="scrap-filter" type="text" inputmode="search"', "the Scrapbook bar carries a filter field");
test.assertIncludes(scrapbook, "(selectedScrapStack === \"all\" || getScrapStack(scrap) === selectedScrapStack) && scrapMatchesFilter(scrap)", "stack and filter narrow the scraps in one place");
test.assertIncludes(scrapbook, "const visibleScraps = scrapbookPageScraps();\n  syncScrapSelection(visibleScraps);", "the list draws from the same answer as the page rail");
test.assertIncludes(scrapbook, 't("scrap_filter_empty", scrapFilterQuery)', "an empty filter result says what was filtered for");

// A row previews what the scrap says, not the source its meta line already names.
test.assertIncludes(scrapbook, "function scrapPreviewLine(scrap, meta)", "the row preview skips section labels and the source line");

// The source is a citation beside its Open Source button, not a field.
test.assertMatches(html, /class="scrap-citation-row">\s*<div id="scrap-source-info" class="source-info-panel scrap-citation">[\s\S]*?id="open-scrap-source"/, "Open Source sits beside the citation it opens");
test.assertIncludes(apps, ".source-info-panel.scrap-citation {\n  display: grid;", "the citation wraps instead of ellipsizing inside an inset frame");

// Actions: Delete apart, Insert last and default, pictures behind one menu.
test.assertMatches(html, /class="button-row scrap-actions">\s*<button class="btn danger" type="button" id="delete-scrap"[\s\S]*id="scrap-picture-menu"[\s\S]*<button class="btn default" type="button" id="insert-scrap"/, "the action row orders Delete, Picture and Insert");
test.assertIncludes(apps, ".scrap-editor .button-row {\n  flex-wrap: wrap;", "the action row wraps instead of pushing the editor out of its column");

// Two or more selected: the batch actions that sat hidden since May come back.
test.assertNotIncludes(html, 'class="scrap-selection-actions" hidden', "batch actions are no longer hidden in the window");
test.assertIncludes(scrapbook, 'scrapForm.dataset.scrapMode = selectedScrapIds.size > 1 ? "multi" : "single"', "a multi-selection switches the editor to its batch view");
test.assertIncludes(apps, '.scrap-editor[data-scrap-mode="multi"] > .scrap-selection-actions {\n  display: grid;', "the batch view shows the batch actions");


// Clipped pictures. Scrapbook stays curated material the writer chose, so a
// picture is clipped, not generated — and a picture-only clip is told plainly
// that Searcher cannot find it rather than being quietly filled with model
// text. A reading is a proposal until the writer keeps it.
const derivedIndex = read("app/core/derived-index-queue.js");
const enCopy = read("app/data/translations-en.js");
const zhCopy = read("app/data/translations-zh.js");

test.assertIncludes(scrapbook, "images: Array.isArray(options.images)", "a clip can carry pictures");
test.assertIncludes(scrapbook, "const SCRAP_IMAGE_LIMIT = 4", "a clip carries a bounded number of pictures");
test.assertIncludes(scrapbook, "function scrapIsPictureOnly", "a picture-only clip can be recognized");
test.assertIncludes(html, 'id="scrap-unindexed-note"', "the window can say a clip is not searchable");
test.assertIncludes(html, 'data-action="scrapbook-clip-picture"', "a picture is clipped by the writer");
test.assertIncludes(html, 'data-action="scrapbook-keep-reading"', "a reading has to be kept before it is saved");

test.assertIncludes(scrapbook, "scrapReadingProposal = {\n      scrapId: scrap.id,", "a reading is held in memory, not written to the clip");
test.assertIncludes(scrapbook, "function keepScrapReadingProposal", "keeping a reading is a separate, explicit act");
test.assertIncludes(scrapbook, "function discardScrapReadingProposal", "a reading can be thrown away");
test.assertNotIncludes(scrapbook, "scrap.body = result.text", "a reading never lands in the clip on its own");
test.assertIncludes(scrapbook, "imageAttachmentEvidenceMarkdown(", "a kept reading carries where it came from");

test.assertIncludes(
  derivedIndex,
  'const content = String(source?.content || "").trim();',
  "the index still skips a source with no text, so the un-indexed note stays true"
);

test.assertIncludes(enCopy, "scrap_image_unindexed", "English copy explains the un-indexed clip");
test.assertIncludes(zhCopy, "scrap_image_unindexed", "Chinese copy explains the un-indexed clip");
test.assertIncludes(enCopy, "nothing is saved until you keep it", "English copy is explicit that the reading is unsaved");

test.finish();
