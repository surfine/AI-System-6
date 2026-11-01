// ClioWork (M7, rulings U2/T1): the Clio shell's document-studio page. The
// sidebar's ClioWork row shows the open project's Office documents, newest
// first; a job over the ticked ones goes to the agent's task layer with
// those files lent; Open opens a document in its own app, beside the window.
//
// These checks run app/features/cliotalk-shell.js against a DOM and click
// what the writer clicks; the desk around it (chatFiles, the project, the
// agent module, the ClioWorks host, window tiling) is a stand-in that
// records what it was asked to do.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("cliowork-page");
const source = read("app/features/cliotalk-shell.js");

let parseHTML;
try {
  ({ parseHTML } = await import("linkedom"));
} catch {
  test.fail("linkedom is needed to run the shell against a real DOM");
  test.finish();
}

const PAGE = `<html lang="en"><body data-theme="liquid-glass">
<div class="window assistant-window is-active" data-window="assistant">
<div class="assistant-details-bar"></div>
<div class="messages-stage"><div id="messages"></div></div>
<form id="chat-form" class="composer"><textarea id="prompt"></textarea>
<div class="composer-action-row"><button id="send" type="submit"></button></div></form>
</div>
<div class="window" data-window="clioWrite"></div></body></html>`;

const office = (id, format, name, updatedAt, projectId = "p1") => ({ id, type: "office", format, name, projectId, updatedAt, byteLength: 4096, nativeDocumentId: `n-${id}` });
const FILES = [
  office("f-old", "docx", "旧稿", "2026-10-01T09:00:00.000Z"),
  office("f-budget", "xlsx", "2025预算", "2026-10-30T09:00:00.000Z"),
  office("f-deck", "pptx", "返乡简报.pptx", "2026-10-29T09:00:00.000Z"),
  office("f-roster", "xlsx", "访谈名单", "2026-10-28T09:00:00.000Z"),
  office("f-elsewhere", "docx", "别的项目", "2026-10-31T09:00:00.000Z", "p2"),
  { id: "f-text", type: "text", name: "笔记", projectId: "p1", updatedAt: "2026-10-31T10:00:00.000Z" },
];

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function boot({ project = { id: "p1", name: "返乡专题" }, files = FILES } = {}) {
  const { document, window: dom } = parseHTML(PAGE);
  const checked = new WeakMap();
  Object.defineProperty(dom.HTMLInputElement.prototype, "checked", {
    configurable: true,
    get() { return checked.has(this) ? checked.get(this) : this.hasAttribute("checked"); },
    set(value) { checked.set(this, Boolean(value)); },
  });
  const env = { document, calls: { work: [], open: [], tile: [] }, front: null };
  const assistant = document.querySelector('[data-window="assistant"]');
  const writer = document.querySelector('[data-window="clioWrite"]');
  env.front = assistant;
  const ctx = {
    document,
    console,
    MutationObserver: dom.MutationObserver,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { fn(); return 0; },
    getComputedStyle: () => ({ animationName: "none", display: "block" }),
    CSS: { escape: (value) => String(value) },
    activeAbortController: null,
    t: (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key),
    resolveMenuContextWindow: () => env.front,
    chatFiles: files,
    conversation: [],
    activeChatFileId: "",
    getActiveProject: () => project,
    // The agent module, as ensureClioTalkAgentModule loads it.
    ensureClioTalkAgentModule: async () => {
      let active = false;
      ctx.AISystem6ClioTalkAgent = {
        activate: async () => { active = env.agentServed !== false; },
        isActive: () => active,
        work: async (input) => {
          env.calls.work.push(JSON.parse(JSON.stringify(input)));
          return true;
        },
      };
    },
    // The ClioWorks host: opening a document brings its app's window forward.
    AISystem6ClioWorks: {
      openNativeDocument: async (item, context) => {
        env.calls.open.push({ id: item.id, intent: context.intent });
        env.front = writer;
        return { ok: true };
      },
    },
    tileWindows: async (windows) => {
      env.calls.tile.push(windows.map((win) => win.dataset.window));
      return true;
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: "cliotalk-shell.js" });
  env.ctx = ctx;
  env.shell = ctx.AISystem6ClioTalkShell;
  env.$ = (selector) => document.querySelector(selector);
  env.$$ = (selector) => [...document.querySelectorAll(selector)];
  env.press = (el) => el.dispatchEvent(new dom.Event("click", { bubbles: true, cancelable: true }));
  env.tickBox = (el) => {
    el.checked = !el.checked;
    el.dispatchEvent(new dom.Event("change", { bubbles: true }));
  };
  env.type = (el, text) => {
    el.value = text;
    el.dispatchEvent(new dom.Event("input", { bubbles: true }));
  };
  env.submit = (form) => form.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true }));
  env.workRow = () => env.$$(".clio-sidebar .cl-side-row").find((row) => row.textContent.includes("ClioWork"));
  return env;
}

