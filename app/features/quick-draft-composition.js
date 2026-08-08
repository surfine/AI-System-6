// 钟点稿 / Quick Draft — composition (文字亮室).
//
// Adjustment layers, protected ranges, compression grain, composite preview,
// and Develop. The writer's own text is the negative and is never rewritten;
// every layer reads the negative (never another layer's output), and only
// Develop promotes the composite to the new working body — after a revision
// is saved and the writer confirms. Protection is immutable-sentinel based:
// a model pass that breaks a sentinel fails the whole composition.

function adjustmentLayersSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
  return normalizeAdjustmentLayers(normalizeQuickDraftWorkspace(record?.workspace, record).adjustmentLayers);
}

function adjustmentLayerState(kind = "", record = activeProjectQuickDraft({ create: false })?.record) {
  return adjustmentLayer(kind, adjustmentLayersSnapshot(record));
}

function adjustmentLayerLabelKey(kind = "") {
  const labels = {
    mingming: "quick_draft_chip_mingming",
    luoluo: "quick_draft_chip_luoluo",
    hkrr: "quick_draft_chip_hkrr",
    density: "quick_draft_adjustment_density",
  };
  return labels[kind] || "";
}

function renderLayerDescriptions() {
  const descriptions = {
    mingming: "quick_draft_layer_mingming_desc",
    luoluo: "quick_draft_layer_luoluo_desc",
    hkrr: "quick_draft_layer_hkrr_desc",
    density: "quick_draft_layer_density_desc",
  };
  Object.entries(descriptions).forEach(([kind, key]) => {
    document.querySelectorAll(`[data-quick-draft-layer-description="${kind}"]`).forEach((el) => {
      el.textContent = t(key);
    });
  });
}

// One layer opens at a time: the stack order is the information here, and four
// open rows hide it again. The triangle is the Finder list-row disclosure.
function toggleQuickDraftLayerDetail(kind = "") {
  const target = document.getElementById(`quick-draft-layer-detail-${kind}`);
  if (!target) return false;
  const open = target.hidden;
  document.querySelectorAll("[data-quick-draft-layer-toggle]").forEach((button) => {
    const detail = document.getElementById(`quick-draft-layer-detail-${button.dataset.quickDraftLayerToggle}`);
    const on = open && detail === target;
    if (detail) detail.hidden = !on;
    button.setAttribute("aria-expanded", on ? "true" : "false");
  });
  return open;
}

function renderAdjustmentLayers(record = activeProjectQuickDraft({ create: false })?.record) {
  if (!refs.form) return;
  const layers = adjustmentLayersSnapshot(record);
  const section = refs.form.querySelector("[data-quick-draft-adjustment-layer]")?.parentElement;
  if (section) {
    layers.forEach((layer) => {
      const wrapper = section.querySelector(`[data-quick-draft-adjustment-layer="${layer.kind}"]`);
      if (wrapper) section.append(wrapper);
    });
  }
  layers.forEach((layer, index) => {
    const checkbox = refs.form.querySelector(`[data-quick-draft-adjustment-enabled="${layer.kind}"]`);
    const select = refs.form.querySelector(`[data-quick-draft-adjustment-strength="${layer.kind}"]`);
    const maskInput = refs.form.querySelector(`[data-quick-draft-adjustment-mask="${layer.kind}"]`);
    if (checkbox) checkbox.checked = layer.enabled;
    if (select) select.value = String(layer.strength);
    if (maskInput) maskInput.value = adjustmentMaskSummary(layer.mask);
    // The stack order is the information in this panel, so the row carries its
    // own number, and the scope it will run on stays readable when the row is
    // closed.
    const order = refs.form.querySelector(`[data-quick-draft-layer-order="${layer.kind}"]`);
    if (order) order.textContent = String(index + 1);
    const scope = refs.form.querySelector(`[data-quick-draft-layer-scope="${layer.kind}"]`);
    if (scope) {
      const summary = adjustmentMaskSummary(layer.mask);
      scope.textContent = t("quick_draft_layer_scope", summary || t("quick_draft_layer_scope_all"));
    }
    const wrapper = refs.form.querySelector(`[data-quick-draft-adjustment-layer="${layer.kind}"]`);
    if (wrapper) {
      const up = wrapper.querySelector('[data-quick-draft-adjustment-move][data-direction="-1"]');
      const down = wrapper.querySelector('[data-quick-draft-adjustment-move][data-direction="1"]');
      if (up) up.disabled = index === 0;
      if (down) down.disabled = index === layers.length - 1;
    }
  });
  renderLayerDescriptions();
}

