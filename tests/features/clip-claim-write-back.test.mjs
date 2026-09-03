// A success claim ("clipped", "saved", "written", "inserted", "exported",
// "downloaded") must never fire when the operation's own result says the
// work did not happen.
//
// Two audits found the same family of defects and their cases are merged
// here. lane-honesty drove the reader.js / time-machine.js clip flows
// through REAL execution: createScrap()'s genuine "no project mounted"
// refusal used to be overwritten a moment later by an unconditional
// setStatus(t("reader_clipped")) outside the guard. lane-emptystates swept
// the rest of the app for two mechanical shapes — a success claim outside
// the guard deciding whether the write happened, and a success claim
// following a fire-and-forget async write (saveDeskState, saveArtifact)
// without checking its result — and pinned the fixed shape structurally:
// those call sites depend on live project/DOM/canvas/network state (an
// active project outline, a ClioTalk destination target, a live <canvas>
// for Clio Paint, a real USDZ exporter or GPU renderer for CMF Studio)
// that this harness does not model, so the same "pin the shape, force the
// real guard where it's cheap to reach" split that section-draft-write-back
// and this file's own reader.js/time-machine.js cases document applies to
// the structural assertions below.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clip-claim-write-back");

// --- reader.js: clipReaderFigureReading ---
{
  const vmw = createAppBootVm();
  // No project mounted: createScrap's real guard refuses and returns null.
  vmw.run(`readerFigureReading = { label: "Fig 1", src: "https://example.com/fig.png", text: "A caption written by a model." };`);
  const panel = { removed: false, remove() { this.removed = true; } };
  vmw.context.clipReaderFigureReading(panel);

  test.assert(vmw.run("scraps.length") === 0, "clipReaderFigureReading: no project mounted, so no scrap is actually created");
  const statusEl = vmw.getElementById("status");
  const noProjectText = vmw.run('t("no_project_mounted")');
  const clippedText = vmw.run('t("reader_clipped")');
  test.assert(statusEl.textContent === noProjectText, `clipReaderFigureReading: the real refusal status survives (got ${JSON.stringify(statusEl.textContent)})`);
  test.assert(statusEl.textContent !== clippedText, "clipReaderFigureReading: the false 'clipped' claim no longer clobbers the real refusal");
  test.assert(panel.removed === true, "clipReaderFigureReading: the reading panel still closes either way (unrelated to the claim)");
}

// --- reader.js: clipReaderSelection ---
{
  const vmw = createAppBootVm();
  // Selection-reading itself is not what this test is about (see file
  // banner) — force real text past the "select something first" guard so
  // execution reaches the real createScrap() call, which then refuses for
  // real because no project is mounted.
  vmw.run(`getReaderSelection = () => ({ selection: null, text: "A selected passage." });`);
  vmw.context.clipReaderSelection();

  test.assert(vmw.run("scraps.length") === 0, "clipReaderSelection: no project mounted, so no scrap is actually created");
  const statusEl = vmw.getElementById("status");
  test.assert(
    statusEl.textContent === vmw.run('t("no_project_mounted")'),
    `clipReaderSelection: the real refusal status survives (got ${JSON.stringify(statusEl.textContent)})`
  );
  test.assert(statusEl.textContent !== vmw.run('t("reader_clipped")'), "clipReaderSelection: the false 'clipped' claim no longer clobbers the real refusal");
}

// --- reader.js: clipReaderSelectionWithTranslation ---
{
  const vmw = createAppBootVm();
  vmw.run(`
    getReaderSelection = () => ({ selection: null, text: "A selected passage." });
    getTranslationTargetForUi = () => "zh";
    translateTextWithLocalModel = async () => "翻译文本";
  `);
  await vmw.context.clipReaderSelectionWithTranslation();

  test.assert(vmw.run("scraps.length") === 0, "clipReaderSelectionWithTranslation: no project mounted, so no scrap is actually created");
  const statusEl = vmw.getElementById("status");
  test.assert(
    statusEl.textContent === vmw.run('t("no_project_mounted")'),
    `clipReaderSelectionWithTranslation: the real refusal status survives (got ${JSON.stringify(statusEl.textContent)})`
  );
  test.assert(
    statusEl.textContent !== vmw.run('t("reader_bilingual_clipped")'),
    "clipReaderSelectionWithTranslation: the false 'clipped' claim no longer clobbers the real refusal"
  );
}

