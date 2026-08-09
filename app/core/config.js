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

  // Release identity comes from app/generated/build-info.js (written at build
  // time). The only fallback here is an explicit dev marker: an unbuilt or
  // unpackaged checkout must never masquerade as a current release.
  const devBuildInfoFallback = Object.freeze({
    version: "0.0.0-dev",
    build: "dev",
    sourceCommit: "",
  });

  function getAppBuildInfo() {
    const info = window.AISystem6BuildInfo;
    return info && typeof info.version === "string" && info.version
      ? info
      : devBuildInfoFallback;
  }

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
    '[data-action="make-docmap-selection"]',
    '[data-action="make-docmap-source"]',
    '[data-action="reader-make-docmap"]',
    '[data-action="reader-docmap-selection"]',
    '[data-action="reader-docmap-source"]',
    '[data-action="time-machine-docmap"]',
    '[data-action="time-machine-docmap-selection"]',
    '[data-action="time-machine-docmap-source"]',
    '[data-action="clio-stage-docmap"]',
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
    // Fallback only. "Project Hard Disk" is the name of the object, not a good
    // name for a disk sitting inside it, and it left an English literal in the
    // Chinese desktop; getDefaultProjectName() localizes it once translations
    // are loaded.
    defaultProjectName: "New Project",
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
      "endfieldTerminal",
      "questionSheet",
      "outline",
      "sectionDrafts",
      "reviewDesk",
      "docMap",
      "bureaucracyMeme",
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
    devBuildInfoFallback,
    getAppBuildInfo,
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
const lazyRetryNonces = new Map();

function lazyScriptTimeoutMs() {
  const configured = Number(window.AISystem6LazyScriptTimeoutMs);
  return Number.isFinite(configured) && configured > 0 ? configured : 6000;
}

function lazyScriptUrl(src) {
  const build = window.AISystem6Config?.getAppBuildInfo?.().build || "dev";
  return `${src}${src.includes("?") ? "&" : "?"}v=${encodeURIComponent(build)}`;
}

function resolveClassicScriptSource(src) {
  return src;
}

function removeLazyScriptNode(src) {
  const resolvedSrc = resolveClassicScriptSource(src);
  document
    .querySelectorAll(`script[data-lazy-src="${CSS.escape(resolvedSrc)}"]`)
    .forEach((node) => node.remove());
}

// A failed script can be cached (especially 404 responses), so a retry must
// re-fetch a fresh URL. The ?r= nonce changes only after a failure; the
// canonical ?v=<build> cache-buster stays untouched.
function lazyScriptUrlWithRetryNonce(resolvedSrc) {
  const base = lazyScriptUrl(resolvedSrc);
  const nonce = lazyRetryNonces.get(resolvedSrc) || 0;
  return nonce > 0 ? `${base}${base.includes("?") ? "&" : "?"}r=${nonce}` : base;
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
    let timer = null;
    const fail = (message) => {
      clearTimeout(timer);
      // Drop the half-loaded element and the cached promise so a later retry
      // fetches a fresh copy; an aborted/cancelled script can fire neither
      // onload nor onerror, which would otherwise hang the caller forever.
      lazyRetryNonces.set(resolvedSrc, (lazyRetryNonces.get(resolvedSrc) || 0) + 1);
      lazyScriptPromises.delete(resolvedSrc);
      script.remove();
      reject(new Error(message));
    };
    script.src = lazyScriptUrlWithRetryNonce(resolvedSrc);
    script.dataset.lazySrc = resolvedSrc;
    script.onload = () => {
      clearTimeout(timer);
      script.dataset.loaded = "true";
      resolve(true);
    };
    script.onerror = () => {
      fail(`Could not load ${resolvedSrc}`);
    };
    timer = setTimeout(() => fail(`Timed out loading ${resolvedSrc}`), lazyScriptTimeoutMs());
    if (!existing) document.head.append(script);
  });
  lazyScriptPromises.set(resolvedSrc, promise);
  return promise;
}

// Lazy modules load through one factory. Where a module installs a Loaded
// flag (or its API object), the loader short-circuits on it; every loader
// keeps a shared per-module promise so concurrent callers share one load, and
// a failed load clears the promise so a later retry can succeed. Data loaders
// resolve to the object they install. All loaders always return a Promise, so
// both `await` and `.then()` callers behave identically.
function createLazyModuleLoader(flag, sources, resolveData = false) {
  let loadPromise = null;
  return async function ensureLazyModuleLoaded() {
    if (flag && window[flag]) return resolveData ? (window[flag] || {}) : true;
    if (loadPromise) return loadPromise;
    const chain = sources.reduce((pending, src) => pending.then(() => loadClassicScriptOnce(src)), Promise.resolve());
    loadPromise = chain
      .then(() => {
        // A script can fire onload without executing (syntax error) or a
        // module can fail to install its API. Loading "succeeded" must mean
        // the module is actually present, otherwise callers would proceed
        // against an uninstalled module.
        if (flag && !window[flag]) {
          sources.forEach(removeLazyScriptNode);
          throw new Error(`${flag} did not install after loading ${sources.join(", ")}`);
        }
        return resolveData ? (window[flag] || {}) : true;
      })
      .catch((error) => {
        loadPromise = null;
        throw error;
      });
    return loadPromise;
  };
}

