// Machine-readable companion to docs/design/HIG.md.
//
// This file is intentionally outside the browser bundle. It makes every
// product window declare its object role and shell before feature code can
// treat it as a one-off layout. Static, dynamic, and lazy data-window entries
// must be added here and must choose the canonical shell or state why a
// specialized shell is needed.

export const interfaceObjectRoles = Object.freeze([
  "writing-route",
  "finder",
  "reader",
  "desk-accessory",
  "utility",
  "modal",
  "status",
  "creative-lab",
]);

export const interfaceRoutes = Object.freeze(["core", "summoned", "system"]);
export const interfaceShells = Object.freeze(["application", "finder", "desk-accessory", "modal", "status", "creative-lab"]);
export const interfaceDocumentModels = Object.freeze(["none", "sdi", "tdi"]);
export const interfaceStatusModels = Object.freeze(["none", "standard", "specialized"]);
export const interfaceResponsiveModels = Object.freeze(["adaptive", "compact-da", "immersive"]);
export const interfaceSourceKinds = Object.freeze(["static", "dynamic", "lazy"]);
export const interfaceStatusLayouts = Object.freeze([
  "none",
  "three-slot",
  "finder",
  "compact",
  "multi-row",
  "multi-receipt",
  "task-specific",
  "navigation",
  "receipt",
]);
export const interfaceReferenceSurfaces = Object.freeze([
  "finder",
  "teachText",
  "reader",
  "docMap",
  "control",
  "systemHelp",
  "clioStage",
  "systemStatus",
]);

export const canonicalTypographyTokens = Object.freeze({
  chrome: "--ui-font",
  title: "--title-font",
  reading: "--text-font",
  receipt: "--mono-font",
  editor: "--editor-font",
  preview: "--preview-font",
  editorSize: "--mde-font-size",
  editorMeasure: "--editor-measure",
});

export const canonicalGeometryTokens = Object.freeze({
  controlLine: "--system-control-line",
  controlRadius: "--control-radius",
  menuHeight: "--system-menu-height",
  statusBackground: "--details-bar-bg",
  statusBorder: "--details-bar-border",
  statusOpticalRise: "--details-bar-optical-rise",
  writingGutter: "--writing-window-gutter",
  tdiRailWidth: "--tdi-rail-width",
  localChromeLayer: "--z-local-chrome",
  localOverlayLayer: "--z-local-overlay",
  localPopoverLayer: "--z-local-popover",
});

export const canonicalAppShell = Object.freeze({
  titleIdentity: "application",
  documentIdentity: "status-context",
  statusSlots: Object.freeze(["leading", "context", "trailing"]),
  tdiWide: "vertical-rail",
  tdiCompact: "status-context-menu",
  forbiddenTdi: "second-horizontal-row",
  bottomControls: "owned-safe-inset",
});

export const canonicalControlStatePriority = Object.freeze([
  "disabled",
  "loading",
  "selected",
  "pressed",
  "focus-visible",
  "hover-preview",
  "default",
]);

function defineWindow({
  role,
  route,
  shell,
  documentModel = "none",
  statusModel = "none",
  responsiveModel = "adaptive",
  rationale = "",
  tdiHost = "",
  statusLayout = "none",
  referenceSurface = "",
}) {
  return Object.freeze({
    role,
    route,
    shell,
    documentModel,
    statusModel,
    responsiveModel,
    rationale,
    tdiHost,
    statusLayout,
    referenceSurface,
  });
}

const standardDocument = (role, route = "core", options = {}) => defineWindow({
  role,
  route,
  shell: "application",
  documentModel: options.documentModel || "sdi",
  statusModel: "standard",
  responsiveModel: "adaptive",
  tdiHost: options.tdiHost || "",
  statusLayout: "three-slot",
  referenceSurface: options.referenceSurface || (role === "writing-route" ? "teachText" : role === "reader" ? "reader" : "docMap"),
});

const specializedUtility = (role = "utility", options = {}) => defineWindow({
  role,
  route: options.route || "summoned",
  shell: options.shell || "application",
  documentModel: options.documentModel || "sdi",
  statusModel: options.statusModel || "specialized",
  responsiveModel: options.responsiveModel || "adaptive",
  rationale: options.rationale || "",
  tdiHost: options.tdiHost || "",
  statusLayout: options.statusLayout || "",
  referenceSurface: options.referenceSurface || "",
});