// --- time-machine.js: clipTimeMachineSelection / clipTimeMachineSelectionWithTranslation ---
// createTimeMachineClip's own body pulls in Time Machine page/reader DOM
// state that has nothing to do with the claim-honesty guard under test here
// (whether the wrapper shows "clipped" only when a scrap actually came back);
// stubbing its return value isolates exactly that guard, the same way this
// suite spies a call site elsewhere rather than re-driving its whole body.
{
  const vmw = createAppBootVm();
  await vmw.run("ensureTimeMachineModule()");
  vmw.run(`
    timeMachineReaderSelection = () => ({ selection: null, text: "hello" });
    window.__cmReturn = null;
    createTimeMachineClip = () => window.__cmReturn;
  `);

  vmw.context.clipTimeMachineSelection();
  test.assert(
    vmw.getElementById("status").textContent !== vmw.run('t("reader_clipped")'),
    "clipTimeMachineSelection: a falsy createTimeMachineClip result is never reported as 'clipped'"
  );

  vmw.run(`window.__cmReturn = { id: "s1" };`);
  vmw.context.clipTimeMachineSelection();
  test.assert(
    vmw.getElementById("status").textContent === vmw.run('t("reader_clipped")'),
    "clipTimeMachineSelection: a real result is still reported as 'clipped' — the fix does not suppress the true claim"
  );
}
{
  const vmw = createAppBootVm();
  await vmw.run("ensureTimeMachineModule()");
  vmw.run(`
    timeMachineReaderSelection = () => ({ selection: null, text: "hello" });
    getTranslationTargetForUi = () => "zh";
    currentTranslationModel = () => "test-model";
    translateTextWithLocalModel = async () => "翻译文本";
    window.__cmReturn = null;
    createTimeMachineClip = () => window.__cmReturn;
  `);

  await vmw.context.clipTimeMachineSelectionWithTranslation();
  test.assert(
    vmw.getElementById("status").textContent !== vmw.run('t("reader_bilingual_clipped")'),
    "clipTimeMachineSelectionWithTranslation: a falsy createTimeMachineClip result is never reported as 'clipped'"
  );

  vmw.run(`window.__cmReturn = { id: "s2" };`);
  await vmw.context.clipTimeMachineSelectionWithTranslation();
  test.assert(
    vmw.getElementById("status").textContent === vmw.run('t("reader_bilingual_clipped")'),
    "clipTimeMachineSelectionWithTranslation: a real result is still reported as 'clipped' — the fix does not suppress the true claim"
  );
}

// --- Structural checks execution cannot cheaply replace ---
// Driving these through real execution would need a fully wired DocMap
// document + confirm-modal stub, a fully wired ClioTalk "use result" choice
// object, a live canvas / GPU renderer / real export dispatch, and live
// project state; the shape itself is what needs pinning here. Each call
// site must consult the operation's own result (saveDeskState's return, or
// saveArtifact's dispatch result) before it claims success.

// --- docmap.js: insertDocMapNodeAsOutline / saveCurrentDocMap ---
{
  const docmap = read("app/features/docmap.js");
  test.assertIncludes(
    docmap,
    'setStatus(saved ? t("docmap_inserted_outline") : t("docmap_inserted_outline_unsaved"));',
    "insertDocMapNodeAsOutline never claims the outline replacement landed unless saveDeskState's own result says so"
  );
  test.assertIncludes(
    docmap,
    'setStatus(saved ? t("docmap_saved_file", name) : t("docmap_saved_file_unsaved", name));',
    "saveCurrentDocMap never claims the DocMap file was saved unless saveDeskState's own result says so"
  );
}

