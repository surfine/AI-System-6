// Drafting-phase ownership of project.outline, driven through the real app.
//
// In the drafting phase `project.outline` is the record. The Outline field and
// the Section Draft field are both views of it, and both write into it on every
// keystroke (wireup.js wires each input handler to savePipelineData). Every
// other view -- the manuscript, the tree, the preview -- reads it.
//
// The question a projection has to answer is "has the record moved away from
// what THIS surface put into it". `document.activeElement` answers a different
// question, and answering with it lost text in both directions:
//
//   - the caret sits in the Outline, an AI command rewrites a section, the
//     Outline is refused its refresh for holding focus, and the writer's next
//     keystroke there writes the previous revision back over the record;
//   - the caret sits in a Section Draft, the record moves, same refusal, same
//     loss the other way.
//
// This contract holds BOTH directions at once, because fixing one of them by
// itself is how the previous repair became the next data loss:
//
//   1. Neither surface may shorten the other's text.
//   2. No legitimate projection may be refused -- a surface whose record has
//      moved must show the move even while it holds the caret, and a surface
//      that IS the record's source must be left alone (the trailing newline the
//      writer just typed, an outline they just emptied, and their caret).
//
// Break either half and a named assertion below goes red.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("drafting-ownership");

const OUTLINE = "# Paper\n\n## Alpha\n\nalpha body\n\n## Beta\n\nbeta body\n";

// One seeded project, in the drafting phase, with section one selected.
async function draftingDesk() {
  const vmw = createAppBootVm();
  vmw.run(`
    isProjectMounted = true;
    projects.length = 0;
    projects.push({
      id: "p1", name: "Contract", questionSheet: "",
      outline: ${JSON.stringify(OUTLINE)},
      drafts: [], scraps: [], flowState: {},
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    });
    activeProjectId = "p1";
    // The desk record is IndexedDB in production and unavailable in the boot
    // VM; the ownership rule under test is decided before persistence.
    saveDeskState = async () => true;
  `);
  await vmw.run("ensureWritingFlowModule()");
  vmw.run("renderPipeline(); syncDraftsFromProjectOutline(getActiveProject()); selectedDraftIndex = 0; renderPipeline();");
  return {
    vmw,
    project: vmw.run("getActiveProject()"),
    outlineEl: vmw.run("outlineContentEl"),
    draftEl: vmw.run("draftBodyInput"),
    teachEl: vmw.run("teachTextBodyInput"),
  };
}

// --- Direction 1: neither surface may shorten the other's text ------------

// The caret is in the Outline when a Section-Draft-side write lands. The
// Outline field must not carry its previous revision back over the record.
{
  const { vmw, project, outlineEl, draftEl } = await draftingDesk();
  outlineEl.focus();
  draftEl.value = "alpha body WRITTEN FROM THE SECTION DRAFT";
  vmw.run("updateProjectOutlineFromSelectedDraft(getActiveProject())");
  vmw.typeInto(outlineEl, `${outlineEl.value}\n\n## Gamma\n`);

  test.assert(
    project.outline.includes("WRITTEN FROM THE SECTION DRAFT"),
    "caret in the Outline: a Section Draft's text survives the next Outline keystroke",
  );
  test.assert(
    project.outline.includes("## Gamma"),
    "caret in the Outline: the Outline's own new section still reaches the record",
  );
}

// The mirror image: the caret is in the Section Draft when the record moves.
{
  const { vmw, project, draftEl } = await draftingDesk();
  draftEl.focus();
  vmw.run(`
    setProjectOutlineMarkdown(getActiveProject(), getActiveProject().outline.replace("alpha body", "alpha body WRITTEN FROM THE OUTLINE"));
    syncDraftsFromProjectOutline(getActiveProject());
    syncDraftDomFromProject(getActiveProject());
  `);
  vmw.typeInto(draftEl, `${draftEl.value} plus my own words`);

  test.assert(
    project.outline.includes("WRITTEN FROM THE OUTLINE"),
    "caret in the Section Draft: the Outline's text survives the next Section Draft keystroke",
  );
  test.assert(
    project.outline.includes("plus my own words"),
    "caret in the Section Draft: the writer's own words still reach the record",
  );
}

// A caret can park in the Section Draft while the manuscript owns the document,
// because a read-only field is still focusable. Capturing that field back into
// the record pushes the read-only projection over the text it came from.
{
  const { vmw, project, draftEl, teachEl } = await draftingDesk();
  vmw.run(`
    getActiveProject().manuscriptOwnsDraft = true;
    getActiveProject().manuscriptLinkedToOutline = true;
    teachTextFileLabel = "draft";
    setTeachTextWorkflowState("draft");
    if (typeof activateTeachTextManuscriptTab === "function") activateTeachTextManuscriptTab({ focus: false });
    syncProjectOutlineToTeachText(getActiveProject());
  `);
  test.assert(vmw.run("manuscriptPhase()") === "manuscript", "the manuscript phase is really entered before its case is tested");

  teachEl.value = project.outline.replace("alpha body", "alpha body EDITED IN THE MANUSCRIPT");
  vmw.run("syncTeachTextToLinkedProjectMarkdown()");
  // The field is forced back to a previous revision to stand for any field the
  // record has moved past, then the caret parks in it and a command saves.
  draftEl.value = "alpha body";
  draftEl.focus();
  vmw.run('noteWritingSurfaceEdit("questionSheet"); savePipelineData();');

  test.assert(
    project.outline.includes("EDITED IN THE MANUSCRIPT"),
    "manuscript phase: a caret parked in the read-only Section Draft does not write it back",
  );
  test.assert(
    String(vmw.run("getActiveProject().drafts[0].body")).includes("EDITED IN THE MANUSCRIPT"),
    "manuscript phase: the Section Draft record stays the manuscript's projection",
  );
}