function updateAdjustmentLayer(kind = "", patch = {}) {
  const next = normalizeAdjustmentLayers(adjustmentLayersSnapshot()).map((layer) => (
    layer.kind === kind ? { ...layer, ...patch } : layer
  ));
  saveQuickDraft({ workspace: { adjustmentLayers: next } }, { debounce: false });
  renderAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record);
  refreshQuickDraftPreviewIfOpen();
  setQuickDraftStatus(t("quick_draft_adjustment_saved"));
  return next;
}

function moveAdjustmentLayer(kind = "", direction = -1) {
  const layers = adjustmentLayersSnapshot();
  const index = layers.findIndex((layer) => layer.kind === kind);
  const target = index + (Number(direction) || -1);
  if (index < 0 || target < 0 || target >= layers.length) return layers;
  const next = [...layers];
  const [layer] = next.splice(index, 1);
  next.splice(target, 0, layer);
  saveQuickDraft({ workspace: { adjustmentLayers: next } }, { debounce: false });
  renderAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record);
  refreshQuickDraftPreviewIfOpen();
  setQuickDraftStatus(t("quick_draft_adjustment_saved"));
  return next;
}

function refreshQuickDraftPreviewIfOpen() {
  if (refs.draft?.closest(".teachtext-editor-container")?.classList.contains("is-previewing")) {
    renderQuickDraftPreviewPane();
  }
}

// ---- Protected ranges ----------------------------------------------------
// Protection is a property of the text. The UI keeps the writer's mask as
// readable line ranges (a textarea cannot paint spans), but enforcement is
// immutable-sentinel based in app/core/protected-ranges.js: the model never
// sees the protected bytes, and any violation fails the composition.

function protectedRangesSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
  return normalizeAdjustmentLayerMask(normalizeQuickDraftWorkspace(record?.workspace, record).protectedRanges);
}

function renderProtectedRangeControls(record = activeProjectQuickDraft({ create: false })?.record) {
  const input = refs.form?.querySelector("[data-quick-draft-protected-ranges]");
  if (!input) return;
  input.value = adjustmentMaskSummary(protectedRangesSnapshot(record));
}

function selectionLineRanges() {
  const el = refs.draft;
  if (!el) return [];
  const value = String(el.value || "");
  if (!value) return [];
  const start = Math.min(Number(el.selectionStart) || 0, value.length);
  const end = Math.max(Number(el.selectionEnd) || start, start);
  const before = value.slice(0, start);
  const selected = value.slice(start, end).replace(/\n$/, "");
  const startLine = before.split(/\n/).length;
  const endLine = startLine + Math.max(0, selected.split(/\n/).length - 1);
  return [{ start: startLine, end: endLine }];
}

function protectSelectionFromTextarea() {
  const ranges = selectionLineRanges();
  if (!ranges.length) {
    setQuickDraftStatus(t("quick_draft_protect_no_selection"));
    refs.draft?.focus();
    return false;
  }
  const next = normalizeAdjustmentLayerMask([...protectedRangesSnapshot(), ...ranges]);
  saveQuickDraft({ workspace: { protectedRanges: next } }, { debounce: false });
  renderProtectedRangeControls(activeProjectQuickDraft({ create: false })?.record);
  refreshQuickDraftPreviewIfOpen();
  setQuickDraftStatus(t("quick_draft_protect_saved"));
  return true;
}

function scopeSelectionToLayer(kind = "") {
  const ranges = selectionLineRanges();
  if (!ranges.length) {
    setQuickDraftStatus(t("quick_draft_scope_no_selection"));
    refs.draft?.focus();
    return false;
  }
  const layers = adjustmentLayersSnapshot();
  const layer = layers.find((item) => item.kind === kind);
  if (!layer) return false;
  const merged = normalizeAdjustmentLayerMask([...(layer.mask || []), ...ranges]);
  const next = layers.map((item) => (item.kind === kind ? { ...item, mask: merged } : item));
  saveQuickDraft({ workspace: { adjustmentLayers: next } }, { debounce: false });
  renderAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record);
  refreshQuickDraftPreviewIfOpen();
  setQuickDraftStatus(t("quick_draft_scope_saved"));
  return true;
}

