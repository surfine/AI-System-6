// Teaser mode contracts: a seeded, deterministic 15–30s walkthrough that
// needs no model or network, clearly labels its material as Demo, restores
// the user's desk and project on exit, stays stoppable (Escape / button,
// including phone viewports), and never fakes a live run.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-demo-teaser");
const writingDemo = read("app/features/writing-demo.js");
const teaserSection = writingDemo.split("// ---- Teaser mode")[1] || "";
const actions = read("app/core/actions.js");
const indexHtml = read("index.html");
const appJs = read("app.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// API surface: teaser shares the demo engine but runs under its own mode.
test.assertIncludes(writingDemo, "playTeaser:", "the writing demo API exposes a teaser mode");
test.assertIncludes(writingDemo, "stopTeaser:", "the teaser mode can be stopped");
test.assertIncludes(writingDemo, 'mode: "teaser"', "the teaser runs under its own mode marker");
test.assertIncludes(writingDemo, "teaserDemoSceneSource", "teaser scene 1 (a modern source enters the desktop) exists");
test.assertIncludes(writingDemo, "teaserDemoSceneTransform", "teaser scene 2 (material transforms across apps) exists");
test.assertIncludes(writingDemo, "teaserDemoSceneResult", "teaser scene 3 (the result is a file) exists");
test.assertIncludes(writingDemo, "teaserDemoRestore", "the teaser restores the user's desk");
test.assertIncludes(writingDemo, "teaserDemoSnapshotDurable", "the teaser snapshots the full durable state before running");
test.assertIncludes(writingDemo, "teaserDemoDurableCollections", "the teaser restores durable collections in place");
test.assertIncludes(writingDemo, "teaserDemoEnsureDemoProject", "the teaser always runs in a dedicated temporary project");
test.assertIncludes(writingDemo, "seeded: true", "teaser files are explicitly marked as seeded");

// No live capability is faked inside the teaser path.
test.assertNotIncludes(teaserSection, "fetchModelPayload", "the teaser never calls the model");
test.assertNotIncludes(teaserSection, "searchFindPath", "the teaser never runs a live search");
test.assertNotIncludes(teaserSection, "writingDemoRunPreflight", "the teaser needs no live preflight");
test.assertNotIncludes(teaserSection, "writingDemoProbeModel", "the teaser does not probe a model");
test.assertNotIncludes(teaserSection, "ensureSlidesExportModule", "the teaser never needs the slides generator");
test.assertIncludes(teaserSection, "Demo", "teaser captions and fixtures label the material as Demo");
test.assertIncludes(teaserSection, "The AI has a desktop now", "the teaser ends on the product slogan");

// Exit paths: Escape routes through the teaser stop, and the stop button
// exists for touch viewports.
test.assertIncludes(writingDemo, 'writingDemoRun.mode === "teaser"', "Escape stops the teaser");
test.assertIncludes(writingDemo, "writingDemoSetTeaserButtons", "the teaser has its own start/stop button state");
test.assertIncludes(writingDemo, "teaser-demo-running", "the teaser marks its running surface distinctly from the full demo");

// Entry points: registered action, Applications item, and bilingual labels.
// First-run onboarding is owned by ClioTalk; the deterministic tour remains an
// explicit Extras application instead of a second onboarding system.
test.assertIncludes(actions, '"play-teaser-demo"', "the teaser action is registered");
test.assertIncludes(actions, "playWelcomeTour", "the explicit tour command reaches teaser mode");
test.assertIncludes(appJs, "play-teaser-demo", "the Applications folder lists the teaser");
test.assertIncludes(en, "guide_play_teaser_demo:", "English labels the teaser");
test.assertIncludes(zh, "guide_play_teaser_demo:", "Chinese labels the teaser");

// The full live demo is preserved untouched.
test.assertIncludes(writingDemo, "play: playWritingDemo", "the full live demo entry stays intact");
test.assertIncludes(writingDemo, "writingDemoRunPreflight", "the full demo still preflights its real capabilities");

// System-surface wiring for the shared story (receipts + activity visible
// without new windows).
const persistenceStatus = read("app/core/persistence-status.js");
const finderObjects = read("app/features/finder-objects.js");
const coordinator = read("app/core/writing-agent-coordinator.js");
test.assertIncludes(persistenceStatus, "renderAssistantActivityRow", "System Status renders the assistant activity row");
test.assertIncludes(persistenceStatus, "renderSystemRecentRuns", "System Status renders recent runs");
test.assertIncludes(persistenceStatus, "dataset.assistantState", "System Status exposes the semantic activity hook");
test.assertIncludes(finderObjects, "renderRunReceiptInfo", "Get Info renders produced-by provenance");
test.assertIncludes(finderObjects, "run_receipt_repeat", "Get Info offers Repeat This Run");
test.assertIncludes(coordinator, "reportRunTransition", "writing agent runs feed the activity state");

// The tour is discoverable as an application, never pushed as a carousel or toast.
const writerGuide = read("app/features/writer-guide.js");
test.assertNotIncludes(writerGuide, "pushSystemNotification", "onboarding never pushes the tour after dismissal");

// ---- Behavioral state tests ----------------------------------------------
// The teaser must leave durable user state untouched: complete run, mid-run
// stop, scene error, with or without a mounted project. Deep-equality checks
// against the pre-run snapshot replace source-search-only restore proof.

function deepClone(value) {
  return structuredClone(value);
}

function durableSnapshot(runtime) {
  return {
    projects: deepClone(runtime.projects),
    chatFolders: deepClone(runtime.chatFolders),
    chatFiles: deepClone(runtime.chatFiles),
    scraps: deepClone(runtime.scraps),
    trashItems: deepClone(runtime.trashItems),
    projectCdItems: deepClone(runtime.projectCdItems),
    projectReferences: deepClone(runtime.projectReferences),
    activeProjectId: runtime.activeProjectId,
    isProjectMounted: runtime.isProjectMounted,
    selectedProjectId: runtime.selectedProjectId,
    selectedFolderId: runtime.selectedFolderId,
    selectedChatFileId: runtime.selectedChatFileId,
  };
}

function assertDurableEqual(test, label, before, after) {
  test.assert(
    JSON.stringify(before.projects) === JSON.stringify(after.projects),
    `${label}: projects are deep-equivalent`
  );
  test.assert(
    JSON.stringify(before.chatFolders) === JSON.stringify(after.chatFolders),
    `${label}: folders are deep-equivalent`
  );
  test.assert(
    JSON.stringify(before.chatFiles) === JSON.stringify(after.chatFiles),
    `${label}: files are deep-equivalent`
  );
  test.assert(
    JSON.stringify(before.scraps) === JSON.stringify(after.scraps),
    `${label}: scraps are deep-equivalent`
  );
  test.assert(
    JSON.stringify(before.trashItems) === JSON.stringify(after.trashItems),
    `${label}: trash is deep-equivalent`
  );
  test.assert(
    JSON.stringify(before.projectCdItems) === JSON.stringify(after.projectCdItems),
    `${label}: project CD is deep-equivalent`
  );
  test.assert(
    before.activeProjectId === after.activeProjectId,
    `${label}: the active project id is restored`
  );
  test.assert(
    before.isProjectMounted === after.isProjectMounted,
    `${label}: the mounted/unmounted state is restored`
  );
  test.assert(
    before.selectedProjectId === after.selectedProjectId,
    `${label}: the selected project is restored`
  );
  test.assert(
    before.selectedFolderId === after.selectedFolderId,
    `${label}: the selected folder is restored`
  );
  test.assert(
    before.selectedChatFileId === after.selectedChatFileId,
    `${label}: the selected file is restored`
  );
  test.assert(
    !after.projects.some((project) => project.teaserDemo || /Teaser Demo/.test(String(project.name || ""))),
    `${label}: no demo project survives`
  );
  test.assert(
    !after.chatFiles.some((file) => file.artifactKind === "teaser-demo" || file.demo?.kind === "teaser"),
    `${label}: no demo file survives`
  );
  test.assert(
    !after.chatFiles.some((file) => file.artifactKind === "clio-run-record"),
    `${label}: no demo run receipt survives`
  );
}

function createTeaserRuntime(options = {}) {
  const mounted = options.mounted !== false;
  const realProject = { id: "real-project", name: "Real Project", createdAt: "2026-01-01T00:00:00.000Z", teaserDemo: undefined };
  const realFile = { id: "real-file", projectId: "real-project", name: "A.md", body: "A", artifactKind: "text" };
  const realScrap = { id: "real-scrap", projectId: "real-project", name: "Scrap X", body: "X", artifactKind: "clipping" };
  const projects = [realProject];
  const chatFiles = [realFile, realScrap];
  const chatFolders = [];
  const scraps = [];
  const trashItems = [];
  const projectCdItems = [];
  const projectReferences = [];
  const ragChunks = [];
  const timers = [];
  let abortCalls = 0;
  const activeAbortController = options.cancellable === true
    ? { abort: () => { abortCalls += 1; }, signal: { aborted: false } }
    : null;
  const documentStub = {
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({
      className: "",
      textContent: "",
      style: { setProperty: () => {}, zIndex: "" },
      dataset: {},
      classList: { add: () => {}, remove: () => {} },
      append: () => {},
      remove: () => {},
      scrollIntoView: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    }),
    body: {
      append: () => {},
      classList: { add: () => {}, remove: () => {} },
    },
    elementFromPoint: () => null,
  };
  let fakeNowMs = 1_700_000_000_000;
  class TeaserDate {
    constructor(value) {
      this.d = typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : new Date(fakeNowMs);
    }

    toISOString() {
      return this.d.toISOString();
    }

    static now() {
      fakeNowMs += 1_000_000;
      return fakeNowMs;
    }
  }
  const context = vm.createContext({
    console,
    crypto: webcrypto,
    structuredClone,
    Date: TeaserDate,
    DOMException,
    projects,
    chatFiles,
    chatFolders,
    scraps,
    trashItems,
    projectCdItems,
    projectReferences,
    ragChunks,
    activeProjectId: mounted ? "real-project" : "",
    isProjectMounted: mounted,
    selectedProjectId: "real-project",
    selectedFolderId: "all",
    selectedChatFileId: null,
    selectedDocumentFolderId: null,
    selectedProjectRootItemId: null,
    currentLanguage: "en",
    t: (key) => key,
    setStatus: () => {},
    activeAbortController,
    systemModal: null,
    document: documentStub,
    setTimeout: (fn) => {
      timers.push({ fn });
      return timers.length;
    },
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    uniqueProjectName: (name) => name,
    createProjectRecord: (name) => ({
      id: webcrypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      teaserDemo: undefined,
    }),
    parkConversationInProject: () => {},
    clearProjectTransientState: () => {},
    closeProjectScopedWindows: () => {},
    scheduleWorkspaceRender: () => {},
    resetAssistantForProject: () => {},
    loadActiveProjectReferences: () => {},
    saveDeskState: async () => true,
    ensureFolder: (name, parentId = null) => {
      const folder = {
        id: webcrypto.randomUUID(),
        projectId: context.activeProjectId,
        name,
        parentId,
        createdAt: new Date().toISOString(),
      };
      chatFolders.push(folder);
      return folder;
    },
    nextAvailableFileName: (name) => name,
    renderDocuments: () => {},
    renderProjectDisks: () => {},
    renderScraps: () => {},
    renderTrash: () => {},
    renderProjectCd: () => {},
    renderProjectReferences: () => {},
    openTextFile: () => {},
    openWindow: () => {},
    closeWindow: () => {},
    getWindow: () => null,
    focusWindow: () => null,
    writingDemoPlaceWindow: () => {},
    writingDemoClampWindowAboveCaption: () => {},
    setInlineStyleValue: () => {},
    createClippingFile: (input = {}) => {
      if (options.failClipping === true) throw new Error("scene boom");
      const clipping = {
        id: webcrypto.randomUUID(),
        projectId: context.activeProjectId,
        type: "text",
        artifactKind: "clipping",
        name: input.sourceTitle || "Clip",
        body: input.text || "",
        clipping: { sourceType: input.sourceType || "teaser-demo" },
      };
      chatFiles.unshift(clipping);
      context.selectedChatFileId = clipping.id;
      return clipping;
    },
    window: {
      AISystem6Iphone17eDemoCorpus: {},
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener: () => {},
      removeEventListener: () => {},
      AISystem6AssistantActivity: { resetForProject: () => {} },
    },
  });
  vm.runInContext(writingDemo, context);
  return {
    context,
    window: context.window,
    projects,
    chatFiles,
    chatFolders,
    scraps,
    trashItems,
    projectCdItems,
    projectReferences,
    ragChunks,
    timers,
    get activeProjectId() { return context.activeProjectId; },
    get isProjectMounted() { return context.isProjectMounted; },
    get selectedProjectId() { return context.selectedProjectId; },
    get selectedFolderId() { return context.selectedFolderId; },
    get selectedChatFileId() { return context.selectedChatFileId; },
    get abortCalls() { return abortCalls; },
    flushTimers() {
      while (timers.length) timers.shift().fn();
    },
    async settle() {
      for (let i = 0; i < 60; i += 1) {
        this.flushTimers();
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
  };
}

async function runTeaser(runtime, { stopWhen = null } = {}) {
  const promise = runtime.window.AISystem6WritingDemo.playTeaser();
  let settled = false;
  promise.finally(() => { settled = true; });
  for (let i = 0; i < 300 && !settled; i += 1) {
    runtime.flushTimers();
    await new Promise((resolve) => setImmediate(resolve));
    if (stopWhen && stopWhen(runtime)) {
      runtime.window.AISystem6WritingDemo.stopTeaser();
    }
  }
  await runtime.settle();
  await promise;
  return settled;
}

// Case A: an existing mounted project with files and scraps stays untouched.
{
  const runtime = createTeaserRuntime({ mounted: true });
  const before = durableSnapshot(runtime);
  await runTeaser(runtime);
  const after = durableSnapshot(runtime);
  assertDurableEqual(test, "Case A (complete run with a real project)", before, after);
}

// Case B: no mounted project stays unmounted and no demo project is created.
{
  const runtime = createTeaserRuntime({ mounted: false });
  const before = durableSnapshot(runtime);
  test.assert(before.isProjectMounted === false, "Case B fixture starts unmounted");
  await runTeaser(runtime);
  const after = durableSnapshot(runtime);
  test.assert(after.isProjectMounted === false, "Case B: the system stays unmounted after the teaser");
  test.assert(
    after.projects.length === before.projects.length,
    "Case B: no demo project is left behind"
  );
  assertDurableEqual(test, "Case B (no mounted project)", before, after);
}

// Case C: stopping mid-run (scene 2) still rolls back every durable write.
{
  const runtime = createTeaserRuntime({ mounted: true, cancellable: true });
  const before = durableSnapshot(runtime);
  const sawClipping = (r) => r.chatFiles.some((file) => file.artifactKind === "clipping" && file.projectId !== "real-project");
  await runTeaser(runtime, { stopWhen: sawClipping });
  test.assert(sawClipping(runtime) === false, "Case C: the demo clipping is rolled back");
  test.assert(runtime.abortCalls >= 1, "Case C: stopping the teaser aborts the demo run");
  const after = durableSnapshot(runtime);
  assertDurableEqual(test, "Case C (mid-run stop)", before, after);
}

// Case D: a scene error still rolls back in finally.
{
  const runtime = createTeaserRuntime({ mounted: true, failClipping: true });
  const before = durableSnapshot(runtime);
  await runTeaser(runtime);
  const after = durableSnapshot(runtime);
  assertDurableEqual(test, "Case D (scene throws)", before, after);
}

// --- The closing beat: watching to the end is being introduced --------------
test.assertIncludes(writingDemo, "completedRun = true;", "only a run that played all three scenes counts as completed");
test.assertIncludes(writingDemo, "if (completedRun) await showTeaserClosingCard();", "the closing card follows desk restore, and an aborted run shows no card");
test.assertMatches(
  writingDemo,
  /async function showTeaserClosingCard\(\)[\s\S]*?completeClioOnboarding\("toured"\)[\s\S]*?hideCancel: true,/,
  "a completed tour completes the introduction and asks one question with two named answers"
);
test.assertMatches(
  writingDemo,
  /choice === "no"[\s\S]{0,80}handleAction\("open-quick-draft"\)/,
  "the draft answer opens Quick Draft, the first-win door"
);
for (const key of ["teaser_closing_message", "teaser_closing_look_around", "teaser_closing_draft_one"]) {
  test.assertIncludes(en, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese copy exists for ${key}`);
}

test.finish();