// --- chat-messages.js: applyClioTalkUseResult ---
{
  const chatMessages = read("app/core/chat-messages.js");
  test.assertIncludes(
    chatMessages,
    'setStatus(saved ? t("clio_result_written", destination.name) : t("clio_result_written_unsaved", destination.name));',
    "applyClioTalkUseResult never claims the reply was written unless saveDeskState's own result says so"
  );
}

// --- translation.js: the translate-document flow ---
{
  const translation = read("app/features/translation.js");
  test.assertIncludes(
    translation,
    'setStatus(saved ? t("translated_document_saved", name) : t("translated_document_saved_unsaved", name));',
    "the translated-document save never claims success unless saveDeskState's own result says so"
  );
}

// --- clio-paint.js: saveClioPaintPicture ---
// The picture is usable in memory (sketch-read etc.) regardless of desk
// persistence, so the function still returns true either way; only the
// "Picture saved." claim is gated on the real save result.
{
  const clioPaint = read("app/features/clio-paint.js");
  test.assertIncludes(
    clioPaint,
    'setStatus(persisted ? t("clio_paint_saved") : t("clio_paint_saved_unsaved"));',
    "saveClioPaintPicture never claims the picture was saved unless saveDeskState's own result says so"
  );
}

// --- writing-flow.js: pasteOutlineMarkdown / addOutlineSection ---
// Same shape as insertDocMapNodeAsOutline above: the outline tree is
// already mutated in memory before the claim.
{
  const writingFlow = read("app/features/writing-flow.js");
  test.assertIncludes(
    writingFlow,
    'setStatus(saved ? t("outline_tree_pasted", nodes.length) : t("outline_tree_pasted_unsaved", nodes.length));',
    "pasteOutlineMarkdown never claims the paste landed unless saveDeskState's own result says so"
  );
  test.assertIncludes(
    writingFlow,
    'setStatus(saved ? t("outline_section_added") : t("outline_section_added_unsaved"));',
    "addOutlineSection never claims the section was added unless saveDeskState's own result says so"
  );
}

// --- finder-objects.js: alias + clipping-into-deck mutations ---
{
  const finderObjects = read("app/features/finder-objects.js");
  test.assertIncludes(
    finderObjects,
    'setStatus(saved ? t("alias_replaced", copy.name) : t("alias_replaced_unsaved", copy.name));',
    "replaceAliasWithOriginal never claims the replacement landed unless saveDeskState's own result says so"
  );
  test.assertIncludes(
    finderObjects,
    'setStatus(saved ? t("alias_created", alias.name) : t("alias_created_unsaved", alias.name));',
    "makeAliasForFinderSelection never claims the alias was created unless saveDeskState's own result says so"
  );
  test.assertIncludes(
    finderObjects,
    'setStatus(saved ? t("clipping_inserted", title) : t("clipping_inserted_unsaved", title));',
    "insertClippingIntoClioStage never claims the clipping landed unless saveDeskState's own result says so"
  );
}

