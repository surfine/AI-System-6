// Static runtime configuration for AI System 6. Keep DOM behavior in app.js.
window.AISystem6Perf = (() => {
  const buckets = new Map();
  const slowEvents = [];
  const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

  function record(name, durationMs = 0, meta = {}) {
    const duration = Math.max(0, Number(durationMs) || 0);
    if (!buckets.has(name)) buckets.set(name, { samples: [], count: 0, total: 0 });
    const bucket = buckets.get(name);
    bucket.count += 1;
    bucket.total += duration;
    bucket.samples.push(duration);
    if (bucket.samples.length > 80) bucket.samples.shift();
    if (duration >= 80 || meta.slow) {
      slowEvents.push({ name, duration, meta, at: new Date().toISOString() });
      if (slowEvents.length > 20) slowEvents.shift();
    }
    return duration;
  }

  function start(name, meta = {}) {
    const startedAt = now();
    return (extra = {}) => record(name, now() - startedAt, { ...meta, ...extra });
  }

  function summary(name) {
    const bucket = buckets.get(name);
    if (!bucket) return null;
    const sorted = [...bucket.samples].sort((a, b) => a - b);
    const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] || 0;
    return {
      count: bucket.count,
      p50: percentile(0.5),
      p95: percentile(0.95),
      last: bucket.samples[bucket.samples.length - 1] || 0,
    };
  }

  return {
    record,
    start,
    summary,
    slowEvents: () => [...slowEvents],
  };
})();