// The entry -----------------------------------------------------------------

{
  const env = boot();
  const row = env.workRow();
  test.assert(!!row && !row.disabled, "the sidebar's ClioWork row is a live control, no longer 'in a later release'");
  test.assert(env.shell.work.page() === "chat", "the window opens on the conversation");
  env.press(row);
  test.assert(env.shell.work.page() === "work", "ClioWork shows the document studio");
  test.assert(row.getAttribute("aria-current") === "page", "the ClioWork row is the selection while its page is up");
  test.assert(env.$(".clio-shell").dataset.page === "work", "the shell names the page for the stylesheet");

  // The list: the open project's Office documents only, last changed first.
  const ids = env.$$(".cw-doc").map((doc) => doc.dataset.fileId);
  test.assert(JSON.stringify(ids) === JSON.stringify(["f-budget", "f-deck", "f-roster", "f-old"]),
    `the list is this project's Office documents, newest first (got ${ids.join(", ")})`);
  const first = env.$(".cw-doc");
  test.assert(first.querySelector(".cw-tile").textContent === "XLSX", "each row carries its kind");
  test.assert(first.querySelector(".cw-doc-name").textContent === "2025预算.xlsx", "a name without its extension gets one");
  test.assert(first.querySelector(".cw-doc-sub").textContent.startsWith("ClioChart"), "each row names the app it opens in");
  test.assert(env.$$(".cw-doc .cw-doc-name").some((el) => el.textContent === "返乡简报.pptx"), "a name that has its extension keeps one");
  test.assert(env.$(".cw-count").textContent === "clio_work_count:4|返乡专题", "the head counts the project's documents");

  // Ticking lends; a fourth tick is refused, and the suggestions follow what is ticked.
  const boxes = () => env.$$(".cw-pick");
  const start = env.$(".cw-start");
  test.assert(start.disabled, "交给 Clio waits for a ticked document and a job");
  env.tickBox(boxes()[0]);
  env.tickBox(boxes()[2]);
  test.assert(env.$$(".cw-chip").length === 2, "each ticked document shows above the field");
  const suggestions = env.$$(".cw-suggestion").map((button) => button.dataset.i18n);
  test.assert(suggestions[0] === "clio_work_suggest_merge" && suggestions.includes("clio_work_suggest_formulas"),
    `two sheets suggest merging and checking formulas (got ${suggestions.join(", ")})`);
  env.tickBox(boxes()[1]);
  test.assert(boxes()[3].disabled, "with three ticked, the fourth cannot be");
  test.assert(env.$(".cw-limit")?.textContent === "clio_work_limit:3", "the limit says so");
  env.press(env.$$(".cw-chip").find((chip) => chip.textContent.includes("返乡简报")));
  test.assert(!boxes()[1].checked && env.$$(".cw-chip").length === 2, "a chip's press takes its document back");
  test.assert(start.disabled, "a ticked document without a job is not enough");

  // A suggestion fills the field; 交给 Clio hands the job to the task layer.
  env.press(env.$$(".cw-suggestion")[0]);
  test.assert(env.$(".cw-prompt").value === "clio_work_suggest_merge", "a suggestion fills the field");
  test.assert(!start.disabled, "a ticked document and a job enable 交给 Clio");
  env.submit(env.$(".cw-composer"));
  await tick();
  await tick();
  const call = env.calls.work[0];
  test.assert(call && call.prompt === "clio_work_suggest_merge", "the job goes to the agent in the writer's words");
  test.assert(call && JSON.stringify(call.fileIds) === JSON.stringify(["f-budget", "f-roster"]), `the ticked documents are lent to the task (got ${JSON.stringify(call?.fileIds)})`);
  test.assert(env.shell.work.page() === "chat", "the conversation comes forward, where the plan arrives");
  env.shell.work.show();
  test.assert(env.$(".cw-prompt").value === "" && !env.$$(".cw-pick").some((box) => box.checked), "the page is clear for the next job");

  // The job in hand: a document it borrowed says so, and the card goes back to the conversation.
  env.shell.tasks.apply({ task: { id: "t1", title: "合成报告", state: "planning", mounts: [{ kind: "object", id: "f-budget", name: "2025预算.xlsx" }] }, turns: [] });
  env.shell.work.show();
  test.assert(!env.$(".cw-job").hidden && env.$(".cw-job-title").textContent === "合成报告", "the page shows the job in hand");
  test.assert(env.$(".cw-job-docs").textContent === "clio_work_job_docs:2025预算.xlsx", "and what it borrowed");
  const lent = env.$('.cw-doc[data-file-id="f-budget"] .cw-doc-state');
  test.assert(!lent.hidden && lent.textContent === "clio_work_lent", "a lent document says it is lent");
  env.shell.tasks.apply({ task: { id: "t1", title: "合成报告", state: "delivered", mounts: [{ kind: "object", id: "f-budget", name: "2025预算.xlsx" }] }, turns: [], documents: [{ docId: "f-budget", name: "2025预算.xlsx", turn: 1, revisions: 4 }] });
  test.assert(env.$('.cw-doc[data-file-id="f-budget"] .cw-doc-state').textContent === "clio_work_revisions:4", "the revisions it left wait on the document's row");
  env.press(env.$(".cw-job-back"));
  test.assert(env.shell.work.page() === "chat", "the job card goes back to the conversation");

  // Open: the document in its own app, beside this window.
  env.shell.work.show();
  env.press(env.$('.cw-doc[data-file-id="f-deck"] .cw-doc-open'));
  await tick();
  await tick();
  test.assert(JSON.stringify(env.calls.open) === JSON.stringify([{ id: "f-deck", intent: "edit" }]), `Open opens the project document for editing (got ${JSON.stringify(env.calls.open)})`);
  test.assert(JSON.stringify(env.calls.tile) === JSON.stringify([["assistant", "clioWrite"]]), "and lays its window beside this one");
}

