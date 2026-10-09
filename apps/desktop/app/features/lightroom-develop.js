// 文字亮室 — the develop model, wired to the window.
//
// The pure parts (who may write, presets, what a layer changed) are in
// app/core/darkroom-develop.js and app/core/darkroom-record.js. This file is
// everything that needs a window around it:
//
//   - writing a developed text back through the window that holds the pen,
//   - the darkroom's own history (⌘Z), kept apart from the version list and
//     from the film strip that shows it,
//   - the stale-negative banner and the re-shoot,
//   - "just this layer", and the before/after compare with its held peek,
//   - presets, and settings carried to another document,
//   - the automatic version taken on leaving a document,
//   - and the one place Preview and Develop decide what they mean.
//
// It loads after quick-draft-composition.js and reads the globals the rest of
// the Quick Draft chain declares. Everything it needs from the page it asks for
// at call time, so it is inert in a context with no window.

let lightroomVisitTouched = false;
let lightroomSoloKind = "";
let lightroomCompare = { on: false, mode: "side", sourceId: "" };
let lightroomPeeking = false;
const lightroomHistories = new Map();
const LIGHTROOM_PRESETS_KEY = "ai-system6-darkroom-presets";

// ---- Which document, which history ---------------------------------------------
function lightroomDocumentKey() {
  return `${typeof activeProjectId === "string" ? activeProjectId : ""}:${lightroomSubjectDocumentId() || "draft"}`;
}

// The darkroom did something with this document this visit, so leaving keeps a
// version of it.
function lightroomTouch() {
  lightroomVisitTouched = true;
}

function lightroomSubjectChanged() {
  lightroomVisitTouched = false;
  lightroomSoloKind = "";
  lightroomCompare = { on: false, mode: lightroomCompare.mode, sourceId: "" };
  if (typeof lightroomRefreshChrome === "function") lightroomRefreshChrome();
}

// Whether the darkroom is the window the writer is using, for the commands that
// read a selection or a key. Asking the front window directly mistakes a floating
// accessory for the darkroom; the menu context resolves that the way the menu
// bar does.
function lightroomIsMenuContext() {
  const win = typeof resolveMenuContextWindow === "function" ? resolveMenuContextWindow() : null;
  return win?.dataset?.window === "lightroom";
}

function lightroomWindow() {
  return typeof getWindow === "function" ? getWindow("lightroom") : null;
}

// ---- Writing a text back through its owner -------------------------------------------
// Quick Draft's own draft is written through Quick Draft's commit. A document
// TeachText holds is written through TeachText -- the textarea the writer sees,
// then TeachText's own save, which keeps its own revision. A document nobody is
// editing is written to its record with a revision. Never any other way: a
// window that does not hold the pen does not get to write.
async function lightroomApplyBody(body, { operation = "darkroom-develop", previousBody = null, decision = lightroomWriteDecision() } = {}) {
  const next = String(body ?? "");
  if (!decision.canWrite) return { ok: false, reason: decision.reason };
  const before = previousBody === null ? lightroomBodyText() : String(previousBody);
  if (decision.path === "draft") {
    if (refs.draft) refs.draft.value = next;
    const committed = await commitQuickDraft({ workspace: { body: next } }, { captureForm: false });
    if (!committed.ok) {
      if (refs.draft) refs.draft.value = before;
      return { ok: false, reason: "save-failed" };
    }
    return { ok: true };
  }
  const documentId = lightroomSubjectDocumentId();
  const file = lightroomSubjectFile();
  if (!file || !documentId) return { ok: false, reason: "missing" };
  if (decision.path === "editor") {
    if (typeof teachTextBodyInput === "undefined" || !teachTextBodyInput || activeTextFileId !== documentId) {
      return { ok: false, reason: "open-in-owner" };
    }
    teachTextBodyInput.value = next;
    // The same event typing raises, so the manuscript's own sync (the outline,
    // the tab, the Modified mark) runs exactly as it would for the writer.
    teachTextBodyInput.dispatchEvent(new Event("input", { bubbles: true }));
    // TeachText's save brings TeachText forward, and with a single application
    // in front that sends the darkroom away. The writer is developing here, so
    // the darkroom is put back where it was once the owner has saved.
    const darkroomWindow = lightroomWindow();
    const wasOpen = Boolean(darkroomWindow && !darkroomWindow.classList.contains("is-hidden"));
    const bringBack = async () => {
      if (wasOpen && darkroomWindow.classList.contains("is-hidden") && typeof openWindow === "function") {
        await openWindow("lightroom", { skipQuickDraftEntrypoint: true });
        renderLightroomSubject({ force: true });
      }
    };
    try {
      const saved = typeof saveTextDocument === "function" ? await saveTextDocument({ promptForFolder: false }) : false;
      if (saved === false) {
        teachTextBodyInput.value = before;
        teachTextBodyInput.dispatchEvent(new Event("input", { bubbles: true }));
        await bringBack();
        return { ok: false, reason: "save-failed" };
      }
    } catch {
      await bringBack();
      return { ok: false, reason: "save-failed" };
    }
    await bringBack();
    return { ok: true };
  }
  // path "record": the file is nobody's editor at the moment.
  const now = new Date().toISOString();
  file.body = next;
  file.updatedAt = now;
  if (typeof markDeskDirty === "function") markDeskDirty("chatFiles", file.id);
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  (project?.documentTabs || []).forEach((tab) => {
    if (tab?.app === "teachText" && (tab.state?.activeTextFileId === file.id || tab.backing?.id === file.id)) {
      tab.state = { ...(tab.state || {}), body: next };
      tab.updatedAt = now;
    }
  });
  if (project && typeof markProjectTabsDirty === "function") markProjectTabsDirty(project);
  let saved = false;
  try {
    saved = typeof saveDeskState === "function" ? await saveDeskState() : true;
  } catch {
    saved = false;
  }
  if (!saved) {
    file.body = before;
    return { ok: false, reason: "save-failed" };
  }
  if (typeof renderDocuments === "function") renderDocuments();
  return { ok: true };
}