window.AISystem6Config = (() => {
  const legacyDefaultClioTalkSystemPrompt = "You are ClioTalk, the concise, thoughtful AI voice inside AI System 6. AI System 6 is a source-first local AI writing desktop for turning sources, judgment, feeling, and the writer's own language into work that a real recipient can receive. It is not a chat page, a retro skin, a model name, or a product from a model vendor. Explain the desk through visible writing objects: Project Hard Disk, File Floppy, Reader, Scrapbook, Question Sheet, Outline, Section Drafts, TeachText, Review Desk, and Project CD. Preserve rough human input when it carries voice or judgment; do not turn the writer into a model mouthpiece. Prefer fewer, clearer handoff steps over more output; do not create pressure by multiplying drafts, variants, or tasks unless the user asks. Be useful, calm, and direct.";
  const previousDefaultClioTalkSystemPrompt = "You are ClioTalk inside AI System 6: a calm writing companion for turning sources, judgment, feeling, and the writer's own language into work a real recipient can receive. Preserve rough human voice; do not turn the writer into a model mouthpiece. Avoid AI-flavored filler, inflated significance, promotional polish, vague authority, and generic uplift. Keep help concrete, low-pressure, and oriented to the visible writing objects on the desk.";
  const defaultClioTalkSystemPrompt = () => window.AISystem6PromptFilesRuntime?.resolvePromptFile("cliotalk.main", null, "en").body || "";
  const legacyClioTalkSystemPrompts = Object.freeze([
    legacyDefaultClioTalkSystemPrompt,
    previousDefaultClioTalkSystemPrompt,
  ]);

  const defaultAppVersionInfo = Object.freeze({
    version: "1.0.2",
    build: "20260729.3",
  });

  const nativeProductDecision = Object.freeze({
    trackKey: "product_track_value",
    targetKey: "native_target_value",
    boundaryKey: "prototype_boundary_value",
    nativeStatus: "native-first beta",
    currentRuntime: "local web beta",
  });

  const defaultWindowViewModes = Object.freeze({
    finder: "icon",
    helpFolder: "icon",
    applications: "icon",
    disk: "icon",
    documents: "icon",
    projects: "icon",
    imageManager: "icon",
  });

  const memoryCardPairs = Object.freeze([
    { key: "apple-ii", name: "Apple II", color: "blue", icon: "apple-ii" },
    { key: "lisa", name: "Lisa", color: "blue", icon: "lisa" },
    { key: "mac-128k", name: "Macintosh 128K", color: "blue", icon: "mac-128k" },
    { key: "mac-portable", name: "Macintosh Portable", color: "green", icon: "mac-portable" },
    { key: "powerbook-100", name: "PowerBook 100", color: "green", icon: "powerbook-100" },
    { key: "newton", name: "Newton MessagePad", color: "green", icon: "newton" },
    { key: "quicktake", name: "QuickTake", color: "green", icon: "quicktake" },
    { key: "laserwriter", name: "LaserWriter", color: "yellow", icon: "laserwriter" },
    { key: "applecd-sc", name: "AppleCD SC", color: "yellow", icon: "applecd-sc" },
    { key: "keyboard", name: "Apple Keyboard", color: "yellow", icon: "keyboard" },
    { key: "adb-mouse", name: "ADB Mouse", color: "red", icon: "adb-mouse" },
    { key: "pippin", name: "Pippin", color: "red", icon: "pippin" },
  ]);

  const longTaskControlSelectors = Object.freeze([
    '[data-action="generate-outline"]',
    '[data-action="critique-outline"]',
    '[data-action="expand-outline"]',
    '[data-action="mingming-outline"]',
    '[data-action="reduce-outline"]',
    '[data-action="structure-outline"]',
    '[data-action="draft-selected-section"]',
    '[data-action="revise-draft"]',
    '[data-action="polish-draft"]',
    '[data-action="suggest-draft"]',
    '[data-action="run-claim-check"]',
    '[data-action="review-mingming-handoff"]',
    '[data-action="review-mingming-handoff-backstage"]',
    '[data-action="run-rebuild-flow"]',
    '[data-action="make-docmap"]',
    '[data-action="ai-print-to-slides"]',
    '[data-action="generate-marp-open-clio-stage"]',
    '[data-action="selection-look-up"]',
    '[data-action="selection-translate"]',
    "#translation-pad-translate",
    "#reader-docmap-button",
    "#teachtext-docmap",
    "#clipboard-docmap",
    "#teachtext-translate",
    "#teachtext-download-bilingual",
  ]);

  const storageConfig = Object.freeze({
    storageVersion: 2,
    indexedDbName: "ai-system-6-db",
    indexedDbVersion: 2,
    referenceStoreName: "projectReferences",
    keyvalStoreName: "keyval",
    projectsStoreName: "projects",
    scrapsStoreName: "scraps",
    trashStoreName: "trashItems",
    chatFoldersStoreName: "chatFolders",
    chatFilesStoreName: "chatFiles",
  });

  const projectConfig = Object.freeze({
    defaultProjectName: "Project Hard Disk",
    displayNameRewrites: Object.freeze([
      Object.freeze({
        pattern: new RegExp(`^${["示范", "项目"].join("")}\\s*-\\s*本地\\s*AI\\s*写作(\\s+\\d+)?$`, "u"),
        replacement: "AI 写作示例$1",
      }),
      Object.freeze({
        pattern: new RegExp(`^${["Demo", "Project"].join(" ")}\\s*-\\s*Local\\s+AI\\s+Writing(\\s+\\d+)?$`, "i"),
        replacement: "AI Writing Sample$1",
      }),
      Object.freeze({
        pattern: /^还原\s*-\s*AI System 6：一台为本地\s*AI\s*写作而生的小 Macintosh$/u,
        replacement: "还原 - AI System 6：一台为 AI 写作而生的小 Macintosh",
      }),
      Object.freeze({
        pattern: /^Rebuild\s*-\s*AI System 6: A Small Macintosh For Local AI Writing$/i,
        replacement: "Rebuild - AI System 6: A Small Macintosh For AI Writing",
      }),
    ]),
  });

  const docToolConfig = Object.freeze({
    docMapMinSelectionChars: 200,
    docMapMinDocumentChars: 800,
    dictionaryMaxSelectionChars: 160,
    defaultOutlineSection: "New Section",
  });

  const contextBudgetConfig = Object.freeze({
    maxCuratedContextItems: 3,
    maxReferenceChunks: 12,
    maxContextChars: 12000,
    maxContextItemChars: 1400,
    maxAttachedContextChars: 5000,
    maxPipelineReferenceChunks: 12,
    maxPipelineContextChars: 18000,
    contextCharsPerToken: 4,
    reservedOutputTokens: 1536,
    reservedSafetyTokens: 256,
    ragBudgetShare: 0.45,
  });

  const flowConfig = Object.freeze({
    stepOrder: Object.freeze(["topic", "research", "outline", "drafting", "check"]),
  });

  const windowManagementConfig = Object.freeze({
    tileableWindowNames: Object.freeze([
      "assistant",
      "teachText",
      "documents",
      "chatFile",
      "scrapbook",
      "applications",
      "projects",
      "reader",
      "timeMachine",
      "endfieldTerminal",
      "findPath",
      "questionSheet",
      "outline",
      "sectionDrafts",
      "reviewDesk",
      "docMap",
      "bureaucracyMeme",
      "clioStage",
      "liquidCover",
      "quickDraft",
      "cmfStudio",
      "soundscape",
      "imageManager",
      "systemHelp",
      "modelMeter",
      "notificationCenter",
      "projectCd",
      "importUtility",
      "printDirectory",
      "pageSetup",
    ]),
    resizableWindowNames: Object.freeze([
      // A window that can be sized shows the two scroll bar lanes whose corner
      // cell is the grow box. Dialogs and desk accessories have neither in
      // System 6 — they open at one size, so they are not listed here.
      "assistant",
      "teachText",
      "documents",
      "scrapbook",
      "applications",
      "finder",
      "helpFolder",
      "disk",
      "trash",
      "textDisk",
      "projects",
      "reader",
      "timeMachine",
      "questionSheet",
      "outline",
      "sectionDrafts",
      "reviewDesk",
      "docMap",
      "clioStage",
      "clioChart",
      "liquidCover",
      "quickDraft",
      "cmfStudio",
      "soundscape",
      "imageManager",
      "systemHelp",
      "projectCd",
    ]),
    assistantSidecarWindowNames: Object.freeze(["dictation", "translationPad", "importUtility", "rag"]),
  });

  return {
    defaultAppVersionInfo,
    nativeProductDecision,
    defaultWindowViewModes,
    memoryCardPairs,
    longTaskControlSelectors,
    storageConfig,
    defaultClioTalkSystemPrompt,
    legacyClioTalkSystemPrompts,
    legacyDefaultClioTalkSystemPrompt,
    projectConfig,
    docToolConfig,
    contextBudgetConfig,
    flowConfig,
    windowManagementConfig,
  };
})();

