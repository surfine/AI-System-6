// A sync may fill an empty paper. It may not replace somebody's writing.
//
// A person who had never seen this product wrote 98 words, pressed To Review,
// and watched them become "## New Section" BEFORE the command's own dialog
// appeared. Cancel did not bring them back and neither did Undo.
//
// The cause was not the dialog. `advanceManuscriptToReview` calls
// `savePipelineData()` first, which calls `syncLinkedTeachTextFromProject()`,
// which writes the project outline over the TeachText body. Its guard was
// `document.activeElement === teachTextBodyInput` — and a route command blurs
// the editor before it runs, so the guard was never true when it mattered.
// `.claude/rules/writing-route-internals.md` already names that exact trap:
// source-of-truth follows the PHASE, never the focused element.
//
// This contract holds the property at the place where the bytes are lost: the
// document's own status says whether those characters are a projection of the
// outline or somebody's work, and work is never overwritten.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("manuscript-sync-keeps-text");

const flow = read("app/features/writing-flow.js");

// The guard must live at the write, not only at a caller: a second caller
// would otherwise arrive without it, which is how this defect happened.
test.assertIncludes(
  flow,
  "holdsUnsavedWriting",
  "the write that replaces the visible body asks whether it is about to discard work",
);
test.assertNotIncludes(
  flow.slice(flow.indexOf("function syncProjectOutlineToTeachText")).slice(0, 2000),
  "document.activeElement === teachTextBodyInput",
  "the write does not decide from the focused element — a route command blurs the editor first",
);

// --- Executed against the real app --------------------------------------
{
  const vmw = createAppBootVm();
  const ctx = vmw.context;
  const body = ctx.document.querySelector("#teachtext-body");
  const status = ctx.document.querySelector("#teachtext-status");
  test.assert(Boolean(body && status), "the booted app has the manuscript field and its status capsule");

  // writing-flow.js is lazy. Its loader is a `const`, which is a lexical
  // binding and not a property of the global object, so it cannot be called
  // from here — the same trap the harness documents. The product installs a
  // registered lazy COMMANDS with a real ensure(), which is the path a writer
  // takes when they use the route, so loading through one of those is what
  // makes the real functions reachable.
  // The lazy loader cannot fetch inside this harness, and the module's own
  // loader is a `const` — a lexical binding, not a property of the global
  // object. Evaluating the module's real source in the SAME scope is what the
  // browser's script tag does, so the declarations land where the rest of the
  // app can see them, which is the condition this contract is about.
  vmw.run(readFileSync(join(root, "apps/desktop/app/features/writing-flow.js"), "utf8"));
  test.assert(
    typeof ctx.syncProjectOutlineToTeachText === "function",
    "the route module really loaded and the sync under test is reachable",
  );

  const writing = Array.from({ length: 98 }, (_, index) => `word${index + 1}`).join(" ");

  // 1. Work in progress is never replaced.
  body.value = writing;
  if (status) status.dataset.statusKey = "modified";
  // Without a project the function returns on its first line and BOTH cases
  // below would pass while measuring nothing — which is exactly how this
  // contract read before this line was added. The function takes the project
  // as its own first argument, so hand it one rather than hoping the harness
  // has mounted one.
  const project = { id: "probe", name: "Probe", outline: "## New Section\n\n" };
  let refused = false;
  try {
    refused = ctx.syncProjectOutlineToTeachText(project, { markModified: false }) === false;
  } catch (error) {
    refused = `threw: ${error?.message || error}`;
  }
  test.assert(
    body.value === writing,
    body.value === writing
      ? "a sync leaves 98 words of unsaved writing exactly as they were"
      : `a sync replaced unsaved writing with ${JSON.stringify(body.value.slice(0, 40))}`,
  );
  test.assert(refused === true, `the refused sync reports that it did nothing (got ${JSON.stringify(refused)})`);

  // 2. A clean projection may still be refreshed, or the route stops working.
  body.value = "";
  if (status) status.dataset.statusKey = "saved";
  project.outline = "## A real section\n\nSome prose.\n";
  try {
    ctx.syncProjectOutlineToTeachText(project, { markModified: false });
  } catch {
    // The DOM shim has no modal; the write above it is what this asserts.
  }
  test.assert(
    body.value.includes("A real section"),
    body.value.includes("A real section")
      ? "an empty paper is still filled from the outline"
      : `the sync refused a paper that held nothing (body is ${JSON.stringify(body.value.slice(0, 40))})`,
  );

  // 3. The drafting phase's own refresh. This is the case the document status
  //    could not answer: the manuscript is the READ-ONLY projection there, the
  //    writer is typing in Section Drafts, and the manuscript must follow them.
  //    A manuscript tab with no file on disk is born "modified"
  //    (teachtext-accessories.js loadTeachTextTabState) and this sync sets
  //    "modified" itself on its way out, so a status-reading guard refuses
  //    every refresh after the first: the manuscript freezes on stale text, and
  //    the next "To Manuscript" writes that stale body back over the newer
  //    sections. The guard must recognise its own projection instead.
  if (status) status.dataset.statusKey = "modified";
  test.assert(
    body.value === project.outline,
    "the paper now holds exactly what the sync projected into it",
  );
  project.outline = "## A real section\n\nSome prose.\n\n## A second section\n\nJust typed in Section Drafts.\n";
  const refreshed = ctx.syncProjectOutlineToTeachText(project, { markModified: false });
  test.assert(
    refreshed === true && body.value.includes("A second section"),
    refreshed === true && body.value.includes("A second section")
      ? "a clean projection is still refreshed while the status capsule says \"modified\""
      : `the drafting manuscript froze on stale text (returned ${JSON.stringify(refreshed)}, body ${JSON.stringify(body.value.slice(0, 60))})`,
  );

  // 4. The status does not decide in the other direction either. "saved"
  //    describes the last write to disk, not the characters on the paper now,
  //    so it is never a licence to discard them.
  const typed = "Words the writer put here, with the capsule still reading saved.";
  body.value = typed;
  if (status) status.dataset.statusKey = "saved";
  const refusedDespiteSaved = ctx.syncProjectOutlineToTeachText(project, { markModified: false }) === false;
  test.assert(
    body.value === typed && refusedDespiteSaved,
    body.value === typed && refusedDespiteSaved
      ? "text that is not this sync's own projection is kept whatever the status capsule says"
      : `a "saved" capsule was enough to discard the body (body is ${JSON.stringify(body.value.slice(0, 60))})`,
  );
}

test.finish();