const ensureWritingFlowModule = createLazyModuleLoader("AISystem6WritingFlowLoaded", [
  "app/content/rebuild-samples.js",
  "app/features/writing-flow.js",
]);
const ensureMarkdownParser = createLazyModuleLoader("marked", ["app/vendor/marked.umd.js"]);
const ensurePromptFilesData = createLazyModuleLoader("AISystem6PromptFiles", ["app/generated/ai-prompt-files.js"], true);
const ensureTranslationZh = createLazyModuleLoader("AISystem6TranslationsZh", ["app/data/translations-zh.js"], true);
const ensureTranslationEn = createLazyModuleLoader("AISystem6TranslationsEn", ["app/data/translations-en.js"], true);
function ensureLanguageFor(language) {
  return language === "zh" ? ensureTranslationZh() : ensureTranslationEn();
}
const ensureWritingFlowHelpData = createLazyModuleLoader("AISystem6WritingFlowHelpData", ["app/data/writing-flow-help.js"], true);
const ensureSystemConceptsData = createLazyModuleLoader("AISystem6SystemConceptsData", ["app/data/system-concepts.js"], true);
const ensureMemoryCardsModule = createLazyModuleLoader("", ["app/features/memory-cards.js"]);
const ensureAlarmClockModule = createLazyModuleLoader("", ["app/features/alarm-clock.js"]);
const ensureBureaucracyMemeModule = createLazyModuleLoader("AISystem6BureaucracyMeme", ["app/features/bureaucracy-meme.js"]);
const ensurePrintDirectoryModule = createLazyModuleLoader("", ["app/features/print-directory.js"]);
const ensureProjectCdPrintModule = createLazyModuleLoader("", ["app/features/project-cd-print.js"]);
const ensureTranslationPadModule = createLazyModuleLoader("", ["app/features/translation-pad.js"]);
const ensureDictionaryHelpModule = createLazyModuleLoader("AISystem6DictionaryHelpLoaded", ["app/features/dictionary-help.js"]);
const ensureVideoTranscriptModule = createLazyModuleLoader("AISystem6VideoTranscriptLoaded", ["app/features/video-transcript.js"]);
const ensureVideoDocMapModule = createLazyModuleLoader("AISystem6VideoDocMapLoaded", ["app/features/video-docmap.js"]);
const ensureEndfieldTerminalModule = createLazyModuleLoader("AISystem6EndfieldTerminalLoaded", ["app/features/endfield-terminal.js"]);
const ensureTimeMachineModule = createLazyModuleLoader("AISystem6TimeMachineLoaded", ["app/features/time-machine.js"]);
const ensureHkrrReviewModule = createLazyModuleLoader("", ["app/features/hkrr-review.js"]);
const ensureMingmingHandoffReviewModule = createLazyModuleLoader("", ["app/features/mingming-handoff-review.js"]);
const ensureSlidesExportModule = createLazyModuleLoader("AISystem6SlidesExportLoaded", ["app/features/slides-export.js"]);
const ensureClioStageModule = createLazyModuleLoader("AISystem6ClioStageLoaded", ["app/features/clio-stage.js"]);
const ensureClioChartModule = createLazyModuleLoader("AISystem6ClioChartLoaded", ["app/features/clio-chart.js"]);
const ensureLiquidCoverModule = createLazyModuleLoader("AISystem6LiquidCoverLoaded", ["app/features/liquid-cover.js"]);
const ensureQuickDraftModule = createLazyModuleLoader("AISystem6QuickDraftLoaded", [
  "app/data/draft-desk-presets.js",
  "app/features/draft-desk.js",
  "app/features/quick-draft-intake.js",
  "app/features/quick-draft-editor.js",
  "app/features/quick-draft-composition.js",
  "app/features/quick-draft-ai.js",
  "app/features/quick-draft-handoff.js",
]);
const ensureCmfStudioModule = createLazyModuleLoader("AISystem6CMFStudioLoaded", ["app/features/cmf-studio.js?cmf=exterior-ao-sanitized"]);
const ensureSoundscapeModule = createLazyModuleLoader("AISystem6SoundscapeLoaded", ["app/features/soundscape.js"]);
const ensureWritingDemoModule = createLazyModuleLoader("AISystem6WritingDemoLoaded", [
  "app/data/iphone-17e-demo-corpus.js",
  "app/features/writing-demo.js",
]);