const lazyScriptPromises = new Map();

function lazyScriptUrl(src) {
  const build = window.AISystem6Config?.defaultAppVersionInfo?.build || "dev";
  return `${src}${src.includes("?") ? "&" : "?"}v=${encodeURIComponent(build)}`;
}

function resolveClassicScriptSource(src) {
  if (!window.AISystem6LegacyWebKit || !src.startsWith("app/")) return src;
  return `app/legacy/${src.slice("app/".length)}`;
}

function loadClassicScriptOnce(src) {
  const resolvedSrc = resolveClassicScriptSource(src);
  if (lazyScriptPromises.has(resolvedSrc)) return lazyScriptPromises.get(resolvedSrc);
  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-lazy-src="${CSS.escape(resolvedSrc)}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve(true);
      return;
    }
    const script = existing || document.createElement("script");
    script.src = lazyScriptUrl(resolvedSrc);
    script.dataset.lazySrc = resolvedSrc;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve(true);
    };
    script.onerror = () => {
      lazyScriptPromises.delete(resolvedSrc);
      reject(new Error(`Could not load ${resolvedSrc}`));
    };
    if (!existing) document.head.append(script);
  });
  lazyScriptPromises.set(resolvedSrc, promise);
  return promise;
}

let writingFlowLoadPromise = null;
let writingFlowHelpLoadPromise = null;
let systemConceptsLoadPromise = null;
let memoryCardsLoadPromise = null;
let alarmClockLoadPromise = null;
let bureaucracyMemeLoadPromise = null;
let printDirectoryLoadPromise = null;
let projectCdPrintLoadPromise = null;
let translationPadLoadPromise = null;
let dictionaryHelpLoadPromise = null;
let videoTranscriptLoadPromise = null;
let videoDocMapLoadPromise = null;
let slidesExportLoadPromise = null;
let clioStageLoadPromise = null;
let clioChartLoadPromise = null;
let liquidCoverLoadPromise = null;
let quickDraftLoadPromise = null;
let cmfStudioLoadPromise = null;
let soundscapeLoadPromise = null;
let endfieldTerminalLoadPromise = null;
let timeMachineLoadPromise = null;
let hkrrReviewLoadPromise = null;
let mingmingHandoffReviewLoadPromise = null;
let writingDemoLoadPromise = null;

async function ensureWritingFlowModule() {
  if (window.AISystem6WritingFlowLoaded) return true;
  writingFlowLoadPromise ||= loadClassicScriptOnce("app/content/rebuild-samples.js")
    .then(() => loadClassicScriptOnce("app/features/writing-flow.js"))
    .catch((error) => {
      writingFlowLoadPromise = null;
      throw error;
    });
  return writingFlowLoadPromise;
}

