// S4 refusal grammar (ClioWorks second draft, Refusal.dc.html boards ① ② ④):
// a command that cannot run says which command, why and where to go, from the
// keyboard as well as from the greyed menu row; repeats replace each other;
// the 回稿 file explains itself before it opens; the agent tab does not carry
// an earlier refusal at the top of ClioTalk.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("refusal-grammar");

// --- 1. ⌘5 (Review Desk) in the desktop workspace, three times -------------------
{
  const vmw = createAppBootVm();
  vmw.run(read("app/data/translations-zh.js"));
  vmw.run(`
    translations = { zh: window.AISystem6TranslationsZh, en: window.AISystem6TranslationsZh };
    currentLanguage = "zh";
    projects.push({ id: "refusal-test", name: "Refusal Test" });
    activeProjectId = "refusal-test";
    activeProject = projects[0];
    workspaceProfile = workspaceProfileDesktop;
    activeAppId = "teachText";
    systemNotifications.length = 0;
  `);
  for (let count = 0; count < 3; count += 1) vmw.fireKeydown(vmw.document.body, { key: "5", metaKey: true });
  await vmw.waitFor(() => vmw.run("systemNotifications.length") > 0);
  const notes = vmw.run("systemNotifications.map((item) => item.message)");
  test.assert(notes.length === 1, `three identical refusals leave one notification, not a count (got ${notes.length})`);
  test.assert(/^「审校台」属于写作工作区；现在是桌面工作区。/.test(notes[0]),
    `the refusal names the command and the reason, got: ${notes[0]}`);
  test.assert(/创作坊/.test(notes[0]) && /来回/.test(notes[0]), "the refusal names where to go");
  test.assert(!notes[0].includes("当前窗口或所选项目无法使用此命令"), "the generic sentence is not used when a specific reason exists");
  test.assert(vmw.run("unreadSystemNotifications") === 1, "repeats do not raise the unread count");
  // A different writing-route command in the same workspace gets the shorter workspace reason.
  vmw.run(`activeAppId = "teachText";`);
  vmw.fireKeydown(vmw.document.body, { key: "1", metaKey: true });
  await vmw.waitFor(() => vmw.run("systemNotifications.length") > 1);
  test.assert(/^「问题单」/.test(vmw.run("systemNotifications[0].message")) && vmw.run("systemNotifications[0].message").includes("属于写作工作区"),
    "another route command is named by its own label");
  // The writing workspace, a command that needs the document in front, none in front.
  vmw.run(`workspaceProfile = workspaceProfileWriting; activeAppId = "finder"; systemNotifications.length = 0;`);
  await vmw.run(`handleAction("send-manuscript-review")`);
  const documentNote = vmw.run("systemNotifications[0]?.message") || "";
  test.assert(documentNote.includes("先打开一份文件") && !documentNote.includes("当前窗口或所选项目"),
    `with no document in front the reason says so, got: ${documentNote}`);
  // The manuscript in front but empty: the reason is the empty body, not a missing document.
  vmw.run(`
    getWindow("teachText").classList.remove("is-hidden");
    document.querySelectorAll(".window.is-active").forEach((win) => win.classList.remove("is-active"));
    getWindow("teachText").classList.add("is-active");
    activeAppId = "teachText"; teachTextBodyInput.value = ""; systemNotifications.length = 0;
  `);
  await vmw.run(`handleAction("print-current")`);
  const emptyNote = vmw.run("systemNotifications[0]?.message") || "";
  test.assert(emptyNote.includes("还是空的") && !emptyNote.includes("先打开一份文件"),
    `with an empty manuscript in front the reason is the empty body, got: ${emptyNote}`);
  // No Project Hard Disk mounted: burning a Project CD asks for one.
  test.assert(vmw.run(`activeProjectId = null; activeProject = null; projects.length = 0; actionUnavailableReasonKey("export-teachtext-project-cd")`) === "balloon_disabled_menu_project",
    "Burn Project CD with no project mounted names the missing project");
}

// --- 2. both languages carry every new key ----------------------------------------
for (const file of ["translations-zh.js", "translations-en.js"]) {
  const source = read(`app/data/${file}`);
  for (const key of [
    "balloon_disabled_menu_workspace", "balloon_disabled_menu_review_desk", "balloon_disabled_menu_document",
    "refusal_command_line", "review_desk_switched_workspace", "roundtrip_explainer_title", "roundtrip_explainer_answers",
    "roundtrip_explainer_returned", "roundtrip_explainer_counts", "roundtrip_explainer_view_only",
    "roundtrip_explainer_compare", "roundtrip_explainer_compare_none", "roundtrip_send_footnotes",
    "balloon_disabled_menu_document_empty",
  ]) test.assert(source.includes(`    ${key}:`), `${file} has ${key}`);
}

