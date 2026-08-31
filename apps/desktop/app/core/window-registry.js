// Window registry — the one place a window says what it is.
//
// A window used to be declared in eight places: an app-id map, a width table, a
// narrow-screen exclusion set, a lazy-module map, a chain of `if (name === …)`
// render hooks, the hideSidebars list, the runtime manifest, and its own markup.
// Four of those only announced a missing entry as a test failure, which is a
// gate compensating for the absence of a declaration. This is the declaration.
//
// The authority is here, in the product. The tooling contract
// (tooling/interface-guidelines-contract.mjs) carries the *design* facets —
// interface role, status layout, document model — which the browser never reads
// and which would only cost boot bytes; a gate holds the two key sets equal, so
// neither file can quietly grow a window the other has never heard of.
//
// Two hook phases, and the difference is load-bearing. `onOpen` runs while the
// window is still hidden; `onReveal` runs after
// `classList.remove("is-hidden")`, which is the only point where a window can
// be measured. The old chain hid that seam in the middle of a list of ifs, and
// a hook on the wrong side of it fails in a way that looks like a layout bug.
//
// Values, not behaviour, wherever possible. `width` is a token name and a
// fallback rather than a resolved number, so it is read after the stylesheet
// exists instead of at boot. `lazy` and the hooks stay as arrow functions
// because a bare reference to a lazily loaded function resolves at boot and
// throws; the arrow defers it.
//
// Contract: tests/features/window-registry.test.mjs