async function ensureWritingFlowHelpData() {
  if (window.AISystem6WritingFlowHelpData) return window.AISystem6WritingFlowHelpData;
  writingFlowHelpLoadPromise ||= loadClassicScriptOnce("app/data/writing-flow-help.js")
    .then(() => window.AISystem6WritingFlowHelpData || {})
    .catch((error) => {
      writingFlowHelpLoadPromise = null;
      throw error;
    });
  return writingFlowHelpLoadPromise;
}

async function ensureSystemConceptsData() {
  if (window.AISystem6SystemConceptsData) return window.AISystem6SystemConceptsData;
  systemConceptsLoadPromise ||= loadClassicScriptOnce("app/data/system-concepts.js")
    .then(() => window.AISystem6SystemConceptsData || {})
    .catch((error) => {
      systemConceptsLoadPromise = null;
      throw error;
    });
  return systemConceptsLoadPromise;
}

async function ensureMemoryCardsModule() {
  memoryCardsLoadPromise ||= loadClassicScriptOnce("app/features/memory-cards.js")
    .catch((error) => {
      memoryCardsLoadPromise = null;
      throw error;
    });
  return memoryCardsLoadPromise;
}

async function ensureAlarmClockModule() {
  alarmClockLoadPromise ||= loadClassicScriptOnce("app/features/alarm-clock.js")
    .catch((error) => {
      alarmClockLoadPromise = null;
      throw error;
    });
  return alarmClockLoadPromise;
}

async function ensureBureaucracyMemeModule() {
  if (window.AISystem6BureaucracyMeme) return true;
  bureaucracyMemeLoadPromise ||= loadClassicScriptOnce("app/features/bureaucracy-meme.js")
    .catch((error) => {
      bureaucracyMemeLoadPromise = null;
      throw error;
    });
  return bureaucracyMemeLoadPromise;
}

async function ensurePrintDirectoryModule() {
  printDirectoryLoadPromise ||= loadClassicScriptOnce("app/features/print-directory.js")
    .catch((error) => {
      printDirectoryLoadPromise = null;
      throw error;
    });
  return printDirectoryLoadPromise;
}

async function ensureProjectCdPrintModule() {
  projectCdPrintLoadPromise ||= loadClassicScriptOnce("app/features/project-cd-print.js")
    .catch((error) => {
      projectCdPrintLoadPromise = null;
      throw error;
    });
  return projectCdPrintLoadPromise;
}

async function ensureTranslationPadModule() {
  translationPadLoadPromise ||= loadClassicScriptOnce("app/features/translation-pad.js")
    .catch((error) => {
      translationPadLoadPromise = null;
      throw error;
    });
  return translationPadLoadPromise;
}

async function ensureDictionaryHelpModule() {
  if (window.AISystem6DictionaryHelpLoaded) return true;
  dictionaryHelpLoadPromise ||= loadClassicScriptOnce("app/features/dictionary-help.js")
    .catch((error) => {
      dictionaryHelpLoadPromise = null;
      throw error;
    });
  return dictionaryHelpLoadPromise;
}

async function ensureVideoTranscriptModule() {
  if (window.AISystem6VideoTranscriptLoaded) return true;
  videoTranscriptLoadPromise ||= loadClassicScriptOnce("app/features/video-transcript.js")
    .catch((error) => {
      videoTranscriptLoadPromise = null;
      throw error;
    });
  return videoTranscriptLoadPromise;
}

async function ensureVideoDocMapModule() {
  if (window.AISystem6VideoDocMapLoaded) return true;
  videoDocMapLoadPromise ||= loadClassicScriptOnce("app/features/video-docmap.js")
    .catch((error) => {
      videoDocMapLoadPromise = null;
      throw error;
    });
  return videoDocMapLoadPromise;
}

async function ensureEndfieldTerminalModule() {
  if (window.AISystem6EndfieldTerminalLoaded) return true;
  endfieldTerminalLoadPromise ||= loadClassicScriptOnce("app/features/endfield-terminal.js")
    .catch((error) => {
      endfieldTerminalLoadPromise = null;
      throw error;
    });
  return endfieldTerminalLoadPromise;
}