function densityStrengthPromptLine(strength = ADJUSTMENT_DEFAULT_STRENGTH, zh = true) {
  if (strength === 25) {
    return zh
      ? "- 密度调整层：少压。几乎保留全部原句，只压掉最妨碍“当天能录”的啰嗦；顺序、口气和判断不动。"
      : "- Density adjustment: less compression. Keep nearly every original sentence; cut only the redundancy that blocks same-day recording; keep order, voice, and judgment.";
  }
  if (strength === 75) {
    return zh
      ? "- 密度调整层：多压。明显压缩：合并冗余句、删空话、让段落更密；不新增事实、不丢未测边界、不用风格覆盖事实。"
      : "- Density adjustment: more compression. Compress hard: merge redundant sentences, cut filler, make the passage denser; never add facts, drop untested boundaries, or let style override facts.";
  }
  return zh
    ? "- 密度调整层：标准。适度压缩：合并可省的句子、压掉泛泛总结，但保留作者判断、具体细节和已写出的口气。"
    : "- Density adjustment: standard. Compress moderately: merge what can be saved and trim generic summary, but keep the author's judgment, concrete detail, and written voice.";
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
function adjustmentLayerCompositionInstruction(layer = {}, zh = true, protectedRanges = protectedRangesSnapshot()) {
  const kind = String(layer?.kind || "");
  const strength = Number(layer?.strength) || ADJUSTMENT_DEFAULT_STRENGTH;
  const lensLine = kind === "density"
    ? densityStrengthPromptLine(strength, zh)
    : kind === "mingming"
    ? (zh
      ? "- 铭铭视角调整：朝“能拍、能念、能成立的当天口播”收紧这一遍；保留作者判断、犹豫和已写出的口气。"
      : "- Mingming-perspective adjustment: tighten this pass toward shootable, speakable, defensible same-day spoken copy; keep the author's judgment, hesitation, and written voice.")
    : kind === "luoluo"
    ? (zh
      ? "- 落落接收视角调整：让段落更容易直接开口念、不要求他重新拆资料；保留判断和真实口气，不写私人建议。"
      : "- Luoluo-receiving adjustment: make the passage easier to read aloud without re-triaging sources; keep judgment and real voice; no private advice.")
    : kind === "hkrr"
    ? (zh
      ? "- HKRR 调整：加发现感、信息增量、人的感受和节奏；不编造，不抹平边界。"
      : "- HKRR adjustment: add discovery, information gain, human feeling, and rhythm; never invent, never flatten boundaries.")
    : "";
  const strengthLine = kind === "density" ? "" : adjustmentStrengthPromptLine(strength, zh);
  const originalMask = normalizeAdjustmentLayerMask(layer?.mask);
  const maskRanges = window.AISystem6ProtectedRanges.remapLineRangesAfterSentinels(originalMask, protectedRanges);
  const maskLine = !originalMask.length
    ? (zh ? "- 本层作用于全文。" : "- This layer applies to the whole draft.")
    : maskRanges.length
    ? (zh
      ? `- 本层只作用于下面正文的第 ${adjustmentMaskSummary(maskRanges)} 行；其余行保持原样，不要给建议。`
      : `- This layer applies only to lines ${adjustmentMaskSummary(maskRanges)} of the text below; leave every other line alone.`)
    : (zh
      ? "- 本层蒙版所在的行全部受保护，这一层不改任何内容。"
      : "- Every line this layer masks is protected; this layer changes nothing.");
  return [lensLine, strengthLine, maskLine].filter(Boolean).join("\n");
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
// Body = negative + enabled adjustments applied in stored order. Each layer
// reads the negative, never another layer's output, so every prefix of the
// stack is its own cache key. The pure rule lives in app/core/text-compose.js;
// this module keeps the in-memory cache, the prompt, and the record writes.

const quickDraftCompositeCache = new Map();
const QUICK_DRAFT_COMPOSITION_PROMPT_VERSION = 2;
let quickDraftLastComposite = "";
let quickDraftLastCompositeKey = "";

function quickDraftCompositeSource(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  return hasRecordedNegative(record)
    ? workspace.composition.negative
    : String(refs.draft?.value || workspace.body || "");
}

function enabledAdjustmentLayers(record = activeProjectQuickDraft({ create: false })?.record) {
  return adjustmentLayersSnapshot(record).filter((layer) => layer.enabled);
}

function compositionCacheContext(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  const targetFormat = normalizeScenario(refs.format?.value || workspace.intake.setup.scenario);
  return {
    language: currentLanguage,
    targetFormat,
    targetDuration: normalizeDuration(refs.duration?.value || workspace.intake.setup.targetDuration, targetFormat),
    modelId: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value?.trim() || ""),
    promptVersion: QUICK_DRAFT_COMPOSITION_PROMPT_VERSION,
  };
}

function currentCompositeState(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  const body = String(refs.draft?.value || workspace.body || "");
  const layers = enabledAdjustmentLayers(record);
  if (!layers.length) return { text: body, ready: true, stale: false };
  const source = quickDraftCompositeSource(record);
  const key = composeCacheKey({ source, layers, protectedRanges: protectedRangesSnapshot(record), ...compositionCacheContext(record) });
  if (workspace.composition.currentKey === key && workspace.composition.composite) {
    return { text: workspace.composition.composite, ready: true, stale: false };
  }
  if (quickDraftCompositeCache.has(key)) {
    return { text: quickDraftCompositeCache.get(key), ready: true, stale: false };
  }
  if (quickDraftLastCompositeKey === key && quickDraftLastComposite) {
    return { text: quickDraftLastComposite, ready: true, stale: false };
  }
  if (!quickDraftLastCompositeKey) {
    return { text: body, ready: true, stale: false };
  }
  return { text: quickDraftLastComposite || body, ready: false, stale: true };
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

function buildCompositionPrompt({ sourceText = "", sentinels = [], layers = [] }) {
  const zh = currentLanguage === "zh";
  const firstDay = firstDaySnapshot();
  const targetFormat = normalizeScenario(refs.format?.value || FIRST_DAY_FORMAT);
  const targetDuration = normalizeDuration(refs.duration?.value, targetFormat);
  const formatText = formatLabel(targetFormat);
  const lengthText = durationLabel(targetDuration, targetFormat);
  const context = [
    `对象/标题：${meaningfulFirstDayTitle(firstDay.title) || firstDay.subject || titleFromBody(sourceText)}`,
    `稿件类型：${formatText}`,
    `目标长度：${lengthText}`,
  ].filter(Boolean).join("\n");
  const protectedRanges = protectedRangesSnapshot();
  const layerInstructions = layers
    .map((layer) => adjustmentLayerCompositionInstruction(layer, zh, protectedRanges))
    .filter(Boolean)
    .join("\n\n");
  return zh
    ? [
        "钟点稿非破坏调整合成：",
        "这是把下面的原稿按顺序应用已启用的调整层。你的任务是一遍完成全部调整，输出合成后的整篇正文。",
        context,
        "原稿（必须基于它改写，只改应改的部分；受保护内容已被占位符替换，保持原样）：",
        sourceText || "（原稿为空）",
        protectedSentinelBlock(sentinels, zh),
        "调整层（按此顺序应用）：",
        layerInstructions,
        "- 事实只来自素材区和原稿；不新增事实、不把没亲测写成体验、不丢地区/Beta/待核边界、不用风格覆盖事实。",
        "- 保留作者判断、具体细节和已写出的口气；不要只沿着上一版 AI 稿自我复制。",
        "- 只输出正文文本本身：不要 Markdown 标题、说明、列表、JSON 或后台标签；不要用“当然”“好的”“以下是”开头。",
        "- 受保护占位符必须逐字保留在输出中。",
      ].filter(Boolean).join("\n\n")
    : [
        "Quick Draft non-destructive composition:",
        "Apply the enabled adjustment layers below to the source text, in order, in one pass, and return the full composed body.",
        context,
        "Source (rewrite from this; change only what a layer asks for; protected content is already replaced by placeholders):",
        sourceText || "(empty source)",
        protectedSentinelBlock(sentinels, zh),
        "Adjustment layers (apply in this order):",
        layerInstructions,
        "- Facts come only from the material pane and the source; do not add facts, do not turn untested material into experience, do not drop region/Beta/pending-check boundaries, and do not let style override facts.",
        "- Preserve the author's judgment, concrete detail, and written voice; do not self-replicate from a previous AI draft.",
        "- Output the body text only: no Markdown headings, notes, lists, JSON, or backstage labels; do not begin with 'Sure', 'Of course', or 'Here is'.",
        "- Protected placeholders must appear verbatim in the output.",
      ].filter(Boolean).join("\n\n");
}

async function compositionModelCall({ key, source, protectedText, sentinels, layers }) {
  const prompt = buildCompositionPrompt({ sourceText: protectedText, sentinels, layers });
  const response = await fetchModelPayload({
    model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value?.trim() || ""),
    messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
    temperature: 0.4,
    max_tokens: 5200,
    ai_system6_task_kind: "mingming_rewrite",
    stream: false,
  }, requestController?.signal);
  if (!response.ok) {
    throw new Error(serviceErrorDetail(response.status, await response.text()));
  }
  const result = await response.json().catch(() => ({}));
  const raw = String(result?.choices?.[0]?.message?.content || "").trim();
  return cleanMingmingQuickDraftBody(raw);
}

async function applyAdjustmentLayers() {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const layers = enabledAdjustmentLayers(slot.record);
  if (!layers.length) {
    setQuickDraftStatus(t("quick_draft_apply_none"));
    return false;
  }
  if (!quickDraftModelAvailable()) {
    setQuickDraftStatus(t("quick_draft_connect_ai"));
    return false;
  }
  const source = quickDraftCompositeSource(slot.record);
  if (!String(source || "").trim()) {
    setQuickDraftStatus(t("quick_draft_empty_body"));
    refs.draft?.focus();
    return false;
  }
  if (requestController) requestController.abort();
  requestController = new AbortController();
  setBusy(true);
  setQuickDraftStatus(t("quick_draft_applying"));
  try {
    const protectedRanges = protectedRangesSnapshot(slot.record);
    const applicableLayers = layers.filter((layer) => (
      !normalizeAdjustmentLayerMask(layer.mask).length
      || window.AISystem6ProtectedRanges.remapLineRangesAfterSentinels(layer.mask, protectedRanges).length
    ));
    if (!applicableLayers.length) {
      setQuickDraftStatus(t("quick_draft_apply_none"));
      return false;
    }
    const cacheContext = compositionCacheContext(slot.record);
    const composed = await composeDocument({
      source,
      layers: applicableLayers,
      protectedRanges,
      cache: quickDraftCompositeCache,
      cacheContext,
      runModel: compositionModelCall,
    });
    quickDraftLastComposite = composed.text;
    quickDraftLastCompositeKey = composeCacheKey({
      source,
      layers: applicableLayers,
      protectedRanges: composed.ranges,
      ...cacheContext,
    });
    const committed = await commitQuickDraft({ workspace: { composition: {
      ...slot.record.workspace.composition,
      currentKey: quickDraftLastCompositeKey,
      composite: composed.text,
      generatedAt: new Date().toISOString(),
      sourceHash: textComposeHash(source),
    } } });
    if (!committed.ok) throw committed.error;
    renderQuickDraft(committed.record);
    // Apply means look: the composite opens in the reading view, because the
    // body itself stays untouched until develop.
    const container = refs.draft?.closest(".teachtext-editor-container");
    const showingComposite = Boolean(container?.classList.contains("is-previewing"))
      && quickDraftPreviewMode === "composite";
    if (!showingComposite) setQuickDraftPreviewMode("composite");
    setQuickDraftStatus(t("quick_draft_apply_done"));
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") {
      setQuickDraftStatus(t(
        error?.code === "PROTECTED_RANGE_VIOLATION"
          ? "quick_draft_protect_failed"
          : "quick_draft_failed",
        quickDraftFailureMessage(error)
      ));
    }
    return false;
  } finally {
    requestController = null;
    setBusy(false);
  }
}