const windowRegistry = Object.freeze({
  about: {
    app: "system",
    mobileOverlay: true,
    onOpen: () => renderAboutMacintosh(),
  },
  alarmClock: {
    app: "accessories",
    mobileOverlay: true,
    sidebar: true,
    lazy: { ensure: () => ensureAlarmClockModule() },
  },
  applications: {
    app: "finder",
    sidebar: true,
    onOpen: () => renderStaticFinderWindow("applications"),
  },
  assistant: {
    app: "clioTalk",
  },
  bonsaiCity: {
    app: "bonsaiCity",
    builtByModule: true,
    lazy: {
    ensure: () => ensureBonsaiCityModule(),
    attach: () => window.AISystem6BonsaiCity?.attach?.(),
    appearanceAttach: () => window.AISystem6BonsaiCity?.attach?.(),
  },
  },
  bureaucracyMeme: {
    builtByModule: true,
    app: "bureaucracyMeme",
    onOpen: () => { if (typeof renderBureaucracyMemeGenerator === "function") renderBureaucracyMemeGenerator(); },
    lazy: { ensure: () => ensureBureaucracyMemeModule() },
  },
  calculator: {
    app: "accessories",
    width: 208,
    mobileOverlay: true,
    sidebar: true,
  },
  chatFile: {
    app: "teachText",
    sidebar: true,
  },
  chooser: {
    app: "accessories",
    mobileOverlay: true,
    sidebar: true,
  },
  claimCheck: {
    app: "teachText",
    opensAs: "reviewDesk",
    onOpen: () => renderPipeline(),
  },
  clioChart: {
    app: "clioChart",
    lazy: {
    ensure: () => ensureClioChartModule(),
    attach: () => window.AISystem6ClioChart?.attach?.(),
  },
  },
  clioProject: {
    app: "clioProject",
    builtByModule: true,
    width: 560,
    lazy: {
      ensure: () => ensureClioProjectModule(),
      attach: () => window.AISystem6ClioProjectWindow?.attach?.(),
    },
    onOpen: () => window.AISystem6ClioProjectWindow?.render?.(),
  },
  clioStage: {
    app: "clioStage",
    lazy: {
    ensure: () => ensureClioStageModule(),
    attach: () => window.AISystem6ClioStage?.attach?.(),
  },
  },
  clipboard: {
    app: "accessories",
    width: ["--da-width-pad", 340],
    mobileOverlay: true,
    sidebar: true,
  },
  cmfStudio: {
    app: "cmfStudio",
    width: 1080,
    sidebar: true,
    onOpen: () => { if (typeof renderCmfStudio === "function") renderCmfStudio(); },
    lazy: { ensure: () => ensureCmfStudioModule() },
  },
  contextPanel: {
    app: "clioTalk",
    sidebar: true,
    onReveal: () => document.body.classList.add("has-context-panel-open"),
  },
  control: {
    app: "accessories",
    mobileOverlay: true,
    sidebar: true,
    onOpen: ({ wasAlreadyOpen }) => { refreshControlPanelModels(); if (!wasAlreadyOpen && typeof setControlTab === "function") setControlTab(); },
  },
  controlStripModules: {
    builtByModule: true,
    app: "finder",
    sidebar: true,
    onOpen: () => renderStaticFinderWindow("controlStripModules"),
    lazy: {
    ensure: () => ensureControlStripModulesFolderModule(),
    attach: () => {
      if (typeof renderStaticFinderWindow === "function") renderStaticFinderWindow("controlStripModules");
      window.AISystem6ControlStripModulesFolder?.attach?.();
    },
  },
  },
  dictation: {
    app: "accessories",
    mobileOverlay: true,
    onOpen: () => { if (typeof refreshDictationDestination === "function") refreshDictationDestination(); },
    lazy: { ensure: () => ensureDictationPadModule() },
  },
  dictionary: {
    app: "accessories",
    width: ["--da-width-wide-pad", 380],
    mobileOverlay: true,
    sidebar: true,
    onOpen: () => renderDictionaryResult(),
    lazy: {
    ensure: async () => {
      await ensureSystemDictionaryData();
      await ensureDictionaryHelpModule();
    },
    // The writer's own word list is drawn on the way in. `typeof` and not
    // `?.()`: an undefined identifier is a ReferenceError, which the optional
    // call does not catch.
    attach: () => {
      if (typeof renderDictionaryWords === "function") renderDictionaryWords();
    },
  },
  },
  disk: {
    app: "finder",
    sidebar: true,
    onOpen: () => renderStaticFinderWindow("disk"),
  },
  docMap: {
    app: "docMap",
    sidebar: true,
    onOpen: () => { if (window.AISystem6DocMapLoaded) renderDocMap(); },
  },
  documents: {
    app: "finder",
    sidebar: true,
  },
  doom: {
    app: "doom",
    builtByModule: true,
    lazy: {
    ensure: () => ensureDoomModule(),
    attach: () => window.AISystem6Doom?.attach?.(),
  },
  },
  endfieldTerminal: {
    app: "endfield",
    sidebar: true,
    onOpen: () => window.AISystem6EndfieldTerminal?.attach?.(),
    lazy: {
    ensure: () => ensureEndfieldTerminalModule(),
    attach: () => window.AISystem6EndfieldTerminal?.attach?.(),
  },
  },
  fileInfo: {
    app: "finder",
  },
  findChange: {
    app: "accessories",
    lazy: { ensure: () => ensureFindChangeModule() },
  },
  findFile: {
    app: "accessories",
    width: 520,
    mobileOverlay: true,
    sidebar: true,
    lazy: {
    ensure: () => ensureFindPathModule(),
    attach: () => renderFindFileResults(),
  },
  },
  findPath: {
    app: "searcher",
    sidebar: true,
    onReveal: () => document.body.classList.add("has-find-path-open"),
    lazy: {
    ensure: () => ensureFindPathModule(),
    attach: () => renderFindPathResults(),
  },
  },
  finder: {
    app: "finder",
    sidebar: true,
    onOpen: () => renderFinder(),
  },
  finishingReceipt: {
    builtByModule: true,
    app: "finder",
    lazy: {
    ensure: () => ensureProjectCdPrintModule(),
    attach: () => window.attachFinishingReceipt?.(),
  },
  },
  helpFolder: {
    app: "finder",
    sidebar: true,
    onOpen: () => renderStaticFinderWindow("helpFolder"),
  },
  holdThought: {
    builtByModule: true,
    app: "accessories",
    width: ["--da-width-pad", 340],
    mobileOverlay: true,
    sidebar: true,
    onOpen: () => { if (typeof mountHoldThoughtRuntime === "function") mountHoldThoughtRuntime(); },
    lazy: {
    ensure: () => ensureHoldThatThoughtModule(),
    attach: () => {
      if (typeof mountHoldThoughtRuntime === "function") mountHoldThoughtRuntime();
    },
  },
  },
  imageManager: {
    app: "teachText",
    sidebar: true,
    onOpen: () => renderTeachTextImageAttachments(),
  },
  imagePromptStudio: {
    app: "imagePromptStudio",
    builtByModule: true,
    lazy: {
    ensure: () => ensureImagePromptStudioModule(),
    attach: () => window.AISystem6ImagePromptStudio?.render?.(),
    appearanceAttach: () => window.AISystem6ImagePromptStudio?.render?.(),
  },
  },
  importUtility: {
    app: "finder",
    onOpen: () => renderImportPreview(),
  },
  keyCaps: {
    app: "accessories",
    width: 380,
    mobileOverlay: true,
    sidebar: true,
  },
  // 文字亮室 is its own application, task and all. Finder mode is single-task,
  // so the darkroom and the draft cannot share the screen there; seeing the
  // grain beside the sentence is a MultiFinder arrangement. That is the cost of
  // a real second application, and it was chosen with the cost known.
  lightroom: {
    app: "lightroom",
    builtByModule: true,
    // The window frame comes from the Quick Draft bundle that also renders it,
    // so a restore or an Appearance probe can raise the frame through the shared
    // boundary; openWindow's own branch still calls openLightroom to fill it.
    lazy: { ensure: () => ensureQuickDraftModule() },
  },
  liquidCover: {
    app: "liquidCover",
    builtByModule: true,
    // Cover Glass builds its own window, so loading the module is not the same
    // as having a window: installLiquidCoverWindow() is what puts one on the
    // desk. openWindow reaches that through AISystem6LiquidCover.open(), but a
    // caller holding only the registry -- appearance verification is the one
    // that does -- had no way in, and reported the window as never mounting.
    lazy: {
      ensure: () => ensureLiquidCoverModule(),
      appearanceAttach: () => installLiquidCoverWindow(),
    },
  },
  memoryCards: {
    app: "accessories",
    width: 520,
    mobileOverlay: true,
    sidebar: true,
    onOpen: () => { if (!memoryCardsHasGame()) newMemoryCardsGame(); renderMemoryCards(); },
    lazy: { ensure: () => ensureMemoryCardsModule() },
  },
  micropolis: {
    app: "micropolis",
    builtByModule: true,
    lazy: {
    ensure: () => ensureMicropolisModule(),
    attach: () => window.AISystem6Micropolis?.attach?.(),
  },
  },
  modelMeter: {
    app: "accessories",
    width: 230,
    mobileOverlay: true,
    sidebar: true,
  },
  notePad: {
    app: "accessories",
    width: ["--da-width-pad", 340],
    mobileOverlay: true,
    sidebar: true,
    onOpen: () => renderNotePadPage(),
  },
  notificationCenter: {
    app: "accessories",
    width: 360,
    mobileOverlay: true,
    sidebar: true,
    onOpen: () => renderNotificationCenter(),
  },
  openttd: {
    app: "openttd",
    builtByModule: true,
    lazy: {
    ensure: () => ensureOpenTTDModule(),
    attach: () => window.AISystem6OpenTTD?.attach?.(),
  },
  },
  outline: {
    app: "teachText",
    onOpen: () => renderPipeline(),
    lazy: { ensure: () => ensureWritingFlowModule() },
  },
  pageSetup: {
    app: "finder",
  },
  printDirectory: {
    app: "finder",
  },
  projectCd: {
    app: "finder",
    onOpen: () => renderProjectCd(),
  },
  projectInfo: {
    app: "finder",
  },
  projectPeek: {
    builtByModule: true,
    app: "accessories",
    width: 420,
    mobileOverlay: true,
    sidebar: true,
    lazy: {
      ensure: () => ensureProjectPeekModule(),
      attach: () => {
        if (typeof mountProjectPeekRuntime === "function") mountProjectPeekRuntime();
      },
    },
    onOpen: () => {
      if (typeof mountProjectPeekRuntime === "function") mountProjectPeekRuntime();
    },
  },
  projects: {
    app: "finder",
    sidebar: true,
    onOpen: () => renderProjectDisks(),
  },
  puzzle: {
    app: "accessories",
    width: 188,
    mobileOverlay: true,
    sidebar: true,
    onOpen: () => newPuzzleGame({ announce: false }),
  },
  questionSheet: {
    app: "teachText",
    onOpen: () => renderPipeline(),
    lazy: { ensure: () => ensureWritingFlowModule() },
  },
  quickDraft: {
    app: "quickDraft",
  },
  rag: {
    app: "finder",
    sidebar: true,
  },
  reader: {
    app: "reader",
    sidebar: true,
  },
  rebuildFlow: {
    app: "teachText",
    onOpen: () => renderRebuildFlow(),
    lazy: { ensure: () => ensureWritingFlowModule() },
  },
  reviewDesk: {
    app: "teachText",
    onOpen: () => { renderPipeline(); renderStyleCheckSections(); renderClaimCheckSections(); },
  },
  saveChat: {
    app: "clioTalk",
    mobileOverlay: true,
    onReveal: () => placeSaveChatWindow(),
  },
  scrapbook: {
    app: "scrapbook",
    sidebar: true,
  },
  sectionDrafts: {
    app: "teachText",
    onOpen: () => renderPipeline(),
    lazy: { ensure: () => ensureWritingFlowModule() },
  },
  sideAskPad: {
    app: "accessories",
    mobileOverlay: true,
    builtByModule: true,
    lazy: { ensure: () => { sideAskPad(); } },
  },
  soundscape: {
    app: "soundscape",
    sidebar: true,
    lazy: {
    ensure: () => ensureSoundscapeModule(),
    attach: () => window.AISystem6Soundscape?.attach?.(),
  },
  },
  styleSheet: {
    app: "teachText",
    opensAs: "reviewDesk",
    onOpen: () => { renderStyleCheckSections(); renderClaimCheckSections(); },
  },
  systemHelp: {
    app: "system",
    onOpen: () => renderSystemHelp(),
    lazy: {
    ensure: async () => {
      await ensureSystemDictionaryData();
      await ensureDictionaryHelpModule();
    },
  },
  },
  systemStatus: {
    app: "accessories",
    width: 430,
    mobileOverlay: true,
    sidebar: true,
    onOpen: () => renderSystemStatus(),
  },
  teachText: {
    app: "teachText",
    onOpen: () => { updateTeachTextBoundaries(); updateTeachTextTranslateButton(); updateTeachTextBilingualExportButton(); },
  },
  textDisk: {
    app: "finder",
    sidebar: true,
  },
  themeLab: {
    app: "themeLab",
    builtByModule: true,
    lazy: {
    ensure: () => ensureThemeLabModule(),
    attach: () => window.AISystem6ThemeLab?.restore?.(),
  },
  },
  timeMachine: {
    app: "timeMachine",
    lazy: {
    ensure: () => ensureTimeMachineModule(),
    attach: () => window.AISystem6TimeMachine?.attach?.(),
  },
  },
  todo: {
    builtByModule: true,
    app: "accessories",
    width: ["--da-width-pad", 340],
    mobileOverlay: true,
    sidebar: true,
    lazy: {
      ensure: () => ensureTodoDaModule(),
      attach: () => window.AISystem6TodoDa?.attach?.(),
      appearanceAttach: () => window.AISystem6TodoDa?.attach?.(),
    },
    onOpen: () => window.AISystem6TodoDa?.render?.(),
  },
  translationPad: {
    app: "accessories",
    mobileOverlay: true,
    lazy: { ensure: () => ensureTranslationPadModule() },
  },
  trash: {
    app: "finder",
    sidebar: true,
  },
  writingBell: {
    app: "accessories",
    width: ["--da-width-dial", 300],
    mobileOverlay: true,
    sidebar: true,
    onOpen: () => renderWritingBell(),
  },
});