// --- 3. the 回稿 explainer: round, both roads; D3 switches the workspace ---------
{
  const doc = {
    created: [],
    classes: new Set(),
  };
  const calls = [];
  const element = () => {
    const node = {
      nodeType: 1, children: [], dataset: {}, style: { setProperty() {} }, attrs: {}, listeners: {}, classList: { add() {}, remove() {} },
      append(...kids) { node.children.push(...kids); },
      setAttribute(name, value) { node.attrs[name] = value; },
      addEventListener(type, fn) { node.listeners[type] = fn; },
      remove() {}, querySelector() { return null; }, clientWidth: 800, clientHeight: 600,
      set textContent(value) { node.text = value; }, get textContent() { return node.text || ""; },
    };
    return node;
  };
  const pane = element();
  const context = vm.createContext({
    console, window: {}, localStorage: { getItem: () => null, setItem() {} },
    document: {
      createElement: element,
      createTextNode: (text) => ({ nodeType: 3, text }),
      querySelector: (selector) => (selector.includes(".window-pane") ? pane : null),
    },
    t: (key, ...args) => `${key}(${args.join("|")})`,
    activeProjectId: "p1",
    chatFolders: [{ id: "f1", projectId: "p1", name: "来回" }],
    chatFiles: [
      { id: "s1", projectId: "p1", folderId: "f1", name: "访谈安排-送审-第2轮.docx", createdAt: "2026-11-03T08:00:00Z" },
    ],
    getActiveProject: () => ({ roundTrip: { fileId: "r1", recipient: "落落", rows: [
      { kind: "changed", comments: [{}] }, { kind: "same", comments: [] }, { kind: "added", comments: [{}] },
    ], unplacedComments: [] } }),
    workspaceProfileDesktop: "desktop", workspaceProfileWriting: "writing", workspaceProfile: "desktop",
    activateWorkspaceProfile: async (value) => { calls.push(["profile", value]); context.workspaceProfile = value; },
    openReviewComments: async (tab) => { calls.push(["review", tab]); },
    setStatus: (text) => calls.push(["status", text]),
  });
  context.window = context;
  vm.runInContext(read("app/vendor/clioworks-v3/manuscript-roundtrip.js"), context);
  vm.runInContext(read("app/features/manuscript-roundtrip.js"), context);
  const opened = [];
  const result = await context.AISystem6ManuscriptRoundTripUI.explainReturn(
    { id: "r1", projectId: "p1", name: "访谈安排-回稿-第2轮.docx", createdAt: "2026-11-04T08:00:00Z" },
    (extra) => { opened.push(extra); return { ok: true }; }
  );
  test.assert(result && result.explained === true && opened.length === 0, "the explainer shows first and does not open the file itself");
  const text = JSON.stringify(pane.children);
  const windoid = pane.children[0];
  const body = windoid.children[1];
  const lines = body.children.map((child) => child.textContent);
  test.assert(lines[0].includes("roundtrip_explainer_answers(访谈安排|2|11-03)"), `it states which manuscript and round it answers, got ${lines[0]}`);
  test.assert(lines[1].includes("落落") && lines[1].includes("11-04"), "who and when come from the record and the file date");
  test.assert(lines[2].includes("roundtrip_explainer_counts(2|2)"), `it counts changed paragraphs and comments, got ${lines[2]}`);
  const buttons = body.children[3].children;
  test.assert(buttons.length === 2 && buttons[0].textContent.includes("view_only") && buttons[1].textContent.includes("compare"),
    "it offers both paths");
  buttons[1].listeners.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  test.assert(JSON.stringify(calls) === JSON.stringify([["profile", "writing"], ["review", "roundtrip"], ["status", "review_desk_switched_workspace()"]]),
    `compare from the desktop workspace switches to writing, opens the comparison and says so, got ${JSON.stringify(calls)}`);
  // An older round the stored record does not hold: Compare is withheld, not pointed at another round.
  calls.length = 0;
  context.workspaceProfile = "desktop";
  pane.children.length = 0;
  await context.AISystem6ManuscriptRoundTripUI.explainReturn(
    { id: "r0", projectId: "p1", name: "访谈安排-回稿-第1轮.docx", createdAt: "2026-11-02T08:00:00Z" },
    () => ({ ok: true })
  );
  const olderBody = pane.children[0].children[1];
  const olderCompare = olderBody.children[olderBody.children.length - 1].children[1];
  test.assert(olderCompare.disabled === true && !olderCompare.listeners.click,
    "Compare is disabled for a 回稿 the stored record does not hold");
  test.assert(olderBody.children.some((child) => String(child.textContent).includes("roundtrip_explainer_compare_none")),
    "a one-line note says this round has no stored comparison");
  test.assert(calls.length === 0, `nothing switches the workspace or opens another round, got ${JSON.stringify(calls)}`);
  void text; void doc;
}

// --- 4. the send dialog counts every footnote the file carries -------------------
test.assert(read("app/features/manuscript-roundtrip.js").includes("roundtrip_send_footnotes"),
  "the send dialog's footnote line counts manuscript footnotes as well as cited sources");

// --- 5. the agent tab clears a stale notice ------------------------------------
{
  const events = [];
  const store = new Map();
  const context = vm.createContext({
    console, TextEncoder,
    localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    fetch: () => Promise.reject(new Error("offline")),
    t: (key) => key,
    clearStatus: () => events.push("clear"),
    setStatus: (text) => events.push(`status:${text}`),
    window: {},
  });
  vm.runInContext(fs.readFileSync(path.join(root, "apps/desktop/app/features/cliotalk-agent.js"), "utf8"), context, { filename: "cliotalk-agent.js" });
  await context.window.AISystem6ClioTalkAgent.setMode(true).catch(() => {});
  test.assert(events[0] === "clear", `opening the agent tab clears the earlier notice first, got ${JSON.stringify(events)}`);
}

test.finish();
process.exit(0);