// ---- History (⌘Z) ---------------------------------------------------------------------
// A step is the darkroom as it was before a change: the layer settings, the
// negative and the proof, and the text itself, because a develop that wrote
// back has to take the text back with it. Versions are a different thing -- a
// list the writer keeps and names, on disk -- and the film strip is only how
// that list is shown. Undo does not touch either.
function lightroomReadSnapshot() {
  const record = darkroomOf();
  return {
    body: lightroomBodyText(),
    settings: window.AISystem6DarkroomRecord ? structuredClone(record.settings || {}) : {},
    negative: record.negative || "",
    negativeUpdatedAt: record.negativeUpdatedAt || "",
    composite: record.composite || "",
    currentKey: record.currentKey || "",
    generatedAt: record.generatedAt || "",
    modelDelivered: record.modelDelivered || "",
    modelDeliveredAt: record.modelDeliveredAt || "",
    chainBase: record.chainBase || "",
  };
}

function lightroomHistoryRead() {
  return window.AISystem6EditHistory ? lightroomReadSnapshot() : null;
}

function lightroomSnapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function lightroomHistoryEntry() {
  const kernel = window.AISystem6EditHistory;
  if (!kernel) return null;
  const key = lightroomDocumentKey();
  let entry = lightroomHistories.get(key);
  if (entry) return entry;
  entry = { past: [], future: [], pending: null, history: null };
  entry.history = kernel.createEditHistory({
    read: lightroomReadSnapshot,
    write: (snapshot) => lightroomWriteSnapshot(snapshot),
    limit: 100,
    equals: lightroomSnapshotsEqual,
    weigh: (snapshot) => JSON.stringify(snapshot).length,
    budget: 6000000,
    onChange: (event) => {
      if (event.kind === "record" && entry.pending) {
        entry.past.push({ label: event.label, body: entry.pending.body, after: "" });
        entry.future = [];
      } else if (event.kind === "undo") {
        const step = entry.past.pop();
        if (step) entry.future.push(step);
      } else if (event.kind === "redo") {
        const step = entry.future.pop();
        if (step) entry.past.push(step);
      } else if (event.kind === "clear") {
        entry.past = [];
        entry.future = [];
      }
    },
  });
  lightroomHistories.set(key, entry);
  return entry;
}

// Record a step whose "before" the caller took. Nothing is recorded for a
// change that changed nothing, and nothing for a write that failed -- the
// callers only get here after their commit landed.
function lightroomRecordStep(label, before) {
  const entry = lightroomHistoryEntry();
  if (!entry || !before) return false;
  if (lightroomSnapshotsEqual(before, lightroomReadSnapshot())) return false;
  lightroomVisitTouched = true;
  entry.pending = before;
  try {
    return entry.history.record(label, before);
  } finally {
    entry.pending = null;
    if (typeof updateMenuState === "function") updateMenuState();
  }
}

// Restoring a step has to put the darkroom's record back and, if the text
// moved, the text. The record goes in at once; the text goes through its owner,
// which is asynchronous and may refuse -- the guard on undo/redo below checks
// that before the history moves, so a refused write leaves the step in place.
function lightroomWriteSnapshot(snapshot) {
  const slot = activeProjectQuickDraft({ create: false });
  if (!slot || !snapshot) return;
  const { body, ...fields } = snapshot;
  const composition = { ...darkroomOf(slot.record), ...fields };
  // A develop that wrote the draft back also moved the draft; one that only
  // changed the stack did not, and must not rewrite a body the writer has since
  // edited.
  const bodyMoved = typeof body === "string" && body !== lightroomBodyText();
  quickDraftLastComposite = "";
  quickDraftLastCompositeKey = "";
  const decision = lightroomWriteDecision();
  const patch = { workspace: { composition } };
  if (bodyMoved && decision.path === "draft") {
    if (refs.draft) refs.draft.value = body;
    patch.workspace.body = body;
    patch.workspace.title = titleFromBody(body);
  }
  void commitQuickDraft(patch, { captureForm: false }).then((committed) => {
    if (committed.ok) renderQuickDraft(committed.record);
    else setLightroomStatus(t("quick_draft_save_failed"));
  });
  if (bodyMoved && decision.path !== "draft") {
    void lightroomApplyBody(body, { operation: "darkroom-undo", decision }).then((result) => {
      if (result.ok) {
        renderQuickDraft(activeProjectQuickDraft({ create: false })?.record);
      } else {
        setLightroomStatus(t("lightroom_write_failed"));
      }
    });
  }
}

