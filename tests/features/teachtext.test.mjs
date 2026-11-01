// TeachText is the manuscript surface. Unsaved edits are protected by Working
// Session, while explicit Save still turns drafts into durable Project Disk
// documents.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("teachtext");
const index = read("index.html");
const teachText = read("app/features/teachtext-accessories.js");
const imageAttachments = read("app/core/image-attachments.js");
const documentsChat = read("app/features/documents-chat.js");
const workingSession = read("app/core/working-session.js");
const wireup = read("app/core/wireup.js");
const responsiveCss = read("styles/60-responsive.css");
const app = readAppSurface(["app/features/translation.js"]);
const writingCommands = index.match(/aria-label="Writing commands"[\s\S]*?<button class="btn default" type="submit"/)?.[0] || "";
const reviewCommands = index.match(/aria-label="Review commands"[\s\S]*?<button class="btn default" type="button" data-action="review-export"/)?.[0] || "";
const questionCommands = index.match(/aria-label="Question Sheet commands"[\s\S]*?data-action="advance-question-to-outline"/)?.[0] || "";
const outlineCommands = index.match(/aria-label="Outline commands"[\s\S]*?data-action="advance-outline-to-drafts"/)?.[0] || "";
const sectionDraftCommands = index.match(/aria-label="Section Draft commands"[\s\S]*?data-action="advance-drafts-to-manuscript"/)?.[0] || "";

test.assertIncludes(teachText, "function setTeachTextStatus(key)", "tracks visible TeachText saved/modified status");
test.assertIncludes(teachText, "function syncTeachTextWindowTitle()", "TeachText separates application identity from the active document title");
test.assertIncludes(teachText, 'teachTextTitleEl.textContent = appTitle', "TeachText keeps its application name in the title bar");
test.assertIncludes(teachText, 'compactLabelFor: (tab) => tab.title || teachTextRoleLabel(tab.role)', "TeachText places the active document identity in compact TDI chrome");
test.assertIncludes(teachText, "function captureActiveTeachTextTabState()", "captures TeachText title, body, role, selection, and scroll state");
test.assertIncludes(teachText, "statusKey: teachTextStatusEl?.dataset.statusKey", "records dirty status with each TeachText tab");
test.assertIncludes(teachText, "documentRole: teachTextDocumentRole", "preserves manuscript versus scratch-file role");

test.assertIncludes(workingSession, "function captureTeachTextWorkingSession()", "ordinary refresh captures unsaved TeachText work");
test.assertIncludes(workingSession, "function restoreTeachTextWorkingSession(state = {})", "ordinary refresh restores unsaved TeachText work");
test.assertIncludes(workingSession, "teachTextBodyInput.value", "Working Session includes the unsaved manuscript body");
test.assertIncludes(workingSession, "setTeachTextStatus", "restore rehydrates the visible dirty/saved state");

test.assertIncludes(wireup, "teachTextForm.addEventListener(\"submit\"", "explicit Save remains the durable TeachText action");
test.assertIncludes(documentsChat, "function saveTextDocument", "TeachText save writes a Project Disk text document");
test.assertIncludes(documentsChat, "activeTextFileId", "saved TeachText documents keep a durable file identity");
test.assertIncludes(documentsChat, "chatFiles.unshift(file)", "new TeachText saves enter Project Disk documents");

test.assertIncludes(app, "function markTeachTextModified()", "editing TeachText marks user work as modified");
test.assertIncludes(app, "shouldPromptForTeachTextFileSave", "closing TeachText still protects unsaved work with the existing prompt");

test.assertIncludes(writingCommands, 'data-i18n="teachtext_commands"', "TeachText keeps the shared Commands menu title");
test.assertIncludes(writingCommands, 'id="teachtext-docmap"', "TeachText command menu keeps the manuscript DocMap action");
test.assertIncludes(writingCommands, 'data-action="open-image-manager"', "TeachText command menu keeps image management");
test.assertIncludes(writingCommands, 'data-action="generate-marp-open-clio-stage"', "TeachText command menu keeps slide handoff");
test.assertNotIncludes(writingCommands, 'id="teachtext-translate"', "TeachText command menu does not re-add the old translate item");
test.assertNotIncludes(writingCommands, 'data-action="ai-proofread"', "TeachText command menu does not re-add the old Writing Tools submenu");
test.assertNotIncludes(writingCommands, 'id="teachtext-download-markdown"', "TeachText command menu does not re-add the old markdown export item");
test.assertIncludes(imageAttachments, "AISystem6ModelTaskRuntime.buildVisionMessages", "the shared image module builds a browser-local vision request");

