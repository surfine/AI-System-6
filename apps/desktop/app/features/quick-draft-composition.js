// 钟点稿 / Quick Draft — composition (文字亮室).
//
// Adjustment layers, protected ranges, compression grain, composite preview,
// and Develop. The writer's own text is the negative and is never rewritten;
// the first layer reads the negative, every later layer reads the output of the
// one before it (one model call each, each output cached), and only Develop
// promotes the composite to the new working body — after a revision is saved
// and the writer confirms. Protection is immutable-sentinel based: a layer
// that breaks a sentinel fails the whole composition.

// The working copy of the stack: the settings' layers (kind, on, step, scope)
// read as the { kind, enabled, strength, mask } the desk's normalizer owns.
// The settings stay the only stored truth; nothing here writes back.
function adjustmentLayersSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
  return normalizeAdjustmentLayers(darkroomLayersOf(record));
}

function adjustmentLayerState(kind = "", record = activeProjectQuickDraft({ create: false })?.record) {
  return adjustmentLayer(kind, adjustmentLayersSnapshot(record));
}

function adjustmentLayerLabelKey(kind = "") {
  const labels = {
    clean: "quick_draft_adjustment_clean",
    mingming: "quick_draft_chip_mingming",
    luoluo: "quick_draft_chip_luoluo",
    hkrr: "quick_draft_chip_hkrr",
    density: "quick_draft_adjustment_density",
  };
  return labels[kind] || "";
}

// FatBits is a zoom level of the grain view, not a fifth display mode: the
// same canvas at a different magnification, the way MacPaint had it.
// Three magnifications of one canvas, the way MacPaint had FatBits and
// Photoshop has a zoom-out: the histogram is the whole draft in one picture,
// grain is the draft at reading size, FatBits is one sentence per cell.
let quickDraftGrainZoom = "grain";
// The history brush's source state. Photoshop picks one and then paints from
// it; so does this. Empty means the brush is put down.
let quickDraftBrushSource = "";
// The cells last drawn, so a commit can splice by offset instead of searching.
let quickDraftFatBitsCells = [];
// One previous text per edited sentence, keyed by what it reads now. It lives
// only as long as the zoom session: FatBits is a magnifier, not a second
// version store.
const quickDraftFatBitsUndo = new Map();
let quickDraftFatBitsBound = false;
// One write at a time: the re-render a write causes must not start another.
let quickDraftFatBitsWriting = false;
let quickDraftFatBitsRuleRegistered = false;
let quickDraftActiveLayerKind = "mingming";
let quickDraftExpandedLayerKind = "";
let quickDraftLayerLayoutObserver = null;

function layerDescriptionKey(kind = "") {
  const descriptions = {
    clean: "quick_draft_layer_clean_desc",
    mingming: "quick_draft_layer_mingming_desc",
    luoluo: "quick_draft_layer_luoluo_desc",
    hkrr: "quick_draft_layer_hkrr_desc",
    density: "quick_draft_layer_density_desc",
  };
  return descriptions[kind] || "";
}

function selectQuickDraftAdjustmentLayer(kind = "") {
  const layers = adjustmentLayersSnapshot();
  if (layers.some((layer) => layer.kind === kind)) quickDraftActiveLayerKind = kind;
  renderAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record);
  return quickDraftActiveLayerKind;
}

function quickDraftUsesLayerAccordion() {
  return typeof quickDraftUsesDrawerLayout === "function" && quickDraftUsesDrawerLayout();
}

// Figure 03 and Figure 07 share one Range/detail object. On a wide desk it
// sits below the stack; in the narrow inspector it moves under the one open
// layer so the rows behave like a Finder disclosure list without duplicating
// controls or state.
function syncQuickDraftLayerDetailPlacement() {
  const stack = quickDraftQuery(".draft-desk-layer-stack");
  const section = stack?.closest(".draft-desk-inspector-section");
  const scope = quickDraftQuery(".draft-desk-layer-scope-row");
  const detail = document.getElementById("quick-draft-layer-detail");
  const protect = section?.querySelector(".draft-desk-protect");
  if (!stack || !section || !scope || !detail || !protect) return;
  const active = stack.querySelector(`[data-quick-draft-adjustment-layer="${quickDraftExpandedLayerKind}"]`);
  if (quickDraftUsesLayerAccordion() && active && !detail.hidden) {
    active.append(detail, scope);
    return;
  }
  section.insertBefore(scope, protect);
  section.insertBefore(detail, protect);
}

function observeQuickDraftLayerLayout() {
  if (quickDraftLayerLayoutObserver || !refs.form || typeof ResizeObserver !== "function") return;
  quickDraftLayerLayoutObserver = new ResizeObserver(() => syncQuickDraftLayerDetailPlacement());
  quickDraftLayerLayoutObserver.observe(refs.form);
}

function toggleQuickDraftLayerDisclosure(kind = "") {
  const target = document.getElementById("quick-draft-layer-detail");
  const layers = adjustmentLayersSnapshot();
  if (!target || !layers.some((layer) => layer.kind === kind)) return false;
  const open = quickDraftExpandedLayerKind !== kind || target.hidden;
  quickDraftActiveLayerKind = kind;
  quickDraftExpandedLayerKind = open ? kind : "";
  target.hidden = !open;
  target.classList.remove("is-editing");
  renderAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record);
  return open;
}

function toggleQuickDraftLayerDetail() {
  const target = document.getElementById("quick-draft-layer-detail");
  if (!target) return false;
  if (quickDraftUsesLayerAccordion()) {
    if (target.hidden || quickDraftExpandedLayerKind !== quickDraftActiveLayerKind) {
      quickDraftExpandedLayerKind = quickDraftActiveLayerKind;
      target.hidden = false;
      target.classList.remove("is-editing");
    } else {
      target.classList.toggle("is-editing");
    }
    renderAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record);
    return !target.hidden;
  }
  const open = Boolean(target.hidden);
  target.hidden = !open;
  target.classList.toggle("is-editing", open);
  quickDraftQuery("[data-quick-draft-layer-toggle]")
    ?.setAttribute("aria-expanded", open ? "true" : "false");
  return open;
}

