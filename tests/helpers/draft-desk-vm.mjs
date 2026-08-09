import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { read } from "./feature-test-harness.mjs";

const sourcePaths = [
  "app/data/draft-desk-presets.js",
  "app/core/adjustment-layers.js",
  "app/core/protected-ranges.js",
  "app/core/text-compose.js",
  "app/core/grain-diff.js",
  "app/core/quick-draft-workspace.js",
  "app/features/draft-desk.js",
  "app/features/quick-draft-intake.js",
  "app/features/quick-draft-editor.js",
  "app/features/quick-draft-composition.js",
  "app/features/quick-draft-ai.js",
  "app/features/quick-draft-handoff.js",
];

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toggle: (name, force) => {
      const next = force === undefined ? !values.has(name) : Boolean(force);
      if (next) values.add(name);
      else values.delete(name);
      return next;
    },
    values: () => [...values],
  };
}

function control(id = "") {
  return {
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    open: false,
    checked: false,
    scrollTop: 0,
    selectionStart: 0,
    selectionEnd: 0,
    selectionDirection: "none",
    dataset: {},
    classList: classList(),
    style: { setProperty: () => {}, removeProperty: () => {} },
    isConnected: true,
    offsetParent: {},
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name] ?? null; },
    removeAttribute(name) { delete this[name]; },
    addEventListener: () => {},
    removeEventListener: () => {},
    append: () => {},
    prepend: () => {},
    replaceChildren: () => {},
    remove: () => {},
    click: () => {},
    dispatchEvent: () => true,
    focus() { this.__focused = true; },
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    setSelectionRange(start, end, direction = "none") {
      this.selectionStart = start;
      this.selectionEnd = end;
      this.selectionDirection = direction;
    },
  };
}

