// Feature module: writing-flow.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.

window.AISystem6WritingFlowLoaded = true;

function getProjectEvidenceClips() {
  return getProjectScraps().filter((scrap) =>
    scrap.tags?.includes("reader-clip")
    || scrap.tags?.includes("document-clip")
    || ["reader-clip", "document-clip", "search-result"].includes(scrap.source?.type)
  );
}

function getFlowProgress(project) {
  const states = {
    topic: false,
    research: false,
    outline: false,
    drafting: false,
    check: false,
  };

  if (project) {
    states.topic = (project.questionSheet || "").trim().length > 20 || project.flowState?.topic === true;
    states.research = getProjectEvidenceClips().length > 0 || project.flowState?.research === true;
    const outlineSections = getProjectOutlineSections(project);
    states.outline = getMeaningfulOutlineSections(outlineSections).length > 0 || project.flowState?.outline === true;
    states.drafting = (project.drafts || []).length > 0 || project.flowState?.drafting === true;
    states.check = claimResultsEl.innerHTML.length > 100 || project.flowState?.check === true;
  }

  const complete = flowStepOrder.every((step) => states[step]);
  const currentKey = flowStepOrder.find((step) => !states[step]) || "check";
  const currentIndex = flowStepOrder.indexOf(currentKey);
  return { states, complete, currentKey, currentIndex };
}

function renderFlowProgress(project, progress = getFlowProgress(project)) {
  syncTeachTextLabelControl();
}

function getTeachTextSurface(surface) {
  const surfaces = {
    questionSheet: {
      input: questionSheetBodyInput,
      preview: questionSheetPreviewEl,
      statusKey: "question_sheet",
      toggleAction: "toggle-question-preview",
    },
    outline: {
      input: outlineContentEl,
      preview: outlinePreviewEl,
      statusKey: "outline",
      toggleAction: "toggle-outline-preview",
    },
    sectionDrafts: {
      input: draftBodyInput,
      preview: draftPreviewEl,
      statusKey: "section_drafts",
      toggleAction: "toggle-draft-preview",
    },
  };
  return surfaces[surface] || null;
}

function syncTeachTextSurfacePreviewToggle(surface) {
  const config = getTeachTextSurface(surface);
  if (!config?.preview || !config.toggleAction) return;

  const button = document.querySelector(`[data-action="${config.toggleAction}"]`);
  if (!button) return;
  button.textContent = t(config.preview.classList.contains("is-hidden") ? "preview" : "edit");
}

function refreshTeachTextSurfacePreview(surface) {
  const config = getTeachTextSurface(surface);
  if (!config?.input || !config.preview) return;

  const value = config.input.value || "";
  config.preview.innerHTML = value.trim()
    ? markdownToSystemHtml(value)
    : `<p class="empty-folder-note">${escapeHtml(t("teachtext_preview_empty"))}</p>`;
  syncTeachTextSurfacePreviewToggle(surface);
}

function refreshAllTeachTextSurfacePreviews() {
  ["questionSheet", "outline", "sectionDrafts"].forEach(refreshTeachTextSurfacePreview);
}

function toggleTeachTextSurfacePreview(surface) {
  const config = getTeachTextSurface(surface);
  if (!config?.input || !config.preview) return;
  const container = config.preview.closest(".teachtext-editor-container");

  const showPreview = config.preview.classList.contains("is-hidden");
  if (showPreview) {
    refreshTeachTextSurfacePreview(surface);
    config.input.classList.add("is-hidden");
    config.preview.classList.remove("is-hidden");
    container?.classList.add("is-previewing");
    config.preview.focus?.();
    syncTeachTextSurfacePreviewToggle(surface);
    setStatus(t("previewing_markdown"));
  } else {
    config.preview.classList.add("is-hidden");
    container?.classList.remove("is-previewing");
    config.input.classList.remove("is-hidden");
    config.input.focus();
    syncTeachTextSurfacePreviewToggle(surface);
    setStatus(t("editing_markdown"));
  }
}

function isPlaceholderOutlineSection(section) {
  const text = String(section || "").replace(/\s+/g, " ").trim();
  if (!text) return true;

  const localizedDefault = t("new_outline_section");
  return text === defaultOutlineSection
    || text === localizedDefault
    || /^New Section(?: \d+)?$/.test(text)
    || /^新章节(?: \d+)?$/.test(text);
}

function getMeaningfulOutlineSections(sections) {
  return (sections || []).filter((section) => !isPlaceholderOutlineSection(section));
}

function outlineSectionsFromDom() {
  if (!outlineContentEl) return [];

  return extractOutlineSections(outlineContentEl.value || "");
}

function currentOutlineMarkdown(project = getActiveProject()) {
  if (outlineContentEl && "value" in outlineContentEl) return outlineContentEl.value;
  return project?.outline || serializeOutlineSections(getProjectOutlineSections(project));
}

// Which writing surface the user most recently typed into. Route commands fire
// from menus/buttons, which blur the editor first, so `document.activeElement`
// is no longer a writing surface at command time. Without this marker
// `savePipelineData` always falls back to the Outline DOM and silently ignores
// fresh Manuscript/Section-Draft edits, making commands operate on the previous
// article. Reset on project switch (see renderPipeline).
let lastEditedWritingSurface = null;

function noteWritingSurfaceEdit(surface) {
  lastEditedWritingSurface = surface || null;
}

// The route manuscript (TeachText) is the same document as the Outline seen as
// prose. Its workflow state decides its phase, and the phase decides who owns the
// text: while drafting it is a read-only preview of the Section Drafts; once it is
// finalized it becomes the editable text under review at the Review Desk. Phase is
// derived live from the manuscript state (the persisted source of truth) rather
// than stored separately, so the two can never drift apart.
function manuscriptPhase() {
  if (typeof teachTextReviewLabel === "function" && teachTextReviewLabel()) return "review";
  return "drafting";
}

// Whether the manuscript is currently an editable owner of project.outline. In the
// target model only the review-phase (finalized) manuscript owns the text; during
// the transition the drafting manuscript stays owner-eligible too (Step 2 makes it
// read-only, after which this collapses to review-only).
function manuscriptOwnsDocument() {
  if (typeof teachTextReviewLabel === "function" && teachTextReviewLabel()) return true;
  return typeof teachTextPipelineLabel === "function" && teachTextPipelineLabel();
}

// Enforce the single-editable-owner rule on the manuscript surface. During the
// drafting phase the Section Drafts are the sole editable owner and the manuscript
// is a read-only preview of project.outline; the manuscript becomes editable only
// once it is finalized for review. readOnly blocks user typing (the source of the
// divergent second copy) while still allowing programmatic project→manuscript
// writes, so a read-only drafting manuscript also emits no input events and never
// writes back. Non-manuscript TeachText documents keep their normal editability.
function applyManuscriptEditability() {
  if (!teachTextBodyInput) return;
  const isManuscript = typeof isTeachTextManuscriptRole === "function"
    ? isTeachTextManuscriptRole()
    : false;
  const lockDrafting = isManuscript && manuscriptPhase() === "drafting";
  teachTextBodyInput.readOnly = lockDrafting;
  teachTextBodyInput.classList.toggle("manuscript-readonly", lockDrafting);
  // Surface who owns the text so the read-only manuscript never looks "broken".
  if (typeof updateTeachTextDeskState === "function") updateTeachTextDeskState();
}

// Resolve the source-of-truth surface for a pipeline save. Ownership follows the
// route phase, not raw focus: a live focus on an editable writing surface wins,
// and when focus has left the editors — i.e. a command was invoked — we fall back
// to the last edited surface. The manuscript is only a candidate owner when its
// phase actually owns the document. Default to the Outline.
function resolvePipelineSourceSurface(project = getActiveProject()) {
  if (document.activeElement === draftBodyInput) return "draft";
  if (document.activeElement === teachTextBodyInput) {
    return manuscriptOwnsDocument() ? "manuscript" : "outline";
  }
  if (document.activeElement === outlineContentEl) return "outline";
  if (lastEditedWritingSurface === "draft"
    && selectedDraftIndex >= 0
    && project?.drafts?.[selectedDraftIndex]) {
    return "draft";
  }
  if (lastEditedWritingSurface === "manuscript" && manuscriptOwnsDocument()) return "manuscript";
  return "outline";
}

function countQuestionSheetQuestions(markdown) {
  return normalizeMarkdownText(markdown)
    .split("\n")
    .map((line) => stripMarkdownInlineSyntax(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim()))
    .filter((line) => /[?？]\s*$/.test(line))
    .length;
}

function linkedManuscriptTitle(project = getActiveProject()) {
  const projectMarkdown = project?.outline || "";
  const bodyMarkdown = teachTextBodyInput?.value || "";
  const fallback = markdownDocumentTitle(projectMarkdown)
    || markdownDocumentTitle(bodyMarkdown)
    || teachTextNameInput?.value?.trim()
    || t("untitled");
  return typeof getTeachTextDocumentName === "function"
    ? getTeachTextDocumentName({ fallback })
    : fallback;
}

function updateQuestionSheetManuscriptTitle(project = getActiveProject()) {
  if (!questionManuscriptTitleEl) return;
  questionManuscriptTitleEl.textContent = linkedManuscriptTitle(project);
}

function getOutlineSelectionText() {
  if (!outlineContentEl || !("selectionStart" in outlineContentEl)) return window.getSelection().toString().trim();
  const { selectionStart, selectionEnd, value } = outlineContentEl;
  if (selectionStart === selectionEnd) return "";
  return value.slice(selectionStart, selectionEnd).trim();
}

function replaceOutlineSelection(nextMarkdown) {
  const project = getActiveProject();
  if (!project) return "";

  const nextText = String(nextMarkdown || "").trim();
  if (!outlineContentEl || !("selectionStart" in outlineContentEl)) {
    setProjectOutlineMarkdown(project, nextText);
    return project.outline;
  }

  const { selectionStart, selectionEnd, value } = outlineContentEl;
  const hasSelection = selectionStart !== selectionEnd;
  const updated = hasSelection
    ? `${value.slice(0, selectionStart)}${nextText}${value.slice(selectionEnd)}`
    : nextText;
  setProjectOutlineMarkdown(project, updated);
  outlineContentEl.value = project.outline;
  return project.outline;
}