const finderSurface = (route = "system") => defineWindow({
  role: "finder",
  route,
  shell: "finder",
  statusModel: "specialized",
  responsiveModel: "adaptive",
  rationale: "Finder surfaces report object and selection state through Finder chrome.",
  statusLayout: "finder",
  referenceSurface: "finder",
});

const deskAccessory = (route = "system", options = {}) => defineWindow({
  role: "desk-accessory",
  route,
  shell: "desk-accessory",
  documentModel: options.documentModel || "none",
  statusModel: options.statusModel || ((options.statusLayout || "compact") === "none" ? "none" : "specialized"),
  responsiveModel: "compact-da",
  rationale: "Desk Accessories keep compact native-role chrome and must not imitate full application windows.",
  statusLayout: options.statusLayout || "compact",
  referenceSurface: "control",
});

const modalSurface = (route = "system", statusModel = "none") => defineWindow({
  role: "modal",
  route,
  shell: "modal",
  statusModel,
  responsiveModel: "adaptive",
  rationale: "A modal owns one short blocking decision and has no persistent application status bar.",
  statusLayout: statusModel === "none" ? "none" : "compact",
  referenceSurface: "control",
});

const creativeLab = () => defineWindow({
  role: "creative-lab",
  route: "summoned",
  shell: "creative-lab",
  documentModel: "sdi",
  statusModel: "specialized",
  responsiveModel: "immersive",
  rationale: "Creative labs may use task-specific scope controls while retaining shared window and control semantics.",
  statusLayout: "task-specific",
  referenceSurface: "clioStage",
});

const statusSurface = () => defineWindow({
  role: "status",
  route: "system",
  shell: "status",
  statusModel: "specialized",
  responsiveModel: "compact-da",
  rationale: "A system status surface is itself the receipt and does not add a second status bar.",
  statusLayout: "receipt",
  referenceSurface: "systemStatus",
});

// The interface registry is also the tooling authority for locating and
// exercising every product window. Runtime handlers stay in their feature
// modules; this metadata is deliberately data-only so audits and browser gates
// do not need a second hand-written list.
const dynamicWindowSources = Object.freeze({
  sideAskPad: Object.freeze({
    sourceKind: "dynamic",
    openCommand: "open-sideask-pad",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/sideask-pad.js#buildSideAskPad",
    cssPrefixes: Object.freeze(["sideask-pad-"]),
    iconId: "assistant",
  }),
  imagePromptStudio: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-image-prompt-studio",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/image-prompt-studio.js#buildStudioWindow",
    cssPrefixes: Object.freeze(["image-prompt-studio-", "ips-"]),
    iconId: "imagePromptStudio",
  }),
  // The Lab's 35,291 bytes of specimen markup left index.html: every boot was
  // downloading a window most sessions never open, while its module and its
  // stylesheet were already lazy. It is now built at module eval, like the games.
  // Tier-1 windows whose markup left index.html for their own lazy modules: a
  // boot was downloading each of them for a window the module already loads on
  // demand. Same generic path as the games -- builtByModule plus a createWindow
  // call at module eval.
  liquidCover: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-liquid-cover",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/liquid-cover.js#installLiquidCoverWindow",
    cssPrefixes: Object.freeze(["lc-", "liquid-cover-"]),
    iconId: "liquidCover",
  }),
  lightroom: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-lightroom",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/draft-desk.js#installLightroomWindow",
    cssPrefixes: Object.freeze(["lightroom-", "draft-desk-"]),
    iconId: "lightroom",
  }),
  projectPeek: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-project-peek",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/project-peek.js#installProjectPeekWindow",
    cssPrefixes: Object.freeze(["project-peek-"]),
    iconId: "projectDisk",
  }),
  clioProject: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-clio-project",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/clio-project-window.js#installClioProjectWindow",
    cssPrefixes: Object.freeze(["clio-project-"]),
    iconId: "clioProject",
  }),
  clioPaint: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-clio-paint",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/clio-paint.js#installClioPaintWindow",
    cssPrefixes: Object.freeze(["clio-paint-"]),
    iconId: "clioPaint",
  }),
  todo: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-todo-da",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/todo-da.js#buildTodoDaWindow",
    cssPrefixes: Object.freeze(["todo-da-"]),
    iconId: "notePad",
  }),
  finishingReceipt: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-finishing-receipt",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/project-cd-print.js#installFinishingReceiptWindow",
    cssPrefixes: Object.freeze(["finishing-receipt-"]),
    iconId: "projectCd",
  }),
  holdThought: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-hold-thought",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/hold-that-thought.js#installHoldThoughtWindow",
    cssPrefixes: Object.freeze(["hold-thought-"]),
    iconId: "notePad",
  }),
  bureaucracyMeme: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-bureaucracy-meme",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/bureaucracy-meme.js#installBureaucracyMemeWindow",
    cssPrefixes: Object.freeze(["bureaucracy-"]),
    iconId: "bureaucracyMeme",
  }),
  controlStripModules: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-control-strip-modules",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/control-strip-modules-folder.js#installControlStripModulesWindow",
    cssPrefixes: Object.freeze(["control-strip-modules-"]),
    iconId: "folder",
  }),
  themeLab: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-theme-lab",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/theme-lab.js#installThemeLabWindow",
    cssPrefixes: Object.freeze(["theme-lab-"]),
    iconId: "themeLab",
  }),
  micropolis: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-micropolis",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/micropolis.js#installMicropolisWindow",
    cssPrefixes: Object.freeze(["micropolis-"]),
    iconId: "micropolis",
  }),
  openttd: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-openttd",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/openttd.js#installOpenTTDWindow",
    cssPrefixes: Object.freeze(["openttd-"]),
    iconId: "openttd",
  }),
  bonsaiCity: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-bonsai-city",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/bonsai-city.js#injectWindowFrame",
    cssPrefixes: Object.freeze(["bonsai-"]),
    iconId: "",
    iconFallback: "applications",
  }),
  doom: Object.freeze({
    sourceKind: "lazy",
    openCommand: "open-doom",
    ensure: "loadLazyWindowModule",
    mountPath: "app/features/doom.js#installDoomWindow",
    cssPrefixes: Object.freeze(["doom-", "openttd-"]),
    iconId: "doom",
  }),
});

