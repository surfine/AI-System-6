// VM harness for app/core/boot.js: actually EXECUTES boot(), the way the
// browser does, instead of grepping its source text for known-good phrases.
//
// Every other boot contract (boot-warm-resume, boot-recovery, lazy-loader...)
// is a static assertion over the source string. That is exactly the gap that
// let a temporal-dead-zone ReferenceError in a boot-path refactor reach a
// white screen while 253 contracts stayed green: nothing in the suite ever
// ran the function. This harness follows the same "vm.runInContext one real
// source file against hand-built stubs" pattern already used for
// write-lease-vm.mjs — no new dependency, just boot.js's own dependency list
// stood up as inert stubs so the real control flow executes for real.
//
// Every stub is a no-op or an immediately-resolving async function by
// default; a test overrides exactly the ones it cares about (to inject a
// throw, or to observe whether a step ran).

import vm from "node:vm";
import { read } from "./feature-test-harness.mjs";

const bootSource = read("app/core/boot.js");

const syncNoop = () => undefined;
const asyncNoop = async () => undefined;

/**
 * Build a fresh vm context with boot.js's full dependency surface stubbed,
 * run boot.js's source in it (defining boot() and its siblings), and return
 * handles for driving and inspecting it.
 *
 * `overrides` replaces any top-level context property — a stub function to
 * inject a throw, a starting value for a state variable (writerMode,
 * clioOnboardingCompleted, ...), or a spy that records a call.
 */
export function createBootContext(overrides = {}) {
  const notifications = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const bodyDataset = {};

  const document = {
    body: { dataset: bodyDataset },
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({
      classList: { add: syncNoop, remove: syncNoop },
      style: {},
      append: syncNoop,
      addEventListener: syncNoop,
      setAttribute: syncNoop,
    }),
  };

  const base = {
    console: {
      log: syncNoop,
      error: (...args) => { consoleErrors.push(args); },
      warn: (...args) => { consoleWarnings.push(args); },
    },
    document,
    window: { location: { reload: syncNoop } },
    localStorage: { getItem: () => null, setItem: syncNoop, removeItem: syncNoop },
    // Fast, real timers: startupTaskWithTimeout races a resolved promise
    // against these, and the final maintenance block schedules one at 8000ms
    // in the real app — capped here so the contract runs in milliseconds,
    // not seconds.
    setTimeout: (fn, ms, ...args) => setTimeout(fn, Math.min(Number(ms) || 0, 15), ...args),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: () => 0,
    clearInterval: syncNoop,
    t: (key, ...args) => (args.length ? `${key}(${args.join(", ")})` : key),
    pushSystemNotification: (message, options = {}) => { notifications.push({ message, options }); },

    // State boot() reads directly.
    currentLanguage: "en",
    writerMode: false,
    clioOnboardingCompleted: true,
    localLmStudioConnectionEnabled: false,
    modelInput: { value: "" },

    // registerRuntimeRenderTasks() reads these as plain values (a task
    // table), not calls — referencing an undeclared identifier throws
    // whether or not it is ever invoked, so this handful needs stubs too
    // even though boot() never calls them directly.
    updateProjectLabels: syncNoop,
    renderContextPanel: syncNoop,
    renderReaderTabs: syncNoop,
    updateMenuStatus: syncNoop,
    renderAboutMacintosh: syncNoop,
    renderLocalModelState: syncNoop,

    // Every bare-identifier dependency boot() calls, in the order boot()
    // calls them. Defaults are inert; see the module doc comment above.
    updateClock: syncNoop,
    ensureAlarmClockModule: asyncNoop,
    ensureProjectCdPrintModule: asyncNoop,
    ensureContextGistModule: asyncNoop,
    ensureDocMapSourcePolicyModule: asyncNoop,
    ensureUserRecoveryMessagesModule: asyncNoop,
    ensureDocumentRolePolicyModule: asyncNoop,
    ensurePromptFilesData: asyncNoop,
    ensureLanguageFor: asyncNoop,
    ensureMarkdownParser: asyncNoop,
    initializeAlarmClock: syncNoop,
    loadAppVersion: syncNoop,
    loadDeskState: asyncNoop,
    applyLanguage: syncNoop,
    applyDeploymentWorkspaceDefault: asyncNoop,
    configurePublicLmStudioControls: syncNoop,
    syncDocMapLayoutControls: syncNoop,
    initSystemSelectControls: syncNoop,
    initSharedControlBehaviors: syncNoop,
    hydrateSystemIcons: syncNoop,
    renderProjectDisks: syncNoop,
    renderProjectReferences: syncNoop,
    renderScraps: syncNoop,
    renderTrash: syncNoop,
    renderDocuments: syncNoop,
    renderMountedTextDisk: syncNoop,
    renderProjectCd: syncNoop,
    loadActiveProjectReferences: syncNoop,
    renderPipeline: syncNoop,
    applyWritingToolsViewMode: syncNoop,
    updateLocalModelState: syncNoop,
    connectLocalLmStudio: asyncNoop,
    renderLocalConnectionStatus: syncNoop,
    refreshImporterStatus: syncNoop,
    initDragAndDrop: syncNoop,
    restoreWorkingSession: asyncNoop,
    openStartupItems: syncNoop,
    enterWriterMode: asyncNoop,
    openWindow: syncNoop,
    setControlTab: syncNoop,
    updateMenuState: syncNoop,
    refreshSystemSelectControls: syncNoop,
    installWorkingSessionAutosave: syncNoop,
    installApplicationLifecycleWatch: syncNoop,
    runBootSequence: asyncNoop,
    scheduleDesktopMaintenance: syncNoop,
    applyControlStripState: syncNoop,
    ensureScriptingModule: asyncNoop,
    getWindow: () => null,
    renderStaticFinderWindow: syncNoop,
    startLocalModelMonitor: syncNoop,
    showBootFailure: syncNoop,
    // Called as syncIconColumnDensity?.() — optional chaining only guards a
    // value that resolves to null/undefined, not an unbound identifier, so
    // this still needs a binding even though it is never called unguarded.
    syncIconColumnDensity: syncNoop,
  };

  const merged = { ...base, ...overrides };
  const context = vm.createContext(merged);
  vm.runInContext(bootSource, context);

  return { context, notifications, consoleErrors, consoleWarnings, bodyDataset };
}