async function ensureTimeMachineModule() {
  if (window.AISystem6TimeMachineLoaded) return true;
  timeMachineLoadPromise ||= loadClassicScriptOnce("app/features/time-machine.js")
    .catch((error) => {
      timeMachineLoadPromise = null;
      throw error;
    });
  return timeMachineLoadPromise;
}

async function ensureHkrrReviewModule() {
  hkrrReviewLoadPromise ||= loadClassicScriptOnce("app/features/hkrr-review.js").catch((error) => {
    hkrrReviewLoadPromise = null;
    throw error;
  });
  return hkrrReviewLoadPromise;
}

async function ensureMingmingHandoffReviewModule() {
  mingmingHandoffReviewLoadPromise ||= loadClassicScriptOnce("app/features/mingming-handoff-review.js").catch((error) => {
    mingmingHandoffReviewLoadPromise = null;
    throw error;
  });
  return mingmingHandoffReviewLoadPromise;
}

async function ensureSlidesExportModule() {
  if (window.AISystem6SlidesExportLoaded) return true;
  slidesExportLoadPromise ||= loadClassicScriptOnce("app/features/slides-export.js")
    .catch((error) => {
      slidesExportLoadPromise = null;
      throw error;
    });
  return slidesExportLoadPromise;
}

async function ensureClioStageModule() {
  if (window.AISystem6ClioStageLoaded) return true;
  clioStageLoadPromise ||= loadClassicScriptOnce("app/features/clio-stage.js")
    .catch((error) => {
      clioStageLoadPromise = null;
      throw error;
    });
  return clioStageLoadPromise;
}

async function ensureClioChartModule() {
  if (window.AISystem6ClioChartLoaded) return true;
  clioChartLoadPromise ||= loadClassicScriptOnce("app/features/clio-chart.js")
    .catch((error) => {
      clioChartLoadPromise = null;
      throw error;
    });
  return clioChartLoadPromise;
}

async function ensureLiquidCoverModule() {
  if (window.AISystem6LiquidCoverLoaded) return true;
  liquidCoverLoadPromise ||= loadClassicScriptOnce("app/features/liquid-cover.js")
    .catch((error) => {
      liquidCoverLoadPromise = null;
      throw error;
    });
  return liquidCoverLoadPromise;
}

async function ensureQuickDraftModule() {
  if (window.AISystem6QuickDraftLoaded) return true;
  quickDraftLoadPromise ||= loadClassicScriptOnce("app/features/finder-draft.js")
    .catch((error) => {
      quickDraftLoadPromise = null;
      throw error;
    });
  return quickDraftLoadPromise;
}

async function ensureCmfStudioModule() {
  if (window.AISystem6CMFStudioLoaded) return true;
  cmfStudioLoadPromise ||= loadClassicScriptOnce("app/features/cmf-studio.js")
    .catch((error) => {
      cmfStudioLoadPromise = null;
      throw error;
    });
  return cmfStudioLoadPromise;
}

async function ensureSoundscapeModule() {
  if (window.AISystem6SoundscapeLoaded) return true;
  soundscapeLoadPromise ||= loadClassicScriptOnce("app/features/soundscape.js")
    .catch((error) => {
      soundscapeLoadPromise = null;
      throw error;
    });
  return soundscapeLoadPromise;
}

async function ensureWritingDemoModule() {
  if (window.AISystem6WritingDemoLoaded) return true;
  writingDemoLoadPromise ||= loadClassicScriptOnce("app/data/iphone-17e-demo-corpus.js")
    .then(() => loadClassicScriptOnce("app/features/writing-demo.js"))
    .catch((error) => {
      writingDemoLoadPromise = null;
      throw error;
    });
  return writingDemoLoadPromise;
}

const passiveWritingFlowStubs = new Set([
  "renderFlowProgress",
  "renderPipeline",
  "renderRebuildFlow",
  "renderRebuildProgress",
  "resetRebuildProgress",
  "renderReaderTabs",
  "savePipelineData",
  "refreshTeachTextSurfacePreview",
  "syncLinkedManuscriptScrollFrom",
  "syncDraftsFromProjectOutline",
  "syncOutlineDomFromProject",
  "syncDraftDomFromProject",
  "syncLinkedTeachTextFromProject",
  "updateFlowGuideChecklist",
]);

const markdownOnlyModelInstruction = [
  "Treat every model-facing input as Markdown.",
  "Return Markdown only.",
  "Never return JSON, JSON code fences, schemas, or machine-readable object literals.",
].join(" ");