// Develop is an explicit action, never a side effect of export: the current
// composite is written into the body only after (1) a revision of the current
// body is saved and (2) the writer confirms this becomes the new working body.
// Any failure leaves the original body untouched.
async function developAdjustmentLayers() {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const state = currentCompositeState(slot.record);
  if (!state.ready || !String(state.text || "").trim()) {
    setQuickDraftStatus(t("quick_draft_develop_none"));
    return false;
  }
  const composite = state.text;
  const previousBody = String(refs.draft?.value || slot.record.workspace.body || "");
  const confirmed = await showSystemModal(t("quick_draft_develop_confirm"), "confirm");
  if (confirmed !== "yes") {
    setQuickDraftStatus(t("quick_draft_develop_cancelled"));
    return false;
  }
  if (slot.record.workspace.projectDocId && typeof createDocumentRevision === "function") {
    try {
      await createDocumentRevision({
        projectId: activeProjectId,
        documentId: slot.record.workspace.projectDocId,
        body: previousBody,
        origin: "system",
        operation: "quick-draft-develop",
      });
    } catch (error) {
      setQuickDraftStatus(t("quick_draft_develop_revision_failed"));
      return false;
    }
  }
  const patch = { stage: "draft", workspace: {} };
  if (previousBody.trim()) {
    const version = normalizeQuickDraftVersion({
      id: stableId("version"),
      body: previousBody,
      title: slot.record.workspace.title,
      createdAt: new Date().toISOString(),
      reason: "before-develop",
      source: "quick-draft",
    });
    patch.workspace.versions = [...slot.record.workspace.versions, version].slice(-100);
  }
  if (!hasRecordedNegative(slot.record)) {
    patch.workspace.composition = {
      ...slot.record.workspace.composition,
      negative: previousBody,
      negativeUpdatedAt: new Date().toISOString(),
    };
  }
  patch.workspace.adjustmentLayers = normalizeAdjustmentLayers(
    adjustmentLayersSnapshot(slot.record).map((layer) => ({ ...layer, enabled: false }))
  );
  patch.workspace.body = composite;
  patch.workspace.title = titleFromBody(composite);
  patch.workspace.composition = {
    ...patch.workspace.composition,
    currentKey: composeCacheKey({
      source: quickDraftCompositeSource(slot.record),
      layers: enabledAdjustmentLayers(slot.record),
      protectedRanges: protectedRangesSnapshot(slot.record),
      ...compositionCacheContext(slot.record),
    }),
    composite,
    generatedAt: new Date().toISOString(),
  };
  refs.draft.value = composite;
  quickDraftLastComposite = "";
  quickDraftLastCompositeKey = "";
  const committed = await commitQuickDraft(patch);
  if (!committed.ok) {
    // The composite must not masquerade as the working body when the write
    // failed; restore the original text and leave the record modified.
    refs.draft.value = previousBody;
    renderQuickDraft(activeProjectQuickDraft({ create: false })?.record);
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  renderQuickDraft(committed.record);
  setQuickDraftStatus(t("quick_draft_develop_done"));
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
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  return Boolean(workspace.composition?.negativeUpdatedAt) || Boolean(humanAnchorSnapshot(record));
}

function grainVersionChain(record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  return grainChainFromRecordParts({
    humanAnchor: workspace.composition?.negative,
    humanAnchorUpdatedAt: workspace.composition?.negativeUpdatedAt,
    dumps: (workspace.versions || []).map((entry) => entry.body),
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
  const body = String(record ? normalizeQuickDraftWorkspace(record.workspace, record).body : refs.draft?.value || "");
  const chain = grainVersionChain(record);
  const model = grainBodyModel(body);
  const empty = {
    runs: [], body, hasAnchor: chain.passes > 0, authorRatio: 1, modelChars: 0, totalChars: 0, passes: chain.passes, deepest: 0,
  };
  if (!model.tokens.length) return empty;
  if (!chain.versions.length) {
    return { ...empty, runs: [{ text: body, generation: 0, source: "author" }], totalChars: grainVisibleLength(body) };
  }
  const runs = grainRunsFromGenerations(model, grainGenerations(model, chain));
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
  refs.preview.innerHTML = [
    `<div class="quick-draft-grain-readout">${readout}</div>`,
    note,
    `<pre class="quick-draft-grain-body">${body}</pre>`,
    `<div class="quick-draft-grain-legend">${legend}</div>`,
  ].join("");
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
  saveQuickDraft({ workspace: { adjustmentLayers: nextLayers } }, { debounce: false });
  renderAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record);
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
  protectSelectionFromTextarea,
  protectedRangesSnapshot,
  quickDraftCompositeSource,
  renderAdjustmentLayers,
  renderQuickDraftGrain,
  renderQuickDraftReadingView,
  renderProtectedRangeControls,
  runAdjustmentCommand,
  scopeSelectionToLayer,
});