// Undo and Redo as Edit > Undo sees them. The kernel moves its stacks before it
// writes, so a restore that would need the document's pen and cannot have it is
// refused here, before anything has moved.
function lightroomEditHistory() {
  const entry = lightroomHistoryEntry();
  if (!entry) return null;
  const refusedFor = (targetBody) => {
    if (typeof targetBody !== "string" || targetBody === lightroomBodyText()) return false;
    const decision = lightroomWriteDecision();
    if (decision.canWrite) return false;
    const message = lightroomWriteNotice(decision);
    setLightroomStatus(message);
    return true;
  };
  return {
    undo() {
      const step = entry.past[entry.past.length - 1];
      if (!step || refusedFor(step.body)) return false;
      step.after = lightroomBodyText();
      const done = entry.history.undo();
      if (done) {
        quickDraftLastComposite = "";
        quickDraftLastCompositeKey = "";
        lightroomRefreshChrome();
      }
      return done;
    },
    redo() {
      const step = entry.future[entry.future.length - 1];
      if (!step || refusedFor(step.after)) return false;
      const done = entry.history.redo();
      if (done) lightroomRefreshChrome();
      return done;
    },
    canUndo: () => entry.history.canUndo(),
    canRedo: () => entry.history.canRedo(),
    undoLabel: () => entry.history.undoLabel(),
    redoLabel: () => entry.history.redoLabel(),
  };
}

// The steps of this sitting, oldest first, for the compare picker.
function lightroomHistorySteps() {
  const entry = lightroomHistories.get(lightroomDocumentKey());
  return entry ? entry.past.map((step) => ({ label: t(step.label), body: step.body })) : [];
}

if (typeof registerEditHistory === "function") {
  registerEditHistory("lightroom", () => lightroomEditHistory());
}

// ---- Preview and Develop mean one thing ----------------------------------------------
// The footer keys and the menu rows used to disagree: under the Content track
// the keys ran that track's rewrite and the menu ran the layers. Both call
// these, and both ask lightroomActionState whether they may.
function lightroomPreview() {
  if (typeof quickDraftTrackOwnsPaper === "function" && quickDraftTrackOwnsPaper()) {
    return generateQuickDraftTraffic({ force: true });
  }
  return applyAdjustmentLayers();
}

function lightroomDevelop() {
  if (typeof quickDraftTrackShouldDevelop === "function" && quickDraftTrackShouldDevelop()) {
    return developQuickDraftTraffic();
  }
  return developAdjustmentLayers();
}

/**
 * Whether Preview and Develop are available, and why not. One answer for the
 * footer keys, the menu rows and the commands they fire.
 */
function lightroomActionState(record = activeProjectQuickDraft({ create: false })?.record) {
  const normalized = normalizeQuickDraftRecord(record);
  const subjectBody = lightroomBodyText();
  const hasBody = Boolean(String((lightroomSubject ? subjectBody : (subjectBody || normalized.workspace.body)) || "").trim());
  const enabled = enabledAdjustmentLayers(record).length > 0;
  const trackOwns = typeof quickDraftTrackOwnsPaper === "function" && quickDraftTrackOwnsPaper();
  const trackReady = typeof quickDraftTrackShouldDevelop === "function" && quickDraftTrackShouldDevelop();
  const trackBusy = Boolean(typeof quickDraftTrackBusy !== "undefined" && quickDraftTrackBusy);
  const decision = lightroomWriteDecision();
  const modelAvailable = quickDraftModelAvailable();
  const composite = currentCompositeState(normalized);
  const proof = trackOwns ? trackReady : (enabled && composite.ready && composite.proof);
  const previewReason = !hasBody
    ? "balloon_qd_darkroom_needs_body"
    : !modelAvailable
      ? "balloon_disabled_menu_model"
      : !trackOwns && !enabled
        ? "balloon_qd_preview_needs_layer"
        : "";
  const stale = !trackOwns && window.AISystem6DarkroomRecord.darkroomNegativeState(darkroomOf(record), subjectBody).state === "stale";
  const developReason = !decision.canWrite
    ? "balloon_qd_darkroom_readonly"
    : !hasBody
      ? "balloon_qd_darkroom_needs_body"
      : !trackOwns && !enabled
        ? "balloon_qd_preview_needs_layer"
        : stale
          ? "lightroom_develop_stale"
          : !proof
            ? "balloon_qd_develop_needs_preview"
            : "";
  return {
    hasBody,
    enabled,
    trackOwns,
    proof,
    decision,
    preview: { available: !previewReason && !(trackOwns && trackBusy), reason: previewReason },
    develop: { available: !developReason && !(trackOwns && trackBusy), reason: developReason },
  };
}

// ---- Stale negative and re-shoot ----------------------------------------------------------
function lightroomNegativeReport(record = activeProjectQuickDraft({ create: false })?.record) {
  return window.AISystem6DarkroomRecord.darkroomNegativeState(darkroomOf(record), lightroomBodyText());
}

