// Writing-route phase ownership. Outline, Section Drafts, and the Manuscript
// are views of one Markdown document (project.outline). `##` and `###` are
// both records now, each carrying its id in its heading, and the Outline shows
// them as a list or as text -- see tests/features/outline-tree.test.mjs. What
// that changed is how the document is EDITED, not who owns it: Section Drafts
// are still one per `##`, and each route phase still has
// exactly one editable owner; every other surface showing the same text is a
// read-only projection:
//
//   - drafting (manuscript state draft/ai): Section Drafts is the editable owner;
//     the manuscript is a read-only preview (readOnly).
//   - manuscript (project.manuscriptOwnsDraft): the manuscript is the editable
//     owner and Section Drafts become the read-only projection. This is the route
//     stop the spine used to skip - "To Review" from Section Drafts jumped past
//     the manuscript and finalized it in one press.
//   - review (manuscript state final): the finalized manuscript is the editable
//     owner under review, paired beside the Review Desk.
//
// Ownership follows the phase, not document.activeElement — route commands fire
// from menus/buttons that blur the editor first, so a focus-based source-of-truth
// silently rewrites the previous article. lastEditedWritingSurface remains only as
// a focus-loss fallback, subordinate to the phase check.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-flow-linkage");

const writingFlow = read("app/features/writing-flow.js");
const documentsChat = read("app/features/documents-chat.js");
const windowManager = read("app/core/window-manager.js");
const teachtextAccessories = read("app/features/teachtext-accessories.js");
const wireup = read("app/core/wireup.js");
const actions = read("app/core/actions.js");
const config = read("app/core/config.js");
const html = read("index.html");

// --- Phase = ownership ---
test.assertIncludes(writingFlow, "function manuscriptPhase", "manuscript phase is derived from workflow state");
test.assertIncludes(writingFlow, "function manuscriptOwnsDocument", "ownership is expressed as a phase check, not a focus check");
test.assertIncludes(writingFlow, "function resolvePipelineSourceSurface", "resolver decides the pipeline source surface");
test.assertIncludes(writingFlow, "return manuscriptOwnsDocument() ? \"manuscript\" : \"outline\";", "live manuscript focus owns only when its phase owns the document");
test.assertIncludes(writingFlow, "lastEditedWritingSurface === \"manuscript\" && manuscriptOwnsDocument()", "manuscript is a fallback owner only when its phase owns the document");
test.assertIncludes(writingFlow, "const sourceSurface = resolvePipelineSourceSurface(project);", "save path drives off the resolver");
test.assertIncludes(writingFlow, "sourceSurface === \"manuscript\" && manuscriptOwnsDocument()", "manuscript save branch keyed on phase ownership");
test.assertNotIncludes(
  writingFlow,
  "document.activeElement === teachTextBodyInput && teachTextPipelineLabel() && project.manuscriptLinkedToOutline",
  "old focus-only manuscript branch is gone",
);

// --- Drafting manuscript is a read-only preview; Section Drafts is sole owner ---
test.assertIncludes(writingFlow, "function applyManuscriptEditability", "manuscript editability is enforced by phase");
test.assertIncludes(writingFlow, "manuscriptPhase() === \"drafting\"", "the drafting manuscript is the read-only case");
// The route states a reason; the write lease owns the property. Two owners of
// element.readOnly meant the last one to run won, and a lease refresh silently
// unlocked the drafting manuscript the whole contract exists to protect.
test.assertIncludes(writingFlow, "function writingRouteReadOnlyRule", "the route registers its lock as a reason instead of assigning readOnly");
test.assertIncludes(writingFlow, "registerReadOnlyRule(writingRouteReadOnlyRule)", "the reason is registered with the single owner of the property");
test.assertNotIncludes(writingFlow, "teachTextBodyInput.readOnly =", "the route never assigns the manuscript's readOnly directly");
test.assertNotIncludes(writingFlow, "draftBodyInput.readOnly =", "the route never assigns the Section Drafts' readOnly directly");
test.assertIncludes(writingFlow, "function manuscriptIsLockedProjection", "drafting manuscript is read-only so it cannot become a divergent second copy");
// A scratch file is nobody's projection: the lock applied to any manuscript-role
// document, so File > New Document opened a TeachText you could not type into.
test.assertIncludes(writingFlow, "shouldSyncProjectOutlineAsManuscript()", "the lock applies only while the manuscript actually projects the route document");
test.assertIncludes(documentsChat, "if (typeof applyManuscriptEditability === \"function\") applyManuscriptEditability();", "changing workflow state re-applies manuscript editability");