export function createDraftDeskVm() {
  const sources = sourcePaths.map((path) => read(path));
  const coordinator = sources[sourcePaths.indexOf("app/features/draft-desk.js")];
  const ids = [...coordinator.matchAll(/refs\.\w+ = \$\("([^"]+)"\)/g)].map((match) => match[1]);
  const controls = new Map(ids.map((id) => [id, control(id)]));
  const form = controls.get("quick-draft-form");
  const draft = controls.get("quick-draft-draft");
  const editorContainer = control("quick-draft-editor-container");
  draft.closest = (selector) => selector === ".teachtext-editor-container" ? editorContainer : null;
  const intakeWell = control("quick-draft-intake-well");
  const bodySurface = control("quick-draft-body-surface");
  const quickDraftWindow = control("quick-draft-window");
  quickDraftWindow.classList.add("is-active");

  form.querySelector = (selector) => {
    if (selector === ".draft-desk-drawer-close") return control("drawer-close");
    return null;
  };
  form.querySelectorAll = () => [];

  const documentStub = {
    activeElement: null,
    body: { append: () => {}, dataset: {}, classList: classList() },
    getElementById: (id) => controls.get(id) || null,
    querySelector: (selector) => {
      if (selector === "[data-quick-draft-intake-well]") return intakeWell;
      if (selector === "[data-quick-draft-body-surface]") return bodySurface;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: (tag = "div") => control(tag),
  };

  let context;
  context = vm.createContext({
    AbortController,
    Blob,
    Event,
    TextEncoder,
    Uint8Array,
    URL,
    console,
    crypto: webcrypto,
    document: documentStub,
    navigator: { userAgent: "node" },
    structuredClone,
    window: {},
    requestAnimationFrame: (callback) => { callback(); return 1; },
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ display: "block" }),
    setTimeout,
    clearTimeout,
    currentLanguage: "zh",
    activeProjectId: "",
    activeProject: null,
    projects: [],
    chatFolders: [],
    chatFiles: [],
    selectedChatFileId: null,
    activeTextFileId: null,
    mountedTextDisk: null,
    cloudConfig: undefined,
    modelInput: { value: "local-model" },
    endpointInput: { value: "" },
    getActiveProject: () => context.activeProject,
    getLocalModelRequestName: () => "local-model",
    cloudCredentialReady: () => false,
    cloudCredentialTransportFields: () => ({}),
    sendLocalModelTask: (...args) => context.modelResponder(...args),
    modelResponder: async () => ({ text: "{}" }),
    saveDeskState: async () => {
      context.persistedStatuses.push(context.projects.map((project) => project.quickDraft?.workspace?.savedStatus || ""));
      if (context.persistDeferred) return context.persistDeferred.promise;
      return context.persistSucceeds !== false;
    },
    persistSucceeds: true,
    persistDeferred: null,
    persistedStatuses: [],
    registerWorkingSessionAdapter: (adapter) => { context.workingSessionAdapter = adapter; },
    captureTextControlWorkingSession: (target) => ({
      selectionStart: target?.selectionStart || 0,
      selectionEnd: target?.selectionEnd || 0,
      selectionDirection: target?.selectionDirection || "none",
      scrollTop: target?.scrollTop || 0,
      focused: documentStub.activeElement === target,
    }),
    restoreTextControlWorkingSession: (target, state = {}) => {
      target.scrollTop = Number(state.scrollTop) || 0;
      target.setSelectionRange(Number(state.selectionStart) || 0, Number(state.selectionEnd) || 0, state.selectionDirection || "none");
      if (state.focused) {
        documentStub.activeElement = target;
        target.focus();
      }
    },
    t: (key, ...args) => args.length ? `${key}:${args.join(",")}` : key,
    getWindow: (name) => name === "quickDraft" ? quickDraftWindow : null,
    openWindow: async () => true,
    closeWindow: async () => true,
    maximizeWindow: () => {},
    showSystemModal: async () => "yes",
    createDocumentRevision: async () => ({}),
    formatReviewVoiceStats: null,
    markdownToSystemHtml: (text) => String(text || ""),
    escapeHtml: (text) => String(text || ""),
    attachMarkdownEditor: () => {},
    attachMarkdownHighlight: () => {},
    initSystemSelectControls: () => {},
    refreshSystemSelectControls: () => {},
    syncRovingTabStops: () => {},
    updateMenuState: () => {},
    setControlLoading: () => {},
    serviceErrorDetail: (error) => error?.message || String(error || ""),
    writeClipboardText: async () => true,
    downloadTextFile: () => true,
    renderDocuments: () => {},
    renderProjectDisks: () => {},
    ensureFolder: (name) => {
      let folder = context.chatFolders.find((item) => item.projectId === context.activeProjectId && item.name === name);
      if (!folder) {
        folder = { id: `folder-${context.chatFolders.length + 1}`, projectId: context.activeProjectId, name, parentId: null };
        context.chatFolders.push(folder);
      }
      return folder;
    },
    nextAvailableProjectFileName: (title) => title,
    isInActiveProject: (item) => item?.projectId === context.activeProjectId,
    openTextFile: () => {},
    setReviewDeskMode: () => {},
    reviewDeskBodyInput: control("review-desk-body"),
    reviewDeskPreviewEl: control("review-desk-preview"),
    reviewDeskEmptyNoteEl: control("review-desk-empty"),
    reviewDeskDirty: false,
    syncReviewDeskPreview: () => {},
    updateReviewDeskStats: () => {},
    pushSystemNotification: (message) => { context.notifications.push(message); return "notification-1"; },
    notifications: [],
  });
  context.window.AISystem6TeachText = {
    openDocument: (documentId) => { context.teachTextDocumentId = documentId; return true; },
  };
  context.window.AISystem6ReviewDesk = {
    openDocument: async (options) => { context.reviewDeskOpenOptions = structuredClone(options); return true; },
  };
  context.window.AISystem6ModelTaskRuntime = { buildQuickDraftMessages: () => [] };
  context.window.AISystem6LocalLMStudio = {
    parseJsonText: (text) => { try { return JSON.parse(text); } catch { return {}; } },
  };

  const exports = `
    window.__draftDeskTest = {
      collectRefs,
      requestQuickDraft,
      captureWorkingSession,
      restoreWorkingSession,
      currentQuickDraftDisplayMode,
      setQuickDraftDisplayMode,
      updateAdjustmentLayer,
      moveAdjustmentLayer,
      protectSelectionFromTextarea,
      scopeSelectionToLayer,
      persistQuickDraftWorkspace,
      commitQuickDraft,
      commitQuickDraftForProject,
      activeProjectQuickDraft,
      projectQuickDraft,
      renderQuickDraft,
      commitQuickDraftProjectDocument,
      saveQuickDraftAsProjectDocument,
      transferQuickDraftToTeachText,
      sendQuickDraftToReviewDesk,
      requestQuickDraft,
      requestMingmingQuickDraft,
      applyAdjustmentLayers,
      developAdjustmentLayers,
      createQuickDraftAsyncTask,
      quickDraftContextSnapshot,
      inferStrategySignals,
    };
  `;
  vm.runInContext(`${sources.join("\n")}\n${exports}`, context);
  context.window.__draftDeskTest.collectRefs();

  function setActiveProject(id) {
    context.activeProjectId = id;
    context.activeProject = context.projects.find((project) => project.id === id) || null;
    if (!context.activeProject) return;
    const record = context.normalizeQuickDraftRecord(context.activeProject.quickDraft);
    context.activeProject.quickDraft = record;
    controls.get("quick-draft-title-input").value = record.workspace.title;
    controls.get("quick-draft-format").value = record.targetFormat;
    controls.get("quick-draft-duration").value = record.targetDuration;
    controls.get("quick-draft-say").value = record.workspace.body;
    controls.get("quick-draft-sources").value = record.pastedSources;
    draft.value = record.workspace.body;
    draft.selectionStart = 0;
    draft.selectionEnd = 0;
    draft.selectionDirection = "none";
  }

  function addProject(id, body = "", workspacePatch = {}) {
    const project = {
      id,
      name: id,
      quickDraft: context.normalizeQuickDraftRecord({
        stage: body ? "draft" : "brief",
        workspace: {
          ...context.blankQuickDraftWorkspace(),
          title: body ? `${id} title` : "",
          body,
          ...workspacePatch,
        },
      }),
    };
    context.projects.push(project);
    if (!context.activeProject) setActiveProject(id);
    return project;
  }

  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  }

  return {
    addProject,
    context,
    controls,
    deferred,
    document: documentStub,
    editorContainer,
    form,
    setActiveProject,
    testApi: context.window.__draftDeskTest,
  };
}