async function lightroomReshoot() {
  const slot = activeProjectQuickDraft();
  const task = createQuickDraftAsyncTask({ create: false });
  if (!slot || !task) {
    setLightroomStatus(t("quick_draft_no_project"));
    return false;
  }
  const body = lightroomBodyText();
  const before = lightroomReadSnapshot();
  const result = window.AISystem6DarkroomRecord.reshootDarkroomNegative(darkroomOf(slot.record), body, {
    id: stableId("version"),
  });
  if (result.refused) {
    setLightroomStatus(t("quick_draft_empty_body"));
    return false;
  }
  quickDraftLastComposite = "";
  quickDraftLastCompositeKey = "";
  const committed = await task.commit({ workspace: { composition: result.record } }, { captureForm: false });
  if (!committed.ok) {
    setLightroomStatus(t("quick_draft_save_failed"));
    return false;
  }
  lightroomSoloKind = "";
  renderQuickDraft(committed.record);
  lightroomRecordStep("edit_step_reshoot", before);
  setLightroomStatus(t("lightroom_reshoot_done"));
  noteLightroomReceipt("lightroom_reshoot");
  return true;
}

// ---- Versions: named, kept, and left behind -------------------------------------------------
async function lightroomNameVersion(id = "") {
  const slot = activeProjectQuickDraft();
  const task = createQuickDraftAsyncTask({ create: false });
  if (!slot || !task) return false;
  const record = darkroomOf(slot.record);
  const entry = (record.versions || []).find((item) => item.id === id);
  if (!entry) return false;
  const name = await showInputDialog({
    title: t("lightroom_version_name_title"),
    message: t("lightroom_version_name_message"),
    defaultValue: String(entry.name || ""),
    placeholder: t("lightroom_version_name_placeholder"),
  });
  if (name === null) return false;
  const next = window.AISystem6DarkroomRecord.nameDarkroomVersion(record, id, name);
  if (!next) return false;
  const committed = await task.commit({ workspace: { versions: next.versions } }, { captureForm: false });
  if (!committed.ok) {
    setLightroomStatus(t("quick_draft_save_failed"));
    return false;
  }
  lightroomVisitTouched = true;
  renderQuickDraft(committed.record);
  setLightroomStatus(t(String(name).trim() ? "lightroom_version_named" : "lightroom_version_unnamed"));
  return true;
}

// Leaving a document keeps one automatic version of it. The darkroom's record
// is its own state, so this needs no pen on the document; it is skipped when the
// darkroom did nothing this visit, when there is nothing to keep, or when the
// text is already a version or the negative.
function lightroomLeaveDocument() {
  if (!lightroomVisitTouched) return false;
  lightroomVisitTouched = false;
  const slot = activeProjectQuickDraft({ create: false });
  const documentId = lightroomSubjectDocumentId();
  const store = window.AISystem6DarkroomStore;
  if (!slot || !documentId || !store?.darkroomIsLoaded?.(slot.project.id, documentId)) return false;
  const record = store.darkroomRecord(slot.project.id, documentId);
  const { record: next, added } = window.AISystem6DarkroomRecord.leaveDarkroomVersion(record, lightroomBodyText(), {
    id: stableId("version"),
  });
  if (!added) return false;
  store.setDarkroomRecord(slot.project.id, documentId, next);
  store.persistDarkroomRecord(slot.project.id, documentId).catch((error) => {
    console.warn("Could not keep the version taken on leaving.", error);
  });
  return true;
}

// ---- What the last run did, layer by layer ------------------------------------------------------
function noteLightroomRun() {
  lightroomVisitTouched = true;
}

// The steps of the stack as it now stands, rebuilt from the layer cache: every
// layer a run finished is in it, so "just this layer" works right after a run
// and after a reload alike, and never asks the model anything.
function lightroomCurrentSteps() {
  const record = activeProjectQuickDraft({ create: false })?.record;
  if (!record) return [];
  return lightroomRunPlan(record).steps || [];
}

function lightroomSoloStep() {
  if (!lightroomSoloKind) return null;
  return lightroomCurrentSteps().find((step) => step.kind === lightroomSoloKind && !step.skipped) || null;
}

function lightroomSetSolo(kind = "") {
  const next = kind && kind !== lightroomSoloKind ? kind : "";
  if (next) {
    const step = lightroomCurrentSteps().find((item) => item.kind === next && !item.skipped);
    if (!step) {
      setLightroomStatus(t("lightroom_solo_none", t(adjustmentLayerLabelKey(next))));
      return false;
    }
    lightroomCompare = { ...lightroomCompare, on: false };
  }
  lightroomSoloKind = next;
  if (next && !quickDraftPreviewIsOpen()) setQuickDraftDisplayMode("read");
  lightroomRefreshChrome();
  if (typeof renderQuickDraftPreviewPane === "function" && quickDraftPreviewIsOpen()) renderQuickDraftPreviewPane();
  return Boolean(next);
}

function lightroomRunsHtml(runs, kind) {
  return runs
    .map((run) => (run.changed ? `<mark class="lightroom-changed is-${escapeHtml(kind || run.kind)}">${escapeHtml(run.text)}</mark>` : escapeHtml(run.text)))
    .join("");
}