// Prefixes that predate the registry do not always match the data-window id
// (TeachText uses .teachtext-*, DocMap uses .docmap-*, and so on). Keep those
// aliases here so CSS ratchets derive application ownership from the same
// authority as window coverage instead of a separate budget-file list.
const additionalCssPrefixes = Object.freeze({
  assistant: Object.freeze(["clio-"]),
  quickDraft: Object.freeze(["draft-"]),
  lightroom: Object.freeze(["lightroom-", "draft-desk-", "quick-draft-"]),
  cmfStudio: Object.freeze(["cmf-"]),
  scrapbook: Object.freeze(["scrap-"]),
  teachText: Object.freeze(["teachtext-", "manuscript-"]),
  endfieldTerminal: Object.freeze(["endfield-"]),
  bureaucracyMeme: Object.freeze(["bureaucracy-"]),
  docMap: Object.freeze(["docmap-"]),
  projects: Object.freeze(["project-disk-"]),
  findPath: Object.freeze(["find-"]),
  printDirectory: Object.freeze(["print-"]),
  rebuildFlow: Object.freeze(["rebuild-"]),
  alarmClock: Object.freeze(["alarm-"]),
  control: Object.freeze(["control-panel-"]),
  rag: Object.freeze(["memory-transfer-"]),
  fileInfo: Object.freeze(["info-"]),
  notificationCenter: Object.freeze(["notification-"]),
  writingBell: Object.freeze(["writing-"]),
});

const appearanceRepresentatives = Object.freeze({
  finder: ".finder-item .sys-icon",
  teachText: "#teachtext-body",
  reader: ".reader-pane",
  control: ".control-settings",
  assistant: ".clio-welcome-icon",
  pageSetup: ".btn.default",
  modelMeter: ".meter-stats",
  liquidCover: ".liquid-cover-window .window-pane",
});

// These ids name system infrastructure whose shorter id stem would swallow
// unrelated primitives (.control-strip) or the Appearance fixture itself.
// Their owned prefixes are the explicit aliases above, not the id-derived one.
const noDefaultCssPrefix = new Set(["control"]);
const cssRatchetExcludedWindows = new Set(["themeLab"]);

