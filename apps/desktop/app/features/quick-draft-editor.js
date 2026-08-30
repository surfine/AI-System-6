// 钟点稿 / Quick Draft — editor surface.
//
// The quiet writing view: format/length chrome, the markdown editor + preview
// modes (Preview / Compression Grain / Read), the document markdown for
// handoff, version restoration, and markdown copy/export. The editor never
// mutates the negative; composition and develop live in
// quick-draft-composition.js.

function isLaunchDayFormat(format = refs.format?.value) {
  return format === FIRST_DAY_FORMAT || format === HANDS_ON_REVIEW_FORMAT;
}

function isHandsOnReviewFormat(format = refs.format?.value) {
  return format === HANDS_ON_REVIEW_FORMAT;
}

function effectiveRouteFormat(format = refs.format?.value) {
  return isLaunchDayFormat(format) ? FIRST_DAY_FORMAT : BILI_DYNAMIC_FORMAT;
}

function launchDaySubtype(format = refs.format?.value) {
  return isHandsOnReviewFormat(format) ? HANDS_ON_REVIEW_FORMAT : FIRST_DAY_FORMAT;
}

function firstDaySnapshot() {
  const setup = quickDraftSetupSnapshot();
  const visibleSources = String(refs.sources?.value || "").trim();
  const title = String(refs.titleInput?.value || titleFromBody(refs.draft?.value || "") || "").trim();
  const subject = title && title !== t("quick_draft_title")
    ? title
    : String(refs.firstDaySubject?.value || "").trim();
  const officialMaterials = [
    String(refs.officialMaterials?.value || "").trim(),
    visibleSources,
  ].filter(Boolean).join("\n\n");
  return {
    title,
    subject,
    handsOnNotes: String(setup.handsOnNotes || "").trim(),
    officialMaterials,
    unavailableNotes: String(setup.unavailableNotes || "").trim(),
    audienceConcerns: String(setup.audienceConcerns || "").trim(),
    firstImpression: String(setup.firstImpression || "").trim(),
  };
}

function meaningfulFirstDayTitle(title = "") {
  const value = String(title || "").trim();
  return value && value !== t("quick_draft_title") ? value : "";
}

function firstDaySeedValues(data = firstDaySnapshot()) {
  return [
    meaningfulFirstDayTitle(data.title),
    data.subject,
    data.handsOnNotes,
    data.officialMaterials,
    data.unavailableNotes,
    data.audienceConcerns,
    data.firstImpression,
  ];
}

/** @param {any} data */
function firstDayThesisText(data = firstDaySnapshot()) {
  return [
    meaningfulFirstDayTitle(data.title) ? `${t("quick_draft_first_day_title")}: ${meaningfulFirstDayTitle(data.title)}` : "",
    data.subject ? `${t("quick_draft_first_day_subject")}: ${data.subject}` : "",
    data.firstImpression ? `${t("quick_draft_first_impression")}: ${data.firstImpression}` : "",
  ].filter(Boolean).join("\n");
}

function setQuickDraftLabel(el, key) {
  if (el) el.textContent = t(key);
}

function durationLabel(value = "", format = refs.format?.value) {
  const normalized = normalizeDuration(value, format);
  if (normalized === "12m") return t("quick_draft_duration_12m");
  if (normalized === "140w") return t("quick_draft_words_140");
  if (normalized === "280w") return t("quick_draft_words_280");
  if (normalized === "500w") return t("quick_draft_words_500");
  return t("quick_draft_duration_7m");
}

function formatLabel(value = refs.format?.value) {
  const normalized = normalizeScenario(value);
  if (normalized === HANDS_ON_REVIEW_FORMAT) return t("quick_draft_format_hands_on_review");
  if (normalized === BILI_DYNAMIC_FORMAT) return t("quick_draft_format_bili_dynamic");
  return t("quick_draft_format_first_day");
}