function renderLightroomSolo() {
  const step = lightroomSoloStep();
  if (!step || !refs.preview) return false;
  const compare = window.AISystem6DarkroomDevelop.darkroomCompare(step.input, step.output);
  const label = t(adjustmentLayerLabelKey(step.kind));
  const summary = compare.changed
    ? t("lightroom_solo_summary", label, compare.summary.added, compare.summary.removed)
    : t("lightroom_solo_unchanged", label);
  refs.preview.innerHTML = [
    `<p class="quick-draft-grain-note">${escapeHtml(summary)}</p>`,
    `<pre class="quick-draft-grain-body lightroom-changes">${lightroomRunsHtml(compare.after, "after")}</pre>`,
  ].join("");
  return true;
}

// ---- Compare: peek, side by side, split ----------------------------------------------------------
function lightroomCompareSources() {
  const record = darkroomOf();
  const stampOf = (value) => (value
    ? new Date(value).toLocaleTimeString(currentLanguage === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" })
    : "");
  const sources = window.AISystem6DarkroomDevelop.darkroomCompareSources(record, lightroomHistorySteps(), {
    negative: t("quick_draft_negative"),
    step: t("lightroom_compare_step"),
  });
  return sources.map((source) => (source.kind === "version"
    ? {
      ...source,
      label: [stampOf(source.version?.createdAt), String(source.version?.name || "") || textExcerpt(source.body, 18) || t("quick_draft_versions")]
        .filter(Boolean).join(" · "),
    }
    : source));
}

function lightroomCompareSource() {
  const sources = lightroomCompareSources();
  return sources.find((source) => source.id === lightroomCompare.sourceId) || sources[0] || null;
}

function lightroomCompareAfterText() {
  const state = currentCompositeState();
  return state.proof && state.ready ? state.text : lightroomBodyText();
}

function lightroomSetCompare(next = {}) {
  const sources = lightroomCompareSources();
  if (next.on && !sources.length) {
    setLightroomStatus(t("lightroom_compare_none"));
    return false;
  }
  lightroomCompare = { ...lightroomCompare, ...next };
  if (lightroomCompare.on) lightroomSoloKind = "";
  if (lightroomCompare.on && !sources.some((source) => source.id === lightroomCompare.sourceId)) {
    lightroomCompare.sourceId = sources[0].id;
  }
  if (lightroomCompare.on && !quickDraftPreviewIsOpen()) setQuickDraftDisplayMode("read");
  lightroomRefreshChrome();
  if (quickDraftPreviewIsOpen()) renderQuickDraftPreviewPane();
  return lightroomCompare.on;
}

function renderLightroomCompare() {
  if (!lightroomCompare.on || !refs.preview) return false;
  const source = lightroomCompareSource();
  if (!source) return false;
  const develop = window.AISystem6DarkroomDevelop;
  const after = lightroomCompareAfterText();
  const compare = develop.darkroomCompare(source.body, after);
  const afterLabel = t("lightroom_compare_current");
  const note = compare.changed
    ? t("lightroom_compare_summary", compare.summary.added, compare.summary.removed)
    : t("lightroom_compare_same");
  if (lightroomCompare.mode === "split") {
    // One column, the changes marked where they happen: what was taken out
    // struck through, what was put in marked.
    const diff = window.AISystem6WordDiff.wordDiff(source.body, after);
    let html = "";
    let at = 0;
    diff.hunks.forEach((hunk) => {
      html += escapeHtml(after.slice(at, hunk.after.start));
      const gone = source.body.slice(hunk.before.start, hunk.before.end);
      const came = after.slice(hunk.after.start, hunk.after.end);
      if (gone) html += `<del class="lightroom-changed is-before">${escapeHtml(gone)}</del>`;
      if (came) html += `<mark class="lightroom-changed is-after">${escapeHtml(came)}</mark>`;
      at = hunk.after.end;
    });
    html += escapeHtml(after.slice(at));
    refs.preview.innerHTML = `<p class="quick-draft-grain-note">${escapeHtml(note)}</p><pre class="quick-draft-grain-body lightroom-changes">${html}</pre>`;
    return true;
  }
  refs.preview.innerHTML = [
    `<p class="quick-draft-grain-note">${escapeHtml(note)}</p>`,
    `<div class="lightroom-compare-sides">`,
    `<section><h4>${escapeHtml(source.label)}</h4><pre class="quick-draft-grain-body lightroom-changes">${lightroomRunsHtml(compare.before, "before")}</pre></section>`,
    `<section><h4>${escapeHtml(afterLabel)}</h4><pre class="quick-draft-grain-body lightroom-changes">${lightroomRunsHtml(compare.after, "after")}</pre></section>`,
    `</div>`,
  ].join("");
  return true;
}

// The paper belongs to whichever of these is on: the changes of one layer, or a
// comparison. Called by the pane's renderer before it draws its own view.
function renderLightroomOverlayPane() {
  if (typeof quickDraftDisplayMode !== "undefined" && quickDraftDisplayMode === "listen") return false;
  if (lightroomCompare.on) return renderLightroomCompare();
  if (lightroomSoloKind) return renderLightroomSolo();
  return false;
}

// Hold \ to see the other side: the compare source while the key is down, the
// proof again when it comes up.
function lightroomPeekStart() {
  if (lightroomPeeking || !refs.preview) return false;
  const source = lightroomCompareSource();
  if (!source) {
    setLightroomStatus(t("lightroom_compare_none"));
    return false;
  }
  lightroomPeeking = true;
  quickDraftPreviewHost()?.classList.add("is-peeking");
  setLightroomStatus(t("lightroom_peek_showing", source.label));
  quickDraftMarkdownPreview(source.body);
  return true;
}

function lightroomPeekEnd() {
  if (!lightroomPeeking) return;
  lightroomPeeking = false;
  quickDraftPreviewHost()?.classList.remove("is-peeking");
  setLightroomStatus("");
  if (quickDraftPreviewIsOpen()) renderQuickDraftPreviewPane();
}

function lightroomKeyIsPeek(event) {
  return event.key === "\\" || event.code === "Backslash";
}

function lightroomPeekTargetOk(event) {
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return lightroomIsMenuContext() && quickDraftPreviewIsOpen();
}

// ---- Presets and settings carried between documents -----------------------------------------------
function lightroomPresets() {
  try {
    const stored = JSON.parse(localStorage.getItem(LIGHTROOM_PRESETS_KEY) || "[]");
    return (Array.isArray(stored) ? stored : []).map(window.AISystem6DarkroomDevelop.normalizeDarkroomPreset).filter(Boolean);
  } catch {
    return [];
  }
}

function lightroomWritePresets(presets) {
  try {
    localStorage.setItem(LIGHTROOM_PRESETS_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

function lightroomSettingsNow() {
  return structuredClone(darkroomOf().settings || window.AISystem6DarkroomRecord.blankDarkroomSettings());
}

async function lightroomSavePreset() {
  const develop = window.AISystem6DarkroomDevelop;
  const name = await showInputDialog({
    title: t("lightroom_preset_save_title"),
    message: t("lightroom_preset_save_message"),
    placeholder: t("lightroom_preset_name_placeholder"),
  });
  if (name === null) return false;
  const preset = develop.darkroomPresetFromSettings(name, lightroomSettingsNow(), { id: stableId("preset"), now: new Date().toISOString() });
  if (!preset) {
    setLightroomStatus(t("lightroom_preset_save_empty"));
    return false;
  }
  if (!lightroomWritePresets(develop.darkroomPresetsWith(lightroomPresets(), preset))) {
    setLightroomStatus(t("lightroom_preset_save_failed"));
    return false;
  }
  renderLightroomPresets(preset.id);
  setLightroomStatus(t("lightroom_preset_saved", preset.name));
  return true;
}

async function lightroomApplyPreset(id = "") {
  const preset = lightroomPresets().find((item) => item.id === id);
  if (!preset) return false;
  const task = createQuickDraftAsyncTask({ create: false });
  if (!task) return false;
  const before = lightroomReadSnapshot();
  const settings = window.AISystem6DarkroomDevelop.applyDarkroomPreset(lightroomSettingsNow(), preset);
  const committed = await task.commit({ workspace: { settings } }, { captureForm: false });
  if (!committed.ok) {
    setLightroomStatus(t("quick_draft_save_failed"));
    return false;
  }
  lightroomRecordStep("edit_step_preset", before);
  renderQuickDraft(committed.record);
  setLightroomStatus(t("lightroom_preset_applied", preset.name));
  return true;
}

async function lightroomDeletePreset(id = "") {
  const develop = window.AISystem6DarkroomDevelop;
  lightroomWritePresets(develop.darkroomPresetsWithout(lightroomPresets(), id));
  renderLightroomPresets();
  return true;
}

// Carry this document's stack to another: the order, the switches and the stops,
// never the scopes or locks, which are line numbers of this text.
async function lightroomCopySettingsTo(documentId = "") {
  const id = String(documentId || "");
  const projectId = activeProjectId;
  const store = window.AISystem6DarkroomStore;
  const file = (typeof chatFiles !== "undefined" ? chatFiles : []).find((item) => item.id === id && item.type === "text");
  if (!id || !file || !store || id === lightroomSubjectDocumentId()) return false;
  try {
    const target = await store.loadDarkroomRecord(projectId, id);
    const settings = window.AISystem6DarkroomDevelop.copyDarkroomSettings(lightroomSettingsNow(), target.settings);
    store.setDarkroomRecord(projectId, id, { ...target, settings });
    await store.persistDarkroomRecord(projectId, id);
  } catch {
    setLightroomStatus(t("quick_draft_save_failed"));
    return false;
  }
  setLightroomStatus(t("lightroom_settings_copied", String(file.name || "")));
  return true;
}

function lightroomPresetSelectValue() {
  return /** @type {HTMLSelectElement | null} */ (document.querySelector("[data-lightroom-preset-select]"))?.value || "";
}

function renderLightroomPresets(selectedId = "") {
  const select = /** @type {HTMLSelectElement | null} */ (document.querySelector("[data-lightroom-preset-select]"));
  if (!select) return;
  const presets = lightroomPresets();
  const chosen = selectedId || select.value;
  select.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = presets.length ? t("lightroom_preset_choose") : t("lightroom_preset_none");
  select.append(none);
  presets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    select.append(option);
  });
  select.value = presets.some((preset) => preset.id === chosen) ? chosen : "";
  if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
  document.querySelectorAll("[data-lightroom-preset-apply], [data-lightroom-preset-delete]").forEach((button) => {
    /** @type {HTMLButtonElement} */ (button).disabled = !select.value;
  });
}

// Adjustments on / off: the stack stays, and nothing is asked of the model.
async function lightroomSetBypass(on = true) {
  const task = createQuickDraftAsyncTask({ create: false });
  if (!task) return false;
  const before = lightroomReadSnapshot();
  const settings = { ...lightroomSettingsNow(), disabled: !on };
  const committed = await task.commit({ workspace: { settings } }, { captureForm: false });
  if (!committed.ok) {
    setLightroomStatus(t("quick_draft_save_failed"));
    return false;
  }
  quickDraftLastComposite = "";
  quickDraftLastCompositeKey = "";
  lightroomRecordStep("edit_step_adjustments_switch", before);
  renderQuickDraft(committed.record);
  return true;
}

// ---- Selection in the darkroom's own pane -------------------------------------------------------------
function lightroomPaneRange() {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !refs.preview) return null;
  const range = selection.getRangeAt(0);
  return refs.preview.contains(range.commonAncestorContainer) ? { range, selection } : null;
}

function lightroomHasPaneSelection() {
  return Boolean(lightroomPaneRange());
}

// The lines of the darkroom's subject that the pane's selection means. The grain
// view draws one element per line and FatBits one per sentence-in-a-line, so
// those answer from the elements; the reading view has dropped the Markdown
// marks, so it answers from the words, and only when they are unambiguous.
function lightroomPaneSelection() {
  const held = lightroomPaneRange();
  if (!held) return { ranges: [], reason: "empty" };
  const develop = window.AISystem6DarkroomDevelop;
  const { range, selection } = held;
  const lineElements = [...refs.preview.querySelectorAll(".quick-draft-grain-line")];
  if (lineElements.length) {
    const lines = lineElements.map((element, index) => (range.intersectsNode(element) ? index + 1 : 0)).filter(Boolean);
    if (lines.length) return { ranges: develop.darkroomRangesFromLines(lines), reason: "" };
  }
  const cells = [...refs.preview.querySelectorAll("[data-fatbit-line]")];
  if (cells.length) {
    const lines = cells.filter((element) => range.intersectsNode(element)).map((element) => Number(element.dataset.fatbitLine)).filter(Boolean);
    if (lines.length) return { ranges: develop.darkroomRangesFromLines(lines), reason: "" };
  }
  return develop.lineRangesForSelectedText(lightroomBodyText(), selection.toString());
}

// ---- Rendering: the notices above the paper -----------------------------------------------------------
function lightroomNoticeButton(label, attribute, value = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn mini-btn";
  button.setAttribute(attribute, value);
  button.textContent = label;
  return button;
}

function renderLightroomNotices() {
  const host = document.getElementById("lightroom-notices");
  if (!host) return;
  host.replaceChildren();
  const record = activeProjectQuickDraft({ create: false })?.record;
  if (!record || !window.AISystem6DarkroomRecord) return;
  if (lightroomNegativeReport(record).state === "stale") {
    const row = document.createElement("div");
    row.className = "lightroom-notice is-stale";
    row.setAttribute("role", "status");
    const text = document.createElement("span");
    text.textContent = t("lightroom_stale_negative");
    row.append(text, lightroomNoticeButton(t("lightroom_reshoot"), "data-lightroom-reshoot"));
    host.append(row);
  }
  const solo = lightroomSoloStep();
  if (solo) {
    const row = document.createElement("div");
    row.className = "lightroom-notice is-solo";
    const text = document.createElement("span");
    text.textContent = t("lightroom_solo_label", t(adjustmentLayerLabelKey(solo.kind)));
    row.append(text, lightroomNoticeButton(t("lightroom_solo_all"), "data-lightroom-solo-clear"));
    host.append(row);
  }
  if (lightroomCompare.on) host.append(renderLightroomCompareBar());
}

function renderLightroomCompareBar() {
  const row = document.createElement("div");
  row.className = "lightroom-notice is-compare";
  const label = document.createElement("span");
  label.textContent = t("lightroom_compare_against");
  const wrap = document.createElement("span");
  wrap.className = "select-wrap-inline";
  const select = document.createElement("select");
  select.setAttribute("data-lightroom-compare-source", "");
  select.setAttribute("aria-label", t("lightroom_compare_against"));
  const sources = lightroomCompareSources();
  const current = lightroomCompareSource();
  sources.forEach((source) => {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = source.label;
    option.selected = source.id === current?.id;
    select.append(option);
  });
  wrap.append(select);
  const modes = document.createElement("span");
  modes.className = "view-switch";
  modes.setAttribute("role", "group");
  [["side", "lightroom_compare_side"], ["split", "lightroom_compare_split"]].forEach(([mode, key]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `view-switch-option${lightroomCompare.mode === mode ? " is-active" : ""}`;
    button.setAttribute("data-lightroom-compare-mode", mode);
    button.setAttribute("aria-pressed", lightroomCompare.mode === mode ? "true" : "false");
    button.textContent = t(key);
    modes.append(button);
  });
  const hint = document.createElement("small");
  hint.textContent = t("lightroom_compare_peek_hint");
  row.append(label, wrap, modes, hint, lightroomNoticeButton(t("lightroom_compare_close"), "data-lightroom-compare-close"));
  return row;
}

// Everything the develop model draws outside the paper, redrawn from state.
function lightroomRefreshChrome() {
  if (!window.AISystem6DarkroomRecord) return;
  renderLightroomNotices();
  renderLightroomPresets();
  const bypass = /** @type {HTMLInputElement | null} */ (document.querySelector("[data-lightroom-bypass]"));
  if (bypass) bypass.checked = darkroomOf().settings?.disabled !== true;
  document.querySelectorAll("[data-lightroom-layer-solo]").forEach((button) => {
    const kind = button.getAttribute("data-lightroom-layer-solo");
    const pressed = kind === lightroomSoloKind;
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
    button.classList.toggle("is-active", pressed);
  });
  const compareButton = document.querySelector("[data-lightroom-compare-toggle]");
  if (compareButton) {
    compareButton.setAttribute("aria-pressed", lightroomCompare.on ? "true" : "false");
    compareButton.classList.toggle("is-active", lightroomCompare.on);
  }
  // The film strip and the notices are rebuilt here, after the lease's sweep of
  // the write-gated controls last ran, so the sweep runs again over them.
  window.AISystem6WriteLease?.syncReadOnlySurface?.();
}

// ---- Events ---------------------------------------------------------------------------------------------
function bindLightroomDevelop() {
  const win = lightroomWindow();
  if (!win || win.dataset.developBound === "true") return;
  win.dataset.developBound = "true";
  win.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const reshoot = target.closest("[data-lightroom-reshoot]");
    if (reshoot) {
      await lightroomReshoot();
      return;
    }
    const solo = target.closest("[data-lightroom-layer-solo]");
    if (solo) {
      lightroomSetSolo(solo.getAttribute("data-lightroom-layer-solo") || "");
      return;
    }
    if (target.closest("[data-lightroom-solo-clear]")) {
      lightroomSetSolo("");
      return;
    }
    if (target.closest("[data-lightroom-compare-toggle]")) {
      lightroomSetCompare({ on: !lightroomCompare.on });
      return;
    }
    if (target.closest("[data-lightroom-compare-close]")) {
      lightroomSetCompare({ on: false });
      return;
    }
    const mode = target.closest("[data-lightroom-compare-mode]");
    if (mode) {
      lightroomSetCompare({ mode: mode.getAttribute("data-lightroom-compare-mode") === "split" ? "split" : "side" });
      return;
    }
    const compareVersion = target.closest("[data-lightroom-version-compare]");
    if (compareVersion) {
      const kind = compareVersion.getAttribute("data-lightroom-version-kind");
      const id = compareVersion.getAttribute("data-lightroom-version-compare") || "";
      lightroomSetCompare({ on: true, sourceId: kind === "negative" ? "negative" : `version:${id}` });
      return;
    }
    const nameVersion = target.closest("[data-lightroom-version-name]");
    if (nameVersion) {
      await lightroomNameVersion(nameVersion.getAttribute("data-lightroom-version-name") || "");
      return;
    }
    if (target.closest("[data-lightroom-preset-save]")) {
      await lightroomSavePreset();
      return;
    }
    if (target.closest("[data-lightroom-preset-apply]")) {
      await lightroomApplyPreset(lightroomPresetSelectValue());
      return;
    }
    if (target.closest("[data-lightroom-preset-delete]")) {
      await lightroomDeletePreset(lightroomPresetSelectValue());
    }
  });
  win.addEventListener("change", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const source = target.closest("[data-lightroom-compare-source]");
    if (source) {
      lightroomSetCompare({ sourceId: source.value });
      return;
    }
    if (target.closest("[data-lightroom-preset-select]")) {
      renderLightroomPresets(target.value);
      return;
    }
    const bypass = target.closest("[data-lightroom-bypass]");
    if (bypass) await lightroomSetBypass(bypass.checked);
  });
}

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("keydown", (event) => {
    if (event.repeat || !lightroomKeyIsPeek(event) || !lightroomPeekTargetOk(event)) return;
    if (lightroomPeekStart()) event.preventDefault();
  });
  document.addEventListener("keyup", (event) => {
    if (lightroomKeyIsPeek(event)) lightroomPeekEnd();
  });
  if (typeof window.addEventListener === "function") window.addEventListener("blur", lightroomPeekEnd);
  // The menu rows that need a selection follow it.
  let selectionTimer = 0;
  document.addEventListener("selectionchange", () => {
    if (!lightroomIsMenuContext()) return;
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      if (typeof updateMenuState === "function") updateMenuState();
    }, 120);
  });
}

bindLightroomDevelop();

window.AISystem6LightroomDevelop = Object.freeze({
  actionState: lightroomActionState,
  applyBody: lightroomApplyBody,
  applyPreset: lightroomApplyPreset,
  compareSources: lightroomCompareSources,
  copySettingsTo: lightroomCopySettingsTo,
  currentSteps: lightroomCurrentSteps,
  develop: lightroomDevelop,
  historySteps: lightroomHistorySteps,
  leaveDocument: lightroomLeaveDocument,
  nameVersion: lightroomNameVersion,
  negativeReport: lightroomNegativeReport,
  preview: lightroomPreview,
  presets: lightroomPresets,
  reshoot: lightroomReshoot,
  savePreset: lightroomSavePreset,
  setBypass: lightroomSetBypass,
  setCompare: lightroomSetCompare,
  setSolo: lightroomSetSolo,
});
