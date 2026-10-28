// ClioWorks N15a contract: TeachText 「自动存档」 revisions and link following,
// as real code in a VM. Three contexts, all classic scripts the way the page
// loads them:
//   A. the archive — real document-revisions.js (createDocumentRevision's own
//      dedup and per-document cap, real IndexedDB-shaped store stub) + real
//      writing-safety.js with captured timers, so the idle debounce is driven
//      by hand;
//   B. the link — real markdown.js's isSafeMarkdownHref behind
//      writing-safety.js's cursor parser, with window.open stubbed;
//   C. the crash — real working-session.js teachText adapter: a body newer
//      than the last explicit save must come back with the window visibly
//      unsaved, never looking saved.
// Plus the real restore entry: AISystem6DocumentRevisions.restore putting an
// auto-archive revision back into the body through the existing Versions… UI
// path, which marks the document modified right after.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("teachtext-autoarchive");

const settle = async (rounds = 8) => {
  for (let index = 0; index < rounds; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

const revisionCap = Number(/maxDocumentRevisions\s*=\s*(\d+)/.exec(read("app/core/document-revisions.js"))?.[1]);

// --- context A: the archive scheduler over the real revision store ----------

function makeArchiveContext() {
  const timers = { nextId: 1, pending: new Map(), cleared: [] };
  const revisionsStore = new Map();
  const counters = { put: 0 };
  const paper = {
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
    listeners: {},
    addEventListener(name, handler) {
      (this.listeners[name] ||= []).push(handler);
    },
    focus() {},
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    dispatchEvent() {},
  };
  const statusNotes = [];
  // The browser's side of execCommand("insertText"): one recorded call, the
  // selected range replaced. The record is how the contract sees that a
  // restore landed as ONE undoable editor step rather than a value write.
  const execInserts = [];
  const context = {
    console: { warn() {}, log() {}, error() {} },
    crypto, Promise, Map, Set, WeakMap, JSON, Math, Date,
    setTimeout: (handler, delay) => {
      const id = timers.nextId;
      timers.nextId += 1;
      timers.pending.set(id, { handler, delay });
      return id;
    },
    clearTimeout: (id) => {
      timers.cleared.push(id);
      timers.pending.delete(id);
    },
    document: {
      addEventListener() {},
      visibilityState: "visible",
      execCommand(command, showUi, value) {
        if (command !== "insertText") return false;
        execInserts.push(String(value));
        paper.value = paper.value.slice(0, paper.selectionStart) + String(value) + paper.value.slice(paper.selectionEnd ?? paper.selectionStart);
        return true;
      },
    },
    openAppDb: async () => ({ close() {} }),
    keyvalStoreName: "keyval",
    idbRequest: (request) => Promise.resolve(request),
    activeProjectId: "project-15a",
    activeTextFileId: "file-15a",
    teachTextWorkflowState: "draft",
    teachTextBodyInput: paper,
    teachTextStatusEl: { dataset: { statusKey: "" } },
    projects: [{ id: "project-15a", name: "N15a", archived: false, outline: "旧 outline" }],
    chatFiles: [],
    t: (key) => `t:${key}`,
    setStatus: (message) => statusNotes.push(message),
    markDeskDirty() {},
    markTeachTextModified: () => statusNotes.push("markTeachTextModified"),
    saveDeskState: async () => true,
  };
  context.window = context;
  context.AISystem6StorageTransactions = {
    runTransaction: async (db, storeName, mode, run) => run({
      objectStore: () => ({
        get: async (key) => revisionsStore.get(key),
        put: async (value, key) => {
          counters.put += 1;
          revisionsStore.set(key, value);
          return key;
        },
      }),
    }),
  };
  vm.createContext(context);
  vm.runInContext(read("app/core/document-revisions.js"), context, { filename: "app/core/document-revisions.js" });
  // The real editor helpers: mdeApply is the undoable full-replace path a
  // restore must ride. markdown-editor.js has no top-level statements, so it
  // only contributes its declarations to the shared scope.
  vm.runInContext(read("app/core/markdown-editor.js"), context, { filename: "app/core/markdown-editor.js" });
  vm.runInContext(read("app/features/writing-safety.js"), context, { filename: "app/features/writing-safety.js" });
  return { context, timers, revisionsStore, paper, statusNotes, counters, execInserts };
}

const archive = makeArchiveContext();
const archiveKey = () => archive.context.documentRevisionStorageKey("project-15a", "file-15a");
const typeIntoManuscript = () => {
  for (const handler of archive.paper.listeners.input || []) handler();
};
const fireIdle = async () => {
  const pending = [...archive.timers.pending.values()];
  archive.timers.pending.clear();
  for (const { handler } of pending) handler();
  await settle();
};
const archiveList = async () => archive.context.listDocumentRevisions();

{
  // 空闲防抖：输入后挂一个 20–30 秒的计时器，再输入把旧计时器作废重挂。
  archive.paper.value = "自动存档合约第一稿\n\n第二段还在写。";
  typeIntoManuscript();
  test.assert(archive.timers.pending.size === 1, "one idle timer is armed after the first keystroke");
  const firstDelay = [...archive.timers.pending.values()][0].delay;
  test.assert(firstDelay >= 20000 && firstDelay <= 30000, `the archive waits an idle 20–30s before writing (waited ${firstDelay}ms)`);
  const firstTimerId = [...archive.timers.pending.keys()][0];
  typeIntoManuscript();
  test.assert(archive.timers.cleared.includes(firstTimerId) && archive.timers.pending.size === 1,
    "more typing cancels the armed timer and re-arms it, so continuous writing never archives mid-draft");
}

{
  // 落一条：operation/origin 是机器值，正文与 phase 来自手稿，hash 用真函数。
  const putsBefore = archive.counters.put;
  await fireIdle();
  test.assert(archive.counters.put > putsBefore, "the idle timer writes a revision through the real store");
  const revisions = await archiveList();
  test.assert(revisions.length === 1, "one revision exists after the first idle write");
  const head = revisions[0];
  test.assert(head.operation === "auto-archive" && head.origin === "system",
    `the archive revision carries the machine identity system/auto-archive (got ${head.origin}/${head.operation})`);
  test.assert(head.body === archive.paper.value && head.phase === "draft",
    "the archived body and phase come from the manuscript as it stood");
  test.assert(head.contentHash === archive.context.revisionContentHash(archive.paper.value),
    "the content hash is the revision store's own hash function");

  // 内容不变跳过：正文一字未动再落，不写第二条。
  const putsAfterWrite = archive.counters.put;
  await fireIdle();
  test.assert(archive.counters.put === putsAfterWrite, "an idle pass over unchanged content writes nothing");
  test.assert((await archiveList()).length === 1, "the revision count stays at one while the content is unchanged");

  // 与显式存储同文也跳过：上一条是「保存」的修订、hash 相同 → 不再造一条自动存档。
  const sameBodyHash = archive.context.revisionContentHash(archive.paper.value);
  archive.revisionsStore.set(archiveKey(), [{
    id: "explicit-save-1", projectId: "project-15a", documentId: "file-15a", parentRevisionId: "",
    phase: "draft", body: archive.paper.value, contentHash: sameBodyHash,
    origin: "user", operation: "revision", runRecordId: "", createdAt: "2026-10-26T06:00:00.000Z",
  }]);
  const putsAfterExplicit = archive.counters.put;
  await fireIdle();
  test.assert(archive.counters.put === putsAfterExplicit,
    "content equal to the last explicit save's revision is skipped, not re-archived");
}

{
  // 封顶沿用：预置满额修订（列表约定 newest 在头部），新自动存档顶掉最旧的一条。
  const seed = Array.from({ length: revisionCap }, (_, index) => ({
    id: `seed-${revisionCap - 1 - index}`, projectId: "project-15a", documentId: "file-15a", parentRevisionId: "",
    phase: "", body: `seed ${index}`, contentHash: `seedhash${index}`,
    origin: "user", operation: "revision", runRecordId: "", createdAt: "2026-10-26T05:00:00.000Z",
  }));
  archive.revisionsStore.set(archiveKey(), seed);
  archive.paper.value = "写到封顶之后的新段落，应当顶掉最旧的一条。";
  typeIntoManuscript();
  await fireIdle();
  const revisions = await archiveList();
  test.assert(revisions.length === revisionCap, `the per-document cap is inherited, not re-implemented (${revisions.length}/${revisionCap})`);
  test.assert(revisions[0].operation === "auto-archive" && revisions[0].body === archive.paper.value,
    "the newest entry is the auto-archive of the new paragraph");
  test.assert(!revisions.some((entry) => entry.id === "seed-0"), "the oldest seed revision was dropped by the cap");

  // 空正文不写：清空不是需要保护的稿子。
  const putsBefore = archive.counters.put;
  archive.paper.value = "   ";
  typeIntoManuscript();
  await fireIdle();
  test.assert(archive.counters.put === putsBefore, "an emptied manuscript archives nothing");
}

// --- context B: link following behind the real whitelist --------------------

function makeLinkContext() {
  const paper = {
    value: "",
    selectionStart: 0,
    listeners: {},
    addEventListener(name, handler) {
      (this.listeners[name] ||= []).push(handler);
    },
  };
  const opened = [];
  const statusNotes = [];
  const context = {
    console: { warn() {}, log() {}, error() {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    document: { addEventListener() {}, visibilityState: "visible" },
    t: (key) => `t:${key}`,
    setStatus: (message) => statusNotes.push(message),
    mdeFormatTarget: () => paper,
    open: (...args) => {
      opened.push(args);
      return null;
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read("app/core/markdown.js"), context, { filename: "app/core/markdown.js" });
  vm.runInContext(read("app/features/writing-safety.js"), context, { filename: "app/features/writing-safety.js" });
  return { context, paper, opened, statusNotes };
}

const links = makeLinkContext();
{
  const api = links.context.AISystem6WritingSafety;
  test.assert(typeof api?.openLinkAtCursor === "function" && typeof api?.canFollowLink === "function" && typeof api?.followLinkAtPoint === "function",
    "the lazy writing-safety module installs openLinkAtCursor/canFollowLink/followLinkAtPoint");

  links.paper.value = "看 [AI System 6](https://example.com/ais6) 与 [危险](javascript:alert(1)) 两处。\n第二行没有链接。";
  const inSafeLink = links.paper.value.indexOf("example.com");
  const inUnsafeLink = links.paper.value.indexOf("危险");
  const offLink = links.paper.value.indexOf("第二行");

  // 有链：光标在链接内 → 打开，window.open 带 _blank + noopener。
  links.paper.selectionStart = inSafeLink;
  test.assert(api.canFollowLink() === true, "the command is available with the caret inside a Markdown link");
  test.assert(api.openLinkAtCursor() === true, "open-link opens the link under the caret");
  test.assert(JSON.stringify(links.opened.at(-1)) === JSON.stringify(["https://example.com/ais6", "_blank", "noopener"]),
    `window.open received (url, "_blank", "noopener") (got ${JSON.stringify(links.opened.at(-1))})`);

  // 无链：说明一行，不开。
  const openedCount = links.opened.length;
  links.paper.selectionStart = offLink;
  test.assert(api.canFollowLink() === false, "the command is unavailable with the caret outside any link");
  test.assert(api.openLinkAtCursor() === false, "open-link without a link does nothing but say so");
  test.assert(links.opened.length === openedCount && links.statusNotes.at(-1) === "t:link_follow_none",
    "no link under the caret gets the one-line explanation, not silence");

  // 不安全 href：白名单（真 isSafeMarkdownHref）拒绝 javascript:，提示不开。
  links.paper.selectionStart = inUnsafeLink;
  test.assert(api.canFollowLink() === true, "the parser still recognizes the unsafe link (availability is about position)");
  test.assert(api.openLinkAtCursor() === false && links.opened.length === openedCount,
    "an unsafe href is never opened");
  test.assert(links.statusNotes.at(-1) === "t:link_not_opened_unsafe",
    "the unsafe href gets its one-line refusal");

  // mailto 在白名单内。
  links.paper.value = "写信给 [作者](mailto:author@example.com)。";
  links.paper.selectionStart = links.paper.value.indexOf("作者");
  test.assert(api.openLinkAtCursor() === true && links.opened.at(-1)[0] === "mailto:author@example.com",
    "mailto stays inside the whitelist and opens");

  // ⌘点击分发：click 处即光标处，经同一道白名单；点击不是命令，无链不出提示。
  links.paper.value = "再点一次 [链接](https://example.com/click) 试试。";
  links.paper.selectionStart = links.paper.value.indexOf("click");
  const beforeClick = { opened: links.opened.length, notes: links.statusNotes.length };
  test.assert(api.followLinkAtPoint({ clientX: 4, clientY: 4, metaKey: true }, links.paper) === true,
    "⌘/Ctrl+click on the link span dispatches to open");
  test.assert(links.opened.length === beforeClick.opened + 1 && links.opened.at(-1)[0] === "https://example.com/click",
    "the click-opened url went through window.open with the whitelist's blessing");
  links.paper.selectionStart = links.paper.value.indexOf("试试");
  test.assert(api.followLinkAtPoint({ clientX: 9, clientY: 9, metaKey: true }, links.paper) === false,
    "⌘/Ctrl+click off a link keeps the native behaviour");
  test.assert(links.statusNotes.length === beforeClick.notes,
    "a click is not a command: no status line for a click that hits no link");
}

// --- context C: crash recovery keeps the window visibly unsaved -------------

function makeWorkingSessionContext() {
  const paper = {
    value: "",
    selectionStart: 3,
    selectionEnd: 3,
    selectionDirection: "forward",
    scrollTop: 0,
    listeners: {},
    addEventListener(name, handler) {
      (this.listeners[name] ||= []).push(handler);
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    focus() {},
  };
  const statusKeys = [];
  const context = {
    console: { warn() {}, log() {}, error() {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    structuredClone, JSON, Date, Promise, Map, Set,
    requestAnimationFrame: (handler) => {
      handler();
      return 0;
    },
    document: {
      addEventListener() {},
      visibilityState: "visible",
      activeElement: null,
      querySelector: () => null,
      querySelectorAll: () => [],
      body: { dataset: {} },
    },
    openAppDb: async () => ({ close() {} }),
    keyvalStoreName: "keyval",
    idbRequest: (request) => Promise.resolve(request),
    activeProjectId: "project-15a",
    isProjectMounted: false,
    selectedProjectId: "project-15a",
    projects: [{ id: "project-15a", name: "N15a", archived: false, outline: "" }],
    assignProjectScope() {},
    scheduleWorkspaceRender() {},
    scheduleStatusRender() {},
    renderMultiFinderMenu() {},
    updateMenuState() {},
    getWindow: () => null,
    activeTextFileId: null,
    teachTextDocumentRole: "manuscript",
    teachTextNameInput: { value: "" },
    teachTextFolderInput: { value: "" },
    teachTextBodyInput: paper,
    teachTextStatusEl: { dataset: { statusKey: "unsaved" } },
    teachTextFileLabel: "",
    teachTextWorkflowState: "draft",
    normalizeFileLabel: (value) => String(value || ""),
    setTeachTextWorkflowState() {},
    setTeachTextStatus: (key) => statusKeys.push(key),
    syncTeachTextLabelControl() {},
  };
  context.window = context;
  context.AISystem6StorageTransactions = {
    runTransaction: async (db, storeName, mode, run) => run({
      objectStore: () => ({ get: async () => undefined, put: async (value, key) => key, getAllKeys: async () => [] }),
    }),
  };
  vm.createContext(context);
  vm.runInContext(read("app/core/working-session.js"), context, { filename: "app/core/working-session.js" });
  return { context, paper, statusKeys };
}

const crash = makeWorkingSessionContext();
{
  // 捕获侧：输入把状态改成 modified 是同步的，350ms 后的快照带着它。
  crash.paper.value = "崩溃前新写的一段，比最后一次显式存储新。";
  crash.context.teachTextStatusEl.dataset.statusKey = "modified";
  const snapshot = crash.context.captureTeachTextWorkingSession();
  test.assert(snapshot.body === crash.paper.value && snapshot.statusKey === "modified",
    "a body typed past the last save is captured with its unsaved status, not a saved one");

  // 恢复侧：窗口先显示旧存文/已存，恢复后必须带着未存状态回来。
  crash.paper.value = "最后一次显式存储的旧正文。";
  crash.context.teachTextStatusEl.dataset.statusKey = "saved";
  crash.statusKeys.length = 0;
  test.assert(crash.context.restoreTeachTextWorkingSession(snapshot) === true, "the teachText adapter restores the scene");
  test.assert(crash.paper.value === "崩溃前新写的一段，比最后一次显式存储新。",
    "the restored body is the newer draft the crash interrupted");
  test.assert(crash.statusKeys.at(-1) === "modified",
    `a restored body newer than the last save shows as unsaved work (status went to ${crash.statusKeys.at(-1)})`);

  // 无状态键的快照：有正文就按 modified 落，绝不看起来像已存。
  crash.statusKeys.length = 0;
  crash.context.restoreTeachTextWorkingSession({ projectId: "project-15a", body: "没有状态键的快照正文。" });
  test.assert(crash.paper.value === "没有状态键的快照正文。" && crash.statusKeys.at(-1) === "modified",
    "a snapshot without a status key restores non-empty text as modified, never as saved");
}

// --- the restore entry: the existing Versions… UI, real code ----------------

{
  test.assert(typeof archive.context.AISystem6DocumentRevisions.restore === "function",
    "auto-archive revisions are reachable: AISystem6DocumentRevisions.restore exists (File ▸ Versions…)");
  archive.paper.value = "恢复前的当前正文。";
  archive.statusNotes.length = 0;
  const insertsBefore = archive.execInserts.length;
  const restored = await archive.context.AISystem6DocumentRevisions.restore({
    id: "rev-auto-42", projectId: "project-15a", documentId: "manuscript:project-15a", parentRevisionId: "",
    phase: "draft", body: "自动存档里恢复回来的正文。", contentHash: "hash-of-restored",
    origin: "system", operation: "auto-archive", runRecordId: "", createdAt: "2026-10-26T06:30:00.000Z",
  });
  test.assert(restored === true && archive.paper.value === "自动存档里恢复回来的正文。",
    "restoring an auto-archive revision puts its body back into the manuscript");
  test.assert(archive.execInserts.length === insertsBefore + 1
    && archive.execInserts.at(-1) === "自动存档里恢复回来的正文。",
    "the whole-paper replacement is ONE execCommand(\"insertText\") step, so Edit ▸ Undo puts the pre-restore text back in a single step");
  test.assert(archive.statusNotes.includes("markTeachTextModified"),
    "the restore marks the document modified, so the window never pretends it is saved");
  const project = archive.context.projects[0];
  test.assert(project.outline === "自动存档里恢复回来的正文。",
    "the manuscript record itself carries the restored body");
  const history = await archive.context.listDocumentRevisions("manuscript:project-15a");
  test.assert(history[0]?.operation === "restore" && history[1]?.operation === "restore-before",
    "the restore protects the current text with a restore-before revision first, then records the restore");
}

// --- eager-side wiring: thin on purpose --------------------------------------

{
  const translationsEn = read("app/data/translations-en.js");
  const translationsZh = read("app/data/translations-zh.js");
  for (const key of ["auto_archive", "link_follow_none", "link_not_opened_unsafe", "format_open_link"]) {
    test.assert(new RegExp(`${key}:\\s*"`).test(translationsEn), `translations-en.js carries ${key}`);
    test.assert(new RegExp(`${key}:\\s*"`).test(translationsZh), `translations-zh.js carries ${key}`);
  }
  test.assert(/auto_archive:\s*"自动存档"/.test(translationsZh), "the zh auto-archive label is 「自动存档」");
  const revisionsSource = read("app/core/document-revisions.js");
  test.assert(revisionsSource.includes('revision.operation === "auto-archive"') && revisionsSource.includes('t("auto_archive")'),
    "the versions list labels auto-archive revisions through t(), distinct from explicit saves");
  test.assert(revisionsSource.includes("applyRestoredPaperBody(paper, restored)") && revisionsSource.includes("ensureWritingSafetyModule"),
    "restore body writes go through the lazy module's applyRestoredPaperBody bridge, never a raw value write");
  const safetySource = read("app/features/writing-safety.js");
  test.assert(safetySource.includes("applyRestoredBody") && safetySource.includes("mdeApply(paper, { from: 0,"),
    "the module's restore apply rides mdeApply's whole-paper replace, the one-step-undo path");

  const { lazyRuntimePaths } = await import("../../tooling/runtime-manifest.mjs");
  test.assert(lazyRuntimePaths.includes("app/features/writing-safety.js"),
    "writing-safety.js is a lazy runtime path, not boot payload");

  const menusSource = read("app/data/menus.js");
  test.assert(menusSource.includes('menuItem("format-open-link", "format_open_link")'),
    "the Format menu carries the open-link row next to the link row");
  const actionsSource = read("app/core/actions.js");
  test.assert(actionsSource.includes('registerLazyCommand?.("format-open-link"'),
    "actions.js registers open-link as a lazy command that loads the module on first use");
  test.assert(actionsSource.includes('"bold","italic","strike","code","link","quote"'),
    "the insert path (⌘K / format-link / paste-as-link) is untouched by the follow feature");
  const windowManagerSource = read("app/core/window-manager.js");
  test.assert(windowManagerSource.includes('"format-open-link"'),
    "getActionAvailability() answers for the open-link row");
  const wireupSource = read("app/core/wireup.js");
  test.assert(wireupSource.includes("ensureWritingSafetyModule"),
    "wireup.js pulls the module in on the manuscript's first keystroke, one line");
  const configSource = read("app/core/config.js");
  test.assert(configSource.includes('createLazyModuleLoader("AISystem6WritingSafety"'),
    "config.js declares only the one-line lazy loader stub for writing safety");
  const editorSource = read("app/core/markdown-editor.js");
  test.assert(editorSource.includes("followLinkAtPoint") && editorSource.includes("event.metaKey || event.ctrlKey"),
    "the editor overlay routes ⌘/Ctrl+click to the module's follow, and nothing else");
}

test.finish();