function kebabCaseWindowName(name) {
  return String(name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function surfaceMetadata(name) {
  const source = dynamicWindowSources[name] || {};
  const defaultPrefix = `${kebabCaseWindowName(name)}-`;
  const cssPrefixes = [...new Set([
    ...(noDefaultCssPrefix.has(name) ? [] : [defaultPrefix]),
    ...(additionalCssPrefixes[name] || []),
    ...(source.cssPrefixes || []),
  ])].sort();
  const representativeSample = appearanceRepresentatives[name] || "";
  return Object.freeze({
    sourceKind: source.sourceKind || "static",
    openCommand: source.openCommand || "",
    ensure: source.ensure || "dom-present",
    mountPath: source.mountPath || "index.html",
    cssPrefixes: Object.freeze(cssPrefixes),
    cssRatchet: !cssRatchetExcludedWindows.has(name),
    appearanceProbe: Object.freeze({
      sampleSelector: representativeSample || ".window-pane",
      representative: Boolean(representativeSample),
    }),
    iconId: source.iconId || "",
    iconFallback: source.iconFallback || "document",
  });
}

const windowInterfaceContracts = Object.freeze({
  assistant: specializedUtility("utility", {
    documentModel: "none",
    statusLayout: "multi-receipt",
    referenceSurface: "reader",
    rationale: "ClioTalk multiplexes conversation, model, and SideAsk receipts in one contextual strip.",
  }),
  control: deskAccessory("system", { statusLayout: "none" }),
  themeLab: specializedUtility("utility", {
    route: "system",
    documentModel: "none",
    statusLayout: "compact",
    referenceSurface: "control",
    rationale: "Theme Lab is an internal control-state specimen for reviewing one shared DOM across every Appearance.",
  }),
  chooser: modalSurface(),
  rag: specializedUtility("utility", {
    statusLayout: "compact",
    referenceSurface: "finder",
    rationale: "File Floppy reports mount lifetime and retrieval scope above its concrete file objects.",
  }),
  textDisk: finderSurface("core"),
  finder: finderSurface("core"),
  controlStripModules: specializedUtility("utility", {
    route: "system",
    documentModel: "none",
    statusLayout: "finder",
    referenceSurface: "finder",
    rationale: "The module folder uses Finder count, view, and location chrome without becoming a document app.",
  }),
  helpFolder: finderSurface("system"),
  applications: finderSurface("system"),
  quickDraft: specializedUtility("utility", {
    route: "core",
    statusLayout: "multi-receipt",
    referenceSurface: "teachText",
    rationale: "Quick Draft is an independent drafting application. It keeps drafting, protection, stack, save, and operation receipts visible, then offers a one-way entry into Writing Studio.",
  }),
  lightroom: specializedUtility("utility", {
    route: "core",
    statusLayout: "multi-receipt",
    referenceSurface: "teachText",
    rationale: "文字亮室 develops a document rather than writing one: the negative, the adjustment stack, protection, the version chain and the grain views. It opens beside the draft it works on, never instead of it, and takes the pen only while it is editing.",
  }),
  cmfStudio: creativeLab(),
  soundscape: creativeLab(),
  endfieldTerminal: creativeLab(),
  bureaucracyMeme: creativeLab(),
  micropolis: creativeLab(),
  openttd: creativeLab(),
  bonsaiCity: creativeLab(),
  doom: creativeLab(),
  imagePromptStudio: specializedUtility("utility", {
    documentModel: "none",
    statusLayout: "task-specific",
    referenceSurface: "clioStage",
    rationale: "Image Prompt Studio is a summoned prompt-building utility inside the shared application window and control grammar.",
  }),
  disk: finderSurface("core"),
  projectCd: specializedUtility("writing-route", {
    route: "core",
    statusLayout: "compact",
    referenceSurface: "finder",
    rationale: "Project CD is a Finder-like collection whose bar reports item count and volume location.",
  }),
  pageSetup: modalSurface("system", "specialized"),
  importUtility: modalSurface("system", "specialized"),
  projects: finderSurface("core"),
  documents: finderSurface("core"),
  chatFile: specializedUtility("utility", {
    statusLayout: "compact",
    referenceSurface: "reader",
    rationale: "A saved Chat File reports message count and durable-record identity while commands remain beside the preview.",
  }),
  teachText: standardDocument("writing-route", "core", { documentModel: "tdi", tdiHost: "teachtext-tabs" }),
  imageManager: specializedUtility("utility", {
    statusLayout: "finder",
    referenceSurface: "finder",
    rationale: "Image Manager browses attachment objects with count, view mode, and owning-document location.",
  }),
  findChange: deskAccessory("summoned"),
  reviewDesk: standardDocument("writing-route"),
  saveChat: modalSurface("summoned"),
  scrapbook: specializedUtility("utility", {
    statusLayout: "task-specific",
    referenceSurface: "finder",
    rationale: "Scrapbook combines object count, explicit creation, and an optional stack filter in compact object chrome.",
  }),
  trash: finderSurface("core"),
  printDirectory: specializedUtility("utility", {
    route: "system",
    statusLayout: "compact",
    referenceSurface: "finder",
    rationale: "Print Directory reports the selected Finder source and its print metadata above one preview.",
  }),
  reader: standardDocument("reader", "summoned", { documentModel: "tdi", tdiHost: "reader-tabs" }),
  timeMachine: specializedUtility("reader", {
    documentModel: "tdi",
    tdiHost: "time-machine-tabs",
    statusLayout: "navigation",
    referenceSurface: "reader",
    rationale: "Time Machine uses its archive navigation strip as the status analogue while sharing Reader TDI and Ask behavior.",
  }),
  questionSheet: standardDocument("writing-route"),
  outline: standardDocument("writing-route"),
  sectionDrafts: standardDocument("writing-route"),
  findPath: standardDocument("utility", "summoned", { referenceSurface: "reader" }),
  findFile: specializedUtility("utility", {
    statusLayout: "compact",
    referenceSurface: "finder",
    rationale: "Find File reports the searched Project Hard Disk scope and result count above a local query pane.",
  }),
  contextPanel: specializedUtility("utility", {
    statusLayout: "multi-row",
    referenceSurface: "reader",
    rationale: "Context Panel reserves a second receipt line for retrieval budget provenance that must not be truncated.",
  }),
  rebuildFlow: specializedUtility("utility", {
    route: "core",
    statusLayout: "compact",
    referenceSurface: "teachText",
    rationale: "Rebuild Flow reports destination and source identity while step progress remains beside the rebuild operation.",
  }),
  docMap: standardDocument("utility", "summoned", { documentModel: "tdi", tdiHost: "docmap-tabs" }),
  clioStage: creativeLab(),
  clioChart: creativeLab(),
  clioPaint: creativeLab(),
  // The plan for one project: a summoned utility over the route, not a lab.
  clioProject: specializedUtility("utility", {
    route: "summoned",
    statusLayout: "compact",
    referenceSurface: "teachText",
    rationale: "ClioProject reports the chain blocking the handoff in its status bar over a derived node-and-arrow plan.",
  }),
  liquidCover: creativeLab(),
  dictionary: deskAccessory(),
  systemHelp: specializedUtility("utility", {
    route: "system",
    statusLayout: "compact",
    referenceSurface: "systemHelp",
    rationale: "System Help reports the active glossary scope and match count above its list-detail browser.",
  }),
  dictation: deskAccessory("summoned"),
  translationPad: deskAccessory("summoned"),
  sideAskPad: deskAccessory("summoned"),
  // The writing accessories share one status shell: state on the left, and on
  // the right where the content goes or what the window holds.
  notePad: deskAccessory("system", { documentModel: "sdi" }),
  todo: deskAccessory("system", { documentModel: "sdi" }),
  holdThought: deskAccessory("system", { documentModel: "sdi", statusLayout: "none" }),
  projectPeek: deskAccessory("system", { documentModel: "sdi" }),
  clipboard: deskAccessory("system", { documentModel: "sdi" }),
  alarmClock: deskAccessory("system", { statusLayout: "none" }),
  calculator: deskAccessory("system", { statusLayout: "none" }),
  writingBell: deskAccessory("system"),
  memoryCards: specializedUtility("utility", {
    statusLayout: "compact",
    referenceSurface: "control",
    rationale: "Memory Cards keeps move and elapsed-time readouts together as the state of one small game board.",
  }),
  puzzle: deskAccessory("system", { statusLayout: "none" }),
  modelMeter: statusSurface(),
  keyCaps: deskAccessory("system", { statusLayout: "none" }),
  systemStatus: statusSurface(),
  notificationCenter: statusSurface(),
  fileInfo: modalSurface(),
  projectInfo: modalSurface("core"),
  finishingReceipt: modalSurface("core"),
  about: modalSurface(),
});

export const windowInterfaceRegistry = Object.freeze(Object.fromEntries(
  Object.entries(windowInterfaceContracts).map(([name, contract]) => [
    name,
    Object.freeze({ ...contract, ...surfaceMetadata(name) }),
  ]),
));

export const applicationCssPrefixes = Object.freeze([
  ...new Set(Object.values(windowInterfaceRegistry)
    .filter((contract) => contract.cssRatchet)
    .flatMap((contract) => contract.cssPrefixes)),
].sort());