// Three stops instead of a pop-up: one click, and the choice is visible
// without opening anything. The <select> stays as the model -- the change
// handler, the menu rows and the read-only sweep all keep using it -- and the
// segment carries data-requires-write so the write lease locks it too.
function syncLightroomStrengthSegments(select, layer) {
  const wrap = select.closest(".select-wrap-inline");
  if (!wrap) return;
  let group = wrap.parentElement?.querySelector(`[data-lightroom-strength="${layer.kind}"]`);
  if (!group) {
    group = document.createElement("span");
    group.className = "view-switch draft-desk-strength";
    group.dataset.lightroomStrength = layer.kind;
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", select.getAttribute("aria-label") || t("quick_draft_adjustment_strength"));
    Array.from(select.options).forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "view-switch-option";
      button.dataset.requiresWrite = "";
      button.dataset.value = option.value;
      if (option.dataset.i18n) button.dataset.i18n = option.dataset.i18n;
      button.textContent = option.textContent;
      button.addEventListener("click", () => {
        if (select.value === option.value || button.disabled) return;
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      group.append(button);
    });
    wrap.classList.add("draft-desk-strength-model");
    wrap.after(group);
  }
  group.querySelectorAll("button").forEach((button) => {
    const on = button.dataset.value === String(layer.strength);
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function renderAdjustmentLayers(record = activeProjectQuickDraft({ create: false })?.record) {
  if (!refs.form) return;
  const layers = adjustmentLayersSnapshot(record);
  if (!layers.some((layer) => layer.kind === quickDraftActiveLayerKind)) {
    quickDraftActiveLayerKind = layers.find((layer) => layer.enabled)?.kind || layers[0]?.kind || "mingming";
  }
  const stack = quickDraftQuery(".draft-desk-layer-stack");
  if (stack) {
    layers.forEach((layer) => {
      const wrapper = stack.querySelector(`[data-quick-draft-adjustment-layer="${layer.kind}"]`);
      if (wrapper) stack.append(wrapper);
    });
  }
  layers.forEach((layer, index) => {
    const layerLabel = t(adjustmentLayerLabelKey(layer.kind));
    const checkbox = quickDraftQuery(`[data-quick-draft-adjustment-enabled="${layer.kind}"]`);
    const select = quickDraftQuery(`[data-quick-draft-adjustment-strength="${layer.kind}"]`);
    if (checkbox) checkbox.checked = layer.enabled;
    if (select) {
      select.value = String(layer.strength);
      syncLightroomStrengthSegments(select, layer);
    }
    const order = quickDraftQuery(`[data-quick-draft-layer-order="${layer.kind}"]`);
    if (order) order.textContent = String(index + 1);
    const wrapper = quickDraftQuery(`[data-quick-draft-adjustment-layer="${layer.kind}"]`);
    if (wrapper) {
      wrapper.classList.toggle("is-off", !layer.enabled);
      wrapper.classList.toggle("is-active-layer", layer.kind === quickDraftActiveLayerKind);
      wrapper.classList.toggle("is-expanded-layer", layer.kind === quickDraftExpandedLayerKind);
    }
    const disclosure = quickDraftQuery(`[data-quick-draft-layer-disclosure="${layer.kind}"]`);
    if (disclosure) {
      const expanded = layer.kind === quickDraftExpandedLayerKind;
      disclosure.setAttribute("aria-expanded", expanded ? "true" : "false");
      disclosure.setAttribute("aria-label", t("quick_draft_layer_disclosure_aria", layerLabel, expanded));
      disclosure.textContent = expanded ? "▼" : "▶";
    }
  });
  const active = layers.find((layer) => layer.kind === quickDraftActiveLayerKind) || layers[0];
  const summary = adjustmentMaskSummary(active?.mask);
  const scope = quickDraftQuery("[data-quick-draft-active-layer-scope]");
  if (scope) scope.textContent = t("quick_draft_layer_scope", summary || t("quick_draft_layer_scope_all"));
  const mask = quickDraftQuery("[data-quick-draft-active-layer-mask]");
  const activeLabel = t(adjustmentLayerLabelKey(active?.kind));
  if (mask) {
    mask.value = summary;
    mask.setAttribute("aria-label", t("quick_draft_layer_mask_aria", activeLabel));
  }
  const description = quickDraftQuery("[data-quick-draft-active-layer-description]");
  if (description) description.textContent = t(layerDescriptionKey(active?.kind));
  quickDraftQueryAll("[data-quick-draft-active-layer-move]").forEach((button) => {
    button.dataset.quickDraftActiveLayerMove = active?.kind || "";
    const index = layers.findIndex((layer) => layer.kind === active?.kind);
    button.disabled = Number(button.dataset.direction) < 0 ? index <= 0 : index >= layers.length - 1;
    button.setAttribute("aria-label", t(
      Number(button.dataset.direction) < 0
        ? "quick_draft_layer_move_up_aria"
        : "quick_draft_layer_move_down_aria",
      activeLabel
    ));
  });
  const scopeToggle = quickDraftQuery("[data-quick-draft-layer-toggle]");
  const detail = document.getElementById("quick-draft-layer-detail");
  if (scopeToggle && detail) {
    scopeToggle.setAttribute("aria-expanded", detail.classList.contains("is-editing") ? "true" : "false");
  }
  syncQuickDraftLayerDetailPlacement();
  syncQuickDraftMobileAdjustmentActions(record);
  if (typeof updateMenuState === "function") updateMenuState();
}

// The darkroom footer keys are greyed here and nowhere else. Give the grey one
// reason the shared shell can read on tap (and clear it when the key returns);
// a transient model run is left to its loading label, not a second reason.
function markDarkroomAction(control, unavailable, reasonKey = "") {
  if (!control) return;
  if (typeof markGrayAffordance === "function") {
    markGrayAffordance(control, unavailable, reasonKey);
    return;
  }
  control.disabled = Boolean(unavailable);
  if (unavailable && reasonKey) control.dataset.balloonHelpDisabled = reasonKey;
  else delete control.dataset.balloonHelpDisabled;
}

function syncQuickDraftMobileAdjustmentActions(record = activeProjectQuickDraft({ create: false })?.record) {
  // The buttons follow the darkroom's subject, like the menu rows they
  // shortcut, and they ask the same question the rows do (lightroomActionState)
  // so the two can never answer differently. 试看 needs no write access -- it
  // writes only the darkroom record -- but Develop writes the document, and
  // whether it may is the write decision's, not a guess from the window.
  const state = lightroomActionState(record);
  const previewButton = quickDraftQuery("[data-quick-draft-adjustment-apply]");
  const developButton = quickDraftQuery("[data-quick-draft-adjustment-develop]");
  if (previewButton) markDarkroomAction(previewButton, !state.preview.available, state.preview.reason);
  if (developButton) markDarkroomAction(developButton, !state.develop.available, state.develop.reason);
  // One default key in the footer. Listen owns its own Play default inside the
  // paper, so the footer must not compete with it. Empty paper: the door back
  // is the only live next step. A waiting proof: 冲洗. Otherwise 试看.
  const listenMode = document.querySelector('[data-quick-draft-display="listen"]')?.classList.contains("is-active");
  const backButton = document.getElementById("quick-draft-display-body");
  previewButton?.classList.toggle("default", Boolean(state.hasBody && !state.proof && !listenMode));
  developButton?.classList.toggle("default", Boolean(state.hasBody && state.proof && !listenMode));
  backButton?.classList.toggle("default", !state.hasBody);
}

// A change to the stack is a step in the darkroom's history (⌘Z takes it back).
// The snapshot is taken before the change and recorded after it landed, so a
// write that failed leaves no step behind.
function lightroomStepBefore() {
  return typeof lightroomHistoryRead === "function" ? lightroomHistoryRead() : null;
}

function lightroomNoteStep(label, before) {
  if (typeof lightroomRecordStep === "function") lightroomRecordStep(label, before);
}

async function updateAdjustmentLayer(kind = "", patch = {}) {
  const previousRecord = activeProjectQuickDraft({ create: false })?.record;
  const stepBefore = lightroomStepBefore();
  const next = normalizeAdjustmentLayers(adjustmentLayersSnapshot()).map((layer) => (
    layer.kind === kind ? { ...layer, ...patch } : layer
  ));
  const committed = await commitQuickDraft({ workspace: { adjustmentLayers: next } });
  if (!committed.ok) {
    renderQuickDraft(previousRecord);
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  lightroomNoteStep("enabled" in patch ? "edit_step_layer_switch" : "strength" in patch ? "edit_step_layer_step" : "edit_step_layer_scope", stepBefore);
  const record = committed.record;
  renderAdjustmentLayers(record);
  updateQuickDraftShellState(record);
  syncQuickDraftPrimaryAction(record, Boolean(String(refs.draft?.value || "").trim()));
  refreshQuickDraftPreviewIfOpen();
  setQuickDraftStatus(t("quick_draft_adjustment_saved"));
  return next;
}

async function moveAdjustmentLayer(kind = "", direction = -1) {
  const layers = adjustmentLayersSnapshot();
  const index = layers.findIndex((layer) => layer.kind === kind);
  const target = index + (Number(direction) || -1);
  if (index < 0 || target < 0 || target >= layers.length) return layers;
  const next = [...layers];
  const [layer] = next.splice(index, 1);
  next.splice(target, 0, layer);
  const previousRecord = activeProjectQuickDraft({ create: false })?.record;
  const stepBefore = lightroomStepBefore();
  const committed = await commitQuickDraft({ workspace: { adjustmentLayers: next } });
  if (!committed.ok) {
    renderQuickDraft(previousRecord);
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  lightroomNoteStep("edit_step_layer_move", stepBefore);
  const record = committed.record;
  renderAdjustmentLayers(record);
  updateQuickDraftShellState(record);
  syncQuickDraftPrimaryAction(record, Boolean(String(refs.draft?.value || "").trim()));
  refreshQuickDraftPreviewIfOpen();
  setQuickDraftStatus(t("quick_draft_adjustment_saved"));
  return next;
}

// Every darkroom verb ends here: a layer toggled or moved, a scope set, a
// selection protected, an adjustment run. All six asked the draft's container
// whether the paper was showing, and it stopped carrying that class when the
// views moved windows -- so turning on Reader's Eye changed the stack and left
// the page in front of the writer exactly as it was.
function refreshQuickDraftPreviewIfOpen() {
  if (quickDraftPreviewIsOpen()) {
    renderQuickDraftPreviewPane();
  }
}

// ---- Protected ranges ----------------------------------------------------
// Protection is a property of the text. The UI keeps the writer's mask as
// readable line ranges (a textarea cannot paint spans), but enforcement is
// immutable-sentinel based in app/core/protected-ranges.js: the model never
// sees the protected bytes, and any violation fails the composition.

function protectedRangesSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
  return normalizeAdjustmentLayerMask(darkroomOf(record).settings?.protected);
}

function renderProtectedRangeControls(record = activeProjectQuickDraft({ create: false })?.record) {
  const input = quickDraftQuery("[data-quick-draft-protected-ranges]");
  const ranges = protectedRangesSnapshot(record);
  if (input) input.value = adjustmentMaskSummary(ranges);
  const lines = ranges.reduce((total, range) => total + Math.max(0, (range.end - range.start) + 1), 0);
  const summary = quickDraftQuery("[data-quick-draft-protected-summary]");
  if (summary) summary.textContent = lines
    ? t("quick_draft_protected_summary", lines)
    : t("quick_draft_protected_empty");
}

// The lasso, not the marquee: the range shrink-wraps to the lines the drag
// actually caught text on. The rule itself is pure and lives with the rest of
// the protection data in app/core/protected-ranges.js, so a test can execute
// it without a textarea.
// Two named reasons a line may not be reworded, never merged into one number:
// the writer locked it, or it is quoted from a source. The writer's count keeps
// meaning what the writer locked; the citation count says the rest out loud.
function citationRangesSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  const ids = (workspace.materials || []).map((material) => String(material?.id || "")).filter(Boolean);
  if (!ids.length) return [];
  const body = String(refs.draft?.value || workspace.body || "");
  return window.AISystem6ProtectedRanges?.citationLineRanges(body, ids) || [];
}

// What a model pass may not touch: the writer's locks plus every citation.
// Every AI write path asks this one function, so a quotation cannot be quietly
// reworded by whichever path forgot to add it.
function modelProtectedRanges(record = activeProjectQuickDraft({ create: false })?.record) {
  return normalizeAdjustmentLayerMask([
    ...protectedRangesSnapshot(record),
    ...citationRangesSnapshot(record).map((range) => ({ start: range.start, end: range.end })),
  ]);
}

// Where the selection is read from is where the writer is. In the darkroom the
// paper is a rendered pane, not Quick Draft's textarea, so the selection in
// front of the writer is the pane's; the textarea is only asked while Quick
// Draft itself is the window in use. The pane's selection is turned into the
// lines of the darkroom's own subject -- which may be another document.
function lightroomSelectionReport() {
  if (typeof lightroomPaneSelection === "function" && typeof lightroomIsMenuContext === "function" && lightroomIsMenuContext()) {
    return lightroomPaneSelection();
  }
  const el = refs.draft;
  const ranges = el
    ? window.AISystem6ProtectedRanges?.lassoLineRanges(
      String(el.value || ""),
      Number(el.selectionStart) || 0,
      Number(el.selectionEnd) || 0
    ) || []
    : [];
  return { ranges, reason: ranges.length ? "" : "empty" };
}

function selectionLineRanges() {
  return lightroomSelectionReport().ranges;
}

function selectionMissingMessage(report, fallbackKey) {
  if (report.reason === "ambiguous") return t("lightroom_selection_ambiguous");
  if (report.reason === "not-found") return t("lightroom_selection_not_found");
  return t(fallbackKey);
}

async function protectSelectionFromTextarea() {
  const report = lightroomSelectionReport();
  const ranges = report.ranges;
  if (!ranges.length) {
    const message = selectionMissingMessage(report, "quick_draft_protect_no_selection");
    setQuickDraftStatus(message);
    setLightroomStatus(message);
    if (!(typeof lightroomIsMenuContext === "function" && lightroomIsMenuContext())) refs.draft?.focus();
    return false;
  }
  const next = normalizeAdjustmentLayerMask([...protectedRangesSnapshot(), ...ranges]);
  const previousRecord = activeProjectQuickDraft({ create: false })?.record;
  const stepBefore = lightroomStepBefore();
  const committed = await commitQuickDraft({ workspace: { protectedRanges: next } });
  if (!committed.ok) {
    renderQuickDraft(previousRecord);
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  lightroomNoteStep("edit_step_protect", stepBefore);
  const record = committed.record;
  renderProtectedRangeControls(record);
  updateQuickDraftShellState(record);
  refreshQuickDraftPreviewIfOpen();
  setQuickDraftStatus(t("quick_draft_protect_saved"));
  return true;
}

// A protected range and a layer mask are line numbers, so any edit that adds
// or removes lines above them has to carry them along. The paste takeover
// (app/core/markdown-editor.js) reports its splice here; without this a
// multi-line paste would leave the writer's protection pointing at whatever
// text slid into those line numbers, which reads as protected and is not.
async function notePasteLineShift(textarea, shift = {}) {
  if (!refs.draft || textarea !== refs.draft) return false;
  const runtime = window.AISystem6PasteMarkdown;
  if (!runtime || !Number(shift.delta)) return false;

  const record = activeProjectQuickDraft({ create: false })?.record;
  if (!record) return false;
  const ranges = protectedRangesSnapshot(record);
  const layers = adjustmentLayersSnapshot();
  const masked = layers.filter((layer) => (layer.mask || []).length);
  if (!ranges.length && !masked.length) return false;

  const patch = {};
  if (ranges.length) {
    patch.protectedRanges = normalizeAdjustmentLayerMask(runtime.pasteShiftLineRanges(ranges, shift));
  }
  if (masked.length) {
    patch.adjustmentLayers = layers.map((layer) => (
      (layer.mask || []).length
        ? { ...layer, mask: normalizeAdjustmentLayerMask(runtime.pasteShiftLineRanges(layer.mask, shift)) }
        : layer
    ));
  }
  const committed = await commitQuickDraft({ workspace: patch });
  if (!committed.ok) return false;
  renderProtectedRangeControls(committed.record);
  renderAdjustmentLayers(committed.record);
  updateQuickDraftShellState(committed.record);
  return true;
}

async function scopeSelectionToLayer(kind = "") {
  const report = lightroomSelectionReport();
  const ranges = report.ranges;
  if (!ranges.length) {
    const message = selectionMissingMessage(report, "quick_draft_scope_no_selection");
    setQuickDraftStatus(message);
    setLightroomStatus(message);
    if (!(typeof lightroomIsMenuContext === "function" && lightroomIsMenuContext())) refs.draft?.focus();
    return false;
  }
  const layers = adjustmentLayersSnapshot();
  const layer = layers.find((item) => item.kind === kind);
  if (!layer) return false;
  const merged = normalizeAdjustmentLayerMask([...(layer.mask || []), ...ranges]);
  const next = layers.map((item) => (item.kind === kind ? { ...item, mask: merged } : item));
  const previousRecord = activeProjectQuickDraft({ create: false })?.record;
  const stepBefore = lightroomStepBefore();
  const committed = await commitQuickDraft({ workspace: { adjustmentLayers: next } });
  if (!committed.ok) {
    renderQuickDraft(previousRecord);
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  lightroomNoteStep("edit_step_layer_scope", stepBefore);
  renderAdjustmentLayers(committed.record);
  refreshQuickDraftPreviewIfOpen();
  setQuickDraftStatus(t("quick_draft_scope_saved"));
  return true;
}

function adjustmentStrengthPromptLine(strength = ADJUSTMENT_DEFAULT_STRENGTH, zh = true) {
  if (strength === 25) {
    return zh
      ? "- 调整层强度：轻触。只修最影响“当天能录”的问题；当前正文的原句、顺序和口气尽量保留。"
      : "- Adjustment strength: light touch. Fix only what most blocks same-day recording; keep the current body's sentences, order, and voice.";
  }
  if (strength === 75) {
    return zh
      ? "- 调整层强度：重写。可以合并、换序、换词来达到目标，但不新增事实、不丢未测边界、不用风格覆盖事实。"
      : "- Adjustment strength: heavy. You may merge, reorder, and reword to hit the target; never add facts, drop untested boundaries, or let style override facts.";
  }
  return zh
    ? "- 调整层强度：标准。可以合并或微调，但保留作者判断、犹豫和已写出的口气。"
    : "- Adjustment strength: standard. You may merge or tune, but keep the author's judgment, hesitation, and written voice.";
}

// The layer mask is stored against the original body's line numbers; the
// prompt receives the sentinel-protected text, so the mask is remapped onto
// that layout for honest line numbers.
// The personal dictionary is read, never stored. Three sources, all the
// writer's own: a title they typed (a derived title is the body's first
// sentence and says nothing about spelling), Latin names and acronyms the
// draft and its materials repeat (HKRR, iPhone), and -- when the writer keeps
// one -- a project document called 词典 / Dictionary, one term per line.
// Anything with sentence punctuation is a sentence, not a term.
function quickDraftDictionaryTerms() {
  const terms = new Set();
  const add = (value) => {
    const term = String(value || "").replace(/^[-*•\s]+/, "").trim();
    if (term && term.length <= 16 && !/[。！？!?]/.test(term)) terms.add(term);
  };
  const record = activeProjectQuickDraft({ create: false })?.record;
  const workspace = normalizeQuickDraftRecord(record).workspace;
  if (workspace.titleMode === "manual") {
    String(workspace.title || "").split(/[\s,，、:：;；/|]+/).filter((part) => part.length >= 2).forEach(add);
  }
  let materialText = "";
  try {
    materialText = (typeof sourceRecordsFromForm === "function" ? sourceRecordsFromForm() : [])
      .map((source) => source.text).join("\n");
  } catch {}
  const counts = new Map();
  `${workspace.body || ""}\n${materialText}`.match(/\b(?:[A-Z][A-Za-z0-9+]{1,15}|[a-z][A-Z][A-Za-z0-9+]{0,14})\b/g)?.forEach((word) => {
    counts.set(word, (counts.get(word) || 0) + 1);
  });
  counts.forEach((count, word) => {
    if (count >= 2 || /^[A-Z0-9+]{2,}$/.test(word)) add(word);
  });
  const files = typeof getProjectFiles === "function" ? getProjectFiles() : [];
  files.forEach((file) => {
    const name = String(file?.name || "").trim();
    if (/^(词典|詞典|dictionary)(\.\w+)?$/i.test(name)) String(file.body || "").split(/\n+/).forEach(add);
  });
  return [...terms].slice(0, 120);
}

// The project dictionary a clean-up pass corrects misheard words against. It is
// the one dynamic line a layer's prompt file cannot hold, so it is appended to
// the file's own instructions.
function quickDraftDictionaryLine(zh = true) {
  const terms = quickDraftDictionaryTerms();
  if (!terms.length) return "";
  return zh
    ? `项目词典（听错时按这里改正写法）：${terms.join("、")}`
    : `Project dictionary (use these spellings when a word was misheard): ${terms.join(", ")}`;
}

// Each layer's instructions live in a prompt file (content/ai-prompts/other-apps),
// so the writer can read them in the Finder and rewrite them for the project.
// The layer's kind names the file; its stop picks the wording inside it.
const LIGHTROOM_LAYER_PROMPT_IDS = Object.freeze({
  clean: "other-apps.darkroom-clean",
  mingming: "other-apps.darkroom-reader-eye",
  luoluo: "other-apps.darkroom-listener-ear",
  hkrr: "other-apps.darkroom-hkrr-lift",
  density: "other-apps.darkroom-density",
});
const LIGHTROOM_LAYER_RULES_ID = "other-apps.darkroom-layer-rules";

// Resolving a prompt file also files a run record, so a run resolves each one
// once and reuses it for every layer: the shared rules are one record, not one
// per layer.
let lightroomPromptMemo = null;

function lightroomPromptFile(id, zh = true) {
  const key = `${id}:${zh ? "zh" : "en"}`;
  if (lightroomPromptMemo?.has(key)) return lightroomPromptMemo.get(key);
  const text = resolveWritingRoutePrompt(id, zh ? "zh" : "en");
  lightroomPromptMemo?.set(key, text);
  return text;
}

// One layer's instructions as the model reads them: its prompt file at its own
// stop, plus the project dictionary for a clean-up. No names, no strength
// sentence written in code.
function lightroomLayerInstruction(layer = {}, zh = true) {
  const kind = String(layer?.kind || "");
  const id = LIGHTROOM_LAYER_PROMPT_IDS[kind];
  if (!id) return "";
  const develop = window.AISystem6DarkroomDevelop;
  const parsed = develop.parseLayerPrompt(lightroomPromptFile(id, zh));
  const step = window.AISystem6DarkroomRecord.darkroomStepFromStrength(layer?.strength);
  const text = develop.layerPromptText(parsed, step);
  return [text, kind === "clean" ? quickDraftDictionaryLine(zh) : ""].filter(Boolean).join("\n");
}

// Where in its input a layer works. `scopeLines` is already in the input's own
// line numbers (the composition rule remaps the first layer's scope onto the
// sentinel layout and clamps a later layer's to the text it reads).
function lightroomScopeLine(scoped, scopeLines = [], zh = true) {
  if (!scoped) return zh ? "本层作用于全文。" : "This layer applies to the whole text.";
  if (!scopeLines.length) {
    return zh ? "本层蒙版所在的行全部受保护，这一层不改任何内容。" : "Every line this layer masks is protected; this layer changes nothing.";
  }
  const summary = adjustmentMaskSummary(scopeLines);
  return zh
    ? `本层只作用于下面正文的第 ${summary} 行；其余行保持原样，不要给建议。`
    : `This layer applies only to lines ${summary} of the text below; leave every other line alone.`;
}

// Kept for the guest bridge, which asks for one layer's instruction beside a
// protected body: the same file text and the same scope sentence the develop
// pipeline sends, composed for a single layer.
function adjustmentLayerCompositionInstruction(layer = {}, zh = true, protectedRanges = protectedRangesSnapshot()) {
  const originalMask = normalizeAdjustmentLayerMask(layer?.mask);
  const maskRanges = window.AISystem6ProtectedRanges.remapLineRangesAfterSentinels(originalMask, protectedRanges);
  return [
    lightroomLayerInstruction(layer, zh),
    lightroomScopeLine(originalMask.length > 0, maskRanges, zh),
  ].filter(Boolean).map((line) => `- ${line}`).join("\n");
}

// The prompt lists the sentinel tokens and demands they survive verbatim.
// Enforcement is strict verification in text-compose after the pass.
function protectedSentinelBlock(sentinels = [], zh = true) {
  if (!sentinels.length) return "";
  const tokens = sentinels.map((entry) => entry.token).join(" ");
  return zh
    ? [
        "- 以下是正文里的受保护占位符（每个占位符代表一段你不许改动的原文）：",
        tokens,
        "- 输出中必须原样保留每一个占位符，且每个只出现一次：不能改字、不能换大小写、不能删、不能重复，也不能新增任何类似的占位符。",
      ].join("\n")
    : [
        "- The protected placeholders below mark text you must never change:",
        tokens,
        "- Reproduce every placeholder verbatim in the output, exactly once each: no rewording, no case changes, no deletions, no duplicates, and no new look-alike placeholders.",
      ].join("\n");
}

function grainMaskEntries(bodyText = "") {
  const lineCount = String(bodyText || "").split("\n").length;
  return adjustmentLayersSnapshot()
    .filter((layer) => layer.enabled)
    .map((layer) => ({
      kind: layer.kind,
      label: t(adjustmentLayerLabelKey(layer.kind)),
      ranges: adjustmentLayerMaskRanges(layer, lineCount),
    }))
    .filter((entry) => entry.ranges.length);
}

// ---- Non-destructive composition and develop ----------------------------
// Body = negative + enabled adjustments applied in stored order. The first
// layer reads the negative and every later layer reads the output of the one
// before it: one model call per layer, each output cached in the darkroom
// record under the hash of what the layer read and how it was set, so a change
// to layer 3 re-runs layer 3 and nothing before it. The pure rule lives in
// app/core/text-compose.js; this module keeps the prompt, the model call, and
// the record writes.

const QUICK_DRAFT_COMPOSITION_PROMPT_VERSION = 3;
let quickDraftLastComposite = "";
let quickDraftLastCompositeKey = "";
// The composite text is already durable in the darkroom record the moment a
// preview commits below; this id only carries the receipt across to whichever
// explicit action the writer takes next — Develop (adopted) or Discard
// (rejected) — so that decision is on the honest record too.
let quickDraftLastCompositeReceiptId = "";

function quickDraftCompositeSource(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  // The composite reads the darkroom's subject: usually the draft in front of
  // the writer, but a developed document composes from its own text — the
  // instruments must never read one text and report on another.
  const base = lightroomSubject
    ? lightroomBodyText()
    : String(refs.draft?.value || workspace.body || "");
  const negative = String(darkroomOf(record).negative || "");
  return hasRecordedNegative(record) && negative.trim() ? negative : base;
}

// The stack, as far as a run is concerned. Adjustments off is the bypass: the
// layers stay as they are, and nothing is asked of the model.
function enabledAdjustmentLayers(record = activeProjectQuickDraft({ create: false })?.record) {
  if (darkroomOf(record).settings?.disabled === true) return [];
  return adjustmentLayersSnapshot(record).filter((layer) => layer.enabled);
}

function compositionCacheContext(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  // A format and a length belong to the draft the desk is writing. Another
  // document has neither, and borrowing the draft's would split its cache by a
  // setting that never reached it.
  const own = typeof lightroomSubjectIsOwnDraft !== "function" || lightroomSubjectIsOwnDraft();
  const targetFormat = own ? normalizeScenario(refs.format?.value || workspace.intake.setup.scenario) : "";
  return {
    language: currentLanguage,
    targetFormat,
    targetDuration: own ? normalizeDuration(refs.duration?.value || workspace.intake.setup.targetDuration, targetFormat) : "",
    modelId: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value?.trim() || ""),
    promptVersion: QUICK_DRAFT_COMPOSITION_PROMPT_VERSION,
  };
}

// The layer outputs this document already has, as a Map-shaped cache. The
// entries live in the darkroom record; a run writes them back at its end.
function lightroomLayerCache(record = activeProjectQuickDraft({ create: false })?.record, onChange) {
  return window.AISystem6DarkroomRecord.createDarkroomLayerCache(darkroomOf(record).layerCache || [], { onChange });
}

// A clean-up's output depends on the project dictionary, which is not part of
// its input, so the dictionary is part of its key.
function lightroomLayerExtra(layer) {
  return layer?.kind === "clean" ? quickDraftDictionaryTerms().join("|") : "";
}

// Layers a run would actually call, with the sentinel/scope rules applied once
// so the preview, the plan and the status line agree on the number.
function lightroomRunPlan(record = activeProjectQuickDraft({ create: false })?.record) {
  const layers = enabledAdjustmentLayers(record);
  const source = quickDraftCompositeSource(record);
  return {
    layers,
    source,
    ...planLayerRun({
      source,
      layers,
      protectedRanges: protectedRangesSnapshot(record),
      cache: lightroomLayerCache(record),
      cacheContext: compositionCacheContext(record),
      layerExtra: lightroomLayerExtra,
    }),
  };
}

// What the paper can show for the current stack. `proof` says the text is a
// real composite of the stack as it now stands (a stored one, or one rebuilt
// entirely from cached layers); without it the text is just the body and
// there is nothing to develop.
function currentCompositeState(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  const body = lightroomSubject
    ? lightroomBodyText()
    : String(refs.draft?.value || workspace.body || "");
  const layers = enabledAdjustmentLayers(record);
  if (!layers.length) return { text: body, ready: true, stale: false, proof: false };
  const source = quickDraftCompositeSource(record);
  const key = composeCacheKey({ source, layers, protectedRanges: protectedRangesSnapshot(record), ...compositionCacheContext(record) });
  const darkroom = darkroomOf(record);
  if (darkroom.currentKey === key && darkroom.composite) {
    return { text: darkroom.composite, ready: true, stale: false, proof: true };
  }
  const plan = lightroomRunPlan(record);
  // A stack whose every layer is already cached is a proof without a call --
  // unless the writer threw that proof away, which stays thrown away until the
  // next preview of the same stack.
  if (plan.total > 0 && plan.calls === 0 && plan.text && darkroom.discardedKey !== key) {
    return { text: plan.text, ready: true, stale: false, proof: true };
  }
  if (quickDraftLastCompositeKey === key && quickDraftLastComposite) {
    return { text: quickDraftLastComposite, ready: true, stale: false, proof: true };
  }
  if (!quickDraftLastCompositeKey) {
    return { text: body, ready: true, stale: false, proof: false };
  }
  return { text: quickDraftLastComposite || body, ready: false, stale: true, proof: false };
}

function renderQuickDraftCompositePreview() {
  const state = currentCompositeState();
  if (!state.ready) {
    refs.preview.innerHTML = `<p class="empty-folder-note">${escapeHtml(t("quick_draft_composite_pending"))}</p>`;
    return;
  }
  quickDraftMarkdownPreview(state.text);
}

function renderQuickDraftReadingView() {
  if (!refs.preview) return;
  const state = currentCompositeState();
  if (!state.ready) {
    refs.preview.innerHTML = `<p class="empty-folder-note">${escapeHtml(t("quick_draft_composite_pending"))}</p>`;
    return;
  }
  refs.preview.innerHTML = `<div class="quick-draft-reading">${quickDraftMarkdownHtml(state.text)}</div>`;
}

// The model sees one layer at a time. The frame is structure only -- which
// layer this is, where it works, and the source -- and every instruction in it
// comes from a prompt file.
/** @param {{ input?: string, sentinels?: any[], layer?: any, index?: number, count?: number, scopeLines?: any[] }} options */
function buildLayerPrompt({ input = "", sentinels = [], layer = {}, index = 0, count = 1, scopeLines = [] }) {
  const zh = currentLanguage === "zh";
  const own = typeof lightroomSubjectIsOwnDraft !== "function" || lightroomSubjectIsOwnDraft();
  let context = "";
  if (own) {
    const firstDay = firstDaySnapshot();
    const targetFormat = normalizeScenario(refs.format?.value || FIRST_DAY_FORMAT);
    const targetDuration = normalizeDuration(refs.duration?.value, targetFormat);
    context = [
      `${zh ? "对象/标题" : "Subject/title"}: ${meaningfulFirstDayTitle(firstDay.title) || firstDay.subject || titleFromBody(input)}`,
      `${zh ? "稿件类型" : "Format"}: ${formatLabel(targetFormat)}`,
      `${zh ? "目标长度" : "Target length"}: ${durationLabel(targetDuration, targetFormat)}`,
    ].join("\n");
  } else {
    context = `${zh ? "文档" : "Document"}: ${String(lightroomSubject?.name || titleFromBody(input) || "")}`;
  }
  const scoped = normalizeAdjustmentLayerMask(layer?.mask).length > 0;
  const label = t(adjustmentLayerLabelKey(layer?.kind));
  return [
    zh
      ? `文字亮室逐层调整，第 ${index + 1}/${count} 层「${label}」：只做这一层，返回整篇正文。`
      : `Text Lightroom, adjustment layer ${index + 1} of ${count}, ${label}: do this layer only and return the whole text.`,
    context,
    lightroomLayerInstruction(layer, zh),
    lightroomScopeLine(scoped, scopeLines, zh),
    lightroomPromptFile(LIGHTROOM_LAYER_RULES_ID, zh),
    zh ? "输入正文（受保护内容已被占位符替换，保持原样）：" : "Input text (protected content is already replaced by placeholders):",
    input || (zh ? "（输入为空）" : "(empty input)"),
    protectedSentinelBlock(sentinels, zh),
  ].filter(Boolean).join("\n\n");
}

// A layer returns about as much text as it was given. The old flat 5200 was
// sized for a spoken draft; a longer document needs its own room, bounded so a
// runaway reply still ends.
function lightroomLayerTokenBudget(input = "") {
  return Math.min(8000, Math.max(1600, Math.ceil(String(input).length * 1.1) + 400));
}

function cleanLayerOutput(markdown = "") {
  return stripQuickDraftModelFence(markdown).replace(/\n{3,}/g, "\n\n").trim();
}

// One layer, one call, streamed. A stream is what keeps a local model honest
// about being alive: the local client abandons a call that does not begin
// answering within 45 seconds and one that goes quiet mid-answer, instead of
// leaving the desk marked busy for the whole of a long document.
async function lightroomLayerModelCall({ layer, index, count, input, sentinels, scopeLines, signal, onProgress }) {
  const prompt = buildLayerPrompt({ input, sentinels, layer, index, count, scopeLines });
  const response = await fetchModelPayload({
    model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value?.trim() || ""),
    messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
    temperature: 0.4,
    max_tokens: lightroomLayerTokenBudget(input),
    ai_system6_task_kind: "mingming_rewrite",
    stream: true,
  }, signal);
  if (!response.ok) {
    throw new Error(serviceErrorDetail(response.status, await response.text()));
  }
  const contentType = response.headers?.get?.("content-type") || "";
  let raw;
  if (response.body && /event-stream|text\/plain|octet-stream/i.test(contentType)) {
    const final = await readChatCompletionStream(response, (snapshot) => onProgress?.(String(snapshot || "").length), signal);
    raw = String(final?.content || "").trim();
  } else {
    const result = await response.json().catch(() => ({}));
    raw = String(result?.choices?.[0]?.message?.content || "").trim();
  }
  return cleanLayerOutput(raw);
}

// The darkroom's own status line. The Quick Draft status bar is not on screen
// while the darkroom is the front window, so a run that reported only there
// ran in silence.
function setLightroomStatus(message = "") {
  const status = document.getElementById("lightroom-status");
  if (status) status.textContent = String(message || "");
}

async function applyAdjustmentLayers() {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const task = createQuickDraftAsyncTask({ create: false });
  if (!task) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  window.AISystem6ModelUserErrors?.registerRetryable?.({
    owner: "quickDraft-adjustment",
    projectId: task.projectId,
    callback: () => applyAdjustmentLayers(),
  });
  const layers = enabledAdjustmentLayers(slot.record);
  if (!layers.length) {
    setQuickDraftStatus(t("quick_draft_apply_none"));
    setLightroomStatus(t("quick_draft_apply_none"));
    return false;
  }
  if (!quickDraftModelAvailable()) {
    setQuickDraftStatus(t("quick_draft_connect_ai"));
    setLightroomStatus(t("quick_draft_connect_ai"));
    return false;
  }
  const source = quickDraftCompositeSource(slot.record);
  if (!String(source || "").trim()) {
    setQuickDraftStatus(t("quick_draft_empty_body"));
    setLightroomStatus(t("quick_draft_empty_body"));
    refs.draft?.focus();
    return false;
  }
  const requestGuard = beginQuickDraftRequest();
  setBusy(true);
  let cacheDirty = false;
  lightroomPromptMemo = new Map();
  const cache = lightroomLayerCache(slot.record, () => { cacheDirty = true; });
  try {
    const protectedRanges = protectedRangesSnapshot(slot.record);
    const cacheContext = compositionCacheContext(slot.record);
    const plan = planLayerRun({ source, layers, protectedRanges, cache, cacheContext, layerExtra: lightroomLayerExtra });
    if (!plan.total) {
      setQuickDraftStatus(t("quick_draft_apply_none"));
      setLightroomStatus(t("quick_draft_apply_none"));
      return false;
    }
    // Say how many layers will be called before calling any of them.
    const announced = t("lightroom_run_plan", plan.calls, plan.total, plan.cached);
    setQuickDraftStatus(announced);
    setLightroomStatus(announced);
    const labelOf = (kind) => t(adjustmentLayerLabelKey(kind));
    const composed = await composeDocument({
      source,
      layers,
      protectedRanges,
      cache,
      cacheContext,
      layerExtra: lightroomLayerExtra,
      runModel: (args) => lightroomLayerModelCall({
        ...args,
        signal: requestGuard.signal,
        onProgress: (chars) => setLightroomStatus(t("lightroom_run_layer_streaming", args.index + 1, args.count, labelOf(args.layer.kind), chars)),
      }),
      onLayer: (step, { index, count }) => setLightroomStatus(t(
        step.cached ? "lightroom_run_layer_cached" : "lightroom_run_layer_done",
        index + 1,
        count,
        labelOf(step.kind)
      )),
    });
    quickDraftLastComposite = composed.text;
    quickDraftLastCompositeKey = composeCacheKey({
      source,
      layers,
      protectedRanges: composed.ranges,
      ...cacheContext,
    });
    if (typeof noteLightroomRun === "function") noteLightroomRun();
    if (!task.stillOwnsActiveProject()) {
      // The writer switched projects while the model composed. Discard the
      // composite: it belongs to the old project and must not touch Project B.
      return false;
    }
    const currentRecord = task.currentRecord();
    const committed = await task.commit({ workspace: { composition: {
      ...darkroomOf(currentRecord),
      layerCache: cache.entries(),
      currentKey: quickDraftLastCompositeKey,
      composite: composed.text,
      generatedAt: new Date().toISOString(),
      discardedKey: "",
      sourceHash: textComposeHash(source),
    } } }, { captureForm: false });
    if (!committed.ok) throw committed.error;
    renderQuickDraft(committed.record);
    // Apply means look: the composite opens in the reading view, because the
    // body itself stays untouched until develop.
    if (!(quickDraftPreviewIsOpen() && quickDraftDisplayMode === "read")) setQuickDraftDisplayMode("read");
    setQuickDraftStatus(t("quick_draft_apply_done"));
    noteLightroomReceipt("quick_draft_preview_adjustments", { model: quickDraftConnectedModelName() });
    if (typeof lightroomRefreshChrome === "function") lightroomRefreshChrome();
    const composedRecorded = await window.AISystem6RunReceipts?.recordModelAnswer?.({
      projectId: task.projectId,
      sourceAppId: "quickDraft",
      intent: "apply-adjustment-layers",
      provider: (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudCredentialReady()) ? "cloud" : "local",
      model: quickDraftConnectedModelName(),
      answerText: composed.text,
    });
    quickDraftLastCompositeReceiptId = composedRecorded?.receiptId || "";
    window.AISystem6ModelUserErrors?.clearRetryable?.("quickDraft-adjustment");
    return true;
  } catch (error) {
    const timedOut = quickDraftRequestTimedOut(error, requestGuard);
    if (error?.name !== "AbortError" || timedOut) {
      if (error?.code === "PROTECTED_RANGE_VIOLATION") {
        const message = t("quick_draft_protect_failed", quickDraftFailureMessage(error));
        setQuickDraftStatus(message);
        setLightroomStatus(message);
      } else if (error?.code === "EMPTY_LAYER_OUTPUT") {
        const message = t("lightroom_layer_empty", t(adjustmentLayerLabelKey(error.kind)));
        setQuickDraftStatus(message);
        setLightroomStatus(message);
      } else {
        presentQuickDraftModelFailure(error, timedOut ? { timeout: true } : {});
        setLightroomStatus(quickDraftFailureMessage(error));
      }
    }
    // The layers that finished are real work: keep them, so the retry (or the
    // next preview) picks up where this one stopped instead of paying again.
    if (cacheDirty && task.stillOwnsActiveProject()) {
      task.commit({ workspace: { layerCache: cache.entries() } }, { captureForm: false }).catch(() => {});
    }
    return false;
  } finally {
    lightroomPromptMemo = null;
    settleQuickDraftRequest(requestGuard);
    setBusy(false);
  }
}

// Develop is an explicit action, never a side effect of export: the current
// composite is written into the document only after (1) a revision of the
// current text is saved and (2) the writer confirms this becomes the new
// working body. It writes through whoever owns the document -- Quick Draft for
// its own draft, TeachText for a document it holds, the record for one nobody
// is editing -- and never through a window that does not hold the pen. Any
// failure leaves the original text untouched.
async function developAdjustmentLayers() {
  const decision = lightroomWriteDecision();
  if (!decision.canWrite) {
    const message = lightroomWriteNotice(decision);
    setQuickDraftStatus(message);
    setLightroomStatus(message);
    return false;
  }
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const task = createQuickDraftAsyncTask({ create: false });
  if (!task) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  if (lightroomNegativeReport(slot.record).state === "stale") {
    // The proof is built from the negative, and the writer has kept writing past
    // it: developing now would replace their newer words with a rewrite of older
    // ones. Re-shooting first makes the proof start from what they wrote last.
    setQuickDraftStatus(t("lightroom_develop_stale"));
    setLightroomStatus(t("lightroom_develop_stale"));
    return false;
  }
  const state = currentCompositeState(slot.record);
  if (!state.ready || !state.proof || !String(state.text || "").trim()) {
    setQuickDraftStatus(t("quick_draft_develop_none"));
    setLightroomStatus(t("quick_draft_develop_none"));
    return false;
  }
  const composite = state.text;
  const previousBody = lightroomBodyText();
  const confirmed = await showSystemModal(t("quick_draft_develop_confirm"), "confirm");
  if (confirmed !== "yes") {
    setQuickDraftStatus(t("quick_draft_develop_cancelled"));
    return false;
  }
  if (!task.stillOwnsActiveProject()) return false;
  const historyBefore = typeof lightroomHistoryRead === "function" ? lightroomHistoryRead() : null;
  const documentId = lightroomSubjectDocumentId();
  if (documentId && typeof createDocumentRevision === "function") {
    try {
      await createDocumentRevision({
        projectId: task.projectId,
        documentId,
        body: previousBody,
        origin: "system",
        operation: "quick-draft-develop",
      });
    } catch (error) {
      setQuickDraftStatus(t("quick_draft_develop_revision_failed"));
      setLightroomStatus(t("quick_draft_develop_revision_failed"));
      return false;
    }
  }
  if (!task.stillOwnsActiveProject()) return false;
  const darkroom = darkroomOf(slot.record);
  const now = new Date().toISOString();
  const patch = { workspace: {} };
  if (previousBody.trim()) {
    const version = normalizeQuickDraftVersion({
      id: stableId("version"),
      body: previousBody,
      title: lightroomSubject ? String(lightroomSubject.name || "") : slot.record.workspace.title,
      createdAt: now,
      reason: "before-develop",
      source: "quick-draft",
    });
    patch.workspace.versions = window.AISystem6DarkroomRecord.pruneDarkroomVersions([...darkroom.versions, version]);
  }
  patch.workspace.adjustmentLayers = normalizeAdjustmentLayers(
    adjustmentLayersSnapshot(slot.record).map((layer) => ({ ...layer, enabled: false }))
  );
  patch.workspace.composition = {
    ...darkroom,
    currentKey: composeCacheKey({
      source: quickDraftCompositeSource(slot.record),
      layers: enabledAdjustmentLayers(slot.record),
      protectedRanges: protectedRangesSnapshot(slot.record),
      ...compositionCacheContext(slot.record),
    }),
    composite,
    generatedAt: now,
    modelDelivered: composite,
    modelDeliveredAt: now,
  };
  if (!hasRecordedNegative(slot.record)) {
    patch.workspace.composition.negative = previousBody;
    patch.workspace.composition.negativeUpdatedAt = now;
  }
  quickDraftLastComposite = "";
  quickDraftLastCompositeKey = "";
  if (decision.path === "draft") {
    // Quick Draft's own draft is written in the same commit as the record.
    patch.stage = "draft";
    patch.workspace.body = composite;
    patch.workspace.title = titleFromBody(composite);
    if (refs.draft) refs.draft.value = composite;
    const committed = await task.commit(patch, { captureForm: false });
    if (!committed.ok) {
      // The composite must not masquerade as the working body when the write
      // failed; restore the original text and leave the record modified.
      if (refs.draft) refs.draft.value = previousBody;
      renderQuickDraft(activeProjectQuickDraft({ create: false })?.record);
      setQuickDraftStatus(t("quick_draft_save_failed"));
      return false;
    }
    renderQuickDraft(committed.record);
  } else {
    // Another owner holds the pen: the text goes through it first, and the
    // darkroom's record only follows a write that landed.
    const written = await lightroomApplyBody(composite, { operation: "darkroom-develop", previousBody, decision });
    if (!written.ok) {
      const message = t("lightroom_write_failed");
      setQuickDraftStatus(message);
      setLightroomStatus(message);
      return false;
    }
    const committed = await task.commit(patch, { captureForm: false });
    if (!committed.ok) {
      await lightroomApplyBody(previousBody, { operation: "darkroom-develop-rollback", previousBody: composite, decision });
      setQuickDraftStatus(t("quick_draft_save_failed"));
      setLightroomStatus(t("quick_draft_save_failed"));
      return false;
    }
    renderQuickDraft(committed.record);
  }
  setQuickDraftStatus(t("quick_draft_develop_done"));
  noteLightroomReceipt("quick_draft_develop", { model: quickDraftConnectedModelName() });
  if (typeof lightroomRecordStep === "function") lightroomRecordStep("edit_step_develop", historyBefore);
  if (quickDraftLastCompositeReceiptId) {
    window.AISystem6RunReceipts?.recordUserAction?.(quickDraftLastCompositeReceiptId, {
      action: "accept",
      finalBodyHash: typeof contentHash === "function" ? contentHash(composite) : "",
    });
    quickDraftLastCompositeReceiptId = "";
  }
  return true;
}

// Throwing away a proof. Until now the only way out of a composite you did not
// want was to toggle layers until the cache key changed, which is not a way
// out, it is a coincidence. This clears the darkroom's composite fields and
// the in-memory cache of the last one; the body was never touched, so there is
// nothing to restore.
async function discardLightroomComposite() {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const task = createQuickDraftAsyncTask({ create: false });
  if (!task) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  // The layers' outputs stay cached (that is work already paid for), so the
  // proof has to be marked thrown away or it would rebuild itself from them.
  const discardedKey = composeCacheKey({
    source: quickDraftCompositeSource(slot.record),
    layers: enabledAdjustmentLayers(slot.record),
    protectedRanges: protectedRangesSnapshot(slot.record),
    ...compositionCacheContext(slot.record),
  });
  quickDraftLastComposite = "";
  quickDraftLastCompositeKey = "";
  const committed = await task.commit({ workspace: { composition: {
    ...darkroomOf(task.currentRecord()),
    currentKey: "",
    composite: "",
    generatedAt: "",
    discardedKey,
  } } }, { captureForm: false });
  if (!committed.ok) {
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  renderQuickDraft(committed.record);
  setQuickDraftStatus(t("lightroom_composite_discarded"));
  if (quickDraftLastCompositeReceiptId) {
    window.AISystem6RunReceipts?.recordUserAction?.(quickDraftLastCompositeReceiptId, { action: "reject" });
    quickDraftLastCompositeReceiptId = "";
  }
  return true;
}

function looksLikePlaceholderDraft(text = "") {
  const value = String(text || "");
  return /(?:请(?:您|你)?提供|此处需要|待填写|需要(?:您|你)?提供|placeholder)/i.test(value);
}

function comparableDraftText(text = "") {
  return String(text || "")
    .replace(/[\s　]+/g, "")
    .replace(/[，。！？、；：,.!?;:()[\]（）【】《》"'“”‘’`*_#>-]/g, "")
    .toLowerCase();
}

function hasMeaningfulDraftChange(previous = "", next = "") {
  const before = comparableDraftText(previous);
  const after = comparableDraftText(next);
  if (!before) return Boolean(after);
  if (!after || before === after) return false;
  const shorter = Math.min(before.length, after.length);
  const longer = Math.max(before.length, after.length);
  if (!longer) return false;
  const lengthDelta = Math.abs(after.length - before.length) / longer;
  if (lengthDelta >= 0.08) return true;
  let samePrefix = 0;
  while (samePrefix < shorter && before[samePrefix] === after[samePrefix]) samePrefix += 1;
  return samePrefix / shorter < 0.92;
}

function stripQuickDraftModelFence(markdown = "") {
  return String(markdown || "")
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function cleanMingmingQuickDraftBody(markdown = "") {
  const source = stripQuickDraftModelFence(markdown);
  const lines = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const compact = line.trim();
    if (/^#{2,6}\s+/.test(compact)) continue;
    if (/^(?:修改说明|分析|交接清单|大纲表|审校报告|版本\s*\d+)\s*[:：]?$/.test(compact)) continue;
    lines.push(line);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---- Compression grain ---------------------------------------------------
// A lossy rewrite leaves no visible seam. The grain view compares the body
// against the negative (the writer's own text) and marks the model's share
// differently. It is read-only; the pure diff lives in app/core/grain-diff.js.

function hasRecordedNegative(record = activeProjectQuickDraft({ create: false })?.record) {
  // A version is not a negative. A copy kept on leaving, or one the writer kept
  // by hand, used to make this answer yes through the first version's body, and
  // the preview then composed from the empty negative beside it.
  const darkroom = darkroomOf(record);
  return Boolean(darkroom.negativeUpdatedAt) || Boolean(String(darkroom.negative || "").trim());
}

function grainVersionChain(record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  return grainChainFromRecordParts({
    humanAnchor: darkroomOf(record).negative,
    humanAnchorUpdatedAt: darkroomOf(record).negativeUpdatedAt,
    // Only the bodies a model pass replaced are passes. A copy kept on leaving,
    // the negative a re-shoot set aside, and anything from before a re-shoot are
    // history of another baseline, and counting them would age the grain.
    dumps: window.AISystem6DarkroomRecord.darkroomChainVersions(darkroomOf(record)).map((entry) => entry.body),
  });
}

function quickDraftGrainRuns(anchorText = "", bodyText = "") {
  const body = String(bodyText || "");
  if (!body) return [];
  const model = grainBodyModel(body);
  if (!String(anchorText || "").trim()) {
    return [{ text: body, generation: 0, source: "author" }];
  }
  const mask = grainPresenceMask(anchorText, model);
  return grainRunsFromGenerations(model, mask.map((present) => (present ? 0 : 1)));
}

function quickDraftGrainReport(record = activeProjectQuickDraft({ create: false })?.record) {
  // The views read whatever the darkroom has as its subject. Usually that is
  // the draft in front of the writer; when it is another document, the same
  // instruments read that one instead.
  const body = lightroomSubject
    ? lightroomBodyText()
    : String(record ? normalizeQuickDraftWorkspace(record.workspace, record).body : refs.draft?.value || "");
  const chain = grainVersionChain(record);
  const model = grainBodyModel(body);
  const empty = {
    runs: [], body, hasAnchor: chain.passes > 0, authorRatio: 1, modelChars: 0, totalChars: 0, passes: chain.passes, deepest: 0,
  };
  if (!model.tokens.length) return empty;
  if (!chain.versions.length) {
    return { ...empty, runs: [{ text: body, generation: 0, source: "author" }], totalChars: grainVisibleLength(body) };
  }
  const delivered = darkroomOf(record).modelDelivered || "";
  const runs = grainRunsFromGenerations(model, grainGenerations(model, chain, { modelDelivered: delivered }));
  let author = 0;
  let rewritten = 0;
  let deepest = 0;
  for (const run of runs) {
    const length = grainVisibleLength(run.text);
    if (run.generation) {
      rewritten += length;
      if (length) deepest = Math.max(deepest, run.generation);
    } else {
      author += length;
    }
  }
  const total = author + rewritten;
  return {
    runs,
    body,
    hasAnchor: true,
    authorRatio: total ? author / total : 1,
    modelChars: rewritten,
    totalChars: total,
    passes: chain.passes,
    deepest,
  };
}

function renderQuickDraftGrain() {
  if (!refs.preview) return;
  const report = quickDraftGrainReport();
  if (!report.totalChars) {
    refs.preview.innerHTML = `<p class="empty-folder-note">${escapeHtml(t("quick_draft_grain_empty"))}</p>`;
    return;
  }
  const maskEntries = grainMaskEntries(report.body);
  const maskedLines = new Set();
  maskEntries.forEach((entry) => entry.ranges.forEach((range) => {
    for (let line = range.start; line <= range.end; line += 1) maskedLines.add(line);
  }));
  const protectedLines = new Set();
  protectedRangesSnapshot().forEach((range) => {
    for (let line = range.start; line <= Math.min(range.end, report.body.split(/\n/).length); line += 1) protectedLines.add(line);
  });
  const bodyLines = [[]];
  report.runs.forEach((run) => {
    const className = run.generation ? "quick-draft-grain-model" : "quick-draft-grain-author";
    const chip = run.generation > 1
      ? `<i class="quick-draft-grain-generation">&times;${run.generation}</i>`
      : "";
    const pieces = escapeHtml(run.text).split("\n");
    pieces.forEach((piece, index) => {
      const isLast = index === pieces.length - 1;
      if (piece) {
        bodyLines[bodyLines.length - 1].push(`<span class="${className}">${piece}${isLast ? chip : ""}</span>`);
      } else if (isLast && chip) {
        bodyLines[bodyLines.length - 1].push(chip);
      }
      if (!isLast) bodyLines.push([]);
    });
  });
  const body = bodyLines
    .map((pieces, lineIndex) => (
      `<span class="quick-draft-grain-line${maskedLines.has(lineIndex + 1) ? " is-masked" : ""}${protectedLines.has(lineIndex + 1) ? " is-protected" : ""}">${pieces.join("")}</span>`
    ))
    .join("\n");
  const note = report.hasAnchor ? "" : `<p class="quick-draft-grain-note">${escapeHtml(t("quick_draft_grain_untouched"))}</p>`;
  const maskSummary = maskEntries
    .map((entry) => `${escapeHtml(entry.label)} ${escapeHtml(adjustmentMaskSummary(entry.ranges))}`)
    .join(" · ");
  const protectedSummary = adjustmentMaskSummary(protectedRangesSnapshot());
  const citationRanges = citationRangesSnapshot();
  const citationSummary = citationRanges.length
    ? `${adjustmentMaskSummary(citationRanges)} · ${[...new Set(citationRanges.map((range) => range.sourceId))].join(" ")}`
    : "";
  // Original / Current / Difference: the grain readout states how compressed
  // the current text is (author ratio + model characters), what may have been
  // squeezed out (the difference between the negative and the body), and how
  // to get it back (versions / restore).
  const readout = [
    `<span><b>${Math.round(report.authorRatio * 100)}%</b> ${escapeHtml(t("quick_draft_grain_negative"))}</span>`,
    `<span><b>${report.modelChars}</b> ${escapeHtml(t("quick_draft_grain_interpolated"))}</span>`,
    `<span><b>${report.passes}</b> ${escapeHtml(t("quick_draft_grain_passes"))}</span>`,
    report.deepest > 1
      ? `<span><b>&times;${report.deepest}</b> ${escapeHtml(t("quick_draft_grain_deepest"))}</span>`
      : "",
    maskSummary
      ? `<span><b>${escapeHtml(t("quick_draft_grain_mask"))}</b> ${maskSummary}</span>`
      : "",
    protectedSummary
      ? `<span><b>${escapeHtml(t("quick_draft_grain_protected"))}</b> ${protectedSummary}</span>`
      : "",
    citationSummary
      ? `<span><b>${escapeHtml(t("quick_draft_grain_cited"))}</b> ${citationSummary}</span>`
      : "",
  ].join("");
  const legend = [
    `<span><i class="quick-draft-grain-swatch is-author"></i>${escapeHtml(t("quick_draft_grain_legend_author"))}</span>`,
    `<span><i class="quick-draft-grain-swatch is-model"></i>${escapeHtml(t("quick_draft_grain_legend_model"))}</span>`,
    report.deepest > 1
      ? `<span><i class="quick-draft-grain-generation">&times;n</i>${escapeHtml(t("quick_draft_grain_legend_generation"))}</span>`
      : "",
    protectedSummary
      ? `<span><i class="quick-draft-grain-swatch is-protected"></i>${escapeHtml(t("quick_draft_grain_legend_protected"))}</span>`
      : "",
  ].join("");
  const zoomButton = (zoom, label, balloon) => [
    `<button type="button" class="btn mini-btn${quickDraftGrainZoom === zoom ? " is-active" : ""}"`,
    ` data-quick-draft-grain-zoom="${zoom}" aria-pressed="${quickDraftGrainZoom === zoom ? "true" : "false"}"`,
    ` data-balloon-help="${balloon}">${escapeHtml(label)}</button>`,
  ].join("");
  const zoom = [
    `<span class="quick-draft-grain-zoom">`,
    zoomButton("histogram", t("quick_draft_histogram"), "balloon_qd_histogram"),
    zoomButton("fatbits", "FatBits", "balloon_qd_fatbits"),
    `</span>`,
  ].join("");
  const canvas = quickDraftGrainZoom === "fatbits"
    ? renderFatBitsCells(report, protectedLines)
    : quickDraftGrainZoom === "histogram"
      ? renderGrainHistogram(report)
      : `<pre class="quick-draft-grain-body">${body}</pre>`;
  refs.preview.innerHTML = [
    `<div class="quick-draft-grain-readout">${readout}${zoom}</div>`,
    note,
    canvas,
    quickDraftGrainZoom === "histogram" ? "" : `<div class="quick-draft-grain-legend">${legend}</div>`,
  ].join("");
}

// Zoomed out until the whole draft is one picture. Two charts on one axis: the
// writer's own negative, and the body now. No threshold and no warning — the
// comparison is the evidence, and the writer is the one who reads it.
function grainHistogramChart(histogram, label, peak) {
  const bars = histogram.buckets.map((bucket) => {
    const height = peak ? Math.round((bucket.total / peak) * 100) : 0;
    const model = bucket.total ? Math.round((bucket.model / bucket.total) * 100) : 0;
    const range = bucket.to ? `${bucket.from}\u2013${bucket.to}` : `${bucket.from}+`;
    return [
      `<li class="quick-draft-histogram-bar">`,
      `<span class="quick-draft-histogram-column" style="--grain-bar-height:${height}%">`,
      model ? `<span class="quick-draft-histogram-model" style="--grain-bar-model:${model}%"></span>` : "",
      `</span>`,
      `<span class="quick-draft-histogram-tick">${range}</span>`,
      `</li>`,
    ].join("");
  }).join("");
  const summary = histogram.count
    ? t("quick_draft_histogram_summary", histogram.count, histogram.median, histogram.spread)
    : t("quick_draft_histogram_none");
  return [
    `<figure class="quick-draft-histogram">`,
    `<figcaption>${escapeHtml(label)}</figcaption>`,
    `<ol class="quick-draft-histogram-bars">${bars}</ol>`,
    `<p class="quick-draft-histogram-summary">${escapeHtml(summary)}</p>`,
    `</figure>`,
  ].join("");
}

function renderGrainHistogram(report) {
  const negativeText = darkroomOf().negative || "";
  const now = grainHistogram(grainSentenceCells(report.runs));
  const negative = negativeText.trim() ? grainHistogramForText(negativeText) : null;
  const peak = Math.max(now.peak, negative?.peak || 0);
  return [
    `<div class="quick-draft-histograms">`,
    negative ? grainHistogramChart(negative, t("quick_draft_histogram_negative"), peak) : "",
    grainHistogramChart(now, t("quick_draft_histogram_now"), peak),
    `</div>`,
    `<p class="quick-draft-grain-note">${escapeHtml(t("quick_draft_histogram_axis"))}</p>`,
  ].join("");
}

// The target the writer already chose, read in the unit it was chosen in.
// A words target counts words; a duration target counts seconds — the frame
// never converts one into the other behind the writer's back.
function quickDraftCanvasTarget() {
  const raw = String(refs.duration?.value || "").trim();
  const words = /^([0-9]+)w$/.exec(raw);
  if (words) {
    return {
      kind: "words",
      target: Number(words[1]) || 0,
      measure: (text) => (typeof countTextWords === "function" ? countTextWords(text) : grainVisibleLength(text)),
    };
  }
  const minutes = /^([0-9]+)m$/.exec(raw);
  if (minutes) {
    return {
      kind: "duration",
      target: (Number(minutes[1]) || 0) * 60,
      measure: (text) => (typeof estimateVoiceoverSeconds === "function"
        ? estimateVoiceoverSeconds(text)
        : estimateBilibiliVoiceoverSeconds(text)),
    };
  }
  return { kind: "", target: 0, measure: grainVisibleLength };
}

function canvasFrameSummary(frame, kind) {
  if (!frame.target) return "";
  const unit = kind === "duration" ? t("quick_draft_canvas_seconds") : t("quick_draft_canvas_words");
  return frame.over
    ? t("quick_draft_canvas_over", frame.total, frame.target, unit, frame.over)
    : t("quick_draft_canvas_fits", frame.total, frame.target, unit);
}

// The brush sources are the version chain the Versions list already shows, by
// the same ids, so "restore this sentence" and "restore the draft" never mean
// two different histories.
function brushSourceOptions(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  const options = [];
  const darkroom = darkroomOf(record);
  if (String(darkroom.negativeUpdatedAt || "")) {
    options.push({ id: "negative", label: t("quick_draft_negative"), body: darkroom.negative || "" });
  }
  [...(darkroom.versions || [])].reverse().slice(0, 12).forEach((entry) => {
    options.push({ id: entry.id, label: textExcerpt(entry.body, 18) || t("quick_draft_versions"), body: entry.body });
  });
  return options;
}

function brushSourceText(record = activeProjectQuickDraft({ create: false })?.record) {
  if (!quickDraftBrushSource) return "";
  return brushSourceOptions(record).find((option) => option.id === quickDraftBrushSource)?.body || "";
}

function renderBrushPicker(record = activeProjectQuickDraft({ create: false })?.record) {
  const options = brushSourceOptions(record);
  if (!options.length) return "";
  const items = [`<option value="">${escapeHtml(t("quick_draft_brush_off"))}</option>`]
    .concat(options.map((option) => (
      `<option value="${escapeHtml(option.id)}"${option.id === quickDraftBrushSource ? " selected" : ""}>${escapeHtml(option.label)}</option>`
    )))
    .join("");
  return [
    `<div class="quick-draft-brush-picker">`,
    `<label for="quick-draft-brush-source">${escapeHtml(t("quick_draft_brush_source"))}</label>`,
    `<div class="select-wrap"><select id="quick-draft-brush-source" data-quick-draft-brush-source>${items}</select></div>`,
    `</div>`,
  ].join("");
}

// One sentence, one cell. The badge is the deepest generation in the cell; the
// parts inside keep their own colour so a sentence whose second clause alone
// was rewritten does not read as wholly the model's.
function renderFatBitsCells(report, protectedLines = new Set()) {
  const cells = grainSentenceCells(report.runs);
  quickDraftFatBitsCells = cells;
  if (!cells.length) return `<p class="quick-draft-grain-note">${escapeHtml(t("quick_draft_grain_empty"))}</p>`;
  const source = brushSourceText();
  const { kind: canvasKind, target: canvasTarget, measure: canvasMeasure } = quickDraftCanvasTarget();
  const frame = grainCanvasFrame(cells, canvasTarget, canvasMeasure);
  const citations = citationRangesSnapshot();
  const citedLines = new Map();
  citations.forEach((range) => {
    for (let line = range.start; line <= range.end; line += 1) citedLines.set(line, range.sourceId);
  });
  const rows = cells.map((cell, index) => {
    const inner = cell.parts
      .map((part) => `<span class="${part.generation ? "quick-draft-grain-model" : "quick-draft-grain-author"}">${escapeHtml(part.text)}</span>`)
      .join("");
    const badge = cell.generation
      ? `<i class="quick-draft-grain-generation">&times;${cell.generation}</i>`
      : "";
    const locked = protectedLines.has(cell.line);
    // Protection is a ban on the model, not on the writer, so a locked cell
    // stays editable and keeps the lock mark that says the model cannot touch it.
    // The brush only appears where there is really something to take back: an
    // ancestor that was found and that differs. Where none was found the cell
    // simply has no brush, which says "no ancestor here" without claiming one.
    // A quoted sentence is not the writer's to repaint from an older draft
    // either: it belongs to its source.
    const citedBy = citedLines.get(cell.line) || "";
    const ancestor = source && !citedBy ? grainAncestorSentence(cell.text, source) : null;
    const brush = ancestor && !ancestor.unchanged
      ? `<button type="button" class="quick-draft-fatbit-brush" data-fatbit-brush="${index}" title="${escapeHtml(ancestor.text)}" aria-label="${escapeHtml(t("quick_draft_brush_cell"))}">&#9678;</button>`
      : "";
    const undo = quickDraftFatBitsUndo.has(cell.text)
      ? `<button type="button" class="quick-draft-fatbit-undo" data-fatbit-revert="${index}" data-i18n-aria-label="quick_draft_fatbits_revert" aria-label="${escapeHtml(t("quick_draft_fatbits_revert"))}">&#8617;</button>`
      : "";
    const outside = frame.target && !frame.marks[index]?.fits;
    const edge = frame.edge === index;
    return [
      `<li class="quick-draft-fatbit${locked ? " is-protected" : ""}${outside ? " is-outside-canvas" : ""}${edge ? " is-canvas-edge" : ""}" data-fatbit-line="${cell.line}">`,
      `<span class="quick-draft-fatbit-index">${index + 1}</span>`,
      `<span class="quick-draft-fatbit-text"${lightroomWriteDecision().path === "draft" ? ' contenteditable="plaintext-only" role="textbox" data-requires-write' : ""} spellcheck="false" data-fatbit-cell="${index}">${inner}</span>`,
      `<span class="quick-draft-fatbit-badge">${citedBy ? `<i class="quick-draft-fatbit-cite">${escapeHtml(citedBy)}</i>` : ""}${brush}${undo}${locked ? `<i class="quick-draft-fatbit-lock" aria-hidden="true"></i>` : ""}${badge}</span>`,
      `</li>`,
    ].join("");
  });
  const canvasNote = frame.target
    ? `<p class="quick-draft-canvas-note">${escapeHtml(canvasFrameSummary(frame, canvasKind))}</p>`
    : "";
  return `${renderBrushPicker()}${canvasNote}<ol class="quick-draft-fatbits">${rows.join("")}</ol>`;
}

// While the zoom is open the cells are the one editable owner of the body. The
// lock is registered as a reason rather than written onto the textarea: the
// write lease owns that property, and two owners means the last one to run
// wins — the trap the writing route already paid for once.
function fatBitsReadOnlyRule(element) {
  return quickDraftGrainZoom === "fatbits" && element === refs.draft;
}

function bindFatBitsHandlers() {
  if (quickDraftFatBitsBound || !refs.preview) return;
  quickDraftFatBitsBound = true;
  refs.preview.addEventListener("keydown", (event) => {
    const cell = event.target.closest?.("[data-fatbit-cell]");
    if (!cell) return;
    if (event.key === "Escape") {
      cell.textContent = quickDraftFatBitsCells[Number(cell.dataset.fatbitCell)]?.text || cell.textContent;
      cell.blur();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    // A sentence cell holds one sentence. Splitting the draft is the body
    // view's job, so Enter commits and moves on rather than making a line.
    event.preventDefault();
    const next = cell.closest("li")?.nextElementSibling?.querySelector("[data-fatbit-cell]");
    commitFatBitsCell(cell).then(() => {
      const moved = next && next.isConnected
        ? next
        : refs.preview?.querySelectorAll("[data-fatbit-cell]")[Number(cell.dataset.fatbitCell) + 1];
      moved?.focus?.();
    });
  });
  refs.preview.addEventListener("focusout", (event) => {
    const cell = event.target.closest?.("[data-fatbit-cell]");
    if (cell) commitFatBitsCell(cell);
  });
  refs.preview.addEventListener("change", (event) => {
    const picker = event.target.closest?.("[data-quick-draft-brush-source]");
    if (!picker) return;
    quickDraftBrushSource = String(picker.value || "");
    renderQuickDraftGrain();
  });
  refs.preview.addEventListener("click", (event) => {
    const brush = event.target.closest?.("[data-fatbit-brush]");
    if (brush) {
      const cell = quickDraftFatBitsCells[Number(brush.dataset.fatbitBrush)];
      const ancestor = cell ? grainAncestorSentence(cell.text, brushSourceText()) : null;
      if (cell && ancestor && !ancestor.unchanged) {
        quickDraftFatBitsUndo.set(ancestor.text, cell.text);
        writeFatBitsCell(cell, ancestor.text);
      }
      return;
    }
    const revert = event.target.closest?.("[data-fatbit-revert]");
    if (!revert) return;
    const cell = quickDraftFatBitsCells[Number(revert.dataset.fatbitRevert)];
    const previous = cell ? quickDraftFatBitsUndo.get(cell.text) : "";
    if (!cell || typeof previous !== "string") return;
    quickDraftFatBitsUndo.delete(cell.text);
    writeFatBitsCell(cell, previous);
  });
}

function fatBitsCellText(element) {
  return String(element?.textContent || "").replace(/\s+/g, " ").trim();
}

// Splice by offset, never by search: a draft that repeats a sentence would
// otherwise have the wrong one rewritten.
async function writeFatBitsCell(cell, nextText) {
  if (quickDraftFatBitsWriting) return false;
  const body = String(refs.draft?.value || "");
  if (!cell || body.slice(cell.start, cell.end) !== cell.text) {
    renderQuickDraftGrain();
    return false;
  }
  let head = body.slice(0, cell.start);
  let tail = body.slice(cell.end);
  let shift = null;
  if (!nextText) {
    // An emptied cell removes its sentence. If that leaves the line blank the
    // line goes too, and every protected range and layer mask below it moves up
    // with it — the same splice report the paste takeover files.
    const lineStart = head.lastIndexOf("\n") + 1;
    const lineEndOffset = tail.indexOf("\n");
    const restOfLine = lineEndOffset < 0 ? tail : tail.slice(0, lineEndOffset);
    if (!head.slice(lineStart).trim() && !restOfLine.trim() && lineEndOffset >= 0) {
      head = head.slice(0, Math.max(0, lineStart - 1));
      tail = tail.slice(lineEndOffset);
      shift = { atLine: cell.line, delta: -1 };
    }
  }
  const nextBody = `${head}${nextText}${tail}`;
  if (nextBody === body) return false;
  if (refs.draft) refs.draft.value = nextBody;
  const patch = { body: nextBody };
  if (shift) {
    const runtime = window.AISystem6PasteMarkdown;
    const ranges = protectedRangesSnapshot();
    const layers = adjustmentLayersSnapshot();
    if (runtime && ranges.length) patch.protectedRanges = normalizeAdjustmentLayerMask(runtime.pasteShiftLineRanges(ranges, shift));
    if (runtime && layers.some((layer) => (layer.mask || []).length)) {
      patch.adjustmentLayers = layers.map((layer) => (
        (layer.mask || []).length
          ? { ...layer, mask: normalizeAdjustmentLayerMask(runtime.pasteShiftLineRanges(layer.mask, shift)) }
          : layer
      ));
    }
  }
  quickDraftFatBitsWriting = true;
  try {
    const committed = await commitQuickDraft({ workspace: patch }, { captureForm: false });
    if (!committed.ok) {
      if (refs.draft) refs.draft.value = body;
      setQuickDraftStatus(t("quick_draft_save_failed"));
      renderQuickDraftGrain();
      return false;
    }
    renderQuickDraft(committed.record);
    return true;
  } finally {
    quickDraftFatBitsWriting = false;
  }
}

async function commitFatBitsCell(element) {
  // A commit re-renders, and replacing the list detaches whatever cell had
  // focus — which still fires focusout, from a node whose index now points at
  // a different sentence. A detached cell has nothing left to say: its text is
  // already in the body. Without this a re-render deletes the next sentence.
  if (!element || !element.isConnected || quickDraftFatBitsWriting) return false;
  const index = Number(element?.dataset?.fatbitCell);
  const cell = quickDraftFatBitsCells[index];
  if (!cell) return false;
  const nextText = fatBitsCellText(element);
  if (nextText === cell.text) return false;
  if (nextText) quickDraftFatBitsUndo.set(nextText, cell.text);
  return writeFatBitsCell(cell, nextText);
}

// The zoom buttons toggle: pressing the lit one returns to plain grain. A menu
// row is a radio, not a button -- choosing the row you are already on must not
// take you somewhere else -- so the menu asks for the exact value.
function currentQuickDraftGrainZoom() {
  return quickDraftGrainZoom;
}

function setQuickDraftGrainZoom(zoom = "grain", { toggle = true } = {}) {
  const next = zoom === "fatbits" || zoom === "histogram" ? zoom : "grain";
  quickDraftGrainZoom = toggle && quickDraftGrainZoom === next ? "grain" : next;
  if (!quickDraftFatBitsRuleRegistered && window.AISystem6WriteLease?.registerReadOnlyRule) {
    window.AISystem6WriteLease.registerReadOnlyRule(fatBitsReadOnlyRule);
    quickDraftFatBitsRuleRegistered = true;
  }
  if (quickDraftGrainZoom !== "fatbits") quickDraftFatBitsUndo.clear();
  bindFatBitsHandlers();
  renderQuickDraftGrain();
  window.AISystem6WriteLease?.syncReadOnlySurface?.();
  return quickDraftGrainZoom;
}

async function runAdjustmentCommand(kind = "") {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const layers = adjustmentLayersSnapshot(slot.record);
  const layer = layers.find((item) => item.kind === kind);
  if (!layer) return false;
  const selection = selectionLineRanges();
  const nextLayers = layers.map((item) => {
    if (item.kind !== kind) return item;
    const mask = selection.length
      ? normalizeAdjustmentLayerMask([...(item.mask || []), ...selection])
      : item.mask;
    return { ...item, enabled: true, mask };
  });
  const committed = await commitQuickDraft({ workspace: { adjustmentLayers: nextLayers } });
  if (!committed.ok) {
    renderQuickDraft(slot.record);
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  renderAdjustmentLayers(committed.record);
  refreshQuickDraftPreviewIfOpen();
  if (String(quickDraftCompositeSource(slot.record) || "").trim()) {
    return applyAdjustmentLayers();
  }
  setQuickDraftStatus(t("quick_draft_adjustment_added"));
  return true;
}

window.AISystem6QuickDraftComposition = Object.freeze({
  adjustmentLayersSnapshot,
  applyAdjustmentLayers,
  currentCompositeState,
  developAdjustmentLayers,
  grainVersionChain,
  hasRecordedNegative,
  modelProtectedRanges,
  notePasteLineShift,
  protectSelectionFromTextarea,
  protectedRangesSnapshot,
  quickDraftCompositeSource,
  renderAdjustmentLayers,
  renderQuickDraftGrain,
  setQuickDraftGrainZoom,
  renderQuickDraftReadingView,
  renderProtectedRangeControls,
  runAdjustmentCommand,
  scopeSelectionToLayer,
});
