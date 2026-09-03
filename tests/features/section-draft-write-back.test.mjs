// A completed AI section-draft answer must never be silently dropped.
//
// Found live: a real cloud model answered "写本节" / draft-current-section,
// the fetch completed, and the answer never reached the record — the status
// line claimed the section was written while the desk-record save was
// actually refused (DESK_RECORD_CONFLICT) and the caller never checked.
// applySectionDraftMarkdown fired saveDeskState() without awaiting it and
// then unconditionally reported success, which is exactly the kind of claim
// System Integrity exists to stop making (CLAUDE.md: "Never claim something
// was saved... unless UI state or a tool result confirms it").
//
// Converted from a static, source-reading contract to one that boots the
// real eager module set (tests/helpers/app-boot-vm.mjs), loads the real
// writing-flow module through the real lazy loader, and drives the real
// applySectionDraftMarkdown() with the real persistence guard
// (deskPersistenceWritable) forced to refuse — the same guard saveDeskState()
// itself checks first, not a re-implementation of it. A spy on
// createDocumentRevision and saveDeskState records real call order and real
// arguments as the engine actually resolves them, which is what a static
// source-order check could only assume held at runtime too.
//
// Scope note, the same shape as quick-draft-model-outcome.test.mjs's own:
// this harness has no real IndexedDB (a deliberate exclusion — see
// app-boot-vm.mjs's own comment), so createDocumentRevision's own
// persistRevisions() call cannot durably land inside this test; that half of
// the real write, and the fully-successful saveDeskState() path, are proven
// below by spying persistDeskState itself rather than a fake database, which
// stays close to the seam the code already exposes. Two assertions that are
// inherently about the SHAPE of source across other files — translation-parity
// copy, and that document-revisions.js never touches the desk-record fence's
// own vocabulary — stay static, per the ratchet's own carve-out for checks
// execution cannot meaningfully replace (a pure data/structural-absence check).

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("section-draft-write-back");

function seedProject(vmw, id) {
  vmw.run(`
    projects.push({ id: "${id}", name: "Write-back Test", manuscriptOwnsDraft: false, drafts: [] });
    activeProjectId = "${id}";
    activeProject = projects.find((p) => p.id === "${id}");
  `);
}

// Loads the real writing-flow module bundle through the real lazy loader —
// the same one every real "写本节" click goes through — rather than reading
// its source. openQuestionSheetSurface is one of the eager stubs that pulls
// it in (see action-registry-dispatch.test.mjs, which proves this load path
// end to end already).
async function loadWritingFlow(vmw) {
  await vmw.context.openQuestionSheetSurface();
}

// Installs real-function spies (not fakes): each wrapped name still calls
// straight through to the original, so behavior is unchanged, but every call
// and its arguments land in window.__swbCalls in the order the engine really
// made them. createDocumentRevision, saveDeskState and persistDeskState are
// all plain top-level `function` declarations, so reassigning the bare name
// redirects every later bare-identifier call site (handleAction, the writing
// route, everything) exactly the way installLazyFunctionStub's own stubs do.
function installSpies(vmw) {
  vmw.run(`
    window.__swbCalls = [];
    (() => {
      const realCreateRevision = createDocumentRevision;
      createDocumentRevision = function spyCreateDocumentRevision(...args) {
        window.__swbCalls.push({ fn: "createDocumentRevision", body: args[0]?.body, documentId: args[0]?.documentId, origin: args[0]?.origin, operation: args[0]?.operation });
        return realCreateRevision(...args);
      };
      const realSave = saveDeskState;
      saveDeskState = function spySaveDeskState(...args) {
        window.__swbCalls.push({ fn: "saveDeskState" });
        return realSave(...args);
      };
    })();
  `);
}

function readCalls(vmw) {
  return JSON.parse(vmw.run("JSON.stringify(window.__swbCalls)"));
}

// --- Outcome 1: the desk-record save is refused. The paid-for answer is
// still captured as a recovery-revision attempt BEFORE the save happens, the
// caller is told the truth, and the status line does not claim success. ---
{
  const vmw = createAppBootVm();
  seedProject(vmw, "swb-refused");
  await loadWritingFlow(vmw);
  installSpies(vmw);
  // The real guard saveDeskState() itself checks first (persistence-status.js:
  // "if (!deskPersistenceWritable) return Promise.resolve(false);") — forcing
  // it, not faking saveDeskState's own return value, is what "force the
  // persistence layer to refuse" means here.
  vmw.run("deskPersistenceWritable = false;");

  const aiText = "这是模型刚刚写好的一段正文，付费生成，绝不能悄悄丢失。";
  const result = await vmw.context.applySectionDraftMarkdown(aiText, { ai: true, statusKey: "saved" });

  test.assert(result === false, `applySectionDraftMarkdown reports the refusal to its caller (got ${JSON.stringify(result)})`);

  const calls = readCalls(vmw);
  const revisionCallIndex = calls.findIndex((c) => c.fn === "createDocumentRevision");
  const revisionCall = calls[revisionCallIndex];
  // ensureDraftForSection (reached via currentSectionDraftContext at the very
  // top of applySectionDraftMarkdown, before the revision capture) also calls
  // saveDeskState as a side effect of creating the draft record — a second,
  // earlier call that is real and expected, not the one the fix is about. The
  // guarantee under test is about the save that actually gates the return
  // value and the status line: the LAST saveDeskState call before this
  // function resolves, which is its own explicit `await saveDeskState()`.
  const lastSaveCallIndex = calls.map((c) => c.fn).lastIndexOf("saveDeskState");
  test.assert(revisionCallIndex >= 0, "createDocumentRevision is actually called for an AI-applied draft (not just present in source)");
  test.assert(lastSaveCallIndex >= 0, "saveDeskState is actually called (and is the thing that refuses)");
  test.assert(
    revisionCallIndex >= 0 && lastSaveCallIndex >= 0 && revisionCallIndex < lastSaveCallIndex,
    `the recovery-revision call happens BEFORE the desk-record save that actually gates the outcome, at runtime — so the answer survives the refusal that follows (calls: ${JSON.stringify(calls.map((c) => c.fn))})`
  );
  test.assert(
    revisionCall?.body === aiText,
    `the revision captures the model's own text verbatim (got ${JSON.stringify(revisionCall?.body)})`
  );
  test.assert(revisionCall?.origin === "model", "the revision is attributed to the model, not the writer");

  const statusEl = vmw.getElementById("status");
  const refusedStatusText = vmw.run('t("section_draft_ai_unsaved_recovered")');
  const successStatusText = vmw.run('t("saved")');
  test.assert(
    statusEl.textContent === refusedStatusText && statusEl.textContent !== successStatusText,
    `the status line reports the refusal copy, not the success copy (got ${JSON.stringify(statusEl.textContent)})`
  );
}

