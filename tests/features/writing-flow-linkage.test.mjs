// Writing-route phase ownership. Outline, Section Drafts, and the Manuscript are
// linked views of one Markdown document (project.outline). Each route phase has
// exactly one editable owner; every other surface showing the same text is a
// read-only projection:
//
//   - drafting (manuscript state draft/ai): Section Drafts is the editable owner;
//     the manuscript is a read-only preview (readOnly).
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
test.assertIncludes(writingFlow, "teachTextBodyInput.readOnly = lockDrafting;", "drafting manuscript is read-only so it cannot become a divergent second copy");
test.assertIncludes(documentsChat, "if (typeof applyManuscriptEditability === \"function\") applyManuscriptEditability();", "changing workflow state re-applies manuscript editability");

// --- Visible owner indicator (answers the silent-divergence complaint) ---
test.assertIncludes(teachtextAccessories, "teachtext_mode_readonly_draft", "read-only drafting manuscript shows a visible owner hint");
test.assertIncludes(writingFlow, "if (typeof updateTeachTextDeskState === \"function\") updateTeachTextDeskState();", "owner indicator refreshes when editability changes");

// --- Next-button spine + paired workspaces ---
test.assertIncludes(html, 'data-action="advance-drafts-to-review"', "Section Drafts has a To Review forward button");
test.assertIncludes(actions, '"advance-drafts-to-review": advanceDraftsToReview', "the forward action is wired");
test.assertIncludes(config, '"advanceDraftsToReview"', "the To Review action is lazy-loaded before the action table references it");
test.assertIncludes(writingFlow, "async function advanceDraftsToReview", "advancing to review finalizes the manuscript into the review phase");
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

test.finish();