function updateQuickDraftChromeSummary() {
  const body = String(refs.draft?.value || "");
  const workspace = normalizeQuickDraftRecord(activeProjectQuickDraft({ create: false })?.record).workspace;
  const editingManualTitle = document.activeElement === refs.titleInput && String(refs.titleInput?.value || "").trim();
  const title = String(
    editingManualTitle
    || (workspace.titleMode === "manual" ? workspace.title : titleFromBody(body))
    || refs.titleInput?.value
    || ""
  ).trim();
  const format = normalizeScenario(refs.format?.value || FIRST_DAY_FORMAT);
  const subject = title && title !== t("quick_draft_title") ? title : "";
  const topline = [formatLabel(format), durationLabel(refs.duration?.value, format), subject]
    .filter(Boolean)
    .join(" · ");
  if (refs.windowTitle) {
    refs.windowTitle.textContent = t("quick_draft_title");
  }
  if (refs.titleDisplay) refs.titleDisplay.textContent = subject || t("quick_draft_untitled");
  if (refs.titleInput && document.activeElement !== refs.titleInput) refs.titleInput.value = subject || "";
  if (refs.firstDaySubject) refs.firstDaySubject.value = subject || "";
  if (refs.settingsSummary) {
    refs.settingsSummary.textContent = `${t("quick_draft_settings_card")}: ${topline || t("quick_draft_untitled")}`;
  }
}

function syncQuickDraftTemplateUi() {
  const format = normalizeScenario(refs.format?.value || FIRST_DAY_FORMAT);
  const launchDay = isLaunchDayFormat(format);
  const dynamic = format === BILI_DYNAMIC_FORMAT;
  const normalizedDuration = normalizeDuration(refs.duration?.value, format);
  refs.form?.classList.toggle("is-format-first-day", format === FIRST_DAY_FORMAT);
  refs.form?.classList.toggle("is-format-hands-on-review", format === HANDS_ON_REVIEW_FORMAT);
  refs.form?.classList.toggle("is-format-bili-dynamic", dynamic);
  setQuickDraftLabel(refs.lengthLabel, dynamic ? "quick_draft_word_count" : "quick_draft_duration");
  if (refs.duration && refs.duration.value !== normalizedDuration) {
    refs.duration.value = normalizedDuration;
  }
  refs.duration?.querySelectorAll("option").forEach((option) => {
    const kind = option.dataset.lengthKind || "duration";
    const visible = dynamic ? kind === "words" : kind === "duration";
    option.hidden = !visible;
    option.disabled = !visible;
  });
  if (refs.duration && refs.duration.value !== normalizedDuration) refs.duration.value = normalizedDuration;
  updateQuickDraftChromeSummary();
  if (refs.startState) {
    const data = firstDaySnapshot();
    const hasBody = Boolean(String(refs.draft?.value || "").trim());
    const hasSetupSeed = firstDaySeedValues(data).some((value) => String(value || "").trim());
    refs.startState.textContent = launchDay
      ? hasBody
        ? t("quick_draft_start_body_ready")
        : hasSetupSeed
        ? t("quick_draft_start_support_ready")
        : t("quick_draft_start_empty")
      : hasBody
      ? t("quick_draft_start_body_ready")
      : t("quick_draft_start_empty");
  }
  refreshQuickDraftSelectControls();
}

function markdownSlot(el, text) {
  if (!el) return;
  const value = String(text || "").trim();
  if (!value) {
    el.textContent = t("quick_draft_empty_slot");
    el.classList.add("is-empty");
    return;
  }
  el.classList.remove("is-empty");
  if (typeof markdownToSystemHtml === "function") {
    el.innerHTML = markdownToSystemHtml(value);
  } else {
    el.textContent = value;
  }
}

function attachQuickDraftMarkdownEditor() {
  if (typeof attachMarkdownEditor === "function") attachMarkdownEditor(refs.draft);
  if (typeof attachMarkdownHighlight === "function") attachMarkdownHighlight(refs.draft);
}

