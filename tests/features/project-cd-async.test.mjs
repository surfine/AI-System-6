// Project CD burn contract: addProjectCdItem is async, assembles the record
// once from explicit options, and fails closed when the pre-burn revision
// cannot be persisted. Downloading Markdown is a separate operation and never
// implies a CD write.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("project-cd-async");
const source = read("app/features/export-import.js");

function makeHarness({ revisionFails = false, commitFails = false } = {}) {
  const state = {
    status: "",
    revisionCalls: [],
    linkClicked: false,
    savedArtifacts: [],
  };
  const fakeLink = {
    set href(_) {},
    set download(_) {},
    click() { state.linkClicked = true; },
    remove() {},
  };
  const context = vm.createContext({
    crypto: webcrypto,
    structuredClone,
    URL,
    Blob,
    Date,
    window: {
      location: { protocol: "http:", hostname: "x" },
      AISystem6Config: {},
      // Every artifact leaves through one exit; the harness watches it.
      AISystem6WebPlatform: {
        saveArtifact: (artifact) => {
          state.linkClicked = true;
          state.savedArtifacts.push(artifact);
          return true;
        },
      },
    },
    // export-import defines its own renderProjectCd; the null grid handle
    // makes it a no-op in the VM.
    projectCdGridEl: null,
    document: {
      createElement: () => fakeLink,
      body: { append() {}, remove() {} },
    },
    getActiveProject: () => ({ id: "p1", name: "P" }),
    activeProjectId: "p1",
    activeTextFileId: "doc-1",
    teachTextWorkflowState: "final",
    currentLanguage: "en",
    projectCdItems: [],
    selectedProjectCdItemId: "",
    selectedProjectCdItemIds: new Set(),
    projectReferences: [],
    chatFiles: [],
    trashItems: [],
    projects: [{ id: "p1", name: "P" }],
    chatFolders: [],
    scraps: [],
    createDocumentRevision: async (options) => {
      state.revisionCalls.push(options);
      if (revisionFails) throw new Error("forced revision write failure");
      return { id: "rev-1", ...options };
    },
    renderProjectCd: () => {},
    setStatus: (message) => { state.status = message; },
    t: (key, ...args) => `${key}:${args.join(",")}`,
    sanitizeFilename: (name) => name,
    countMarkdownWords: (text) => String(text || "").length,
  });
  // The module reads storage/state facades through window, not as bare globals.
  context.window.AISystem6StateStores = {
    projects: {
      commit: async (updater) => {
        if (commitFails) throw new Error("forced commit failure");
        updater({
          projects: context.projects,
          projectCdItems: context.projectCdItems,
        });
        return { ok: true };
      },
    },
  };
  vm.runInContext(source, context);
  return { context, state };
}

{
  const { context, state } = makeHarness();
  const item = await context.addProjectCdItem("# H", "Doc", {
    sourceDocumentId: "doc-9",
    sourceKind: "markdown",
  });
  test.assert(!!item && item.title === "Doc.md", "successful burn returns the assembled Project CD item");
  test.assert(
    item.sourceDocumentId === "doc-9" && item.sourceKind === "markdown",
    "the record is assembled once from explicit options"
  );
  test.assert(context.projectCdItems.length === 1, "the burned item is committed to the CD store");
  test.assert(
    state.revisionCalls.some((call) => call.operation === "project-cd" && call.documentId === "doc-9"),
    "the pre-burn revision is persisted with the explicit source document"
  );
}

{
  const { context, state } = makeHarness({ revisionFails: true });
  const item = await context.addProjectCdItem("# H", "Doc");
  test.assert(item === null, "a failed pre-burn revision returns null");
  test.assert(context.projectCdItems.length === 0, "a failed pre-burn revision writes nothing to the CD");
  test.assert(/版本历史/.test(state.status) || /version history/.test(state.status), "the failure is visible in the status");
}

{
  // downloadMarkdown is a pure download: it must not create a CD item and
  // must not claim an export.
  const { context, state } = makeHarness();
  context.downloadMarkdown("# H", "Doc");
  test.assert(context.projectCdItems.length === 0, "downloadMarkdown never writes to the Project CD");
  test.assert(state.status.startsWith("downloaded_markdown_only"), "downloadMarkdown reports a download only");
  test.assert(state.linkClicked === true, "downloadMarkdown triggers the download link");
  test.assert(
    state.savedArtifacts.at(-1)?.mimeType === "text/markdown;charset=utf-8",
    "downloadMarkdown saves through the shared artifact exit"
  );
}

{
  // Combined download+burn: the burn runs first and must succeed before the
  // download happens or the combined success status is shown.
  const failHarness = makeHarness({ revisionFails: true });
  const failed = await failHarness.context.downloadMarkdownAndBurnToProjectCd("# H", "Doc");
  test.assert(failed === false, "a failed burn in the combined path returns false");
  test.assert(failHarness.state.linkClicked === false, "a failed burn never downloads the file");

  const okHarness = makeHarness();
  const succeeded = await okHarness.context.downloadMarkdownAndBurnToProjectCd("# H", "Doc");
  test.assert(succeeded === true, "a successful combined path returns true");
  test.assert(okHarness.state.linkClicked === true, "a successful combined path downloads the file");
  test.assert(okHarness.state.status.startsWith("downloaded_markdown_exported"), "a successful combined path claims both");
}

test.finish();