const lazySystemModulePromises = new Map();
function ensureLazySystemModule(path, loadedFlag) {
  if (window[loadedFlag]) return Promise.resolve(true);
  let promise = lazySystemModulePromises.get(path);
  if (!promise) {
    promise = loadClassicScriptOnce(path)
      .then(() => {
        if (!window[loadedFlag]) {
          removeLazyScriptNode(path);
          throw new Error(`${loadedFlag} did not install after loading ${path}`);
        }
        return true;
      })
      .catch((error) => {
        // Forget the shared promise so a later retry re-fetches, and rethrow
        // the original error: swallowing it made failures look successful.
        lazySystemModulePromises.delete(path);
        throw error;
      });
    lazySystemModulePromises.set(path, promise);
  }
  return promise;
}
function ensureFinderObjectsModule() { return ensureLazySystemModule("app/features/finder-objects.js", "AISystem6FinderObjectsLoaded"); }
function ensureDesktopMaintenanceModule() { return ensureLazySystemModule("app/core/desktop-maintenance.js", "AISystem6DesktopMaintenanceLoaded"); }
function ensureDocMapModule() { return ensureLazySystemModule("app/features/docmap.js", "AISystem6DocMapLoaded"); }

// User-initiated lazy action: on load/install failure, show an understandable,
// retryable error in the current window instead of writing only to the
// console. Retrying re-runs the loader (its cache was cleared), so a later
// fix can succeed without a reload. Cancelling rethrows the original error.
async function ensureLazyModuleForUserAction(label, ensureModule) {
  try {
    return await ensureModule();
  } catch (error) {
    const detail = error && error.message ? error.message : String(error);
    const choice = await showSystemModal(
      t("lazy_load_failed", label, detail),
      "confirm",
      { defaultAction: "cancel", confirmKey: "retry" }
    );
    if (choice === "yes") return ensureLazyModuleForUserAction(label, ensureModule);
    throw error;
  }
}

// DocMap has two kinds of caller. Commands that summon the tool go through
// withDocMap(); paths that can only run with the window already open (render,
// canvas restore, zoom) guard on the loaded flag and no-op otherwise, so they
// never drag 115 KB in behind an ordinary window redraw.
function withDocMap(callback) {
  if (window.AISystem6DocMapLoaded) return callback();
  return ensureLazyModuleForUserAction(t("docmap"), ensureDocMapModule).then(callback);
}

function ensureScriptingModule() { return ensureLazySystemModule("app/core/scripting.js", "AISystem6ScriptingLoaded"); }
function ensureControlStripModule() { return ensureLazySystemModule("app/features/control-strip.js", "AISystem6ControlStripLoaded"); }
function ensureControlStripModulesModule() {
  return ensureLazySystemModule("app/features/control-strip-modules.js", "AISystem6ControlStripModulesLoaded");
}
function ensureControlStripModulesFolderModule() {
  return ensureLazySystemModule("app/features/control-strip-modules-folder.js", "AISystem6ControlStripModulesFolderLoaded");
}
function applyControlStripState(options = {}) {
  if (!controlStripInput?.checked) { window.AISystem6ControlStrip?.disable(); return; }
  const enable = () => ensureControlStripModule().then(() => window.AISystem6ControlStrip?.enable());
  if (options.silent) {
    enable().catch((error) => console.warn("Control Strip failed to load.", error));
    return;
  }
  return ensureLazyModuleForUserAction(t("control_strip"), enable);
}

function withScripting(callback) {
  if (window.AISystem6ScriptingLoaded) return callback();
  return ensureLazyModuleForUserAction(t("droplet"), ensureScriptingModule).then(callback);
}

function scheduleDesktopMaintenance(reason = "event") {
  ensureDesktopMaintenanceModule()
    .then(() => window.AISystem6DesktopMaintenance?.schedule(reason))
    .catch((error) => {
      // Passive maintenance path degrades silently; it must not leave a Busy
      // state or surface a modal at boot.
      console.warn("Desktop maintenance unavailable.", error);
    });
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
    await ensureLazyModuleForUserAction("Writing Flow", ensureWritingFlowModule);
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
  "advanceQuestionSheetToOutline",
  "advanceOutlineToSectionDrafts",
  "savePipelineData",
  "renderReaderTabs",
  "syncDraftsFromProjectOutline",
  "syncOutlineDomFromProject",
  "syncDraftDomFromProject",
  "syncLinkedTeachTextFromProject",
  "addOutlineSection",
  "draftSelectedOutlineSection",
  "showAdjacentSectionDraft",
  "createManualSectionDraft",
  "advanceDraftsToReview",
].forEach(installLazyWritingFlowStub);

function installLazyMemoryCardsStub(name) {
  if (typeof window[name] === "function") return;
  window[name] = async function lazyMemoryCardsStub(...args) {
    await ensureLazyModuleForUserAction("Memory Cards", ensureMemoryCardsModule);
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
    await ensureLazyModuleForUserAction(name, ensureModule);
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
