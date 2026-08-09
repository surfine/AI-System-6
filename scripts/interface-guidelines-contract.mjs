// Machine-readable companion to HIG.md.
//
// This file is intentionally outside the browser bundle. It makes every
// product window declare its object role and shell before feature code can
// treat it as a one-off layout. New data-window entries must be added here and
// must choose the canonical shell or state why a specialized shell is needed.

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

export const windowInterfaceRegistry = Object.freeze({
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
  cmfStudio: creativeLab(),
  soundscape: creativeLab(),
  endfieldTerminal: creativeLab(),
  bureaucracyMeme: creativeLab(),
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
  guide: specializedUtility("utility", {
    route: "system",
    statusModel: "none",
    statusLayout: "none",
    referenceSurface: "systemHelp",
    rationale: "Start Here is a short task guide whose cards carry their own progress and actions.",
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
  notePad: deskAccessory("system", { documentModel: "sdi", statusLayout: "task-specific" }),
  clipboard: deskAccessory("system", { documentModel: "sdi" }),
  alarmClock: deskAccessory("system", { statusLayout: "none" }),
  calculator: deskAccessory("system", { statusLayout: "none" }),
  writingBell: deskAccessory("system", { statusLayout: "none" }),
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
  about: modalSurface(),
});