function quickDraftDocumentMarkdown(record = activeProjectQuickDraft({ create: false })?.record) {
  const source = normalizeQuickDraftRecord(record);
  const body = String(refs.draft?.value || source.workspace.body || "").trim();
  if (!body) return "";
  if (/^#\s+/m.test(body)) return body;
  const title = String(refs.titleInput?.value || source.workspace.title || titleFromBody(body)).trim().replace(/\s+/g, " ").slice(0, 64) || t("quick_draft_title");
  return [`# ${title}`, "", body].join("\n");
}

function quickDraftQuestionSheetText(record = activeProjectQuickDraft({ create: false })?.record) {
  const source = normalizeQuickDraftRecord(record);
  if (isLaunchDayFormat(source.workspace.intake.setup.scenario)) {
    return firstDayThesisText({
      title: source.workspace.title,
      subject: source.workspace.intake.setup.firstDaySubject,
      firstImpression: source.workspace.intake.setup.firstImpression,
    });
  }
  return source.workspace.intake.setup.thesis;
}

function renderQuickDraftPreview() {
  if (!refs.preview) return;
  const markdown = quickDraftDocumentMarkdown();
  refs.preview.innerHTML = markdown
    ? markdownToSystemHtml(markdown)
    : `<p class="empty-folder-note">${escapeHtml(t("teachtext_preview_empty"))}</p>`;
}

function quickDraftMarkdownHtml(text = "", record = activeProjectQuickDraft({ create: false })?.record) {
  if (!refs.preview) return "";
  const value = String(text || "").trim();
  if (!value) return `<p class="empty-folder-note">${escapeHtml(t("teachtext_preview_empty"))}</p>`;
  const source = normalizeQuickDraftRecord(record);
  let markdown = value;
  if (!/^#\s+/m.test(value)) {
    const title = String(source.workspace.title || titleFromBody(value)).trim().replace(/\s+/g, " ").slice(0, 64) || t("quick_draft_title");
    markdown = [`# ${title}`, "", value].join("\n");
  }
  return markdownToSystemHtml(markdown);
}

function quickDraftMarkdownPreview(text = "") {
  if (!refs.preview) return;
  const html = quickDraftMarkdownHtml(text);
  refs.preview.innerHTML = html;
}

function renderQuickDraftPreviewPane() {
  if (quickDraftDisplayMode === "grain") renderQuickDraftGrain();
  else if (quickDraftDisplayMode === "listen") window.AISystem6QuickDraftListen?.renderQuickDraftListenView?.();
  else renderQuickDraftReadingView();
}

// Body / Grain / Read are one tab group over the same paper region. The body
// view is simply "no preview open", so exactly one tab is selected at a time.
function syncQuickDraftPreviewButtons(active) {
  const reading = active && quickDraftDisplayMode === "read";
  const current = active ? quickDraftDisplayMode : "body";
  document.querySelectorAll("[data-quick-draft-display]").forEach((button) => {
    const control = /** @type {HTMLElement} */ (button);
    const on = (control.dataset.quickDraftDisplay || "body") === current;
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-selected", on ? "true" : "false");
  });
  // The tablist and its panel are both in the lightroom window. They were not:
  // the tabs moved there with the split and kept naming the paper body left
  // behind in Quick Draft, so the tablist advertised a relationship across two
  // windows — and the panel was labelled by "Back to the Draft", which is a
  // door, not a tab.
  const panel = document.getElementById("lightroom-paper-view");
  const selected = quickDraftQuery('[data-quick-draft-display][aria-selected="true"][role="tab"]');
  if (panel && selected?.id) panel.setAttribute("aria-labelledby", selected.id);
  const group = quickDraftQuery('.draft-desk-display-switch[role="tablist"]');
  if (group && typeof syncRovingTabStops === "function") syncRovingTabStops(group);
  getWindow("quickDraft")?.classList.toggle("is-reading", reading);
}

// The two side regions are drawers on a phone; the switch reports which one
// is open so the state is never implied by the layout alone.
function syncQuickDraftDrawerButtons() {
  document.querySelectorAll("[data-quick-draft-drawer]").forEach((button) => {
    const control = /** @type {HTMLElement} */ (button);
    const drawer = control.dataset.quickDraftDrawer === "inspector" ? "inspector" : "shelf";
    const open = Boolean(refs.form?.classList.contains(
      drawer === "inspector" ? "is-inspector-open" : "is-shelf-open"
    ));
    button.classList.toggle("is-active", open);
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

// The views of a draft live in 文字亮室 now, so opening one no longer turns the
// paper over. The writer keeps the body in front of them and the darkroom sits
// beside it, which is the whole reason the two are separate windows: looking at
// what a pass did to a sentence while the sentence is still in reach.
function showQuickDraftDisplayMode(mode) {
  if (!refs.preview || !refs.draft) return;
  const container = refs.preview.closest(".lightroom-view") || refs.preview.parentElement;
  if (quickDraftDisplayMode === "listen" && mode !== "listen") window.AISystem6QuickDraftListen?.stop?.();
  quickDraftDisplayMode = mode === "grain" ? "grain" : mode === "listen" ? "listen" : "read";
  container?.classList.add("is-previewing");
  container?.classList.toggle("is-graining", quickDraftDisplayMode === "grain");
  container?.classList.toggle("is-listening", quickDraftDisplayMode === "listen");
  refs.preview.classList.remove("is-hidden");
  refs.preview.classList.toggle("quick-draft-grain-pane", quickDraftDisplayMode === "grain");
  refs.preview.classList.toggle("draft-desk-listen-pane", quickDraftDisplayMode === "listen");
  openLightroomWindow();
  syncQuickDraftPreviewButtons(true);
  // The reading view still follows the caret. It is in another window now, but
  // "show me where I am" did not stop being true when it moved.
  if (quickDraftDisplayMode === "read") enterPreviewAtCaret(refs.draft, refs.preview);
  renderQuickDraftPreviewPane();
  // Grain and Listen are their own views of the paper, not the paper turned
  // over, so only the reading view follows the caret.
  if (typeof updateMenuState === "function") updateMenuState();
}

function currentQuickDraftDisplayMode() {
  return quickDraftDisplayMode;
}

function setQuickDraftDisplayMode(display = "body") {
  if (display === "grain") showQuickDraftDisplayMode("grain");
  else if (display === "read") showQuickDraftDisplayMode("read");
  else if (display === "listen") showQuickDraftDisplayMode("listen");
  else leaveQuickDraftPreview();
  return currentQuickDraftDisplayMode();
}

function toggleQuickDraftPreview() {
  if (currentQuickDraftDisplayMode() === "read") leaveQuickDraftPreview();
  else showQuickDraftDisplayMode("read");
}

function toggleQuickDraftGrain() {
  if (currentQuickDraftDisplayMode() === "grain") leaveQuickDraftPreview();
  else showQuickDraftDisplayMode("grain");
}

function toggleQuickDraftComposite() {
  if (currentQuickDraftDisplayMode() === "read") leaveQuickDraftPreview();
  else showQuickDraftDisplayMode("read");
}

// The window can go away by three doors: the footer button, ⌘W, and the close
// box. Only the first one used to put the display mode back, so closing the
// darkroom from the menu left the product believing it was still showing the
// grain -- with nothing on screen showing it. Every door reports here.
function noteLightroomClosed() {
  if (quickDraftDisplayMode === "body") return;
  if (quickDraftDisplayMode === "listen") window.AISystem6QuickDraftListen?.stop?.();
  const container = refs.preview?.closest(".lightroom-view") || refs.preview?.parentElement;
  quickDraftDisplayMode = "body";
  container?.classList.remove("is-previewing", "is-graining", "is-listening");
  refs.preview?.classList.add("is-hidden");
  refs.preview?.classList.remove("quick-draft-grain-pane", "draft-desk-listen-pane");
  syncQuickDraftPreviewButtons(false);
  if (typeof updateMenuState === "function") updateMenuState();
}

function leaveQuickDraftPreview() {
  if (!refs.preview || !refs.draft) return;
  const container = refs.preview.closest(".lightroom-view") || refs.preview.parentElement;
  if (quickDraftDisplayMode === "listen") window.AISystem6QuickDraftListen?.stop?.();
  const wasReading = quickDraftDisplayMode === "read";
  quickDraftDisplayMode = "body";
  container?.classList.remove("is-previewing", "is-graining", "is-listening");
  if (wasReading) leavePreviewToCaret(refs.draft, refs.preview);
  closeLightroomWindow();
  refs.preview.classList.add("is-hidden");
  refs.preview.classList.remove("quick-draft-grain-pane", "draft-desk-listen-pane");
  syncQuickDraftPreviewButtons(false);
  refs.draft.focus();
  if (typeof updateMenuState === "function") updateMenuState();
}

function quickDraftFailureMessage(error) {
  const message = error?.message || String(error || "");
  console.warn("Quick Draft operation failed.", error);
  if (/not handled by src\/|Use the root server/i.test(message)) {
    return t("quick_draft_server_stale");
  }
  if (/fetch|network|offline|model|provider|endpoint|api key|401|403|404|429|5\d\d/i.test(message)) {
    return t("quick_draft_ai_unavailable_recovery");
  }
  return t("quick_draft_operation_failed_recovery");
}

// Draft Desk model failures go through the shared ModelUserErrors mapper:
// ordinary UI shows a localized message + next step, and the recovery
// notification appears only when it carries an executable action. Raw HTTP
// codes and fetch internals stay in the console.
function presentQuickDraftModelFailure(error, context = {}) {
  const recovery = window.AISystem6ModelUserErrors?.failure?.(error, {
    provider: typeof cloudConfig !== "undefined" && cloudConfig?.active
      ? (cloudConfig.provider || "deepseek")
      : "lm-studio",
    kind: typeof cloudConfig !== "undefined" && cloudConfig?.active ? "cloud" : "local",
    ...context,
  });
  if (!recovery) {
    setQuickDraftStatus(t("quick_draft_failed", quickDraftFailureMessage(error)));
    return;
  }
  setQuickDraftStatus(`${t(recovery.messageKey)} ${t(recovery.actionKey)}`);
  if (recovery.actionId) {
    window.AISystem6ModelUserErrors?.notify?.(error, {
      provider: typeof cloudConfig !== "undefined" && cloudConfig?.active
        ? (cloudConfig.provider || "deepseek")
        : "lm-studio",
      kind: typeof cloudConfig !== "undefined" && cloudConfig?.active ? "cloud" : "local",
      ...context,
    });
  }
}

function restoreDumpToBody() {
  const slot = activeProjectQuickDraft();
  const latest = darkroomOf(slot?.record).versions?.at(-1);
  if (!latest?.body) {
    setQuickDraftStatus(t("quick_draft_dump_empty"));
    return false;
  }
  const previousBody = String(refs.draft?.value || "");
  refs.draft.value = latest.body;
  renderQuickDraftPreview();
  const version = normalizeQuickDraftVersion({ id: stableId("version"), body: previousBody, title: slot.record.workspace.title, createdAt: new Date().toISOString(), reason: "restore", source: "quick-draft" });
  return commitQuickDraft({ workspace: { body: latest.body, versions: [...darkroomOf(slot.record).versions, version].slice(-100) } }).then((result) => {
    if (!result.ok) {
      refs.draft.value = previousBody;
      setQuickDraftStatus(t("quick_draft_save_failed"));
      return false;
    }
    setQuickDraftStatus(t("quick_draft_dump_restored"));
    refs.draft?.focus();
    return true;
  });
}

// Versions are a list of objects, newest first, with the negative pinned at the
// bottom: it is the one version the writer never wrote over. Every row says
// when it was kept and why, and every row can be gone back to.
function quickDraftVersionRow({ label, meta, id, kind }) {
  const row = document.createElement("div");
  row.className = "draft-desk-version-row";
  const text = document.createElement("span");
  const name = document.createElement("b");
  name.textContent = label;
  text.append(name);
  if (meta) {
    const small = document.createElement("small");
    small.textContent = meta;
    text.append(small);
  }
  row.append(text);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn mini-btn";
  button.dataset.quickDraftVersion = String(id || "");
  if (kind) button.dataset.quickDraftVersionKind = kind;
  button.textContent = t("quick_draft_version_restore");
  row.append(button);
  return row;
}

function renderQuickDraftVersions(record = activeProjectQuickDraft({ create: false })?.record) {
  if (!refs.versionsList) return;
  const workspace = normalizeQuickDraftRecord(record).workspace;
  const darkroom = darkroomOf(record);
  const versions = darkroom.versions || [];
  const negativeAt = String(darkroom.negativeUpdatedAt || "");
  refs.versionsList.replaceChildren();
  if (!versions.length && !negativeAt) {
    refs.versionsList.textContent = t("quick_draft_versions_empty");
    refs.versionsList.classList.add("is-empty");
    if (refs.restoreDumpButton) refs.restoreDumpButton.disabled = true;
    return;
  }
  refs.versionsList.classList.remove("is-empty");
  const stampOf = (value) => (value
    ? new Date(value).toLocaleTimeString(currentLanguage === "zh" ? "zh-CN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
    : "");
  [...versions].reverse().slice(0, 12).forEach((entry) => {
    refs.versionsList.append(quickDraftVersionRow({
      label: textExcerpt(entry.body, 24) || t("quick_draft_versions"),
      meta: [stampOf(entry.createdAt), entry.reason].filter(Boolean).join(" · "),
      id: entry.id,
      kind: "version",
    }));
  });
  if (negativeAt) {
    refs.versionsList.append(quickDraftVersionRow({
      label: t("quick_draft_negative"),
      meta: stampOf(negativeAt),
      id: "negative",
      kind: "negative",
    }));
  }
  if (refs.restoreDumpButton) refs.restoreDumpButton.disabled = !versions.length;
}

// Keeping a proof you liked. Develop leaves a version behind it, which meant
// the only way to keep a state was to commit it to the body -- so the Versions
// list could only ever hold states the writer had already accepted. This keeps
// the body as it stands right now, under the writer's own reason.
async function saveLightroomVersion() {
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
  const body = String(refs.draft?.value || slot.record.workspace.body || "");
  if (!body.trim()) {
    setQuickDraftStatus(t("quick_draft_empty_body"));
    return false;
  }
  const version = normalizeQuickDraftVersion({
    id: stableId("version"),
    body,
    title: slot.record.workspace.title,
    createdAt: new Date().toISOString(),
    reason: "kept",
    source: "lightroom",
  });
  const committed = await task.commit({ workspace: {
    versions: [...darkroomOf(task.currentRecord()).versions, version].slice(-100),
  } }, { captureForm: false });
  if (!committed.ok) {
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  renderQuickDraft(committed.record);
  setQuickDraftStatus(t("lightroom_version_saved"));
  return true;
}

// Going back to a version is not a delete: the body being replaced is kept as
// a version first, so the move is reversible in the same list.
async function restoreQuickDraftVersion(id = "", kind = "version") {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const workspace = normalizeQuickDraftRecord(slot.record).workspace;
  const darkroom = darkroomOf(slot.record);
  const target = kind === "negative"
    ? { body: String(darkroom.negative || ""), id: "negative" }
    : (darkroom.versions || []).find((entry) => entry.id === id);
  if (!target || !String(target.body || "").trim()) {
    setQuickDraftStatus(t("quick_draft_version_empty"));
    return false;
  }
  const current = String(refs.draft?.value || workspace.body || "");
  const kept = current.trim()
    ? [...(darkroom.versions || []), {
      id: `version-${Date.now()}`,
      body: current,
      title: String(workspace.title || ""),
      createdAt: new Date().toISOString(),
      reason: "before-restore",
      source: "quick-draft",
    }]
    : darkroom.versions;
  if (refs.draft) refs.draft.value = target.body;
  const committed = await commitQuickDraft({ workspace: { body: target.body, versions: kept } });
  if (!committed.ok) {
    if (refs.draft) refs.draft.value = current;
    renderQuickDraft(slot.record);
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  renderQuickDraft(committed.record);
  setQuickDraftStatus(t("quick_draft_version_restored"));
  return true;
}

async function copyQuickDraftMarkdown() {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const markdown = quickDraftDocumentMarkdown(slot.record);
  if (!markdown) {
    setQuickDraftStatus(t("quick_draft_empty_body"));
    refs.draft?.focus();
    return false;
  }
  try {
    await navigator.clipboard?.writeText(markdown);
    setQuickDraftStatus(t("copied_markdown"));
    return true;
  } catch (error) {
    setQuickDraftStatus(t("copy_failed"));
    return false;
  }
}

async function exportQuickDraftMarkdown() {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const markdown = quickDraftDocumentMarkdown(slot.record);
  if (!markdown) {
    setQuickDraftStatus(t("quick_draft_empty_body"));
    refs.draft?.focus();
    return false;
  }
  const title = String(refs.titleInput?.value || slot.record.workspace.title || titleFromBody(markdown) || "quick-draft").trim();
  const safeName = title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "quick-draft";
  window.AISystem6WebPlatform.saveArtifact({
    text: markdown,
    fileName: `${safeName}.md`,
    mimeType: "text/markdown;charset=utf-8",
  });
  setQuickDraftStatus(t("quick_draft_export_done"));
  return true;
}

async function shareQuickDraftMarkdown() {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const markdown = quickDraftDocumentMarkdown(slot.record);
  if (!markdown) {
    setQuickDraftStatus(t("quick_draft_empty_body"));
    refs.draft?.focus();
    return false;
  }
  const title = String(refs.titleInput?.value || slot.record.workspace.title || titleFromBody(markdown) || "quick-draft").trim();
  const safeName = title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "quick-draft";
  try {
    const shared = await window.AISystem6WebPlatform?.shareMarkdown?.({
      title,
      markdown,
      fileName: `${safeName}.md`,
    });
    setQuickDraftStatus(t(shared ? "quick_draft_share_done" : "quick_draft_share_cancelled"));
    return !!shared;
  } catch {
    setQuickDraftStatus(t("quick_draft_share_failed"));
    return false;
  }
}

window.AISystem6QuickDraftEditor = Object.freeze({
  copyQuickDraftMarkdown,
  exportQuickDraftMarkdown,
  shareQuickDraftMarkdown,
  firstDaySnapshot,
  firstDaySeedValues,
  firstDayThesisText,
  formatLabel,
  isLaunchDayFormat,
  leaveQuickDraftPreview,
  meaningfulFirstDayTitle,
  quickDraftDocumentMarkdown,
  quickDraftFailureMessage,
  quickDraftMarkdownPreview,
  quickDraftQuestionSheetText,
  renderQuickDraftPreview,
  renderQuickDraftVersions,
  restoreDumpToBody,
  currentQuickDraftDisplayMode,
  setQuickDraftDisplayMode,
  syncQuickDraftTemplateUi,
  toggleQuickDraftComposite,
  toggleQuickDraftGrain,
  toggleQuickDraftPreview,
});