// Where 代理 cannot open, the job stays on the page and the page says why.
{
  const env = boot();
  env.agentServed = false;
  env.press(env.workRow());
  env.tickBox(env.$(".cw-pick"));
  env.type(env.$(".cw-prompt"), "核对公式");
  env.submit(env.$(".cw-composer"));
  await tick();
  await tick();
  test.assert(env.calls.work.length === 0 && env.shell.work.page() === "work", "an agent that cannot open takes no job and the page stays");
  test.assert(!env.$(".cw-error").hidden && env.$(".cw-error").dataset.i18n === "agent_unavailable", "the page says why");
  test.assert(env.$(".cw-prompt").value === "核对公式" && env.$(".cw-pick").checked, "the job and the ticks are kept");
}

// Empty states ---------------------------------------------------------------

{
  const env = boot({ files: FILES.filter((file) => file.type !== "office") });
  env.press(env.workRow());
  const empty = env.$(".cw-empty");
  test.assert(!!empty && empty.querySelector(".cw-empty-title").dataset.i18n === "clio_work_empty_title", "a project without Office documents says so");
  test.assert(empty.querySelector(".btn").dataset.action === "new-office-document", "and offers New Document…");
}

{
  const env = boot({ project: null });
  env.press(env.workRow());
  const empty = env.$(".cw-empty");
  test.assert(!!empty && empty.querySelector(".btn").dataset.action === "open-project-disks", "with no project open, the page leads to the projects");
}

// Strings: every key the page asks for is in both tables.
{
  const env = boot();
  const en = env.ctx.AISystem6TranslationsEn;
  const zh = env.ctx.AISystem6TranslationsZh;
  const keys = [...new Set(source.match(/clio_work_[a-z_]+/g))];
  const missing = keys.filter((key) => !(key in en) || !(key in zh));
  test.assert(keys.length > 20 && missing.length === 0, `the ClioWork strings are in both tables (${missing.join(", ") || `${keys.length} keys`})`);
}

test.finish();