// --- Visible owner indicator (answers the silent-divergence complaint) ---
test.assertIncludes(teachtextAccessories, "teachtext_mode_readonly_draft", "read-only drafting manuscript shows a visible owner hint");
test.assertMatches(
  teachtextAccessories,
  /function ensureTeachTextManuscriptTab[\s\S]*getDocumentTabs\("teachText", project\)[\s\S]*find\(\(tab\) => tab\.role === "manuscript"\)[\s\S]*if \(existing \|\| typeof upsertDocumentTab/,
  "manuscript activation reuses the normalized tab before the displayed tab state is captured",
);
test.assertIncludes(writingFlow, "if (typeof updateTeachTextDeskState === \"function\") updateTeachTextDeskState();", "owner indicator refreshes when editability changes");

// --- The manuscript is its own phase, not a stop the spine skips ---
test.assertIncludes(writingFlow, 'if (manuscriptOwnsProjectDraft()) return "manuscript";', "the manuscript phase sits between drafting and review");
test.assertIncludes(writingFlow, "function manuscriptOwnsProjectDraft", "the manuscript phase is a project fact, not a file label");
test.assertIncludes(writingFlow, 'return manuscriptPhase() !== "drafting";', "ownership leaves Section Drafts as soon as the manuscript phase starts");
test.assertIncludes(writingFlow, "function applySectionDraftEditability", "the drafts get the mirror-image read-only rule");
test.assertIncludes(writingFlow, "function sectionDraftsAreLockedProjection", "a manuscript-owned document makes Section Drafts read-only, so there is never a second editable copy");
test.assertIncludes(writingFlow, "section_draft_readonly_manuscript", "the locked Section Drafts window says who holds the text");
test.assertIncludes(writingFlow, "const draftsOwnDocument = manuscriptPhase() === \"drafting\";", "a read-only draft holding focus cannot claim the pipeline source");

// --- Next-button spine + paired workspaces ---
test.assertIncludes(html, 'data-action="advance-drafts-to-manuscript"', "Section Drafts forwards to the manuscript, the route's next stop");
test.assertIncludes(html, 'data-action="advance-manuscript-to-review"', "the manuscript carries the step into review");
test.assertIncludes(html, 'data-action="return-document-to-section-drafts"', "the manuscript phase has a way back to the sections");
test.assertIncludes(actions, '"advance-drafts-to-manuscript": advanceDraftsToManuscript', "the forward action is wired");
test.assertIncludes(actions, '"advance-manuscript-to-review": advanceManuscriptToReview', "the review step is wired");
test.assertIncludes(actions, '"return-document-to-section-drafts": returnDocumentToSectionDrafts', "the way back is wired");
test.assertIncludes(config, '"advanceDraftsToManuscript"', "the To Manuscript action is lazy-loaded before the action table references it");
test.assertIncludes(config, '"advanceManuscriptToReview"', "the To Review action is lazy-loaded before the action table references it");
test.assertIncludes(writingFlow, "async function advanceDraftsToManuscript", "advancing to the manuscript hands over ownership");
test.assertIncludes(writingFlow, "project.manuscriptOwnsDraft = true;", "advancing to the manuscript records the phase on the project");
test.assertNotIncludes(writingFlow, 'setTeachTextFileLabel("final", { persist: true });\n  }\n  // Finalization opens', "advancing to the manuscript no longer finalizes on the way");
test.assertIncludes(writingFlow, "async function advanceManuscriptToReview", "review finalization is its own step, taken from the manuscript");
test.assertMatches(
  writingFlow,
  /async function advanceManuscriptToReview\(\)[\s\S]*await setTeachTextFileLabel\("final", \{ persist: true \}\);/,
  "only the manuscript's own step marks the document Final and opens the paired desk",
);
test.assertIncludes(writingFlow, "async function returnDocumentToSectionDrafts", "the manuscript phase is reversible");
test.assertIncludes(writingFlow, "project.manuscriptOwnsDraft = false;", "returning to the sections gives the pen back");
test.assertIncludes(windowManager, "function arrangeActiveWritingWorkspace", "openWindow arranges whichever phase workspace is open as a manuscript pair");
test.assertIncludes(windowManager, "function arrangeDraftingWorkspaceSplit", "drafting pairs Section Drafts beside the manuscript");
test.assertIncludes(windowManager, "function arrangeReviewWorkspaceSplit", "review pairs the Review Desk beside the finalized manuscript");
test.assertIncludes(windowManager, "available >= (minW * 2 + gap)", "pairing is responsive: side-by-side only when two paper widths fit, else stacked");
// Finalize keeps the manuscript open and pairs it with the Review Desk.
test.assertNotIncludes(documentsChat, "await closeWindow(\"teachText\", true);", "finalize no longer closes the manuscript; it pairs it with the Review Desk");

// --- Focus-loss fallback markers (subordinate to phase) ---
test.assertIncludes(writingFlow, "let lastEditedWritingSurface", "keeps a focus-loss fallback marker");
test.assertIncludes(writingFlow, "lastEditedWritingSurface = null;", "renderPipeline clears the marker on project switch");
test.assertIncludes(wireup, "noteWritingSurfaceEdit(\"draft\")", "draft edits update the marker");
test.assertIncludes(wireup, "noteWritingSurfaceEdit(\"manuscript\")", "manuscript edits update the marker");

// --- Stop 6: the terminus stays on the map ----------------------------------
// The route charter ends at the Project CD, so the rail shows the finish line
// in every state: locked (disabled, Balloon Help says why), ready (the verb),
// and burned (opens the disc). Hiding the terminus was navigation loss.
const flowIndex = read("index.html");
const flowPanel = flowIndex.match(/<section class="writing-spine-panel"[\s\S]*?<\/section>\s*<\/section>/)?.[0] || "";
const flowExportImport = read("app/features/export-import.js");
const flowActions = read("app/core/actions.js");
const flowEn = read("app/data/translations-en.js");
const flowZh = read("app/data/translations-zh.js");

test.assertMatches(
  flowPanel,
  /id="spine-burn-project-cd-button"[^>]*disabled[^>]*data-balloon-help="balloon_project_cd_stop_ready"[^>]*data-balloon-help-disabled="balloon_project_cd_stop_locked"/,
  "stop 6 ships visible but disabled, and Balloon Help carries the reason"
);
test.assertIncludes(flowPanel, '<span class="spine-step-number" aria-hidden="true">6</span>', "the Project CD is a numbered stop, not an appearing shortcut");
test.assertIncludes(flowExportImport, "spineBurnProjectCdButtonEl.disabled = !burned && !ready;", "the terminus disables instead of hiding when there is nothing to burn");
test.assertIncludes(flowExportImport, 'spineBurnProjectCdButtonEl.dataset.action = burned ? "open-project-cd" : "export-teachtext-project-cd";', "a burned CD opens read-only; an unburned one burns");
test.assertIncludes(flowExportImport, 'const labelKey = ready ? "burn_project_cd" : "project_cd";', "only the ready state shows the verb; otherwise the stop carries the object name");
test.assertMatches(
  flowActions,
  /function receiptProjectCdBurn\(item\)[\s\S]*?project_cd_burn_receipt[\s\S]*?windowName: "projectCd",/,
  "every burn leaves a durable System Messages receipt with a way back"
);
for (const key of ["project_cd_burn_receipt", "balloon_project_cd_stop_locked", "balloon_project_cd_stop_ready", "balloon_project_cd_stop_burned"]) {
  test.assertIncludes(flowEn, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(flowZh, `${key}:`, `Chinese copy exists for ${key}`);
}

test.finish();