// Two names route into another window rather than opening one of their own:
// the Review Desk's two tabs. They are declared here because the app-id map
// they came from had no way to say "this is not a window", which is how a dead
// third name (`guide`) survived in it unnoticed.
function windowOpensAs(name) {
  return getWindowRecord(name)?.opensAs || "";
}

function getWindowRecord(name) {
  return windowRegistry[String(name || "")] || null;
}

// Every window belongs to an application. A name the registry has never heard
// of used to fall through to "finder", which is a plausible wrong answer — the
// worst kind. It still falls back, because a dialog opened before its record
// exists must not take the desk down, but the gate makes the fallback unused.
function registeredWindowAppId(name) {
  return getWindowRecord(name)?.app || "finder";
}

function registeredWindowWidth(name) {
  const width = getWindowRecord(name)?.width;
  if (typeof width === "number") return width;
  if (Array.isArray(width)) return readPixelToken(width[0], width[1]);
  return null;
}

function isMobileOverlayWindow(name) {
  return getWindowRecord(name)?.mobileOverlay === true;
}

function sidebarWindowNames() {
  return Object.keys(windowRegistry).filter((name) => windowRegistry[name].sidebar === true);
}

function lazyWindowRecord(name) {
  return getWindowRecord(name)?.lazy || null;
}

// One call site per phase, so the order of hooks is the order of the registry
// rather than the order somebody happened to add an `if` to a 5,000-line file.
function runWindowHook(name, phase, context = {}) {
  const hook = getWindowRecord(name)?.[phase];
  if (typeof hook !== "function") return;
  try {
    hook(context);
  } catch (error) {
    console.warn(`Window hook failed: ${name}.${phase}`, error);
  }
}