// --- Direction 2: no legitimate projection may be refused -----------------

// A record that moves must reach the field, caret or no caret. This is the
// half a one-sided repair leaves out: a surface frozen on stale text is the
// next command's data loss, not a safe state.
{
  const { vmw, project, outlineEl, draftEl } = await draftingDesk();
  outlineEl.focus();
  draftEl.value = "alpha body WRITTEN FROM THE SECTION DRAFT";
  vmw.run("updateProjectOutlineFromSelectedDraft(getActiveProject())");

  test.assert(
    outlineEl.value.includes("WRITTEN FROM THE SECTION DRAFT"),
    "focused Outline: a record that moved is projected into the field, not refused",
  );
}
{
  const { vmw, draftEl } = await draftingDesk();
  draftEl.focus();
  vmw.run(`
    setProjectOutlineMarkdown(getActiveProject(), getActiveProject().outline.replace("alpha body", "alpha body WRITTEN FROM THE OUTLINE"));
    syncDraftsFromProjectOutline(getActiveProject());
    syncDraftDomFromProject(getActiveProject());
  `);

  test.assert(
    draftEl.value.includes("WRITTEN FROM THE OUTLINE"),
    "focused Section Draft: a record that moved is projected into the field, not refused",
  );
}

// The other side of the same rule: a surface that IS the record's source is
// left alone. The record is stored trimmed, so the newline the writer just
// pressed at the end of the document differs from it -- projecting on that
// difference deletes the keystroke as it is typed.
{
  const { vmw, outlineEl } = await draftingDesk();
  outlineEl.focus();
  vmw.typeInto(outlineEl, `${outlineEl.value}\n`);
  vmw.run("renderPipeline()");

  test.assert(
    outlineEl.value.endsWith("\n"),
    "the newline the writer just typed at the end of the Outline is not swallowed by a projection",
  );
}

// An emptied Outline is an instruction, not an accident. Refilling it from the
// placeholder serialization is the "## New Section" failure this route already
// met once on the manuscript.
{
  const { vmw, outlineEl } = await draftingDesk();
  outlineEl.focus();
  vmw.typeInto(outlineEl, "");
  vmw.run("renderPipeline()");

  test.assert(outlineEl.value === "", "an Outline the writer emptied is not refilled with a placeholder section");
}

// A projection that sends the caret to the end of the document is a projection
// the writer has to fight, so it is refused work of a different kind.
{
  const { vmw, outlineEl, draftEl } = await draftingDesk();
  outlineEl.focus();
  outlineEl.setSelectionRange(9, 9);
  draftEl.value = "alpha body WRITTEN FROM THE SECTION DRAFT";
  vmw.run("updateProjectOutlineFromSelectedDraft(getActiveProject())");

  test.assert(
    outlineEl.selectionStart === 9,
    "a projection into the focused Outline leaves the caret where the writer left it",
  );
}

// --- The rule is stated where the code is read ----------------------------
//
// Behaviour above is the contract; these hold the two named surfaces to the
// rule's wording so a focus test cannot quietly come back through a refactor
// that happens to keep the cases above green.
{
  const source = read("app/features/writing-flow.js");
  const body = (name) => {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) return "";
    const next = source.indexOf("\nfunction ", start + 1);
    return source.slice(start, next < 0 ? source.length : next);
  };

  test.assert(body("syncOutlineDomFromProject").length > 0, "syncOutlineDomFromProject is still the Outline projection");
  test.assert(body("syncDraftDomFromProject").length > 0, "syncDraftDomFromProject is still the Section Drafts projection");
  test.assertNotIncludes(body("syncOutlineDomFromProject"), "activeElement", "the Outline projection does not ask which element has focus");
  test.assertNotIncludes(body("syncDraftDomFromProject"), "activeElement", "the Section Drafts projection does not ask which element has focus");
  test.assertIncludes(source, "function outlineFieldIsRecordSource", "the Outline's leave-alone test is named after what it asks");
  test.assertIncludes(source, "function selectedDraftFieldIsRecordSource", "the Section Drafts' leave-alone test is named after what it asks");
  test.assertIncludes(
    source,
    'if (manuscriptPhase() === "drafting" && draftBodyInput) draft.body = draftBodyInput.value;',
    "the Section Draft capture asks the phase, not the focus",
  );
}

test.finish();