function nextOutlineSectionName(project) {
  const base = t("new_outline_section");
  const existing = new Set(getProjectOutlineSections(project).map((section) => section.toLowerCase()));
  if (!existing.has(base.toLowerCase())) return base;

  let index = 2;
  while (existing.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

function outlineDraftBlocksFromDom(project = getActiveProject()) {
  const markdown = outlineContentEl && "value" in outlineContentEl
    ? outlineContentEl.value
    : project?.outline || "";
  return extractOutlineDraftBlocks(markdown);
}

function selectedOutlineDraftBlock(project = getActiveProject()) {
  const blocks = outlineDraftBlocksFromDom(project);
  const rawIndex = Number(draftSectionSelectEl?.value || 0);
  const index = Math.max(0, Math.min(blocks.length - 1, Number.isFinite(rawIndex) ? rawIndex : 0));
  return blocks[index] || blocks[0] || null;
}

function renderDraftSectionSource(outlineSections) {
  if (!draftSectionSelectEl) return;

  const previous = draftSectionSelectEl.value;
  draftSectionSelectEl.replaceChildren();

  outlineSections.forEach((section, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = section || defaultOutlineSection;
    draftSectionSelectEl.append(option);
  });

  draftSectionSelectEl.disabled = outlineSections.length === 0;
  draftSectionSelectEl.value = [...draftSectionSelectEl.options].some((option) => option.value === previous)
    ? previous
    : "0";
}

function draftMatchesSection(draft, sectionTitle, sectionIndex = null) {
  const normalized = String(sectionTitle || "").trim();
  if (!normalized || !draft) return false;

  const draftSourceTitle = String(draft.sourceOutlineSection || draft.sectionTitle || draft.title || "").trim();
  const hasMatchingIndex = Number.isFinite(Number(sectionIndex))
    && Number.isFinite(Number(draft.sourceOutlineIndex))
    && Number(draft.sourceOutlineIndex) === Number(sectionIndex);
  if (hasMatchingIndex && draftSourceTitle === normalized) return true;
  if (Number.isFinite(Number(sectionIndex)) && Number.isFinite(Number(draft.sourceOutlineIndex))) return false;

  return [draft.sourceOutlineSection, draft.sectionTitle, draft.title]
    .some((value) => String(value || "").trim() === normalized);
}

function ensureDraftForSection(sectionTitle = selectedOutlineSectionTitle(), options = {}) {
  const project = getActiveProject();
  if (!project) return null;

  const title = String(sectionTitle || "").trim() || t("manual_draft_title");
  if (!project.drafts) project.drafts = [];
  const sourceOutlineIndex = Number.isFinite(Number(options.sourceOutlineIndex))
    ? Number(options.sourceOutlineIndex)
    : null;
  const sourceMarkdown = String(options.sourceMarkdown || "").trim();
  const sourceBody = String(options.body || "").trim();

  const existingIndex = project.drafts.findIndex((draft) => draftMatchesSection(draft, title, sourceOutlineIndex));
  if (existingIndex >= 0) {
    selectedDraftIndex = existingIndex;
    const existingDraft = project.drafts[existingIndex];
    if (sourceOutlineIndex !== null) existingDraft.sourceOutlineIndex = sourceOutlineIndex;
    if (sourceMarkdown) existingDraft.sourceMarkdown = sourceMarkdown;
    if (options.seedBody && sourceBody && !String(existingDraft.body || "").trim()) {
      existingDraft.body = sourceBody;
      existingDraft.updatedAt = new Date().toISOString();
    }
    return existingDraft;
  }

  const now = new Date().toISOString();
  const draft = {
    id: crypto.randomUUID(),
    title,
    sectionTitle: title,
    sourceType: "outline-section",
    sourceOutlineSection: title,
    sourceOutlineIndex,
    sourceMarkdown,
    usedClips: [],
    body: options.seedBody ? sourceBody : "",
    createdAt: now,
    updatedAt: now,
    insertedAt: null,
    insertedFileId: null,
    insertedFileName: "",
  };
  project.drafts.push(draft);
  selectedDraftIndex = project.drafts.length - 1;
  project.flowState = { ...(project.flowState || {}), drafting: true };
  project.updatedAt = now;
  saveDeskState();
  return draft;
}

function ensureDraftForOutlineBlock(block, options = {}) {
  if (!block) return null;
  const draft = ensureDraftForSection(block.title, {
    body: block.body,
    sourceMarkdown: block.sourceMarkdown,
    sourceOutlineIndex: block.sourceOutlineIndex,
    seedBody: options.seedBody === true,
  });
  if (draft) {
    draft.hkrrIntent = block.hkrrIntent || "";
    draft.hkrrNote = block.hkrrNote || "";
  }
  return draft;
}

function ensureDraftsForOutlineBlocks(blocks, options = {}) {
  const project = getActiveProject();
  if (!project) return [];

  return normalizeOutlineDraftBlocks(blocks).map((block, index) => {
    const draft = ensureDraftForOutlineBlock({
      ...block,
      sourceOutlineIndex: Number.isFinite(Number(block.sourceOutlineIndex)) ? Number(block.sourceOutlineIndex) : index,
    }, options);
    return draft ? { block, draft, index: project.drafts.indexOf(draft) } : null;
  }).filter(Boolean);
}

function isOutlineLinkedDraft(draft) {
  if (!draft) return false;
  return draft.sourceType === "outline-section"
    || Number.isFinite(Number(draft.sourceOutlineIndex))
    || Boolean(draft.sourceOutlineSection)
    || Boolean(draft.sourceMarkdown);
}

function syncDraftsFromProjectOutline(project = getActiveProject(), { preserveCurrentDraft = false } = {}) {
  if (!project) return [];

  const previousDrafts = Array.isArray(project.drafts) ? project.drafts : [];
  const currentDraft = preserveCurrentDraft && selectedDraftIndex >= 0 ? previousDrafts[selectedDraftIndex] : null;
  const reusableDrafts = previousDrafts.filter(isOutlineLinkedDraft);
  const manualDrafts = previousDrafts.filter((draft) => !isOutlineLinkedDraft(draft));
  const now = new Date().toISOString();
  const blocks = normalizeOutlineDraftBlocks(getProjectOutlineDraftBlocks(project));

  const linkedDrafts = blocks.map((block, blockIndex) => {
    const sourceIndex = Number.isFinite(Number(block.sourceOutlineIndex)) ? Number(block.sourceOutlineIndex) : blockIndex;
    const reusable = reusableDrafts.find((draft) => (
      Number(draft.sourceOutlineIndex) === sourceIndex
      && String(draft.sourceOutlineSection || draft.sectionTitle || draft.title || "").trim() === block.title
    )) || reusableDrafts.find((draft) => Number(draft.sourceOutlineIndex) === sourceIndex)
      || reusableDrafts.find((draft) => String(draft.sourceOutlineSection || draft.sectionTitle || draft.title || "").trim() === block.title);

    const draft = reusable || {
      id: crypto.randomUUID(),
      usedClips: [],
      createdAt: now,
      insertedAt: null,
      insertedFileId: null,
      insertedFileName: "",
    };

    draft.title = block.title;
    draft.sectionTitle = block.title;
    draft.sourceType = "outline-section";
    draft.sourceOutlineSection = block.title;
    draft.sourceOutlineIndex = sourceIndex;
    draft.sourceMarkdown = block.sourceMarkdown;
    draft.hkrrIntent = block.hkrrIntent || "";
    draft.hkrrNote = block.hkrrNote || "";
    if (!(preserveCurrentDraft && draft === currentDraft)) draft.body = block.body;
    draft.updatedAt = draft.updatedAt || now;
    return draft;
  });

  project.drafts = [...linkedDrafts, ...manualDrafts];

  const currentIndex = currentDraft ? project.drafts.indexOf(currentDraft) : -1;
  if (currentIndex >= 0) {
    selectedDraftIndex = currentIndex;
  } else if (linkedDrafts.length) {
    const preferredIndex = Number(draftSectionSelectEl?.value || 0);
    selectedDraftIndex = Math.max(0, Math.min(linkedDrafts.length - 1, Number.isFinite(preferredIndex) ? preferredIndex : 0));
  } else {
    selectedDraftIndex = project.drafts.length ? 0 : -1;
  }

  const refs = linkedDrafts.map((draft, index) => ({
    block: blocks[index],
    draft,
    index: project.drafts.indexOf(draft),
  }));
  return refs;
}

function syncOutlineDomFromProject(project = getActiveProject()) {
  if (!project || !outlineContentEl) return;
  const nextOutline = project.outline || serializeOutlineSections(getProjectOutlineSections(project));
  if (document.activeElement !== outlineContentEl && outlineContentEl.value !== nextOutline) {
    outlineContentEl.value = nextOutline;
  }
  refreshTeachTextSurfacePreview("outline");
  restoreLinkedManuscriptScroll();
}

function syncProjectOutlineToTeachText(project = getActiveProject(), options = {}) {
  if (!project || !teachTextBodyInput) return false;
  if (typeof activateTeachTextManuscriptTab === "function") {
    activateTeachTextManuscriptTab({ focus: false });
  } else {
    teachTextDocumentRole = "manuscript";
  }

  const markdown = project.outline || serializeOutlineSections(getProjectOutlineSections(project));
  const title = markdownDocumentTitle(markdown) || t("untitled");
  project.manuscriptLinkedToOutline = true;
  setTeachTextWorkflowState(options.ai === true ? "ai" : "draft");
  if (teachTextFileLabel !== "ai") teachTextFileLabel = "draft";
  if (options.ai === true) teachTextFileLabel = "ai";
  if (teachTextBodyInput.value !== markdown) teachTextBodyInput.value = markdown;
  applyManuscriptEditability();
  if (teachTextPreviewEl && !teachTextPreviewEl.classList.contains("is-hidden")) {
    syncTeachTextPreview({ force: true });
  }
  restoreLinkedManuscriptScroll();
  if (teachTextNameInput) teachTextNameInput.value = title;
  if (typeof syncTeachTextWindowTitle === "function") syncTeachTextWindowTitle();
  updateQuestionSheetManuscriptTitle(project);
  if (typeof updateReviewDeskStatusTitle === "function") updateReviewDeskStatusTitle();
  if (options.markModified !== false) setTeachTextStatus("modified");
  updateTeachTextBoundaries();
  updateTeachTextTranslateButton();
  updateTeachTextBilingualExportButton();
  updateTeachTextDeskState();
  scheduleTeachTextTabSave();
  if (options.open) {
    openWindow("teachText");
    requestAnimationFrame(() => {
      if (teachTextPipelineLabel()) {
        showTeachTextPreview({ announce: false, focus: options.focusPreview === true, preserveScroll: false });
        restoreLinkedManuscriptScroll();
      } else {
        teachTextBodyInput.focus();
      }
    });
  }
  return true;
}

function shouldSyncProjectOutlineAsManuscript(project = getActiveProject()) {
  if (!project) return false;
  if (typeof isTeachTextManuscriptRole === "function" && !isTeachTextManuscriptRole()) return false;
  if (!teachTextPipelineLabel()) return false;
  if (project.manuscriptLinkedToOutline) return true;
  const sections = getMeaningfulOutlineSections(getProjectOutlineSections(project));
  if (sections.length > 0) return true;
  const markdown = String(project.outline || "").trim();
  return Boolean(markdown && !isPlaceholderOutlineSection(markdown.replace(/^#{1,6}\s+/, "")));
}

function syncLinkedTeachTextFromProject(project = getActiveProject()) {
  if (!shouldSyncProjectOutlineAsManuscript(project)) return false;
  if (document.activeElement === teachTextBodyInput) return false;
  return syncProjectOutlineToTeachText(project, { markModified: false });
}

function previewLinkedTeachTextManuscript({ focus = false } = {}) {
  if (!teachTextPipelineLabel()) return false;
  if (!shouldSyncProjectOutlineAsManuscript()) return false;
  showTeachTextPreview({ announce: false, focus, preserveScroll: false });
  restoreLinkedManuscriptScroll();
  return true;
}

let linkedManuscriptScrollSyncing = false;

function clampScrollRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function scrollRatioForElement(element) {
  if (!element) return 0;
  const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
  if (!maxScroll) return 0;
  return clampScrollRatio(element.scrollTop / maxScroll);
}

function setElementScrollRatio(element, ratio) {
  if (!element) return;
  const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
  element.scrollTop = Math.round(maxScroll * clampScrollRatio(ratio));
}

function linkedManuscriptScrollElements() {
  return [
    outlineContentEl,
    outlinePreviewEl,
    teachTextBodyInput,
    teachTextPreviewEl,
  ].filter(Boolean);
}

function linkedManuscriptScrollEnabled(project = getActiveProject()) {
  return Boolean(project && teachTextPipelineLabel() && shouldSyncProjectOutlineAsManuscript(project));
}

function saveLinkedManuscriptScrollRatio(ratio, source) {
  const project = getActiveProject();
  if (!project || !linkedManuscriptScrollEnabled(project)) return false;
  project.manuscriptViewState = {
    ...(project.manuscriptViewState || {}),
    scrollRatio: clampScrollRatio(ratio),
    scrollSource: source,
    updatedAt: new Date().toISOString(),
  };
  project.updatedAt = new Date().toISOString();
  saveDeskState();
  return true;
}

function applyLinkedManuscriptScrollRatio(ratio, { except = null } = {}) {
  linkedManuscriptScrollSyncing = true;
  linkedManuscriptScrollElements().forEach((element) => {
    if (element !== except) setElementScrollRatio(element, ratio);
  });
  requestAnimationFrame(() => {
    linkedManuscriptScrollSyncing = false;
  });
}

function syncLinkedManuscriptScrollFrom(element, source = "manuscript") {
  if (linkedManuscriptScrollSyncing || !element) return;
  const ratio = scrollRatioForElement(element);
  if (!saveLinkedManuscriptScrollRatio(ratio, source)) return;
  applyLinkedManuscriptScrollRatio(ratio, { except: element });
}

function restoreLinkedManuscriptScroll() {
  const project = getActiveProject();
  if (!project || !linkedManuscriptScrollEnabled(project)) return;
  const ratio = project.manuscriptViewState?.scrollRatio;
  if (!Number.isFinite(Number(ratio))) return;
  requestAnimationFrame(() => applyLinkedManuscriptScrollRatio(ratio));
}

function syncDraftDomFromProject(project = getActiveProject()) {
  const draft = selectedDraftIndex >= 0 ? project?.drafts?.[selectedDraftIndex] : null;
  if (!draft || !draftBodyInput) return;
  if (document.activeElement !== draftBodyInput && draftBodyInput.value !== (draft.body || "")) {
    draftBodyInput.value = draft.body || "";
  }
  refreshTeachTextSurfacePreview("sectionDrafts");
}

function updateProjectOutlineFromSelectedDraft(project = getActiveProject()) {
  const draft = selectedDraftIndex >= 0 ? project?.drafts?.[selectedDraftIndex] : null;
  if (!project || !draft) return getProjectOutlineSections(project);

  const sourceOutlineIndex = Number.isFinite(Number(draft.sourceOutlineIndex))
    ? Number(draft.sourceOutlineIndex)
    : Number(draftSectionSelectEl?.value || 0);
  const nextBody = draftBodyInput?.value || "";
  const metadata = outlineHkrrMetadataMarkdown(draft.hkrrIntent || "", draft.hkrrNote || "");
  const nextOutline = replaceOutlineDraftBlockBody(project.outline || "", sourceOutlineIndex, [metadata, nextBody].filter(Boolean).join("\n"));
  const sections = setProjectOutlineMarkdown(project, nextOutline);
  const blocks = getProjectOutlineDraftBlocks(project);
  const block = blocks[sourceOutlineIndex];
  const now = new Date().toISOString();
  draft.body = nextBody;
  draft.updatedAt = now;
  if (block) {
    draft.title = block.title;
    draft.sectionTitle = block.title;
    draft.sourceOutlineSection = block.title;
    draft.sourceOutlineIndex = block.sourceOutlineIndex;
    draft.sourceMarkdown = block.sourceMarkdown;
    draft.hkrrIntent = block.hkrrIntent || draft.hkrrIntent || "";
    draft.hkrrNote = block.hkrrNote || draft.hkrrNote || "";
  }
  syncDraftsFromProjectOutline(project, { preserveCurrentDraft: true });
  syncOutlineDomFromProject(project);
  syncLinkedTeachTextFromProject(project);
  return sections;
}

function currentSectionDraftContext({ ensureDraft = false, seedBody = false } = {}) {
  const project = getActiveProject();
  if (!project) return null;

  const block = selectedOutlineDraftBlock(project);
  if (!block) return null;

  const draft = ensureDraft
    ? ensureDraftForOutlineBlock(block, { seedBody })
    : (selectedDraftIndex >= 0 ? project.drafts?.[selectedDraftIndex] : null) || ensureDraftForOutlineBlock(block, { seedBody });
  if (!draft) return null;

  return {
    project,
    block,
    draft,
    title: block.title || draft.title || draft.sectionTitle || t("manual_draft_title"),
    outlineMarkdown: block.sourceMarkdown || "",
    outlineBody: block.body || "",
    body: draftBodyInput?.value ?? draft.body ?? "",
  };
}

function applySectionDraftMarkdown(markdown, { append = false, ai = false, statusKey = "saved" } = {}) {
  const context = currentSectionDraftContext({ ensureDraft: true });
  if (!context || !draftBodyInput) {
    setStatus(t("section_draft_needs_section"));
    openWindow("outline");
    return false;
  }

  const clean = stripRebuildMarkdownFence(String(markdown || "")).trim();
  if (!clean) return false;

  const current = String(draftBodyInput.value || context.draft.body || "").trimEnd();
  const nextBody = append
    ? [current, clean].filter(Boolean).join("\n\n---\n\n")
    : clean;

  draftBodyInput.value = nextBody;
  context.draft.body = nextBody;
  context.draft.updatedAt = new Date().toISOString();
  if (ai) markTeachTextAiAssisted();
  updateProjectOutlineFromSelectedDraft(context.project);
  syncLinkedTeachTextFromProject(context.project);
  updateDraftVoiceStats(nextBody);
  refreshTeachTextSurfacePreview("sectionDrafts");
  saveDeskState();
  updateFlowGuideChecklist({ render: false });
  renderPipeline();
  openWindow("sectionDrafts");
  setStatus(t(statusKey));
  requestAnimationFrame(() => draftBodyInput?.focus());
  return true;
}

async function confirmAndApplySectionDraft(markdown, confirmKey, statusKey) {
  const clean = stripRebuildMarkdownFence(String(markdown || "")).trim();
  if (!clean) return false;
  const preview = clipContextContent(clean, 1600);
  const result = await showSystemModal(t(confirmKey, preview), "confirm");
  if (result !== "yes") {
    setStatus(t("ready"));
    return false;
  }
  return applySectionDraftMarkdown(clean, { ai: true, statusKey });
}

function syncTeachTextToLinkedProjectMarkdown() {
  const project = getActiveProject();
  if (typeof isTeachTextManuscriptRole === "function" && !isTeachTextManuscriptRole()) return;
  if (!shouldSyncProjectOutlineAsManuscript(project) || !teachTextBodyInput) return;

  const sections = setProjectOutlineMarkdown(project, teachTextBodyInput.value);
  const title = linkedManuscriptTitle(project);
  if (teachTextNameInput) teachTextNameInput.value = title;
  if (typeof syncTeachTextWindowTitle === "function") syncTeachTextWindowTitle();
  updateQuestionSheetManuscriptTitle(project);
  if (typeof updateReviewDeskStatusTitle === "function") updateReviewDeskStatusTitle();
  syncDraftsFromProjectOutline(project);
  syncOutlineDomFromProject(project);
  syncDraftDomFromProject(project);
  project.flowState = {
    ...(project.flowState || {}),
    outline: getMeaningfulOutlineSections(sections).length > 0,
    drafting: (project.drafts || []).some((draft) => (draft.body || draft.title || "").trim()),
  };
  project.updatedAt = new Date().toISOString();
  saveDeskState();
  updateFlowGuideChecklist({ render: false });
}

function markTeachTextAiAssisted() {
  const project = getActiveProject();
  setTeachTextWorkflowState("ai");
  teachTextFileLabel = "ai";
  if (project) project.manuscriptLinkedToOutline = true;
  syncTeachTextLabelControl();
  syncPipelineLabelControls();
  updateTeachTextDeskState();
}

function selectEnsuredDraftRef(draftRefs, preferredIndex = 0) {
  if (!draftRefs.length) return null;

  const index = Math.max(0, Math.min(draftRefs.length - 1, Number(preferredIndex) || 0));
  const ref = draftRefs[index] || draftRefs[0];
  if (ref && ref.index >= 0) selectedDraftIndex = ref.index;
  return ref;
}

function syncDraftSectionSelection(project, outlineSections) {
  if (!draftSectionSelectEl) return;

  const draft = selectedDraftIndex >= 0 ? project?.drafts?.[selectedDraftIndex] : null;
  const sectionTitle = draft?.sourceOutlineSection || draft?.sectionTitle || draft?.title || "";
  const matchedIndex = outlineSections.findIndex((section, index) => draftMatchesSection(draft, section, index) || section === sectionTitle);
  if (matchedIndex >= 0) draftSectionSelectEl.value = String(matchedIndex);
}

function updateDraftSectionLabel(project) {
  if (!draftSectionLabelEl) return;

  const draft = selectedDraftIndex >= 0 ? project?.drafts?.[selectedDraftIndex] : null;
  if (!draft) {
    draftSectionLabelEl.textContent = t("no_draft_selected");
    return;
  }

  const sections = getProjectOutlineSections(project);
  const title = draft.sourceOutlineSection || draft.sectionTitle || draft.title || t("manual_draft_title");
  const sectionIndex = sections.findIndex((section, index) => draftMatchesSection(draft, section, index) || section === title);
  draftSectionLabelEl.textContent = sectionIndex >= 0
    ? t("editing_section_with_count", title, sectionIndex + 1, sections.length)
    : t("editing_section", title);
}

function ensureTeachTextSurfaceProject() {
  const activeProject = getActiveProject();
  if (activeProject) return activeProject;

  const selectedProject = getSelectedProject();
  if (selectedProject) {
    // The caller opens its own writing window next; resuming that disk's saved
    // scene here would close it again a tick later.
    switchProject(selectedProject.id, { resumeScene: false });
    return getActiveProject();
  }

  ensureActiveProject();
  isProjectMounted = true;
  return getActiveProject();
}

function openQuestionSheetSurface() {
  const project = ensureTeachTextSurfaceProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  renderPipeline();
  openWindow("questionSheet");
  requestAnimationFrame(() => questionSheetBodyInput?.focus());
}

function openOutlineSurface() {
  const project = ensureTeachTextSurfaceProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  renderPipeline();
  openWindow("outline");
  requestAnimationFrame(() => outlineContentEl?.focus());
}

function openSectionDrafts() {
  const project = ensureTeachTextSurfaceProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  savePipelineData();
  const preferredIndex = Number(draftSectionSelectEl?.value || 0);
  const draftRefs = syncDraftsFromProjectOutline(project);
  selectEnsuredDraftRef(draftRefs, Number.isFinite(preferredIndex) ? preferredIndex : 0);
  renderPipeline();
  openWindow("sectionDrafts");
  requestAnimationFrame(() => draftBodyInput?.focus());
}

async function advanceQuestionSheetToOutline() {
  const project = ensureTeachTextSurfaceProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  if (typeof createDocumentRevision === "function") {
    try {
      await createDocumentRevision({ origin: "system", operation: "phase-advance" });
    } catch (error) {
      // The phase transition overwrites the Question Sheet's meaning as the
      // editable owner; without the revision it must not move forward.
      setStatus(currentLanguage === "zh"
        ? "无法保存阶段推进前的版本历史，未推进到大纲。"
        : "Could not save the pre-advance version history; the outline was not opened.");
      return;
    }
  }
  savePipelineData();
  await window.AISystem6StateStores?.writing.commit(() => {
    const project = getActiveProject();
    if (project) project.questionSheet = questionSheetBodyInput?.value || project.questionSheet || "";
  });
  renderPipeline();
  openWindow("outline");
  setStatus(t("question_sheet_autosaved_to_outline"));
  requestAnimationFrame(() => outlineContentEl?.focus());
}

async function advanceOutlineToSectionDrafts() {
  const project = ensureTeachTextSurfaceProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  savePipelineData();
  const outlineSections = getMeaningfulOutlineSections(getProjectOutlineSections(project));
  if (!outlineSections.length) {
    setStatus(t("outline_needs_content"));
    openWindow("outline");
    requestAnimationFrame(() => outlineContentEl?.focus());
    return;
  }
  const preferredIndex = Number(draftSectionSelectEl?.value || 0);
  const draftRefs = syncDraftsFromProjectOutline(project);
  selectEnsuredDraftRef(draftRefs, Number.isFinite(preferredIndex) ? preferredIndex : 0);
  renderPipeline();
  await openWindow("sectionDrafts");
  // 起草台 = Section Drafts (editable owner) beside the read-only draft manuscript.
  // openWindow's placement tail arranges the pair once the manuscript window opens.
  syncLinkedTeachTextFromProject(project);
  if (teachTextPipelineLabel()) {
    await openWindow("teachText");
  }
  setStatus(t("outline_autosaved_to_drafts"));
  if (typeof createDocumentRevision === "function") {
    createDocumentRevision({ origin: "system", operation: "phase-advance" });
  }
  requestAnimationFrame(() => draftBodyInput?.focus());
}

// 起草台 -> 审校台: hand the drafted document into the review phase. The route
// manuscript becomes the finalized, editable owner under review, paired beside the
// Review Desk. Reuses the existing finalize flow (confirm + save + relink) via
// setTeachTextFileLabel("final"); the manuscript stays open and is no longer closed.
async function advanceDraftsToReview() {
  const project = ensureTeachTextSurfaceProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  savePipelineData();
  const outlineSections = getMeaningfulOutlineSections(getProjectOutlineSections(project));
  if (!outlineSections.length) {
    setStatus(t("outline_needs_content"));
    openWindow("sectionDrafts");
    requestAnimationFrame(() => draftBodyInput?.focus());
    return;
  }

  syncLinkedTeachTextFromProject(project);
  if (typeof createDocumentRevision === "function") {
    createDocumentRevision({ origin: "system", operation: "phase-advance" });
  }
  if (typeof activateTeachTextManuscriptTab === "function") {
    activateTeachTextManuscriptTab({ focus: false });
  }
  // This transition's destination IS the finalized manuscript: it must own
  // the phone screen, not stay a hidden preview behind Section Drafts.
  mobileManuscriptForegroundRequested = true;
  await openWindow("teachText");
  if (typeof setTeachTextFileLabel === "function") {
    await setTeachTextFileLabel("final", { persist: true });
  }
  // Finalization opens the paired Review Desk, which becomes the last raised
  // surface. Restore the route's documented destination on phones only after
  // the confirmation and save have completed; otherwise the finalized,
  // editable manuscript is immediately hidden behind the review surface.
  if (typeof isPortraitDocumentFlow === "function"
    && isPortraitDocumentFlow()
    && typeof teachTextReviewLabel === "function"
    && teachTextReviewLabel()) {
    mobileManuscriptForegroundRequested = true;
    await openWindow("teachText");
  }
}

async function openWritingFlowWindows() {
  const project = ensureTeachTextSurfaceProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  savePipelineData();
  if (teachTextPipelineLabel()) {
    syncLinkedTeachTextFromProject(project);
  }
  const canOpen = await prepareFinderModeForApp(getWindowAppId("teachText"));
  if (!canOpen) return;
  const flowWindowNames = writingFlowWindowNames();
  for (const windowName of flowWindowNames) {
    await openWindow(windowName, {
      skipFinderMode: true,
      skipPlacement: true,
      skipFocus: true,
    });
  }
  const writingFlowWindows = flowWindowNames
    .map((windowName) => getWindow(windowName))
    .filter(Boolean);
  // A phone presents one writing surface at a time through the mobile
  // full-screen shell. Desktop tiling writes inline left/top/width/height
  // frames that would override that shell (and leave a shaded window as an
  // off-screen bar), so the route skips tiling in portrait and lets the
  // focused surface own the screen.
  if (typeof isPortraitDocumentFlow === "function" && !isPortraitDocumentFlow()) {
    tileWindows(writingFlowWindows);
    requestAnimationFrame(() => tileWindows(writingFlowWindows));
  }
  focusWindow(getWindow("questionSheet"));
  // focusWindow does not re-run the mobile foreground pass; without this the
  // last window opened by the loop above keeps the phone screen and the
  // focused Question Sheet stays hidden behind it.
  if (typeof syncMobileAppForeground === "function") {
    syncMobileAppForeground();
  }
  previewLinkedTeachTextManuscript();
  setStatus(t("linked_writing_flow_opened"));
}

function writingFlowWindowNames() {
  return ["teachText", "questionSheet", "outline", "sectionDrafts"];
}

function showAdjacentSectionDraft(direction) {
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  const blocks = getProjectOutlineDraftBlocks(project);
  if (!blocks.length) return;

  const currentIndex = Number(draftSectionSelectEl?.value || 0);
  const nextIndex = (currentIndex + direction + blocks.length) % blocks.length;
  if (draftSectionSelectEl) draftSectionSelectEl.value = String(nextIndex);
  const draftRefs = syncDraftsFromProjectOutline(project);
  selectEnsuredDraftRef(draftRefs, nextIndex);
  renderPipeline();
  requestAnimationFrame(() => draftBodyInput?.focus());
}

function updateOutlineSectionStatus(outlineSections) {
  const sectionCount = Array.isArray(outlineSections) ? outlineSections.length : 0;
  const label = t("outline_sections_count", sectionCount);
  if (outlineStatusEl) outlineStatusEl.textContent = label;
}

function estimateVoiceoverSeconds(text) {
  const body = String(text || "");
  // Bilibili narration is faster than classroom reading, but still leaves room for visual beats.
  const cjkCharsPerMinute = 240;
  const latinWordsPerMinute = 150;
  const cjk = body.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length || 0;
  const latin = body
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, " ")
    .match(/[\p{L}\p{N}]+/gu)?.length || 0;
  return Math.ceil((cjk / cjkCharsPerMinute + latin / latinWordsPerMinute) * 60);
}

function updateDraftVoiceStats(text = draftBodyInput?.value || "") {
  if (!draftCountEl) return;
  const words = countTextWords(text || "");
  const seconds = estimateVoiceoverSeconds(text || "");
  if (!words) {
    draftCountEl.textContent = t("draft_voice_stats_empty");
    return;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) {
    draftCountEl.textContent = t("draft_voice_stats_seconds", words, seconds);
  } else if (remainingSeconds === 0) {
    draftCountEl.textContent = t("draft_voice_stats_minutes", words, minutes);
  } else {
    draftCountEl.textContent = t("draft_voice_stats_minutes_seconds", words, minutes, remainingSeconds);
  }
}

function renderPipeline() {
  const project = getActiveProject();
  // Surfaces are about to be repopulated from project state; any stale
  // last-edited marker from a previous project no longer applies.
  lastEditedWritingSurface = null;
  if (!project) {
    questionSheetBodyInput.value = "";
    if (questionCountEl) questionCountEl.textContent = t("questions_count", 0);
    updateQuestionSheetManuscriptTitle(null);
    if (outlineNotesEl) {
      outlineNotesEl.classList.add("is-hidden");
      outlineNotesEl.replaceChildren();
    }
    outlineContentEl.value = "";
    updateOutlineSectionStatus([]);
    updateDraftVoiceStats("");
    renderDraftSectionSource([]);
    draftListEl.replaceChildren();
    if (draftTitleInput) draftTitleInput.value = "";
    draftBodyInput.value = "";
    refreshAllTeachTextSurfacePreviews();
    readerTabsEl.classList.add("is-hidden");
    renderFlowProgress(null);
    renderClaimCheckSections();
    return;
  }

  questionSheetBodyInput.value = project.questionSheet || "";
  if (questionCountEl) questionCountEl.textContent = t("questions_count", countQuestionSheetQuestions(project.questionSheet || ""));
  updateQuestionSheetManuscriptTitle(project);

  syncDraftsFromProjectOutline(project, { preserveCurrentDraft: document.activeElement === draftBodyInput });
  syncLinkedTeachTextFromProject(project);
  applyManuscriptEditability();
  const outlineSections = getProjectOutlineSections(project);
  updateOutlineSectionStatus(outlineSections);
  syncPipelineLabelControls();
  renderDraftSectionSource(outlineSections);
  if (outlineNotesEl) {
    outlineNotesEl.classList.toggle("is-hidden", !project.outlineCritique);
    outlineNotesEl.innerHTML = project.outlineCritique
      ? `<b>${escapeHtml(t("outline_critique_note"))}</b><div>${markdownToSystemHtml(project.outlineCritique)}</div>`
      : "";
  }
  if (outlineContentEl.value !== (project.outline || "")) {
    outlineContentEl.value = project.outline || serializeOutlineSections(outlineSections);
  }
  restoreLinkedManuscriptScroll();

  // Ensure selectedDraftIndex is in bounds
  if (!project.drafts) project.drafts = [];
  if (selectedDraftIndex >= project.drafts.length) {
    selectedDraftIndex = project.drafts.length > 0 ? 0 : -1;
  }
  syncDraftSectionSelection(project, outlineSections);

  // Render drafts list
  draftListEl.replaceChildren();
  if (project.drafts.length) {
    project.drafts.forEach((draft, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${selectedDraftIndex === index ? "is-selected" : ""}`;
      const clipCount = Array.isArray(draft.usedClips) ? draft.usedClips.length : 0;
      const meta = [
        draft.sectionTitle || draft.title || `Draft ${index + 1}`,
        draft.hkrrIntent ? `HKRR ${draft.hkrrIntent}` : "",
        clipCount ? `${clipCount} clip${clipCount === 1 ? "" : "s"}` : t("draft_no_clips"),
        draft.insertedAt ? t("draft_inserted") : t("draft_not_inserted"),
      ].filter(Boolean).join(" · ");
      btn.innerHTML = `<span>${escapeHtml(draft.title || `Draft ${index + 1}`)}</span><small>${escapeHtml(meta)}</small>`;
      btn.addEventListener("click", () => {
        selectedDraftIndex = index;
        if (draftTitleInput) draftTitleInput.value = draft.title || draft.sectionTitle || "";
        draftBodyInput.value = draft.body;
        renderPipeline();
      });
      draftListEl.append(btn);
    });
    if (selectedDraftIndex >= 0) {
      if (draftTitleInput) draftTitleInput.value = project.drafts[selectedDraftIndex].title || project.drafts[selectedDraftIndex].sectionTitle || "";
      draftBodyInput.value = project.drafts[selectedDraftIndex].body;
    }
  } else {
    const empty = document.createElement("div");
    empty.className = "empty-folder-note";
    empty.textContent = t("no_drafts");
    draftListEl.append(empty);
    if (draftTitleInput) draftTitleInput.value = "";
    draftBodyInput.value = "";
  }
  updateDraftVoiceStats(draftBodyInput.value);
  updateDraftSectionLabel(project);
  refreshAllTeachTextSurfacePreviews();

  // Reader Queue
  renderReaderTabs(project);

  const progress = getFlowProgress(project);
  project.flowState = { ...progress.states };
  renderFlowProgress(project, progress);
  renderClaimCheckSections();
}

function cleanRebuildLine(line) {
  return (line || "")
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*(?:[-*]|\d+[.)]|[一二三四五六七八九十]+[、.])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortRebuildText(text, max = 80) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function inferRebuildTitle(text) {
  const lines = (text || "").split(/\n+/).map(cleanRebuildLine).filter(Boolean);
  const title = lines.find((line) => line.length >= 4 && line.length <= 90) || lines[0] || t("untitled_project");
  return shortRebuildText(title, 72);
}

function inferRebuildSections(text, title) {
  const rawLines = (text || "").split(/\n+/);
  const headingPattern = /^\s{0,3}(?:#{1,3}\s+|第.{1,12}[章节]|[一二三四五六七八九十]+[、.]\s+|\d+[.)]\s+)/;
  const headings = rawLines
    .filter((line) => headingPattern.test(line))
    .map(cleanRebuildLine)
    .filter((line) => line && line !== title && line.length <= 90);

  if (headings.length >= 3) return headings.slice(0, 7);

  const paragraphs = getRebuildParagraphs(text);
  const maxLabel = currentLanguage === "zh" ? 30 : 54;
  const sections = paragraphs.slice(0, 6).map((paragraph, index) => {
    const sentence = paragraph.split(/[。！？.!?]/)[0] || paragraph;
    const label = shortRebuildText(sentence, maxLabel);
    return label || (currentLanguage === "zh" ? `段落 ${index + 1}` : `Section ${index + 1}`);
  });

  return sections.length ? sections : [title];
}

function inferRebuildTerms(text) {
  const terms = new Set();
  const quotedPattern = /[「『《“"]([^」』》”"]{2,24})[」』》”"]/g;
  for (const match of text.matchAll(quotedPattern)) {
    terms.add(match[1].trim());
  }

  const latinPattern = /\b[A-Z][A-Za-z0-9+-]{2,}(?:\s+[A-Z][A-Za-z0-9+-]{2,}){0,2}\b/g;
  for (const match of text.matchAll(latinPattern)) {
    const term = match[0].trim();
    if (!["The", "This", "That", "With"].includes(term)) terms.add(term);
  }

  return [...terms].slice(0, 8);
}

function sectionRoleLabel(index, total) {
  const roles = currentLanguage === "zh"
    ? ["开场：提出议题", "背景：解释问题", "材料：展开证据", "转折：区分重点", "综合：说明意义", "收束：给出后续动作"]
    : ["Opening: set the question", "Context: explain the problem", "Evidence: develop the material", "Turn: sharpen the distinction", "Synthesis: explain the meaning", "Close: point to the next step"];
  if (index === 0) return roles[0];
  if (index === total - 1 && total > 2) return roles[5];
  return roles[Math.min(index, roles.length - 2)];
}

function buildRebuildArtifacts(sourceText) {
  const title = inferRebuildTitle(sourceText);
  const paragraphs = getRebuildParagraphs(sourceText);
  const sections = inferRebuildSections(sourceText, title);
  const claims = inferRebuildClaims(paragraphs);
  const terms = inferRebuildTerms(sourceText);
  const zh = currentLanguage === "zh";
  const thesis = shortRebuildText(paragraphs[0] || sourceText, zh ? 120 : 160);

  const questionSheet = buildQuestionSheetMarkdown({
    title,
    sections: {
      topic: title,
      originalQuestions: zh
        ? ["这篇文章试图回答什么问题？", "它希望读者相信什么变化正在发生？", "哪些事实、时间、对象需要核查？"]
        : ["What question is this article trying to answer?", "What change does it want the reader to believe is happening?", "Which facts, dates, and names need checking?"],
      mustRemember: [
        zh ? `主线：${thesis}` : `Through-line: ${thesis}`,
        ...claims.slice(0, 3).map((claim) => zh ? `待核查：${claim}` : `Check: ${claim}`),
      ],
      objections: zh
        ? ["有没有把公告、观点和事实混在一起？", "有没有遗漏反方、限制条件或适用范围？"]
        : ["Does it blur announcement, opinion, and fact?", "Does it hide limits, counterpoints, or scope?"],
      terms: terms.length ? terms : [zh ? "待补充术语" : "Terms to add"],
      toneStyle: zh
        ? "从成品文章反推；这些内容是学习对象，不是原始作者的写作记录。"
        : "Rebuilt from the finished article; these are learning objects, not the author's actual notes.",
    },
  });

  const docMap = [
    `# DocMap: ${title}`,
    "",
    zh ? "## 主线" : "## Through-line",
    thesis,
    "",
    zh ? "## 结构地图" : "## Structure Map",
    ...sections.map((section, index) => `${index + 1}. **${section}** — ${sectionRoleLabel(index, sections.length)}`),
    "",
    zh ? "## 关键主张" : "## Claims To Check",
    ...(claims.length ? claims.map((claim) => `- ${claim}`) : [zh ? "- 没有自动提取到明显主张。" : "- No obvious claims were extracted."]),
  ].join("\n");

  const claimQueue = [
    `# ${zh ? "事实核查队列" : "Claim Check Queue"}: ${title}`,
    "",
    ...(claims.length ? claims.map((claim, index) => `${index + 1}. [ ] ${claim}`) : [zh ? "- [ ] 手动标记需要来源的句子。" : "- [ ] Mark sentences that need sources."]),
  ].join("\n");

  const styleNotes = [
    `# ${zh ? "风格笔记" : "Style Notes"}: ${title}`,
    "",
    zh ? "- 观察段落如何开场、转折、给出事实和收束。" : "- Watch how paragraphs open, turn, cite facts, and close.",
    zh ? "- 保留 Markdown 和原文；不要把还原结果当作真实创作过程。" : "- Keep the original visible; do not treat the rebuild as the real drafting history.",
    zh ? "- 复用的是写作动作，不是原文句子。" : "- Reuse the moves, not the sentences.",
  ].join("\n");

  const readme = [
    `# ${zh ? "这篇文章如何写成" : "How This Article Works"}`,
    "",
    zh
      ? "这是一份从成品文章反推出来的学习包。它会帮助你理解 AI System 6 的正常写作流程。"
      : "This is a learning pack rebuilt from a finished article. It shows how the normal AI System 6 writing flow works.",
    "",
    zh ? "## 查看顺序" : "## Inspect In This Order",
    zh ? "1. 打开 Question Sheet：它保留问题、反对意见和术语。" : "1. Inspect Question Sheet: questions, objections, and terms.",
    zh ? "2. 看 Outline：它是文章骨架，不是 DocMap。" : "2. Inspect Outline: the article skeleton, not the DocMap.",
    zh ? "3. 看 Section Drafts：这里是段落功能说明，不是自动生成正文。" : "3. Inspect Section Drafts: section-role notes, not auto-written prose.",
    zh ? "4. 回到 TeachText 写正文，再用事实核查队列和风格笔记检查。" : "4. Return to TeachText for the manuscript, then use the claim queue and style notes as checks.",
  ].join("\n");

  const sectionNotes = sections.map((section, index) => ({
    title: section,
    body: [
      `# ${section}`,
      "",
      zh ? `段落作用：${sectionRoleLabel(index, sections.length)}` : `Section role: ${sectionRoleLabel(index, sections.length)}`,
      "",
      zh ? "从原文提取的参考：" : "Reference from source:",
      shortRebuildText(paragraphs[index] || paragraphs[0] || sourceText, zh ? 220 : 280),
      "",
      zh ? "写自己的文章时：先说明这一段要解决的问题，再选择证据，不要直接改写原文。" : "When writing your own article: state what this section must solve, choose evidence, and do not paraphrase the source directly.",
    ].join("\n"),
  }));

  return { title, sections, questionSheet, docMap, claimQueue, styleNotes, readme, sectionNotes, paragraphs };
}

function renderRebuildFlow() {
  if (rebuildFlowProjectEl) rebuildFlowProjectEl.textContent = t("rebuild_new_project_disk");
  renderRebuildProgress();
  if (!rebuildFlowSourceMetaEl || !rebuildFlowSourceInput) return;

  const text = rebuildFlowSourceInput.value.trim();
  if (!text) {
    rebuildFlowSourceMetaEl.textContent = t("rebuild_no_source");
    return;
  }
  const label = rebuildFlowSourceInput.dataset.sourceLabel || t("rebuild_pasted_source");
  rebuildFlowSourceMetaEl.textContent = t("rebuild_source_meta", label, text.length);
}

function setRebuildFlowSource(text, label) {
  if (!rebuildFlowSourceInput) return;
  rebuildFlowSourceInput.value = (text || "").trim();
  rebuildFlowSourceInput.dataset.sourceLabel = label || t("rebuild_pasted_source");
  if (rebuildFlowStatusEl) rebuildFlowStatusEl.textContent = t("rebuild_flow_status_ready");
  resetRebuildProgress();
  renderRebuildFlow();
  openRebuildFlow();
}

function openRebuildFlow() {
  closeWindow("guide", true);
  renderRebuildFlow();
  openWindow("rebuildFlow");
  rebuildFlowSourceInput?.focus();
}

function useReaderForRebuildFlow() {
  // The loaded page, not the pane. Reading innerText picked up the Reader's own
  // empty-state sentence, so with nothing open this reported success and handed
  // the flow 47 characters of UI chrome. Every other reader of this state asks
  // currentReaderPage?.text alone.
  const text = (currentReaderPage?.text || "").trim();
  if (!text) {
    if (rebuildFlowStatusEl) rebuildFlowStatusEl.textContent = t("rebuild_reader_empty");
    openRebuildFlow();
    return;
  }
  setRebuildFlowSource(text, t("rebuild_reader_source"));
}

function useTeachTextForRebuildFlow() {
  const text = teachTextBodyInput?.value.trim() || "";
  if (!text) {
    if (rebuildFlowStatusEl) rebuildFlowStatusEl.textContent = t("rebuild_teachtext_empty");
    openRebuildFlow();
    return;
  }
  setRebuildFlowSource(text, t("rebuild_teachtext_source"));
}

async function useClipboardForRebuildFlow() {
  let text = clipboardTextInput?.value.trim() || "";
  try {
    const nativeText = await navigator.clipboard?.readText?.();
    if (nativeText?.trim()) text = nativeText.trim();
  } catch {
    // Browser clipboard permission can fail; the AI System 6 Clipboard still works.
  }

  if (!text) {
    if (rebuildFlowStatusEl) rebuildFlowStatusEl.textContent = t("rebuild_clipboard_empty");
    openRebuildFlow();
    return;
  }
  setRebuildFlowSource(text, t("rebuild_clipboard_source"));
}

function buildRebuildSampleArticle() {
  const articles = window.AISystem6Content?.rebuildSampleArticles || {};
  return articles[currentLanguage] || articles.en || "";
}

function useSampleArticleForRebuildFlow() {
  setRebuildFlowSource(buildRebuildSampleArticle(), t("rebuild_sample_source"));
  if (rebuildFlowStatusEl) rebuildFlowStatusEl.textContent = t("rebuild_sample_loaded");
}

function rebuildProjectDiskName(title) {
  const cleanedTitle = String(title || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const shortTitle = shortRebuildText(cleanedTitle || t("rebuild_folder_name"), currentLanguage === "zh" ? 28 : 48);
  return uniqueProjectName(t("rebuild_project_name", shortTitle));
}

function createRebuildDocument(project, folder, name, body, label = "note") {
  return createTeachTextFile({
    project,
    folder,
    name: nextAvailableProjectFileName(name, project.id),
    body,
    label,
  });
}

function findRebuildPackSection(blocks, patterns) {
  const matchers = Array.isArray(patterns) ? patterns : [patterns];
  return blocks.find((block) => {
    const title = String(block?.title || "").replace(/\s+/g, " ").trim();
    return matchers.some((pattern) => pattern.test(title));
  }) || null;
}

function buildFallbackRebuildDraftNotes(sections, outlineBlocks = []) {
  return (sections || []).map((section, index) => {
    const outline = outlineBlocks[index]?.body || outlineBlocks.find((block) => block.title === section)?.body || "";
    return [
      `### ${section}`,
      `- Section role: ${section}`,
      `- What this section must prove or clarify: ${firstSentence(outline, currentLanguage === "zh" ? 90 : 130) || section}`,
      `- Source-grounded material to reuse: ${outline.trim() || section}`,
      `- What not to copy: ${currentLanguage === "zh" ? "不要照搬原文措辞；只迁移结构、问题和证据位置。" : "Do not copy source wording; reuse structure, questions, and evidence placement."}`,
    ].join("\n");
  }).join("\n\n");
}

function normalizeRebuildOutlineMarkdown(outlineMarkdown, fallbackTitle) {
  const clean = stripRebuildMarkdownFence(outlineMarkdown);
  const levelThreeBlocks = markdownDocumentSectionBlocks(clean, 3);
  if (levelThreeBlocks.length) {
    return levelThreeBlocks.map((block) => [
      `## ${block.title}`,
      block.body.trim(),
    ].filter(Boolean).join("\n\n")).join("\n\n");
  }

  const levelTwoBlocks = markdownDocumentSectionBlocks(clean, 2);
  if (levelTwoBlocks.length) return clean;

  const listItems = parseMarkdownDocument(clean).listItems
    .map((item) => cleanRebuildLine(item.text))
    .filter(Boolean)
    .slice(0, 8);
  if (listItems.length) return listItems.map((item) => `## ${item}`).join("\n\n");

  return `## ${fallbackTitle || t("new_outline_section")}`;
}

function parseRebuildWritingObjectPack(markdown, sourceText, sourceDocMap) {
  const clean = stripRebuildMarkdownFence(markdown);
  const blocks = markdownDocumentSectionBlocks(clean, 2);
  const fallback = buildRebuildArtifacts(sourceText);
  const title = shortRebuildText(
    markdownDocumentTitle(clean).replace(/^(?:Writing Object Pack|写作对象包)\s*[:：]\s*/i, "")
      || sourceDocMap?.title
      || inferRebuildTitle(sourceText),
    currentLanguage === "zh" ? 36 : 72
  );
  const questionBlock = findRebuildPackSection(blocks, [/^Question Sheet$/i, /^问题单$/]);
  const outlineBlock = findRebuildPackSection(blocks, [/^Outline$/i, /^大纲$/]);
  const draftBlock = findRebuildPackSection(blocks, [
    /^Section Draft Notes$/i,
    /^Section Drafts?$/i,
    /^Draft Notes$/i,
    /^Section Notes$/i,
    /^Drafting Notes$/i,
    /^章节(?:草稿|说明|笔记)/,
    /^草稿(?:说明|笔记)/,
  ]);
  const claimBlock = findRebuildPackSection(blocks, [/^Fact Check Queue$/i, /^事实核查/]);
  const styleBlock = findRebuildPackSection(blocks, [/^Style Notes$/i, /^风格笔记$/]);
  const readmeBlock = findRebuildPackSection(blocks, [/^README$/i, /^Read Me$/i, /^说明$/]);
  const required = [
    ["questionSheet", questionBlock || { body: fallback.questionSheet }],
    ["outline", outlineBlock || { body: serializeOutlineSections(fallback.sections) }],
    ["claimQueue", claimBlock || { body: fallback.claimQueue }],
    ["styleNotes", styleBlock || { body: fallback.styleNotes }],
    ["readme", readmeBlock || { body: fallback.readme }],
  ];
  const missing = required.filter(([, block]) => !block?.body?.trim()).map(([name]) => name);
  if (missing.length) throw new Error(`writing_object_pack_missing:${missing.join(",")}`);

  const questionBody = questionBlock?.body?.trim() || fallback.questionSheet;
  const outlineMarkdown = normalizeRebuildOutlineMarkdown(outlineBlock?.body || serializeOutlineSections(fallback.sections), title);
  const sections = getMeaningfulOutlineSections(extractOutlineSections(outlineMarkdown));
  if (sections.length < 3) throw new Error("writing_object_pack_outline_quality_gate");

  const outlineBlocks = extractOutlineDraftBlocks(outlineMarkdown);
  const draftBody = draftBlock?.body?.trim() || buildFallbackRebuildDraftNotes(sections, outlineBlocks);
  let draftBlocks = markdownDocumentSectionBlocks(draftBody, 3);
  if (draftBlocks.length < Math.min(3, sections.length)) {
    draftBlocks = markdownDocumentSectionBlocks(buildFallbackRebuildDraftNotes(sections, outlineBlocks), 3);
  }
  const sectionNotes = sections.map((section, index) => {
    const block = draftBlocks[index] || draftBlocks.find((item) => item.title === section);
    return {
      title: section,
      body: [
        `# ${section}`,
        "",
        (block?.body || "").trim(),
      ].join("\n").trim(),
    };
  });
  const linkedOutlineMarkdown = sections.map((section, index) => {
    const outlineBody = outlineBlocks[index]?.body || "";
    const draftBody = sectionNotes[index]?.body.replace(new RegExp(`^#\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n*`), "") || "";
    return [
      `## ${section}`,
      outlineBody.trim(),
      draftBody.trim(),
    ].filter(Boolean).join("\n\n");
  }).join("\n\n");

  return {
    title,
    sections,
    outlineMarkdown: linkedOutlineMarkdown,
    questionSheet: questionBody,
    docMap: formatDocMapMarkdown(sourceDocMap),
    claimQueue: claimBlock?.body?.trim() || fallback.claimQueue,
    styleNotes: styleBlock?.body?.trim() || fallback.styleNotes,
    readme: readmeBlock?.body?.trim() || fallback.readme,
    sectionNotes,
    paragraphs: getRebuildParagraphs(sourceText).slice(0, 2),
    packMarkdown: clean,
    modelBacked: true,
  };
}

async function buildRebuildWritingObjectPackWithModel(sourceText, sourceDocMap) {
  const zh = currentLanguage === "zh";
  const questionSpec = questionSheetSpec();
  const languageName = questionSpec.languageName;
  const packHeadings = [
    questionSpec.title,
    zh ? "大纲" : "Outline",
    zh ? "章节笔记" : "Section Draft Notes",
    zh ? "事实核查" : "Fact Check Queue",
    zh ? "风格笔记" : "Style Notes",
    zh ? "说明" : "README",
  ];
  const outlineFields = zh
    ? ["写作任务", "关键材料", "读者转向"]
    : ["Writing job", "Key material", "Reader turn"];
  const draftFields = zh
    ? ["段落作用", "本节必须证明或澄清什么", "可复用的来源材料", "不要照搬什么"]
    : ["Section role", "What this section must prove or clarify", "Source-grounded material to reuse", "What not to copy"];
  const prompt = `你是 AI System 6 的写作对象重建助手。请根据可靠 DocMap 重建写作流程对象。
Return Markdown only. Do not use JSON.
所有面向用户的文字使用 ${languageName}。如果来源或 DocMap 是其他语言，请把标签和规划文字翻译成 ${languageName}。

DocMap 是结构依据；来源文本只用于避免空泛。不要假装这些是作者真实笔记，它们是从成文反推的学习对象。

Required Markdown format:
# ${questionSpec.packTitle}: ${zh ? "简短项目标题" : "short project title"}

Use these exact level-2 headings, spelled exactly:
- ## ${packHeadings[0]}
- ## ${packHeadings[1]}
- ## ${packHeadings[2]}
- ## ${packHeadings[3]}
- ## ${packHeadings[4]}
- ## ${packHeadings[5]}

## ${packHeadings[0]}
Create a real writing question sheet with:
${questionSheetFieldList()}

## ${packHeadings[1]}
Use level-3 headings only for sections:
### ${zh ? "章节标题" : "Section title"}
- ${outlineFields[0]}:
- ${outlineFields[1]}:
- ${outlineFields[2]}:

Create 4 to 8 sections.

## ${packHeadings[2]}
Use level-3 headings matching the Outline section titles:
### ${zh ? "章节标题" : "Section title"}
- ${draftFields[0]}:
- ${draftFields[1]}:
- ${draftFields[2]}:
- ${draftFields[3]}:

## ${packHeadings[3]}
Use checklist items.

## ${packHeadings[4]}
List visible writing moves and reuse advice.

## ${packHeadings[5]}
Explain how to inspect this Project Disk.

DocMap Markdown:
${clipContextContent(formatDocMapMarkdown(sourceDocMap), 7000)}

Source text:
${clipContextContent(sourceText, 7000)}

${zh ? "请保持具体，不要写空泛模板。中文要自然，避免翻译腔。" : "Stay specific; do not write generic templates."}`;

  const requestPayload = (stream) => ({
    model: getLocalModelRequestName(),
    messages: withMarkdownModelMessages([
      { role: "system", content: resolveWritingRoutePrompt("writing-route.rebuild-pack") },
      { role: "user", content: prompt },
    ]),
    temperature: 0.18,
    max_tokens: 4200,
    ai_system6_task_kind: "rebuild",
    stream,
  });

  const streamResponse = await fetchModelPayload(requestPayload(true), getLongTaskSignal());
  let markdown = "";
  try {
    markdown = await readRebuildMarkdownPackStream(streamResponse, (text) => {
      updateRebuildModelProgress(text.length);
    });
  } catch (error) {
    if (isAbortError(error) || !isEmptyWritingObjectPackError(error)) throw error;
    setRebuildProgress("model", "running", t("rebuild_pack_retrying"));
    const retryResponse = await fetchModelPayload(requestPayload(false), getLongTaskSignal());
    const data = await readChatJson(retryResponse);
    markdown = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";
    updateRebuildModelProgress(markdown.length);
  }
  return parseRebuildWritingObjectPack(markdown, sourceText, sourceDocMap);
}

function isEmptyWritingObjectPackError(error) {
  return /empty writing object pack stream/i.test(String(error?.message || error || ""));
}

function normalizeRebuildString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeRebuildStringList(value, fallback = [], limit = 8) {
  const list = Array.isArray(value) ? value : [];
  const normalized = list
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)
    .slice(0, limit);
  return normalized.length ? normalized : fallback;
}

function normalizeModelRebuildArtifacts(sourceText, data) {
  const fallback = buildRebuildArtifacts(sourceText);
  const sections = normalizeRebuildStringList(data?.sections, fallback.sections, 8);
  const rawNotes = Array.isArray(data?.sectionNotes) ? data.sectionNotes : [];
  const sectionNotes = sections.map((section, index) => {
    const raw = rawNotes[index] || {};
    return {
      title: normalizeRebuildString(raw.title, section),
      body: normalizeRebuildString(raw.body, fallback.sectionNotes[index]?.body || [
        `# ${section}`,
        "",
        currentLanguage === "zh"
          ? "这是本地模型还原出的段落功能说明。"
          : "This is a local-model reconstruction of the section's role.",
      ].join("\n")),
    };
  });

  return {
    title: normalizeRebuildString(data?.title, fallback.title),
    sections,
    questionSheet: normalizeRebuildString(data?.questionSheet, fallback.questionSheet),
    docMap: normalizeRebuildString(data?.docMap, fallback.docMap),
    claimQueue: normalizeRebuildString(data?.claimQueue, fallback.claimQueue),
    styleNotes: normalizeRebuildString(data?.styleNotes, fallback.styleNotes),
    readme: normalizeRebuildString(data?.readme, fallback.readme),
    sectionNotes,
    paragraphs: normalizeRebuildStringList(data?.scrapbookSeeds, fallback.paragraphs, 4),
    modelBacked: true,
  };
}

function rebuildArtifactQuality(artifacts, fallback) {
  const missing = [];
  const badText = /\b(undefined|null|NaN)\b/i;
  const textFields = ["questionSheet", "docMap", "claimQueue", "styleNotes", "readme"];
  const minLengths = {
    questionSheet: currentLanguage === "zh" ? 80 : 120,
    docMap: currentLanguage === "zh" ? 80 : 120,
    claimQueue: currentLanguage === "zh" ? 36 : 60,
    styleNotes: currentLanguage === "zh" ? 36 : 60,
    readme: currentLanguage === "zh" ? 60 : 90,
  };

  if (!artifacts?.title || artifacts.title.length < 4) missing.push("title");
  if (!Array.isArray(artifacts?.sections) || artifacts.sections.length < Math.min(3, fallback.sections.length)) missing.push("sections");
  if (!Array.isArray(artifacts?.sectionNotes) || artifacts.sectionNotes.length < Math.min(3, artifacts.sections?.length || 0)) missing.push("sectionNotes");
  textFields.forEach((field) => {
    const value = String(artifacts?.[field] || "").trim();
    if (value.length < minLengths[field] || badText.test(value)) missing.push(field);
  });
  if (!/[-*]|\d+[.)]|\[ \]/.test(String(artifacts?.claimQueue || ""))) missing.push("claimQueueItems");

  return {
    ok: missing.length === 0,
    missing,
  };
}

function requireReliableRebuildArtifacts(artifacts, fallback) {
  const quality = rebuildArtifactQuality(artifacts, fallback);
  if (!quality.ok) {
    throw new Error(`quality_gate:${quality.missing.join(",")}`);
  }
  return artifacts;
}

function makeRebuildBlocks(sourceText, maxBlocks = 8) {
  const title = inferRebuildTitle(sourceText);
  const rawLines = (sourceText || "").split(/\n+/);
  const headingPattern = /^\s{0,3}(?:#{1,3}\s+|第.{1,12}[章节]|[一二三四五六七八九十]+[、.]\s+|\d+[.)]\s+)/;
  const blocks = [];
  let current = null;

  rawLines.forEach((line) => {
    const clean = line.trim();
    if (!clean) return;
    if (headingPattern.test(clean) && cleanRebuildLine(clean) !== title) {
      if (current?.text?.trim()) blocks.push(current);
      current = { title: cleanRebuildLine(clean), text: "" };
      return;
    }
    if (!current) current = { title: title || t("source_article"), text: "" };
    current.text = `${current.text}${current.text ? "\n\n" : ""}${clean}`;
  });
  if (current?.text?.trim()) blocks.push(current);

  const paragraphBlocks = getRebuildParagraphs(sourceText).map((paragraph, index) => ({
    title: currentLanguage === "zh" ? `段落 ${index + 1}` : `Passage ${index + 1}`,
    text: paragraph,
  }));
  const usable = blocks.length >= 3 ? blocks : paragraphBlocks;
  const merged = [];

  usable.forEach((block) => {
    const previous = merged[merged.length - 1];
    if (previous && (previous.text.length < 900 || merged.length >= maxBlocks)) {
      previous.text = `${previous.text}\n\n${block.text}`.trim();
      if (previous.title.length < 18 && block.title) previous.title = `${previous.title} / ${block.title}`;
    } else {
      merged.push({ ...block });
    }
  });

  return merged.slice(0, maxBlocks).map((block, index) => ({
    id: `block-${index + 1}`,
    title: shortRebuildText(block.title || `${currentLanguage === "zh" ? "区块" : "Block"} ${index + 1}`, currentLanguage === "zh" ? 34 : 56),
    text: clipContextContent(block.text, 2200),
  }));
}

function normalizeBlockAnalysis(raw, block, index) {
  const title = normalizeRebuildString(raw?.sectionTitle, block.title);
  return {
    id: block.id,
    sectionTitle: shortRebuildText(title, currentLanguage === "zh" ? 34 : 58),
    writingRole: normalizeRebuildString(raw?.writingRole, sectionRoleLabel(index, 6)),
    claims: normalizeRebuildStringList(raw?.claims, inferRebuildClaims([block.text]), 4),
    evidenceQuotes: normalizeRebuildStringList(raw?.evidenceQuotes, [shortRebuildText(block.text, currentLanguage === "zh" ? 160 : 220)], 3),
    readerQuestions: normalizeRebuildStringList(raw?.readerQuestions, [], 3),
    styleMoves: normalizeRebuildStringList(raw?.styleMoves, [], 3),
    reuseAdvice: normalizeRebuildString(
      raw?.reuseAdvice,
      currentLanguage === "zh"
        ? "先复用这一节的写作功能，再替换成自己的材料。"
        : "Reuse the writing move first, then replace the material with your own evidence."
    ),
  };
}

async function callRebuildModelMarkdown(prompt, timeoutMs = 14000) {
  const longTaskSignal = getLongTaskSignal();
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);
  const cancelOnStop = () => timeoutController.abort();
  if (longTaskSignal) {
    if (longTaskSignal.aborted) cancelOnStop();
    else longTaskSignal.addEventListener("abort", cancelOnStop, { once: true });
  }

  let response;
  try {
    response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([
        {
          role: "system",
          content: resolveWritingRoutePrompt("writing-route.rebuild-section", "en"),
        },
        { role: "user", content: prompt },
      ]),
      temperature: 0.15,
      max_tokens: 900,
      stream: false,
    }, timeoutController.signal);
  } catch (error) {
    if (timedOut) throw new Error("lmstudio_timeout");
    throw error;
  } finally {
    clearTimeout(timeoutId);
    longTaskSignal?.removeEventListener?.("abort", cancelOnStop);
  }

  const data = await readChatJson(response);
  return data?.choices?.[0]?.message?.content || "";
}

function rebuildMarkdownSection(markdown, labels) {
  const source = stripRebuildMarkdownFence(markdown);
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = source.match(new RegExp(`(?:^|\\n)#{2,4}\\s*(?:${labelPattern})\\s*\\n+([\\s\\S]*?)(?=\\n#{2,4}\\s+|$)`, "i"));
  return match?.[1]?.trim() || "";
}

function rebuildMarkdownList(markdown, labels, limit = 8) {
  const section = rebuildMarkdownSection(markdown, labels);
  return section
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function parseRebuildBlockMarkdown(markdown, block, index) {
  const sectionTitle = rebuildMarkdownSection(markdown, ["Section Title", "章节标题"]).split("\n")[0]?.trim() || block.title;
  const writingRole = rebuildMarkdownSection(markdown, ["Writing Role", "写作作用"]);
  const reuseAdvice = rebuildMarkdownSection(markdown, ["Reuse Advice", "复用建议"]);
  return {
    sectionTitle,
    writingRole,
    claims: rebuildMarkdownList(markdown, ["Claims", "主张"], 8),
    evidenceQuotes: rebuildMarkdownList(markdown, ["Evidence Quotes", "证据引文"], 6),
    readerQuestions: rebuildMarkdownList(markdown, ["Reader Questions", "读者问题"], 6),
    styleMoves: rebuildMarkdownList(markdown, ["Style Moves", "写法"], 6),
    reuseAdvice,
  };
}

async function analyzeRebuildBlockWithModel(block, index, total) {
  const languageName = currentLanguage === "zh" ? "Chinese" : "English";
  const prompt = `你是 AI System 6 的写作对象重建助手。请分析成文中的一个区块，用于重建写作对象。

Return Markdown only. Do not return JSON. 所有面向用户的字段使用 ${languageName}，证据引文必须保持原文。
不要总结整篇文章，只分析当前区块。中文要自然，避免翻译腔。

Use this Markdown shape:

## Section Title
short reusable section title

## Writing Role
what this block is doing in the article

## Claims
- source-grounded factual or product claim

## Evidence Quotes
- short exact source snippet from this block

## Reader Questions
- question a writer should ask before reusing this move

## Style Moves
- tone, structure, or sentence move visible in this block

## Reuse Advice
how to reuse this writing move without copying

Block ${index + 1} of ${total}: ${block.title}

TEXT:
${block.text}`;

  const parsed = parseRebuildBlockMarkdown(await callRebuildModelMarkdown(prompt, 14000), block, index);
  return normalizeBlockAnalysis(parsed, block, index);
}

function uniqueRebuildItems(items, limit = 12) {
  const seen = new Set();
  const result = [];
  items.forEach((item) => {
    const value = String(item || "").replace(/\s+/g, " ").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });
  return result.slice(0, limit);
}

function buildRebuildArtifactsFromBlockAnalyses(sourceText, analyses) {
  const fallback = buildRebuildArtifacts(sourceText);
  if (!analyses.length) return fallback;
  const zh = currentLanguage === "zh";
  const title = fallback.title;
  const sections = uniqueRebuildItems(analyses.map((analysis) => analysis.sectionTitle), 8);
  const claims = uniqueRebuildItems(analyses.flatMap((analysis) => analysis.claims), 14);
  const questions = uniqueRebuildItems(analyses.flatMap((analysis) => analysis.readerQuestions), 10);
  const styleMoves = uniqueRebuildItems(analyses.flatMap((analysis) => analysis.styleMoves), 12);
  const quotes = uniqueRebuildItems(analyses.flatMap((analysis) => analysis.evidenceQuotes), 8);
  const roles = analyses.map((analysis, index) =>
    `${index + 1}. **${analysis.sectionTitle}** — ${analysis.writingRole}`
  );

  const questionSheet = buildQuestionSheetMarkdown({
    title,
    sections: {
      topic: title,
      originalQuestions: questions.length
        ? questions
        : (zh
          ? ["这篇文章想让读者理解什么变化？", "哪些主张需要回到来源核查？"]
          : ["What change does this article want the reader to understand?", "Which claims need source checking?"]),
      mustRemember: claims.length ? claims.slice(0, 6) : fallback.questionSheet.match(/^- .+/gm)?.slice(0, 4) || [],
      objections: zh
        ? ["哪些内容是公告叙事，哪些是可核查事实？", "适用范围、语言、地区、设备限制在哪里？"]
        : ["Which parts are announcement framing, and which are checkable facts?", "Where are the limits of availability, language, region, or device support?"],
      terms: inferRebuildTerms(sourceText),
      toneStyle: styleMoves.length ? styleMoves.slice(0, 5) : [zh ? "复用写作动作，不复用原句。" : "Reuse writing moves, not original sentences."],
    },
  });

  const docMap = [
    `# DocMap: ${title}`,
    "",
    zh ? "## 主线" : "## Through-line",
    fallback.docMap.split(/\n+/).find((line) => line && !line.startsWith("#")) || title,
    "",
    zh ? "## 来源结构" : "## Source Structure",
    ...roles,
    "",
    zh ? "## 证据摘录" : "## Evidence Quotes",
    ...(quotes.length ? quotes.map((quote) => `- ${quote}`) : [zh ? "- 待回到来源摘录。" : "- Return to the source for exact excerpts."]),
  ].join("\n");

  const claimQueue = [
    `# ${zh ? "事实核查队列" : "Claim Check Queue"}: ${title}`,
    "",
    ...(claims.length
      ? claims.map((claim, index) => `${index + 1}. [ ] ${claim}`)
      : fallback.claimQueue.split("\n").filter(Boolean).slice(2)),
  ].join("\n");

  const styleNotes = [
    `# ${zh ? "风格笔记" : "Style Notes"}: ${title}`,
    "",
    ...(styleMoves.length ? styleMoves.map((move) => `- ${move}`) : [zh ? "- 模型未提取到足够风格动作，使用规则版笔记。" : "- The model did not extract enough style moves; rule-based notes were kept."]),
    "",
    zh ? "## 复用提醒" : "## Reuse Notes",
    ...analyses.slice(0, 6).map((analysis) => `- **${analysis.sectionTitle}**: ${analysis.reuseAdvice}`),
  ].join("\n");

  const readme = [
    `# ${zh ? "这篇文章如何写成" : "How This Article Works"}`,
    "",
    zh
      ? "这份项目硬盘由本地模型从 DocMap 改写成写作对象包。它是学习对象，不是原作者真实草稿。"
      : "This Project Hard Disk was rebuilt by turning a DocMap into a writing object pack with the local model. It is a learning object, not the author's actual draft history.",
    "",
    zh ? "## 模型如何参与" : "## How The Model Was Used",
    zh ? "- 模型逐块判断写作功能、主张、问题、风格动作和复用建议。" : "- The model judged each block's writing role, claims, questions, style moves, and reuse advice.",
    zh ? "- 程序负责合并、去重、保存和质量检查。" : "- The system merged, deduplicated, saved, and quality-checked the result.",
    "",
    zh ? "## 查看顺序" : "## Inspect In This Order",
    zh ? "1. 先看 DocMap，理解来源结构。" : "1. Start with DocMap to understand the source structure.",
    zh ? "2. 再看 Question Sheet，确认可追问的问题和主张。" : "2. Then inspect Question Sheet for questions and claims.",
    zh ? "3. 用 Outline 和 Section Drafts 学习写作动作。" : "3. Use Outline and Section Drafts to study the writing moves.",
    zh ? "4. 最后用 Claim Queue 和 Style Notes 检查自己的改写。" : "4. Finish with Claim Queue and Style Notes when adapting the piece.",
  ].join("\n");

  const sectionNotes = sections.map((section, index) => {
    const analysis = analyses[index] || analyses[analyses.length - 1];
    return {
      title: section,
      body: [
        `# ${section}`,
        "",
        zh ? `段落作用：${analysis.writingRole}` : `Section role: ${analysis.writingRole}`,
        "",
        zh ? "可核查主张：" : "Claims to check:",
        ...(analysis.claims.length ? analysis.claims.map((claim) => `- ${claim}`) : [zh ? "- 待补充。" : "- Add manually."]),
        "",
        zh ? "来源摘录：" : "Source evidence:",
        ...(analysis.evidenceQuotes.length ? analysis.evidenceQuotes.map((quote) => `> ${quote}`) : [">"]),
        "",
        zh ? "复用方式：" : "Reuse advice:",
        analysis.reuseAdvice,
      ].join("\n"),
    };
  });

  return {
    ...fallback,
    title,
    sections: sections.length ? sections : fallback.sections,
    questionSheet,
    docMap,
    claimQueue,
    styleNotes,
    readme,
    sectionNotes: sectionNotes.length ? sectionNotes : fallback.sectionNotes,
    paragraphs: quotes.length ? quotes : fallback.paragraphs,
    modelBacked: true,
  };
}

async function buildRebuildArtifactsWithModel(sourceText, onBlock = null) {
  const blocks = makeRebuildBlocks(sourceText);
  const analyses = [];
  const minSuccessfulBlocks = Math.min(2, blocks.length);
  for (const [index, block] of blocks.entries()) {
    onBlock?.(index, blocks.length, block);
    try {
      analyses.push(await analyzeRebuildBlockWithModel(block, index, blocks.length));
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.warn("Rebuild block model analysis failed.", block.title, error);
    }
  }
  if (analyses.length < minSuccessfulBlocks) {
    throw new Error("model_blocks_insufficient");
  }
  const fallback = buildRebuildArtifacts(sourceText);
  return requireReliableRebuildArtifacts(buildRebuildArtifactsFromBlockAnalyses(sourceText, analyses), fallback);
}

const rebuildFlowStepOrder = ["scan", "plan", "model", "project", "done"];

function rebuildFlowStepLabels() {
  return {
    scan: t("rebuild_step_scan"),
    plan: t("rebuild_step_plan"),
    model: t("rebuild_step_model"),
    project: t("rebuild_step_project"),
    done: t("rebuild_step_done"),
  };
}

function rebuildFlowStatusLabel(status) {
  const labels = {
    pending: t("rebuild_step_pending"),
    running: t("rebuild_step_running"),
    complete: t("rebuild_step_complete"),
    skipped: t("rebuild_step_skipped"),
  };
  return labels[status] || labels.pending;
}

function createRebuildProgressState() {
  return Object.fromEntries(rebuildFlowStepOrder.map((step) => [step, "pending"]));
}

let rebuildFlowProgressState = createRebuildProgressState();
let rebuildFlowRunningFraction = 0;
let rebuildFlowLastProgressAt = 0;

function renderRebuildProgress() {
  if (!rebuildFlowStepsEl || !rebuildFlowProgressBarEl) return;
  const labels = rebuildFlowStepLabels();
  const completed = rebuildFlowStepOrder.filter((step) =>
    ["complete", "skipped"].includes(rebuildFlowProgressState[step])
  ).length;
  const running = rebuildFlowStepOrder.some((step) => rebuildFlowProgressState[step] === "running");
  const percent = Math.round(((completed + (running ? rebuildFlowRunningFraction : 0)) / rebuildFlowStepOrder.length) * 100);
  rebuildFlowProgressBarEl.style.width = `${percent}%`;
  rebuildFlowProgressBarEl.parentElement?.setAttribute("aria-valuenow", String(percent));
  rebuildFlowProgressBarEl.parentElement?.classList.toggle("is-working", running);
  rebuildFlowStepsEl.innerHTML = rebuildFlowStepOrder.map((step) => {
    const status = rebuildFlowProgressState[step] || "pending";
    return `
      <li class="is-${escapeHtml(status)}">
        <b>${escapeHtml(labels[step] || step)}</b>
        <span>${escapeHtml(rebuildFlowStatusLabel(status))}</span>
      </li>
    `;
  }).join("");
}

function setRebuildProgress(step, status, message = "") {
  rebuildFlowProgressState = { ...rebuildFlowProgressState, [step]: status };
  rebuildFlowRunningFraction = status === "running" ? 0.12 : 0;
  renderRebuildProgress();
  if (message && rebuildFlowStatusEl) rebuildFlowStatusEl.textContent = message;
  if (message) setStatus(message);
}

function updateRebuildModelProgress(chars = 0) {
  const count = Math.max(0, Number(chars) || 0);
  const now = Date.now();
  if (now - rebuildFlowLastProgressAt < 260 && count % 500 > 40) return;
  rebuildFlowLastProgressAt = now;
  rebuildFlowRunningFraction = Math.max(0.2, Math.min(0.86, 0.2 + count / 7000));
  renderRebuildProgress();
  const message = t("rebuild_pack_receiving", count);
  if (rebuildFlowStatusEl) rebuildFlowStatusEl.textContent = message;
  setStatus(message);
}

function resetRebuildProgress() {
  rebuildFlowProgressState = createRebuildProgressState();
  rebuildFlowRunningFraction = 0;
  rebuildFlowLastProgressAt = 0;
  renderRebuildProgress();
}

function delayRebuildFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function scanRebuildSource(sourceText) {
  const paragraphs = getRebuildParagraphs(sourceText);
  const sections = inferRebuildSections(sourceText, inferRebuildTitle(sourceText));
  const quotes = (sourceText.match(/[“"][^”"]{16,260}[”"]/g) || []).slice(0, 8);
  const footnotes = (sourceText.match(/(?:\[\d+\]|\^\{\d+\}|\n\s*\d+\.)/g) || []).length;
  return {
    paragraphCount: paragraphs.length,
    sectionCount: sections.length,
    quoteCount: quotes.length,
    footnoteCount: footnotes,
  };
}

function createRebuiltProjectFromArtifacts(artifacts, sourceLabel) {
  const project = createProjectRecord(rebuildProjectDiskName(artifacts.title));
  projects.unshift(project);
  mountProject(project);
  closeProjectScopedWindows();

  const now = new Date().toISOString();
  const folder = ensureFolder(t("rebuild_folder_name"), null);

  project.questionSheet = artifacts.questionSheet;
  if (artifacts.outlineMarkdown) {
    setProjectOutlineMarkdown(project, artifacts.outlineMarkdown);
  } else {
    setProjectOutlineSections(project, artifacts.sections);
  }
  project.drafts = artifacts.sectionNotes.map((note) => ({
    id: crypto.randomUUID(),
    title: note.title,
    sectionTitle: note.title,
    sourceType: "rebuild-flow",
    sourceOutlineSection: note.title,
    sourceMarkdown: note.body,
    usedClips: [],
    body: note.body,
    createdAt: now,
    updatedAt: now,
    insertedAt: null,
    insertedFileId: null,
    insertedFileName: "",
  }));
  selectedDraftIndex = project.drafts.length ? 0 : -1;
  project.flowState = {
    topic: true,
    research: true,
    outline: true,
    drafting: true,
    check: false,
  };
  project.rebuildFlow = {
    title: artifacts.title,
    sourceLabel,
    rebuiltAt: now,
    modelBacked: artifacts.modelBacked === true,
  };

  artifacts.paragraphs.slice(0, 2).forEach((paragraph, index) => {
    const scrap = createScrap(
      `${artifacts.title} ${currentLanguage === "zh" ? "还原摘录" : "Rebuild Seed"} ${index + 1}`,
      [
        currentLanguage === "zh" ? "从成品文章提取，用来学习结构：" : "Extracted from a finished article for structure study:",
        "",
        paragraph,
        "",
        "---",
        `Source: ${artifacts.title}`,
        `Time: ${new Date(now).toLocaleString()}`,
      ].join("\n"),
      {
        reveal: false,
        selectedText: paragraph,
        source: {
          type: "rebuild-flow",
          title: artifacts.title,
          capturedAt: now,
        },
      }
    );
    if (scrap) scrap.tags = [...new Set([...(scrap.tags || []), "rebuild-flow"])];
  });

  createRebuildDocument(project, folder, t("rebuild_docmap_name"), artifacts.docMap, "note");
  if (artifacts.packMarkdown) {
    createRebuildDocument(project, folder, "Writing Object Pack.md", artifacts.packMarkdown, "ai");
  }
  createRebuildDocument(project, folder, t("rebuild_claims_name"), artifacts.claimQueue, "ai");
  createRebuildDocument(project, folder, t("rebuild_style_name"), artifacts.styleNotes, "note");
  const readmeFile = createRebuildDocument(project, folder, t("rebuild_readme_name"), artifacts.readme, "note");
  selectedChatFileId = readmeFile.id;

  project.updatedAt = now;
  scheduleWorkspaceRender({ projectReferences: true, mountedTextDisk: true, menuState: true });
  resetAssistantForProject(project.name);
  loadActiveProjectReferences();
  saveDeskState();
  return project;
}

async function runRebuildFlow() {
  const sourceText = rebuildFlowSourceInput?.value.trim() || "";
  if (!sourceText) {
    if (rebuildFlowStatusEl) rebuildFlowStatusEl.textContent = t("rebuild_need_source");
    return;
  }
  if (sourceText.length < rebuildMinSourceChars) {
    if (rebuildFlowStatusEl) rebuildFlowStatusEl.textContent = t("rebuild_source_too_short");
    return;
  }

  let artifacts = null;
  let sourceDocMap = null;
  if (!beginLongTask("rebuild-flow", t("rebuild_modeling"))) return;
  resetRebuildProgress();
  try {
    setRebuildProgress("scan", "running", t("rebuild_scanning"));
    scanRebuildSource(sourceText);
    await delayRebuildFrame();
    setRebuildProgress("scan", "complete");

    setRebuildProgress("plan", "running", t("rebuild_planning"));
    // The rebuild flow models, inspects and shows a DocMap, so the lazy tool
    // has to be present before any of those three run.
    await ensureDocMapModule();
    const sourceLabel = rebuildFlowSourceInput.dataset.sourceLabel || t("rebuild_pasted_source");
    sourceDocMap = await buildDocMapWithModel({
      text: sourceText,
      label: sourceLabel,
      scope: "rebuildFlow",
      threshold: rebuildMinSourceChars,
    });
    if (!docMapHasMinimumHierarchy(sourceDocMap.nodes, sourceDocMap.edges)) {
      throw new Error("rebuild_docmap_quality_gate");
    }
    showDocMap(sourceDocMap, { focus: true, statusMessage: t("rebuild_docmap_visible") });
    await delayRebuildFrame();
    setRebuildProgress("plan", "complete");

    setRebuildProgress("model", "running", t("rebuild_model_enhancing"));
    artifacts = await buildRebuildWritingObjectPackWithModel(sourceText, sourceDocMap);
    setRebuildProgress("model", "complete");

    setRebuildProgress("project", "running", t("rebuild_creating_project"));
    const project = createRebuiltProjectFromArtifacts(artifacts, sourceLabel);
    await delayRebuildFrame();
    setRebuildProgress("project", "complete");
    setRebuildProgress("done", "complete");

    const cancelled = endLongTask("rebuild-flow");
    if (cancelled) return;

    openWindow("questionSheet");
    focusWindow(getWindow("questionSheet"));
    const message = artifacts.modelBacked
      ? t("rebuild_complete_model", project.name, artifacts.sections.length)
      : t("rebuild_complete", project.name, artifacts.sections.length);
    if (rebuildFlowStatusEl) rebuildFlowStatusEl.textContent = message;
    setStatus(message);
  } catch (error) {
    if (isAbortError(error)) {
      endLongTask("rebuild-flow");
      return;
    }
    console.warn("Rebuild Writing Objects model pass failed.", error);
    const message = t("rebuild_model_failed", error.message || "");
    if (rebuildFlowStatusEl) rebuildFlowStatusEl.textContent = message;
    setStatus(message);
    endLongTask("rebuild-flow");
    return;
  }
}

function getReaderClipSummaries(limit = 6) {
  return getProjectScraps()
    .filter((scrap) => scrap.source?.type === "reader-clip" || scrap.tags?.includes("reader-clip"))
    .slice(0, limit)
    .map((scrap, index) => ({
      id: scrap.id,
      ref: `C${index + 1}`,
      title: scrap.title || `${t("reader")} ${index + 1}`,
      url: scrap.source?.url || "",
      site: scrap.source?.site || "",
    }));
}

function getReaderClipOutlineContext(limit = 6000) {
  const clips = getProjectScraps()
    .filter((scrap) => scrap.source?.type === "reader-clip" || scrap.tags?.includes("reader-clip"))
    .slice(0, 12);
  if (!clips.length) return "";

  return takeWithinBudget(
    clips,
    limit,
    (scrap, index) => [
      `[C${index + 1}] ${scrap.title}`,
      scrap.source?.site ? `Site: ${scrap.source.site}` : "",
      scrap.source?.url ? `URL: ${scrap.source.url}` : "",
      scrap.selectedText || scrap.body,
      scrap.context?.before || scrap.context?.after
        ? `Context: ${[scrap.context.before, scrap.context.after].filter(Boolean).join(" ... ")}`
        : "",
    ].filter(Boolean).join("\n")
  ).join("\n\n");
}

function validateSectionDraftContent(markdown) {
  const content = stripRebuildMarkdownFence(markdown).trim();
  if (!content) return "";
  const forbiddenTemplate = /(?:核心卖点|事实支撑|观众在意点|营销政策|购买门槛|数据准确性|下一步|资料补充)/;
  const bulletLines = content.split("\n").filter((line) => /^\s*[-*+]\s+/.test(line)).length;
  const paragraphs = content.split(/\n\s*\n+/).filter((block) => block.replace(/^#+\s+/, "").trim().length > 40);
  if (forbiddenTemplate.test(content) || (bulletLines >= 4 && paragraphs.length < 2)) {
    throw new Error(currentLanguage === "zh"
      ? "章节草稿像大纲/卖点清单，不是可朗读口播。"
      : "Section draft looks like an outline or selling-points list, not spoken copy.");
  }
  return content;
}

async function draftOutlineSection(sectionTitle) {
  const project = getActiveProject();
  if (!project) return;
  const context = currentSectionDraftContext({ ensureDraft: true, seedBody: true });
  if (!context) {
    setStatus(t("section_draft_needs_section"));
    openWindow("outline");
    return;
  }
  const cleanSectionTitle = String(sectionTitle || context.title || "").trim() || t("manual_draft_title");
  if (!beginLongTask("draft-section", t("drafting_section", cleanSectionTitle))) return;

  openWindow("sectionDrafts");

  let content = "";
  try {
    await prepareStreamingMarkdownPreview();
    const questionSheet = (project.questionSheet || "").trim();
    const query = [questionSheet, context.outlineMarkdown || context.outlineBody || cleanSectionTitle].filter(Boolean).join("\n\n");
    const projectContext = await buildBudgetedProjectContext(query, { taskKind: "draft-section" });
    const prompt = `${resolveWritingRoutePrompt("writing-route.section-draft")}

QUESTION SHEET:
${questionSheet || "No Question Sheet provided."}

PROJECT CONTEXT:
${projectContext || "No relevant project context selected yet."}

CURRENT SECTION:
${cleanSectionTitle}

SECTION OUTLINE:
${context.outlineMarkdown || context.outlineBody || cleanSectionTitle}`;
    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: 0.55,
      ai_system6_task_kind: "draft-section",
      stream: true,
    }, getLongTaskSignal());

    const streamedContent = await readModelTextStream(response, {
      signal: getLongTaskSignal(),
      throttleMs: 120,
      onSnapshot: (markdown) => showStreamingSurfacePreview("sectionDrafts", stripRebuildMarkdownFence(markdown)),
    });
    content = stripRebuildMarkdownFence(streamedContent || "").trim();
    content = validateSectionDraftContent(content);
    if (content) showStreamingSurfacePreview("sectionDrafts", content, { final: true });
  } catch (error) {
    if (!isAbortError(error)) {
      console.error("Drafting failed", error);
      content = "";
      setStatus(error?.message || t("ready"));
    }
  } finally {
    endLongTask("draft-section");
  }

  if (!content) {
    setStatus(t("ready"));
    return;
  }

  const applied = await confirmAndApplySectionDraft(content, "draft_replace_confirm", "section_draft_ai_drafted");
  if (applied) {
    const contextAfterDraft = currentSectionDraftContext({ ensureDraft: true });
    if (contextAfterDraft?.draft) {
      contextAfterDraft.draft.usedClips = getReaderClipSummaries();
      saveDeskState();
      renderPipeline();
    }
  }
}

function addOutlineSection() {
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  const nextSection = nextOutlineSectionName(project);
  const currentMarkdown = currentOutlineMarkdown(project).trimEnd();
  const nextMarkdown = `${currentMarkdown}${currentMarkdown ? "\n\n" : ""}## ${nextSection}`;
  const outlineSections = setProjectOutlineMarkdown(project, nextMarkdown);
  project.flowState = { ...(project.flowState || {}), outline: getMeaningfulOutlineSections(outlineSections).length > 0 };
  project.updatedAt = new Date().toISOString();
  saveDeskState();
  renderPipeline();
  openWindow("outline");
  setStatus(t("outline_section_added"));

  requestAnimationFrame(() => {
    if (!outlineContentEl) return;
    outlineContentEl.focus();
    const start = outlineContentEl.value.lastIndexOf(nextSection);
    if (start >= 0) outlineContentEl.setSelectionRange(start, start + nextSection.length);
  });
}

function selectedOutlineSectionTitle() {
  const project = getActiveProject();
  if (!project) return "";

  return selectedOutlineDraftBlock(project)?.title || "";
}

function draftSelectedOutlineSection() {
  const sectionBlock = selectedOutlineDraftBlock();
  const sectionTitle = sectionBlock?.title || "";
  if (!sectionTitle) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }
  ensureDraftForOutlineBlock(sectionBlock, { seedBody: true });
  renderPipeline();
  draftOutlineSection(sectionTitle);
}

function createManualSectionDraft() {
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  if (!project.drafts) project.drafts = [];
  const now = new Date().toISOString();
  const sectionTitle = selectedOutlineSectionTitle();
  const title = isPlaceholderOutlineSection(sectionTitle) ? t("manual_draft_title") : sectionTitle;
  project.drafts.push({
    id: crypto.randomUUID(),
    title,
    sectionTitle: title,
    sourceType: "manual",
    sourceOutlineSection: sectionTitle || "",
    usedClips: [],
    body: "",
    createdAt: now,
    updatedAt: now,
    insertedAt: null,
    insertedFileId: null,
    insertedFileName: "",
  });
  selectedDraftIndex = project.drafts.length - 1;
  project.flowState = { ...(project.flowState || {}), drafting: true };
  project.updatedAt = now;
  saveDeskState();
  updateFlowGuideChecklist({ render: false });
  renderPipeline();
  openWindow("sectionDrafts");
  setStatus(t("section_draft_created"));
  requestAnimationFrame(() => draftTitleInput?.focus());
}

function savePipelineData() {
  const project = getActiveProject();
  if (!project) return;

  project.questionSheet = questionSheetBodyInput.value;
  if (questionCountEl) questionCountEl.textContent = t("questions_count", countQuestionSheetQuestions(project.questionSheet || ""));
  updateQuestionSheetManuscriptTitle(project);
  let outlineSections;
  const sourceSurface = resolvePipelineSourceSurface(project);
  if (sourceSurface === "draft" && selectedDraftIndex >= 0 && project.drafts?.[selectedDraftIndex]) {
    outlineSections = updateProjectOutlineFromSelectedDraft(project);
  } else if (sourceSurface === "manuscript" && manuscriptOwnsDocument()) {
    // A route manuscript is just the Outline document seen as prose. If its link
    // flag drifted (tab switch, saved copy, AI-assist state) the live sync was
    // gated off and the Outline froze on the previous article; re-link so the
    // edits the user actually made reach project.outline at command time. This
    // covers both the drafting and the finalized (review) manuscript.
    project.manuscriptLinkedToOutline = true;
    outlineSections = setProjectOutlineMarkdown(project, teachTextBodyInput.value);
    syncDraftsFromProjectOutline(project);
    syncOutlineDomFromProject(project);
  } else {
    outlineSections = setProjectOutlineMarkdown(project, currentOutlineMarkdown(project));
    syncDraftsFromProjectOutline(project);
    syncLinkedTeachTextFromProject(project);
    syncDraftDomFromProject(project);
  }

  // Save current draft if editing
  if (selectedDraftIndex >= 0 && project.drafts?.[selectedDraftIndex]) {
    const draft = project.drafts[selectedDraftIndex];
    const title = draftTitleInput?.value.trim() || draft.title || draft.sectionTitle || t("manual_draft_title");
    draft.title = title;
    if (!draft.sectionTitle || draft.sourceType === "manual") draft.sectionTitle = title;
    if (document.activeElement === draftBodyInput) draft.body = draftBodyInput.value;
    draft.updatedAt = new Date().toISOString();
  }

  project.flowState = {
    ...(project.flowState || {}),
    topic: !!project.questionSheet.trim(),
    outline: getMeaningfulOutlineSections(outlineSections).length > 0,
    drafting: (project.drafts || []).some((draft) => (draft.body || draft.title || "").trim()),
  };
  project.updatedAt = new Date().toISOString();
  saveDeskState();
  updateFlowGuideChecklist({ render: false });
}

function getQuestionSheetTemplate() {
  return buildQuestionSheetTemplate();
}

function insertQuestionTemplate() {
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  const template = getQuestionSheetTemplate();
  const existing = questionSheetBodyInput.value.trim();
  questionSheetBodyInput.value = existing ? `${existing}\n\n---\n\n${template}` : template;
  project.questionSheet = questionSheetBodyInput.value;
  project.flowState = { ...(project.flowState || {}), topic: true };
  project.updatedAt = new Date().toISOString();
  saveDeskState();
  renderPipeline();
  openWindow("questionSheet");
  questionSheetBodyInput.focus();
  setStatus(t("question_template_inserted"));
}

function updateFlowGuideChecklist({ render = true } = {}) {
  const project = getActiveProject();
  if (!project) {
    renderFlowProgress(null);
    return;
  }

  const progress = getFlowProgress(project);
  project.flowState = { ...progress.states };
  renderFlowProgress(project, progress);

  if (render) renderPipeline();
}