// --- export-import.js: download/export helpers that ignored saveArtifact's
// own dispatch result (it can refuse - e.g. no File constructor - even
// though the content built fine). ---
{
  const exportImport = read("app/features/export-import.js");
  test.assertIncludes(
    exportImport,
    'setStatus(dispatched ? t("project_disk_exported", backup.project.name) : t("project_disk_export_dispatch_failed"));',
    "exportActiveProjectDisk never claims the backup was exported unless saveArtifact's own dispatch result says so"
  );
  test.assertIncludes(
    exportImport,
    'setStatus(saved ? t("downloaded_markdown_only") : t("markdown_download_failed"));',
    "downloadMarkdown never claims the file downloaded unless saveArtifact's own dispatch result says so"
  );
  test.assertIncludes(
    exportImport,
    'setStatus(saved ? t("downloaded_markdown_exported", item.title) : t("burned_markdown_download_failed", item.title));',
    "downloadMarkdownAndBurnToProjectCd reports the download's own failure distinctly from the (already-landed) burn"
  );
  test.assertIncludes(
    exportImport,
    'setStatus(saved ? t(statusKey) : t("markdown_download_failed"));',
    "downloadPlainMarkdown never claims the file downloaded unless saveArtifact's own dispatch result says so"
  );
  test.assertIncludes(
    exportImport,
    'setStatus((item.format || "text/markdown") === "text/html" ? t("downloaded_html_file") : t("downloaded_plain_markdown"));',
    "downloadProjectCdItem's success claim is reached only after its own saved-guard, and is no longer a hardcoded literal"
  );
}

// --- boot.js: the boot-recovery screen's manual JSON export ---
{
  const boot = read("app/core/boot.js");
  test.assertIncludes(
    boot,
    'setNote(dispatched ? t("boot_recovery_exported") : t("boot_recovery_export_failed"));',
    "the boot-recovery export note follows downloadJsonFile's own dispatch result, not just bundle verification"
  );
}

// --- cmf-studio.js: USDZ export (browser + server fallback) and the
// multi-view PNG export loop. ---
{
  const cmfStudio = read("app/features/cmf-studio.js");
  test.assertIncludes(
    cmfStudio,
    'setCmfStatus(saved ? t("cmf_export_done") : t("cmf_export_download_failed"));',
    "exportUsdz never claims the file was exported unless saveArtifact's own dispatch result says so"
  );
  test.assertIncludes(
    cmfStudio,
    'setCmfStatus(allSaved ? t("cmf_export_views_done") : t("cmf_export_views_download_failed"));',
    "exportViewsAsPng never claims every view exported unless every saveArtifact dispatch actually confirmed"
  );
}

// --- quick-draft-listen.js / quick-draft-editor.js: SRT, shot-list, and
// Markdown export. ---
{
  const quickDraftListen = read("app/features/quick-draft-listen.js");
  test.assertIncludes(
    quickDraftListen,
    'setQuickDraftStatus(saved ? t("quick_draft_export_srt_done") : t("markdown_download_failed"));',
    "exportQuickDraftListenSrt never claims the SRT downloaded unless saveArtifact's own dispatch result says so"
  );
  test.assertIncludes(
    quickDraftListen,
    'setQuickDraftStatus(saved ? t("quick_draft_export_shot_list_done") : t("markdown_download_failed"));',
    "exportQuickDraftShotList never claims the shot list downloaded unless saveArtifact's own dispatch result says so"
  );

  const quickDraftEditor = read("app/features/quick-draft-editor.js");
  test.assertIncludes(
    quickDraftEditor,
    'setQuickDraftStatus(saved ? t("quick_draft_export_done") : t("markdown_download_failed"));',
    "exportQuickDraftMarkdown never claims the Markdown downloaded unless saveArtifact's own dispatch result says so"
  );
}

// Translation parity for every new honesty key this merged audit added.
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
for (const key of [
  "docmap_inserted_outline_unsaved",
  "docmap_saved_file_unsaved",
  "clio_result_written_unsaved",
  "safari_http_local_not_copied",
  "translated_document_saved_unsaved",
  "clio_paint_saved_unsaved",
  "outline_tree_pasted_unsaved",
  "outline_section_added_unsaved",
  "alias_replaced_unsaved",
  "alias_created_unsaved",
  "clipping_inserted_unsaved",
  "project_disk_export_dispatch_failed",
  "markdown_download_failed",
  "burned_markdown_download_failed",
  "downloaded_html_file",
  "cmf_export_download_failed",
  "cmf_export_views_download_failed",
]) {
  test.assertIncludes(en, `${key}:`, `English carries the honesty key ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese carries the honesty key ${key}`);
}

test.finish();