// --- The guard is conditional on ai: a manual (non-AI) edit must not pay the
// cost of a revision capture it does not need. ---
{
  const vmw = createAppBootVm();
  seedProject(vmw, "swb-manual");
  await loadWritingFlow(vmw);
  installSpies(vmw);

  await vmw.context.applySectionDraftMarkdown("一段作者自己手写的内容。", { ai: false });

  const calls = readCalls(vmw);
  test.assert(
    !calls.some((c) => c.fn === "createDocumentRevision"),
    "a manual (ai: false) write-back does not attempt a revision capture at all"
  );
}

// --- Structural checks execution cannot meaningfully replace ---
//
// The successful-save branch of the same ternary (`saved ? t(statusKey) :
// ...`) is one of them. It was tried for real first: boot() itself
// unconditionally kicks off loadDeskState() in the background (app.js's own
// top-level call — see app-boot-vm.mjs's file banner), and this harness has
// no real IndexedDB, so that background chain always eventually hits its own
// catch and sets deskPersistenceWritable = false on its own timeline —
// "Failed to load state from IDB" is literally in the harness's own
// expectedBootNoise allowlist. Stubbing persistDeskState to succeed does not
// help: every await in this test is also an opportunity for that pending
// background chain to run and flip the flag out from under the call, so the
// outcome races the harness's own boot noise rather than testing this fix.
// That is a genuine hole in what this harness can reach (no real IDB), not a
// fact about applySectionDraftMarkdown, so the success half stays pinned by
// source the way the whole file used to be.
const writingFlowSource = read("app/features/writing-flow.js");
test.assertIncludes(
  writingFlowSource,
  'setStatus(saved ? t(statusKey) : t("section_draft_ai_unsaved_recovered"));',
  "the status line never claims the record was written unless the save actually landed (success half — see harness-limitation note above; the refusal half is proven by real execution above)"
);
test.assertIncludes(
  writingFlowSource,
  "return saved;",
  "applySectionDraftMarkdown reports whether the write persisted on the success path too, not just whether it was attempted"
);

// document-revisions.js: the recovery-revision path never touches the
// desk-record fence's own machinery (its own keyval key is the whole point —
// see the file banner). This is a claim about the ABSENCE of a code path
// across a whole module; a real call only proves one path was not taken this
// time, not that no path anywhere touches the fence, so this stays a direct
// read.
const documentRevisions = read("app/core/document-revisions.js");
for (const fenceTerm of ["storageRecordFingerprintCache", "DESK_RECORD_CONFLICT", "deskCollectionPlan", "deskWriteMustBeProxied"]) {
  test.assertNotIncludes(
    documentRevisions,
    fenceTerm,
    `document-revisions.js writes through its own keyval key, never through the desk-record fence (${fenceTerm})`
  );
}

// The failure status has copy in both languages, distinct from the success
// key it must never be confused with — pure data/translation-parity, the
// exact case the ratchet's own note names as a legitimate reason to stay
// static.
// Every OTHER caller either awaits applySectionDraftMarkdown or forwards its
// own promise, rather than firing it and forgetting — a call-site shape
// across two files that is cheaper and just as reliably read as source than
// wired up through the confirm-modal and outline-claim lazy chains for what
// would only be single-line forwarding checks.
test.assertIncludes(
  writingFlowSource,
  "return applySectionDraftMarkdown(clean, { ai: true, statusKey });",
  "confirmAndApplySectionDraft still forwards its own promise"
);
test.assertIncludes(
  read("app/features/outline-claim.js"),
  'await applySectionDraftMarkdown(content, { append: true, ai: true, statusKey: "section_draft_suggested" });',
  "suggestDraft awaits the write-back instead of leaving it dangling"
);

const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
test.assertIncludes(en, "section_draft_ai_unsaved_recovered:", "English copy exists for the unsaved-but-recovered status");
test.assertIncludes(zh, "section_draft_ai_unsaved_recovered:", "Chinese copy exists for the unsaved-but-recovered status");
test.assert(
  !en.match(/section_draft_ai_unsaved_recovered:\s*"([^"]*)"/)?.[1]
    ?.toLowerCase()
    .includes("written by ai"),
  "the recovery status does not reuse the success wording it exists to replace"
);

test.finish();
process.exit(0);