function withMarkdownModelMessages(messages = []) {
  const normalized = Array.isArray(messages) ? messages : [];
  const systemIntegrity = window.AISystem6SystemIntegrity;
  const systemIntegrityInstruction = systemIntegrity && !systemIntegrity.hasIntegrityInstruction(normalized)
    ? systemIntegrity.instruction()
    : "";
  const humanizer = window.AISystem6Humanizer;
  const humanizerInstruction = humanizer && !humanizer.hasHumanizerInstruction(normalized)
    ? humanizer.instruction()
    : "";
  return [
    { role: "system", content: markdownOnlyModelInstruction },
    ...(systemIntegrityInstruction ? [{ role: "system", content: systemIntegrityInstruction }] : []),
    ...(humanizerInstruction ? [{ role: "system", content: humanizerInstruction }] : []),
    ...normalized,
  ];
}

function installLazyWritingFlowStub(name) {
  if (typeof window[name] === "function") return;
  window[name] = async function lazyWritingFlowStub(...args) {
    if (passiveWritingFlowStubs.has(name)) return undefined;
    await ensureWritingFlowModule();
    const fn = window[name];
    if (fn === lazyWritingFlowStub) throw new Error(`Writing Flow did not install ${name}`);
    return fn(...args);
  };
}

[
  "renderFlowProgress",
  "renderPipeline",
  "renderRebuildFlow",
  "renderRebuildProgress",
  "resetRebuildProgress",
  "openRebuildFlow",
  "useReaderForRebuildFlow",
  "useTeachTextForRebuildFlow",
  "useClipboardForRebuildFlow",
  "useSampleArticleForRebuildFlow",
  "runRebuildFlow",
  "openWritingFlowHelp",
  "openQuestionSheetSurface",
  "openOutlineSurface",
  "openSectionDrafts",
  "openWritingFlowWindows",
  "toggleTeachTextSurfacePreview",
  "refreshTeachTextSurfacePreview",
  "syncLinkedManuscriptScrollFrom",
  "updateFlowGuideChecklist",
  "insertQuestionTemplate",
  "clearQuestionSheet",
  "advanceQuestionSheetToOutline",
  "advanceOutlineToSectionDrafts",
  "savePipelineData",
  "renderReaderTabs",
  "syncDraftsFromProjectOutline",
  "syncOutlineDomFromProject",
  "syncDraftDomFromProject",
  "syncLinkedTeachTextFromProject",
  "restoreQuestionsToOutline",
  "addOutlineSection",
  "insertOutlineHkrrIntent",
  "clearOutlineWithConfirmation",
  "saveOutline",
  "draftSelectedOutlineSection",
  "showAdjacentSectionDraft",
  "createManualSectionDraft",
  "advanceDraftsToReview",
].forEach(installLazyWritingFlowStub);

function installLazyMemoryCardsStub(name) {
  if (typeof window[name] === "function") return;
  window[name] = async function lazyMemoryCardsStub(...args) {
    await ensureMemoryCardsModule();
    const fn = window[name];
    if (fn === lazyMemoryCardsStub) throw new Error(`Memory Cards did not install ${name}`);
    return fn(...args);
  };
}

[
  "memoryCardsHasGame",
  "newMemoryCardsGame",
  "pauseMemoryCardsGame",
  "renderMemoryCards",
  "flipMemoryCard",
].forEach(installLazyMemoryCardsStub);

function installLazyFunctionStub(name, ensureModule) {
  if (typeof window[name] === "function") return;
  window[name] = async function lazyFunctionStub(...args) {
    await ensureModule();
    const fn = window[name];
    if (fn === lazyFunctionStub) throw new Error(`Lazy module did not install ${name}`);
    return fn(...args);
  };
}

[
  "openPrintDirectoryPreview",
  "downloadPrintedDirectoryMarkdown",
].forEach((name) => installLazyFunctionStub(name, ensurePrintDirectoryModule));

[
  "openPageSetup",
  "updatePageSetupFromControls",
  "printSelectedProjectCdPdf",
  "printCurrentTeachTextDocument",
].forEach((name) => installLazyFunctionStub(name, ensureProjectCdPrintModule));

[
  "openTranslationPad",
  "openTranslationPadFromSelection",
  "syncTranslationPadStateFromInputs",
  "clearTranslationPad",
  "translateTranslationPadSource",
  "sendTranslationPad",
].forEach((name) => installLazyFunctionStub(name, ensureTranslationPadModule));