// Question Sheet photographed notes: the sheet must welcome messy human input,
// and a photo of a scribbled page is the messiest of it. Photos are raw input
// that rides along with Organize — never a new AI-written section.
const questionSheet = read("app/core/question-sheet.js");
const outlineClaim = read("app/features/outline-claim.js");
const dragDrop = read("app/core/drag-drop.js");
const enCopy = read("app/data/translations-en.js");
const zhCopy = read("app/data/translations-zh.js");
test.assertIncludes(questionSheet, "function addQuestionSheetPhotos", "the Question Sheet can take a photo");
test.assertIncludes(questionSheet, "openTransientFilePicker", "photos use the one Choose-button picker, not a permanent file input");
test.assertIncludes(questionSheet, "surface: QUESTION_SHEET_PHOTO_SURFACE", "sheet photos are stored under their own surface");
test.assertIncludes(index, 'data-action="add-question-sheet-photo"', "the sheet command menu offers Add Photo");
test.assertNotIncludes(index, 'id="question-sheet-photo-input"', "no permanent visible file input is added to the sheet");
test.assertIncludes(dragDrop, "addQuestionSheetPhotoFiles(questionSheetPhotos)", "a photo dropped on the sheet becomes sheet input, not a File Floppy document");
test.assertIncludes(outlineClaim, "attachImagesToModelMessages(", "Organize Questions reads the photographed notes");
test.assertIncludes(outlineClaim, "getQuestionSheetPhotos()", "Organize Questions reads the sheet's own photos");
test.assertIncludes(enCopy, "question_sheet_add_photo", "English copy names the photo command");
test.assertIncludes(zhCopy, "question_sheet_add_photo", "Chinese copy names the photo command");
test.assertIncludes(teachText, "analyzeImageAttachment(attachment", "Project Picture Album asks the selected vision model through the shared module");
test.assertNotIncludes(teachText, "fetch(\"/api/vision/analyze\"", "Project Picture Album does not upload local vision prompts to the VPS");
test.assertIncludes(teachText, "textContent = t(\"image_read\")", "Project Picture Album exposes a Read image action");
test.assertIncludes(teachText, "textContent = t(\"image_ocr\")", "Project Picture Album exposes an OCR action");

test.assertIncludes(questionCommands, 'data-action="insert-question-template"', "Question Sheet command menu keeps template insertion");
test.assertIncludes(questionCommands, 'data-action="organize-question-sheet"', "Question Sheet command menu keeps question organization");
test.assertIncludes(questionCommands, 'data-action="generate-outline"', "Question Sheet command menu keeps outline generation");
test.assertNotIncludes(questionCommands, 'data-action="open-image-manager"', "Question Sheet command menu is not the TeachText menu");

test.assertIncludes(outlineCommands, 'data-action="add-outline-section"', "Outline command menu keeps section creation");
test.assertIncludes(outlineCommands, 'data-action="mingming-outline"', "Outline command menu keeps Mingming handoff");
test.assertIncludes(outlineCommands, 'data-action="structure-outline"', "Outline command menu keeps structure");
test.assertIncludes(outlineCommands, 'data-action="expand-outline"', "Outline command menu keeps weak-topic expansion");
test.assertNotIncludes(outlineCommands, 'data-action="critique-outline"', "Outline command menu does not re-add the old critique item");
test.assertNotIncludes(outlineCommands, 'data-action="reduce-outline"', "Outline command menu does not re-add the old reduce item");

test.assertIncludes(sectionDraftCommands, 'data-action="draft-current-section"', "Section Drafts command menu keeps section drafting");
test.assertIncludes(sectionDraftCommands, 'data-action="polish-draft"', "Section Drafts command menu keeps polishing");
test.assertIncludes(sectionDraftCommands, 'data-action="suggest-draft"', "Section Drafts command menu keeps suggestions");
test.assertNotIncludes(sectionDraftCommands, 'data-action="new-section-draft"', "Section Drafts command menu does not re-add old manual draft creation");

test.assertIncludes(reviewCommands, 'data-action="review-style-section"', "Review Desk command menu keeps style review");
test.assertIncludes(reviewCommands, 'data-action="review-facts-section"', "Review Desk command menu keeps fact review");
test.assertIncludes(reviewCommands, 'data-action="review-hkrr-section"', "Review Desk command menu keeps HKRR review");
test.assertNotIncludes(reviewCommands, 'data-action="draft-current-section"', "Review Desk command menu is not the Section Drafts menu");
test.assertMatches(
  responsiveCss,
  /@media \(max-width: 860px\)[\s\S]*\.review-desk-results\s*\{\s*grid-template-rows:\s*minmax\(0, calc\(\(100% - var\(--review-splitter-size\)\) \* 0\.45\)\)\s*var\(--review-splitter-size\)\s*minmax\(0, calc\(\(100% - var\(--review-splitter-size\)\) \* 0\.55\)\);/,
  "Review Desk responsive preview keeps the splitter row between source preview and review results"
);

test.finish();
