// ClioTalk tasks (M2 slice 4, Work.dc.html): a task's plan, its questions and
// its asks for permission are cards in the thread; its progress is the
// right-hand panel; while it runs Send is Stop and Esc stops it; while a
// card waits, what the writer sends is the answer. The shell draws only the
// snapshots handed to AISystem6ClioTalkShell.tasks.apply() and passes the
// writer's answers to the transport given to tasks.connect().
//
// These checks run app/features/cliotalk-shell.js against a DOM, hand it the
// data brief of tests/fixtures/cliotalk-tasks.json at each state, and click
// what the writer clicks, rather than reading the source.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { codeOnly, createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("cliotalk-tasks");
const source = read("app/features/cliotalk-shell.js");
const css = read("styles/99-cliotalk-shell.css");
const fixture = JSON.parse(readFileSync(join(root, "tests/fixtures/cliotalk-tasks.json"), "utf8"));

let parseHTML;
try {
  ({ parseHTML } = await import("linkedom"));
} catch {
  test.fail("linkedom is needed to run the shell against a real DOM");
  test.finish();
}

const PAGE = (theme) => `<html lang="en"><body data-theme="${theme}">
<div class="window assistant-window is-active" data-window="assistant">
<div class="assistant-details-bar"></div>
<div class="messages-stage"><div id="messages"></div></div>
<form id="chat-form" class="composer"><textarea id="prompt"></textarea>
<div class="composer-action-row"><button id="send" type="submit"></button></div></form>
</div></body></html>`;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const snapshot = (name) => JSON.parse(JSON.stringify(fixture.snapshots[name]));
const proposal = (name, id) => snapshot(name).turns.flatMap((turn) => turn.result.proposals).find((entry) => entry.id === id);

function same(actual, expected, message) {
  const pass = actual === expected;
  const shown = (value) => String(JSON.stringify(value)).slice(0, 160);
  test.assert(pass, pass ? message : `${message} (got ${shown(actual)}, wanted ${shown(expected)})`);
}

// linkedom keeps no checked state; this is the browser's, radio siblings
// unchecking when one is set.
const checkedState = new WeakMap();

// One ClioTalk window with the shell built in it. `t` echoes the key and its
// arguments, so a label is checked by what it was asked to say.
function boot(theme = "liquid-glass", extra = {}) {
  const { document, window: dom } = parseHTML(PAGE(theme));
  Object.defineProperty(dom.HTMLInputElement.prototype, "checked", {
    configurable: true,
    get() { return checkedState.has(this) ? checkedState.get(this) : this.hasAttribute("checked"); },
    set(value) {
      if (value && this.getAttribute("type") === "radio") {
        document.querySelectorAll(`input[name="${this.getAttribute("name")}"]`).forEach((other) => checkedState.set(other, false));
      }
      checkedState.set(this, Boolean(value));
    },
  });
  const env = { document, dom, lang: "en", front: null, sendResyncs: 0 };
  const timers = new Map();
  let timerId = 0;
  const ctx = {
    document,
    console,
    MutationObserver: dom.MutationObserver,
    setTimeout: (fn) => { timerId += 1; timers.set(timerId, fn); return timerId; },
    clearTimeout: (id) => { timers.delete(id); },
    requestAnimationFrame: (fn) => { fn(); return 0; },
    getComputedStyle: () => ({ animationName: "none", display: "block" }),
    CSS: { escape: (value) => String(value) },
    activeAbortController: null,
    t: (key, ...args) => `${env.lang === "zh" ? "zh:" : ""}${args.length ? `${key}:${args.join("|")}` : key}`,
    // The composer's own Send/Stop switch, as chat-messages.js has it.
    setComposerSubmitMode(isBusy) {
      const button = document.getElementById("send");
      button.dataset.mode = isBusy ? "stop" : "send";
      button.type = isBusy ? "button" : "submit";
      button.dataset.balloonHelp = isBusy ? "balloon_clio_stop" : "balloon_clio_send";
    },
    syncClioTalkSendButton() { env.sendResyncs += 1; },
    formatTokenCount(n) {
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
      return String(n);
    },
    resolveMenuContextWindow: () => env.front,
    ...extra,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: "cliotalk-shell.js" });
  env.ctx = ctx;
  env.front = document.querySelector('[data-window="assistant"]');
  env.shell = ctx.AISystem6ClioTalkShell;
  env.tasks = env.shell.tasks;
  env.flushTimers = () => { [...timers].forEach(([id, fn]) => { timers.delete(id); fn(); }); };
  env.$ = (selector) => document.querySelector(selector);
  env.press = (el) => {
    const event = new dom.Event("click", { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  };
  env.key = (target, key, extra = {}) => {
    const event = new dom.Event("keydown", { bubbles: true, cancelable: true });
    Object.assign(event, { key, metaKey: false, ctrlKey: false, altKey: false, ...extra });
    target.dispatchEvent(event);
    return event;
  };
  env.change = (el) => el.dispatchEvent(new dom.Event("change", { bubbles: true }));
  env.submit = () => {
    const event = new dom.Event("submit", { bubbles: true, cancelable: true });
    document.getElementById("chat-form").dispatchEvent(event);
    return event;
  };
  return env;
}

// What the writer's answers reach: each call is recorded, and one can be
// told to refuse the next.
function transport() {
  const calls = [];
  let refuse = false;
  const record = (method) => (task, target, detail) => {
    calls.push({ method, task: task?.id, state: task?.state, proposal: target?.id, detail: JSON.parse(JSON.stringify(detail ?? null)) });
    if (!refuse) return Promise.resolve();
    refuse = false;
    return Promise.reject(new Error("refused"));
  };
  return {
    calls,
    last: () => JSON.stringify(calls.at(-1)),
    refuseNext() { refuse = true; },
    stops: () => calls.filter((call) => call.method === "stop").length,
    api: {
      approvePlan: record("approvePlan"),
      revisePlan: record("revisePlan"),
      answer: record("answer"),
      permit: record("permit"),
      stop: record("stop"),
    },
  };
}

const call = (method, state, proposalId, detail) => JSON.stringify({ method, task: "task-brief-1", state, proposal: proposalId, detail });
const kinds = (view) => [...view.children].map((el) => (el.matches(".cl-task-status") ? "status"
  : el.matches(".cl-deliver") ? "summary"
    : String(el.className.match(/\bis-(plan|question|permission)\b/)?.[1])));

// --- 1. A connected task, from its plan to what it hands over ---------------
{
  const env = boot();
  const { $, tasks } = env;
  const messages = $("#messages");
  const send = $("#send");
  const prompt = $("#prompt");
  const panel = $(".clio-panel");
  const shell = $(".clio-shell");
  const main = $(".clio-main");
  const panelName = () => panel.querySelector(".cl-panel-name").textContent;
  const panelStatus = () => panel.querySelector(".cl-panel-status").textContent;
  const checks = () => [...panel.querySelectorAll(".cl-checklist > li")].map((item) => item.dataset.status).join();
  const back = panel.querySelector(".cl-panel-back");

  test.assert(typeof tasks?.apply === "function" && typeof tasks.connect === "function" && typeof tasks.current === "function",
    "the shell offers tasks.apply, tasks.connect and tasks.current");
  same(tasks.current(), null, "with no task handed over there is nothing to show");

  // Planning: one line, and Send is Stop.
  tasks.apply(snapshot("planning"));
  await tick();
  const view = messages.querySelector(":scope > .clio-task");
  const status = view?.querySelector(".cl-task-status");
  test.assert(view?.getAttribute("role") === "group" && view.getAttribute("aria-label") === "返乡数据简报",
    "a task's thread joins the transcript as a group named by the task");
  test.assert(main.classList.contains("has-task") && !main.classList.contains("is-empty"), "with a task in it the conversation is not the empty page");
  same(status?.textContent, "clio_task_planning", "while Clio drafts the plan the thread says so, and that this round only reads");
  test.assert(!view.querySelector(".cl-card"), "there is no card before there is a plan");
  same(send.dataset.mode, "stop", "while the task drafts its plan, Send is Stop");
  same(send.dataset.balloonHelp, "balloon_clio_stop_task", "and its balloon says it stops the task");
  test.assert(panel.hidden, "the progress panel waits for the work to start");

  // The plan: its steps, 照这个做 and 改计划….
  tasks.apply(snapshot("awaiting_plan"));
  const plan = view.querySelector(".cl-card.is-plan");
  const planTitle = plan?.querySelector(".cl-card-title");
  const [approve, revise] = plan ? plan.querySelectorAll(".cl-actions > .btn") : [];
  same([...plan.querySelectorAll(".cl-plan-steps > li")].map((item) => item.textContent).join("|"),
    proposal("awaiting_plan", "p-plan-1").payload.steps.join("|"), "the plan card lists the plan's steps in order");
  test.assert(planTitle.textContent === "clio_task_plan" && planTitle.dataset.i18n === "clio_task_plan",
    "an untitled plan is called Plan, and relabels with the language");
  test.assert(!plan.querySelector(".cl-actions").hidden && approve?.textContent === "clio_task_approve" && approve.classList.contains("default")
    && revise?.textContent === "clio_task_revise", "a waiting plan offers Go Ahead (the default) and Change Plan…");
  test.assert(!plan.querySelector(".cl-card-note").hidden, "the card says the first round only reads");
  test.assert(status.hidden, "a card that speaks for the state leaves no status line under it");
  same(send.dataset.mode, "send", "waiting on the writer, Stop is Send again");
  test.assert(plan.classList.contains("is-arriving"), "a new card arrives with its motion");
  env.flushTimers();
  test.assert(!plan.classList.contains("is-arriving"), "and is left alone once it has played");

  // What the writer sends after 改计划… is the revision.
  const link = transport();
  tasks.connect(link.api);
  prompt.value = "  先做图，再读表  ";
  const revised = env.submit();
  test.assert(revised.defaultPrevented, "with a plan waiting, what the writer sends revises the plan instead of starting a chat turn");
  same(link.last(), call("revisePlan", "awaiting_plan", "p-plan-1", { text: "先做图，再读表" }), "the transport gets the plan and the writer's words");
  same(prompt.value, "", "the composer empties");
  test.assert(env.sendResyncs > 0, "and the Send button is told it did");
  test.assert(approve.disabled && revise.disabled, "the plan's buttons dim while Clio has the revision");
  await tick();
  test.assert(approve.disabled, "and stay dim until the next snapshot says what became of it");
  tasks.apply(snapshot("awaiting_plan"));
  test.assert(!approve.disabled, "the next snapshot of a waiting plan gives the buttons back");
  test.assert(view.querySelector(".cl-card.is-plan") === plan && view.querySelectorAll(".cl-card").length === 1,
    "a card is built once and brought up to date in place");

  env.press(approve);
  same(link.last(), call("approvePlan", "awaiting_plan", "p-plan-1", null), "Go Ahead approves the plan through the transport");
  const sent = link.calls.length;
  env.press(approve);
  same(link.calls.length, sent, "an answer is sent once");
  await tick();

  // Working: progress opens itself, Send is Stop again.
  tasks.apply(snapshot("working"));
  test.assert(plan.querySelector(".cl-actions").hidden && plan.querySelector(".cl-card-note").hidden,
    "an approved plan keeps its steps and loses its buttons");
  same(send.dataset.mode, "stop", "while the task works, Send is Stop");
  test.assert(!panel.hidden && panel.classList.contains("is-progress") && shell.classList.contains("has-panel"),
    "when the work starts, its progress opens in the right-hand panel");
  test.assert(!panel.classList.contains("is-opening"), "an era without fluid motion shows the panel at once");
  test.assert(!shell.classList.contains("is-rail"), "the progress panel leaves the sidebar whole");
  same(panelName(), "clio_task_progress", "the panel is called Progress");
  same(panelStatus(), "clio_task_state_working:1|5", "its head says which step of how many");
  same(checks(), "now,next,next,next,next", "the step in progress is under way and the rest are to come");
  const firstStep = panel.querySelector(".cl-checklist > li");
  test.assert(firstStep.getAttribute("aria-current") === "step" && firstStep.textContent === "读两张表，对上人数和预算",
    "the step under way is marked current, in the run's own words");
  const [stepsSec, outputsSec, usesSec] = panel.querySelectorAll(".cl-progress > .cl-progress-sec");
  test.assert(!stepsSec.hidden && !usesSec.hidden, "the steps and what the task may touch are shown");
  same(outputsSec.querySelector(".cl-progress-empty")?.textContent, "clio_task_no_outputs", "before it has made anything, the Made list says so");
  same([...usesSec.querySelectorAll(".cl-progress-row")].map((row) => [...row.children].map((part) => part.textContent).join("=")).join(" | "),
    "2025预算.xlsx=clio_task_level_read | 访谈名单.xlsx=clio_task_level_read | 「简报」文件夹=clio_task_level_propose | clio_task_web=clio_task_web_off",
    "Uses lists each mount at its level, and the web");
  const foot = panel.querySelector(".cl-progress-foot");
  test.assert(!foot.hidden && foot.textContent === "clio_task_tokens:9.8Kclio_task_cost:0.02", "the foot carries the tokens and the estimated cost");
  test.assert(panel.querySelector(".cl-panel-foot").hidden && panel.querySelector(".cl-tabs").hidden && back.hidden,
    "progress shows no reply verbs, no Preview/Source and no way back to itself");
  env.flushTimers();

  // Stop, Esc and ⌘. end it through the transport.
  const stopped = env.press(send);
  same(link.stops(), 1, "Stop (the Send button) asks the transport to stop the task");
  test.assert(stopped.defaultPrevented, "and the click does nothing else");
  same(link.last(), JSON.stringify({ method: "stop", task: "task-brief-1", state: "working", proposal: undefined, detail: null }),
    "the transport is told which task");
  test.assert(env.key(prompt, "Escape").defaultPrevented && link.stops() === 2, "Esc stops a running task");
  env.key(prompt, ".", { metaKey: true });
  same(link.stops(), 3, "and so does ⌘.");
  env.key(prompt, "a");
  same(link.stops(), 3, "other keys do not");
  const menu = env.document.createElement("div");
  menu.className = "menu is-open";
  env.document.body.append(menu);
  env.key(prompt, "Escape");
  menu.remove();
  const dialog = env.document.createElement("dialog");
  dialog.setAttribute("open", "");
  env.document.body.append(dialog);
  env.key(prompt, "Escape");
  dialog.remove();
  same(link.stops(), 3, "an open menu or dialog has Esc before the task does");
  env.front = env.document.createElement("div");
  env.key(env.document.body, "Escape");
  same(link.stops(), 3, "Esc in another window is that window's");
  env.key(env.document.body, ".", { metaKey: true });
  same(link.stops(), 4, "⌘. stops the task from anywhere, as it stops a reply");
  env.front = $('[data-window="assistant"]');
  env.ctx.activeAbortController = {};
  const replyStop = env.press(send);
  env.key(prompt, "Escape");
  test.assert(!replyStop.defaultPrevented && link.stops() === 4, "while a reply runs, Stop and Esc stay the reply's own");
  env.ctx.activeAbortController = null;

  // A question: the suggested answers come picked, and the button counts.
  tasks.apply(snapshot("awaiting_answer"));
  same(send.dataset.mode, "send", "a question waiting gives Send back");
  same(panelStatus(), "clio_task_state_awaiting_answer:2|5", "the progress head says the task waits for an answer, and at which step");
  same(checks(), "done,now,next,next,next", "a finished step is done and the next is under way");
  const question = view.querySelector(".cl-card.is-question");
  test.assert(question?.classList.contains("is-ask") && question.getAttribute("role") === "group"
    && question.getAttribute("aria-label") === "clio_task_question", "a question waiting on the writer is an ask card, a labelled group");
  same(question.querySelector(".cl-card-title").textContent, "简报先回答哪三个问题？", "the card is titled by the question");
  same(question.querySelector(".cl-card-body").textContent, proposal("awaiting_answer", "p-ask-1").payload.text, "and says what Clio asks");
  const inputs = [...question.querySelectorAll(".cl-option > input")];
  same(inputs.map((input) => `${input.getAttribute("type")}:${input.checked}`).join(),
    "checkbox:true,checkbox:true,checkbox:true,checkbox:false", "a question that takes several answers offers checkboxes, Clio's suggestions picked");
  const [confirm, writeOwn] = question.querySelectorAll(".cl-actions > .btn");
  same(confirm.textContent, "clio_task_answer:3", "the confirm button counts what is picked");
  same(writeOwn.textContent, "clio_task_write_own", "and I'll Write It sits beside it");
  inputs[2].checked = false;
  env.change(inputs[2]);
  same(confirm.textContent, "clio_task_answer:2", "and recounts as the writer picks");
  inputs.forEach((input) => { input.checked = false; });
  env.change(inputs[0]);
  test.assert(confirm.disabled, "with nothing picked there is nothing to confirm");
  [0, 1, 2].forEach((index) => { inputs[index].checked = true; });
  env.change(inputs[0]);
  test.assert(!confirm.disabled, "picking again gives it back");

  env.lang = "zh";
  env.document.documentElement.setAttribute("lang", "zh");
  await tick();
  test.assert(confirm.textContent === "zh:clio_task_answer:3" && panelStatus() === "zh:clio_task_state_awaiting_answer:2|5",
    "a language switch redraws the labels that carry a count");
  env.lang = "en";
  env.document.documentElement.setAttribute("lang", "en");
  await tick();

  link.refuseNext();
  env.press(confirm);
  same(link.last(), call("answer", "awaiting_answer", "p-ask-1", { picked: [0, 1, 2] }), "the confirm button answers with the picked options");
  test.assert(confirm.disabled && inputs.every((input) => input.disabled), "the card dims while the answer is out");
  await tick();
  test.assert(!confirm.disabled && inputs.every((input) => !input.disabled), "an answer the transport refuses gives the card back");

  link.refuseNext();
  prompt.value = "只要前两个";
  test.assert(env.submit().defaultPrevented, "with a question waiting, what the writer sends is the answer");
  same(link.last(), call("answer", "awaiting_answer", "p-ask-1", { text: "只要前两个" }), "the transport gets the writer's own words");
  same(prompt.value, "", "the composer empties");
  await tick();
  same(prompt.value, "只要前两个", "a refused answer goes back into the composer");
  env.submit();
  await tick();
  test.assert(prompt.value === "" && confirm.disabled, "an answer taken stays sent");
  prompt.value = "顺便问一句";
  test.assert(!env.submit().defaultPrevented && prompt.value === "顺便问一句", "once the question is answered, the composer sends a message as before");
  prompt.value = "";

  // Permission: closed progress stays closed; ⌘\ brings it back.
  env.press(panel.querySelector(".cl-panel-close"));
  test.assert(panel.hidden, "the progress panel closes");
  tasks.apply(snapshot("permission"));
  test.assert(panel.hidden, "progress opens itself once per task: closed, it stays closed");
  same(send.dataset.mode, "stop", "the task works again, so Send is Stop");
  test.assert(!question.classList.contains("is-ask") && question.querySelector(".cl-actions").hidden
    && inputs.map((input) => input.checked).join() === "true,true,true,false" && inputs.every((input) => input.disabled),
    "an answered question shows its answer and nothing to press");
  const permission = view.querySelector(".cl-card.is-permission");
  const permits = [...permission.querySelectorAll(".cl-actions > .btn")];
  test.assert(permission.classList.contains("is-ask") && permission.getAttribute("aria-label") === "clio_task_permission",
    "a permission the task waits on is an ask card, a labelled group");
  same(permits.map((button) => button.textContent).join(), "clio_task_permit_once,clio_task_permit_task,clio_task_permit_deny",
    "it offers Allow Once, Allow for This Task and Don't Allow");
  test.assert(permits[0].classList.contains("default") && permits[2].classList.contains("cl-quiet"), "Allow Once is the default and Don't Allow is quiet");
  test.assert(env.shell.canTogglePanel(), "⌘\\ is available while there is a task");
  env.shell.togglePanel();
  test.assert(!panel.hidden && panel.classList.contains("is-progress") && !panel.classList.contains("is-opening"),
    "⌘\\ shows the task's progress, at once");
  same(panelStatus(), "clio_task_state_awaiting_permission", "the head says the task waits for permission");
  env.press(permits[0]);
  same(link.last(), call("permit", "working", "p-permit-1", "once"), "Allow Once answers the permission");
  test.assert(permits.every((button) => button.disabled), "the permission's buttons dim while the answer is out");
  await tick();

  // Delivered: Clio's summary, what it made, and the documents in the panel.
  tasks.apply(snapshot("delivered"));
  env.flushTimers();
  same(send.dataset.mode, "send", "a delivered task gives Send back");
  same(kinds(view).join(), "plan,question,permission,summary,status", "the thread keeps its cards in the order they came");
  same(view.querySelector(".cl-deliver .cl-reckon-claim").textContent, proposal("delivered", "p-deliver-1").payload.summary, "Clio's summary is text in the thread, the left of the two columns");
  test.assert(status.hidden, "and no line repeats it");
  test.assert(!permission.classList.contains("is-ask") && permission.querySelector(".cl-card-answer").textContent === "clio_task_permit_once"
    && permission.querySelector(".cl-actions").hidden, "an answered permission says what the writer allowed");
  same(panelStatus(), "clio_task_state_delivered", "the progress head says the work is handed over");
  test.assert(checks() === "done,done,done,done,done" && !panel.querySelector('[aria-current="step"]'), "every step is done and none is under way");
  const outputRows = () => [...panel.querySelectorAll(".cl-progress-row.cl-output")];
  same(outputRows().map((row) => row.textContent).join(" | "), "返乡数据简报摘要.mdMD | 采访花费.csvCSV", "Made lists each document with its format");

  env.press(outputRows()[0]);
  const doc = proposal("delivered", "p-doc-1");
  test.assert(!panel.classList.contains("is-progress") && panelName() === "返乡数据简报摘要.md" && panelStatus() === "clio_shell_candidate",
    "a document opens in the panel by its name, a candidate");
  same(panel.querySelector(".cl-panel-body > .cl-panel-doc")?.textContent, doc.payload.content, "Preview shows the document");
  test.assert(!back.hidden && back.textContent === "clio_task_progress", "with a task on, the panel is one step from its progress");
  test.assert(!panel.querySelector(".cl-tabs").hidden && panel.querySelector(".cl-panel-foot").hidden,
    "a document has Preview and Source but no reply verbs; the task's delivery decides where it goes");
  test.assert(shell.classList.contains("is-rail"), "a document in the panel narrows the sidebar to its rail, as a reply does");
  env.press(panel.querySelector('.cl-tab[data-view="source"]'));
  same(panel.querySelector(".cl-panel-body > .cl-panel-source")?.textContent, doc.payload.content, "Source shows it as written");
  env.press(panel.querySelector('.cl-tab[data-view="preview"]'));
  env.press(back);
  test.assert(panel.classList.contains("is-progress") && back.hidden && !shell.classList.contains("is-rail"), "‹ Progress goes back to the progress");
  env.press(outputRows()[1]);
  same(panel.querySelector(".cl-panel-body > .cl-panel-source")?.textContent, proposal("delivered", "p-doc-2").payload.content,
    "a table's CSV shows as its text, even in Preview");
  env.press(back);

  test.assert(tasks.current()?.task?.state === "delivered" && tasks.current().turns.length === snapshot("delivered").turns.length,
    "tasks.current() is the last snapshot");

  // The transcript owns the thread.
  messages.replaceChildren();
  await tick();
  test.assert(!view.isConnected && !main.classList.contains("has-task") && panel.hidden,
    "clearing the transcript takes the task's thread and its panel with it");
  same(tasks.current(), null, "and forgets the snapshot");
  tasks.apply(snapshot("working"));
  test.assert(!messages.querySelector(".clio-task") && panel.hidden && send.dataset.mode === "send",
    "a later snapshot of that task is not drawn into the next conversation");
  const other = snapshot("planning");
  other.task.id = "task-other";
  tasks.apply(other);
  test.assert(messages.querySelector(".clio-task") && send.dataset.mode === "stop", "another task is");
  tasks.apply(null);
  test.assert(!messages.querySelector(".clio-task") && send.dataset.mode === "send" && tasks.current() === null, "apply(null) clears the view");
  tasks.apply(snapshot("awaiting_plan"));
  test.assert(messages.querySelector(".clio-task .cl-card.is-plan"), "after a clear, the dropped task may be drawn again");
}

// --- 2. With no transport ----------------------------------------------------
{
  const env = boot();
  const { $, tasks } = env;
  const send = $("#send");
  const prompt = $("#prompt");
  const panel = $(".clio-panel");

  tasks.apply(snapshot("awaiting_plan"));
  const approve = $(".cl-card.is-plan .btn.default");
  env.press(approve);
  test.assert(approve.disabled, "without a transport an answer still dims its card");
  tasks.apply(snapshot("awaiting_plan"));
  test.assert(!approve.disabled, "until the next snapshot");
  prompt.value = "先做图";
  test.assert(!env.submit().defaultPrevented && prompt.value === "先做图",
    "without a transport, what the writer types goes to the conversation as before, not nowhere");
  prompt.value = "";

  tasks.apply(snapshot("working"));
  test.assert(env.press(send).defaultPrevented, "Stop still takes the click");
  test.assert(env.tasks.current()?.task?.state === "stopped" && send.dataset.mode === "send", "and the view says stopped at once");
  same($(".clio-task .cl-task-status")?.textContent, "clio_task_stopped_note", "the thread says the task stopped");
  same(panel.querySelector(".cl-panel-status").textContent, "clio_task_state_stopped", "and so does the progress head");
  test.assert(!panel.querySelector('.cl-checklist [data-status="now"]'), "a stopped task has no step under way");
  test.assert(!env.key(prompt, "Escape").defaultPrevented, "Esc has nothing to stop afterwards");
}

// --- 3. A reply open in the panel stays; other appearances ------------------
{
  const env = boot();
  const { $, tasks } = env;
  const panel = $(".clio-panel");
  const reply = env.document.createElement("article");
  reply.className = "message assistant";
  reply.dataset.messageId = "m-1";
  reply.dataset.rawContent = "# 第一段回复\n\n正文";
  const actions = env.document.createElement("div");
  actions.className = "message-actions";
  reply.append(actions);
  $("#messages").append(reply);
  await tick();
  env.press(reply.querySelector(".clio-open-output"));
  same(panel.querySelector(".cl-panel-name").textContent, "第一段回复", "a reply opens in the panel");
  tasks.apply(snapshot("working"));
  test.assert(!panel.classList.contains("is-progress") && panel.querySelector(".cl-panel-name").textContent === "第一段回复",
    "a task starting its work does not push a reply out of the panel");
  const back = panel.querySelector(".cl-panel-back");
  test.assert(!back.hidden, "the reply's panel offers the way to the task's progress");
  env.press(back);
  test.assert(panel.classList.contains("is-progress"), "which shows it");
}
{
  const env = boot("classic");
  env.tasks.apply(snapshot("working"));
  test.assert(env.$(".clio-shell").dataset.skin === "classic" && !env.$(".clio-panel").hidden, "Classic shows the task's progress too");
}
for (const theme of ["system-7", "platinum", "drawing-board", "nextstep"]) {
  const env = boot(theme);
  env.tasks.apply(snapshot("working"));
  test.assert(env.$(".clio-shell").dataset.skin === "classic" && !env.$(".clio-panel").hidden, `${theme} wears the Classic skin, so its progress panel shows`);
}
{
  const env = boot("unskinned-era");
  env.tasks.apply(snapshot("working"));
  test.assert(env.$("#messages .clio-task .cl-card.is-plan") && env.$(".clio-panel").hidden && env.$("#send").dataset.mode === "stop",
    "an appearance without a skin still draws the cards and the Stop, but has no panel to show");
}

// --- 4. What the module is made of ------------------------------------------
{
  test.assertNotMatches(codeOnly(source), /\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest)\b/,
    "the shell stores nothing and calls no server: the transport does");

  // The shell's words load with the shell (LOCAL_STRINGS), not with the
  // boot's language tables: loading the module puts them in both.
  const table = (file, name) => {
    const context = vm.createContext({ window: {} });
    vm.runInContext(read(`app/data/${file}`), context, { timeout: 2000 });
    return context.window[name];
  };
  const baseEn = table("translations-en.js", "AISystem6TranslationsEn");
  const baseZh = table("translations-zh.js", "AISystem6TranslationsZh");
  const { ctx } = boot();
  const en = ctx.AISystem6TranslationsEn;
  const zh = ctx.AISystem6TranslationsZh;
  // ClioWork and ClioCode are product names, written over their keys.
  const names = new Set(["clio_shell_work", "clio_shell_code"]);
  const keys = [...new Set([...source.matchAll(/"((?:clio_shell|clio_task|balloon_clio_stop_task)[a-z_]*)"/g)].map((match) => match[1]))]
    .filter((key) => !names.has(key)).concat("clio_task_level_read", "clio_task_level_propose", "clio_task_level_change");
  const missing = keys.filter((key) => !(key in en) || !(key in zh));
  test.assert(keys.length > 50 && !missing.length, `every shell and task label is in English and Chinese once the module loads${missing.length ? ` (missing ${missing.join(", ")})` : ""}`);
  const eager = keys.filter((key) => key in baseEn || key in baseZh);
  test.assert(!eager.length, `none of them rides the boot's language tables${eager.length ? ` (still there: ${eager.join(", ")})` : ""}`);
  test.assert(baseEn.clio_search && baseZh.clio_search, "the menu's Search Conversations… stays in the boot tables: the menu bar names it before the shell loads");
  const enKeys = Object.keys(en).sort().join();
  test.assert(enKeys === Object.keys(zh).sort().join(), "the shell's English and Chinese carry the same keys");
  const arity = Object.keys(en).filter((key) => typeof en[key] === "function" && en[key].length !== zh[key]?.length);
  test.assert(!arity.length, `and the labels drawn with a value take as many in both languages${arity.length ? ` (${arity.join(", ")})` : ""}`);
  const counted = ["clio_task_answer", "clio_task_you_wrote", "clio_task_tokens", "clio_task_cost", "clio_task_state_working", "clio_task_state_awaiting_answer"];
  test.assert(counted.every((key) => typeof en[key] === "function" && typeof zh[key] === "function"), "the labels drawn with a value take it in both languages");
  same(en.clio_task_answer(3), "Use These Three", "the English confirm button counts in words");
  same(zh.clio_task_state_awaiting_answer(2, 5), "等你回答（第 2 步，共 5 步）", "the Chinese strip counts the step");

  test.assertIncludes(css, '.clio-shell[data-skin="glass"] .clio-task {', "Liquid Glass draws the task's thread");
  test.assertIncludes(css, '.clio-shell[data-skin="classic"] .clio-task {', "and so does Classic");
  test.assertIncludes(css, '.clio-shell[data-skin="glass"] .clio-panel.is-progress {', "Liquid Glass sizes the progress panel");
  test.assertIncludes(css, '.clio-shell[data-skin="classic"] .clio-panel.is-progress {', "and so does Classic");
  test.assertMatches(css, /prefers-reduced-motion: reduce\)\s*\{\s*:is\(\.assistant-window, \.clio-code-window\) \.clio-shell\[data-skin="glass"\] \.clio-task \{\s*--cl-card-scale: 1;/,
    "with reduced motion a card fades in without growing");
  const hidden = css.slice(css.lastIndexOf("/* Hidden parts"));
  test.assert(/\.cl-progress-sec, \.cl-progress-foot\)\[hidden\]/.test(hidden) && hidden.includes(".clio-task .cl-actions[hidden]")
    && hidden.trimEnd().endsWith("display: none;\n}"), "the [hidden] rule comes last, so a hidden part stays hidden whatever display it is given");
}

// --- 5. A phone held upright (Phone.dc.html) ---------------------------------
{
  // The phone query as the browser answers it, turned by hand.
  const query = { matches: true, listeners: [], addEventListener(type, fn) { this.listeners.push(fn); } };
  const turn = (upright) => { query.matches = upright; query.listeners.forEach((fn) => fn(query)); };
  const env = boot("liquid-glass", { matchMedia: () => query });
  const { $, tasks, dom } = env;
  const shell = $(".clio-shell");
  const panel = $(".clio-panel");
  const strip = $(".cl-strip");
  const back = $(".cl-thread-back");
  const progress = $(".cl-thread-progress");
  const fresh = $('.clio-sidebar [data-action="start-new-clio-chat"]');
  const pointer = (type, y, time) => {
    const event = new dom.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clientY", { value: y });
    Object.defineProperty(event, "timeStamp", { value: time });
    Object.assign(event, { button: 0, pointerId: 1 });
    return event;
  };
  panel.getBoundingClientRect = () => ({ height: 600 });

  test.assert(shell.classList.contains("is-phone") && shell.dataset.layer === "thread",
    "upright on a phone the window shows one layer, the conversation first");
  test.assert(!!$(".cl-thread-head") && !!back && progress?.hidden, "the conversation's head has a way back and, with no task, no progress button");
  env.press(back);
  same(shell.dataset.layer, "list", "back goes to the list, the sidebar as a page");
  test.assert(!$(".cl-search").hidden, "the list always carries its search field");
  env.press(fresh);
  same(shell.dataset.layer, "thread", "New Chat comes back to the conversation");

  tasks.apply(snapshot("working"));
  await tick();
  test.assert(panel.hidden, "a task starting its work does not throw the sheet over the conversation");
  test.assert(!strip.hidden && !progress.hidden && strip.dataset.status === "now", "the strip and the progress button appear with the task");
  test.assert(/^clio_task_state_working:/.test(strip.querySelector(".cl-strip-text").textContent), "the strip says which step the task is on");
  tasks.apply(snapshot("awaiting_answer"));
  test.assert(/^clio_task_state_awaiting_answer:/.test(strip.querySelector(".cl-strip-text").textContent), "and that it waits for the writer's answer");

  // A tap on the strip raises the sheet, animated; Esc drops it at once.
  env.press(strip);
  test.assert(!panel.hidden && panel.classList.contains("is-progress") && panel.classList.contains("is-opening"),
    "a tap on the strip raises the progress sheet, and it rises");
  test.assert(!shell.classList.contains("is-rail"), "the phone has no rail behind its sheet");
  env.flushTimers();
  env.key(panel.querySelector(".cl-panel-body"), "Escape");
  test.assert(panel.hidden && !panel.classList.contains("is-closing"), "Esc puts the sheet away at once, with no animation");
  env.press(strip);
  env.flushTimers();
  env.key(env.document.body, "Escape");
  test.assert(panel.hidden && !panel.classList.contains("is-closing"),
    "and so it does with the focus outside it, where a tap leaves it");

  // A short slow pull settles back; a flick down puts it away.
  env.press(progress);
  env.flushTimers();
  const handle = panel.querySelector(".cl-sheet-handle");
  handle.dispatchEvent(pointer("pointerdown", 100, 0));
  test.assert(panel.classList.contains("is-dragging"), "the sheet follows a finger on its handle");
  panel.dispatchEvent(pointer("pointermove", 180, 400));
  same(panel.style.getPropertyValue("--cl-sheet-drag"), "80px", "as far as the finger pulls it");
  panel.dispatchEvent(pointer("pointerup", 180, 600));
  test.assert(!panel.hidden && !panel.classList.contains("is-dragging") && !panel.style.getPropertyValue("--cl-sheet-drag"),
    "a short, slow pull lets it settle back");
  handle.dispatchEvent(pointer("pointerdown", 100, 1000));
  panel.dispatchEvent(pointer("pointermove", 130, 1020));
  panel.dispatchEvent(pointer("pointermove", 160, 1040));
  panel.dispatchEvent(pointer("pointerup", 160, 1050));
  test.assert(panel.hidden, "a flick down puts it away, however short");

  // The list closes the sheet; held sideways the window keeps its columns.
  env.press(strip);
  env.press(back);
  test.assert(panel.hidden && shell.dataset.layer === "list", "going back to the list puts the sheet away");
  turn(false);
  test.assert(!shell.classList.contains("is-phone"), "held sideways the window is the three columns again");
  env.press(back);
  same(shell.dataset.layer, "list", "and the layers wait, untouched, for the phone to stand up again");
  turn(true);
  test.assert(shell.classList.contains("is-phone"), "upright again, it is the phone's layers");

  test.assertIncludes(css, "--cl-sheet-ease: cubic-bezier(0.32, 0.72, 0, 1);", "the sheet moves on the drawer curve");
  test.assertIncludes(css, '.clio-shell[data-skin="classic"].is-phone .clio-panel {', "Classic draws the phone's sheet too");
}

// --- 7. A ClioWrite document ClioTalk revised (Review.dc.html) ---------------
// The engines are the real ones (Quire codec, projection, delivery, the 修订
// list's take) in their own context; the shell reaches them as the desk's
// globals. Every decision is watched where it lands: ClioWorksQuireReview.
// resolve, the one call that writes a decision into the document.
const REVIEW_ENGINE = [
  "app/core/text-quote.js",
  "app/vendor/clioworks-v3/native-locate.js",
  "app/features/agent-projection.js",
  "app/core/word-diff.js",
  "app/vendor/clioworks-v3/quire-adapter.js",
  "app/vendor/clioworks-v3/quire-review.js",
  "app/features/clio-write-review.js",
  "app/features/clio-write-compare.js",
  "app/features/clio-write-agent-delivery.js",
];
const LENT = ["访谈名单：小周 8人，林秀兰 12人。", "2025预算.xlsx D7：返乡人口 1,210 人。"];
const EDITS = {
  "在我采访的 27 人里，有 三成 是在 2023 年以后回到县城的。": "在我采访的 27 人里，有 8 人 是在 2023 年以后回到县城的。",
  "2025 年返乡人口 1,240 人，比前一年多出四成。": "2025 年返乡人口 1,210 人，比前一年多出四成。",
  "这是一场静悄悄的迁徙。": "这种回流没有声势，却改变了县城的年龄结构。",
};

// One document with ClioTalk's three revisions delivered into it, bound as
// ClioWrite binds an opened file; resolve() is recorded on its way through.
async function revisedDocument(docId) {
  const ctx = makeContext();
  ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
  loadScripts(ctx, REVIEW_ENGINE);
  const run = (code) => vm.runInContext(code, ctx);
  ctx.__edits = EDITS;
  ctx.__lent = LENT;
  ctx.__docId = docId;
  const adapter = await run(`(async () => {
    const L = await ClioWorksQuireAdapter.loadCodec();
    const D = L.D;
    const doc = D.newDoc();
    const para = (text) => D.para([D.text(text, {})], {});
    D.touchList(doc.main);
    doc.main.blocks.push(para("三、他们为什么回来"), ...Object.keys(globalThis.__edits).map(para));
    D.reindex(doc);
    const bytes = new Uint8Array(await (await L.docx.write(doc, { format: "docx" })).arrayBuffer());
    const projection = await AISystem6AgentProjection.project(bytes, "docx", { name: "三联访谈.docx" });
    const after = { files: projection.files.map((f) => (f.path !== "正文.md" ? f : { path: f.path, text: f.text.split("\\n").map((line) => {
      const m = /^\\{#¶\\d+\\}/.exec(line);
      const text = m ? line.slice(m[0].length) : line;
      return m && globalThis.__edits[text] != null ? m[0] + globalThis.__edits[text] : line;
    }).join("\\n") })) };
    const candidates = await AISystem6AgentProjection.diff(projection, after, projection.map);
    const adapter = await ClioWorksQuireAdapter.open(bytes, { name: "三联访谈.docx" });
    AISystem6ClioWriteAgentDelivery.onDocumentMounted({ docId: globalThis.__docId, adapter });
    AISystem6ClioWriteAgentDelivery.deliver(adapter, candidates, { sources: globalThis.__lent, round: 1 });
    return adapter;
  })()`);
  const quire = ctx.ClioWorksQuireReview;
  const resolves = [];
  // The desk's one road into the document, watched: the shell and the 修订
  // list both reach it through AISystem6ClioWriteReview.take.
  ctx.ClioWorksQuireReview = Object.freeze({
    ...quire,
    resolve(target, records, accept, label) {
      resolves.push({ records: records.map((record) => ({ ...record })), accept, label });
      return quire.resolve(target, records, accept, label);
    },
  });
  return { ctx, adapter, resolves, agent: ctx.AISystem6ClioWriteAgentDelivery, review: ctx.AISystem6ClioWriteReview, quire };
}

{
  const engine = await revisedDocument("doc-review");
  const settled = [];
  const opened = [];
  const env = boot("liquid-glass", {
    AISystem6ClioWriteAgentDelivery: engine.agent,
    AISystem6ClioWriteReview: engine.review,
    ClioWorksQuireReview: engine.ctx.ClioWorksQuireReview,
    AISystem6ClioWrite: { settleExternalEdit: (adapter) => { settled.push(adapter === engine.adapter); return true; } },
    AISystem6ClioWorks: { openNativeDocument: (item, context) => { opened.push({ item, context }); return Promise.resolve({ ok: true }); } },
  });
  const { $, shell } = env;
  const panel = $(".clio-panel");
  const classOf = (record) => engine.agent.metaForRecord(engine.adapter, record)?.class;
  const before = engine.quire.revisions(engine.adapter);
  test.assert(before.length > 3 && before.every((record) => record.author === "ClioTalk"), `the fixture holds ClioTalk's revisions (${before.length})`);

  // The file card in the conversation.
  const card = shell.documents.deliver({ docId: "doc-review", name: "三联访谈.docx", mountedName: "三联访谈.docx", adapter: engine.adapter, sourceNames: ["访谈名单.xlsx", "2025预算.xlsx D7"] });
  test.assert(card?.isConnected && card.closest("#messages") && card.querySelector(".cl-file-tile").textContent === "DOCX",
    "a delivered document is a file card in the conversation");
  same(card.querySelector(".cl-file-name").textContent, "三联访谈.docx", "the card names the file");
  same(card.querySelector(".cl-file-sub").textContent, "clio_review_count:3|2|1", "and counts what waits in it: three revisions, two errands, one in the writer's words");

  // A click opens it in the panel.
  env.press(card.querySelector(".cl-file-main"));
  test.assert(!panel.hidden && panel.classList.contains("is-doc"), "the card opens the document in the panel");
  same(shell.documents.current(), "doc-review", "the panel says which document it shows");
  same(panel.querySelector(".cl-panel-name").textContent, "三联访谈.docx", "the panel is named by the file");
  same(panel.querySelector(".cl-panel-status").textContent, "ClioWrite", "and says whose document it is");
  test.assert(panel.querySelector(".cl-tabs").hidden && panel.querySelector(".cl-panel-foot").hidden, "a document has no Preview / Source and no reply verbs");
  const textEl = panel.querySelector(".cl-doc-text");
  test.assert([...textEl.querySelectorAll("del")].some((el) => el.textContent.includes("三成"))
    && [...textEl.querySelectorAll("ins")].some((el) => el.textContent.includes("8 人")),
    "the revisions are drawn in the text: the old words struck, the new ones underlined");
  const batch = panel.querySelector(".cl-doc-batch");
  test.assert(!batch.hidden, "with errands waiting the head offers to take them");
  same(batch.textContent, "clio_write_agent_batch_button:2", "收下跑腿件（N） counts the errand cards");
  const cards = () => [...panel.querySelectorAll(".cl-rev-card")];
  same(cards().map((el) => el.dataset.kind).join(), "errand,errand,voice", "one card per revision, in reading order");
  const errandCard = cards()[0];
  const voiceCard = cards()[2];
  same(errandCard.querySelector(".cl-rev-title").textContent, "三成 → 8 人", "an errand card shows the words before and after");
  same(errandCard.querySelector(".cl-rev-note").textContent, "clio_review_errand_basis:访谈名单.xlsx", "and the lent source the new words came from");
  same(cards()[1].querySelector(".cl-rev-title").textContent, "1,240 → 1,210", "a number the diff split reads whole on its card");
  test.assert(errandCard.querySelector(".cl-rev-take").classList.contains("default") && !errandCard.querySelector(".cl-rev-return").classList.contains("default"),
    "an errand card takes by default (收下)");
  test.assert(voiceCard.classList.contains("is-voice") && voiceCard.querySelector(".cl-rev-return").classList.contains("default")
    && !voiceCard.querySelector(".cl-rev-take").classList.contains("default"),
    "a voice card is set apart and sends back by default (退回)");
  same(voiceCard.querySelector(".cl-rev-note").textContent, "clio_review_voice_note", "and says it changes the writer's own sentence and will be marked AI words");

  // 收下跑腿件: one step, errand rows only.
  env.press(batch);
  same(engine.resolves.length, 1, "taking the errands is one decision");
  const taken = engine.resolves[0];
  test.assert(taken.accept && taken.label === "收下跑腿件" && taken.records.length > 0 && taken.records.every((record) => classOf(record) === "errand"),
    `the batch reaches the document with errand rows only (${taken.records.map(classOf).join()})`);
  const left = engine.quire.revisions(engine.adapter);
  test.assert(left.length > 0 && left.every((record) => classOf(record) === "voice"), "the writer's own sentence is still waiting");
  same(engine.agent.aiTextRanges("doc-review").length, 0, "taking errands marks no AI words");
  test.assert(batch.hidden, "with only the writer's own sentence left there is nothing to take in a batch");
  same(cards().map((el) => el.dataset.kind).join(), "voice", "only the voice card is left, one by one");
  same(card.querySelector(".cl-file-sub").textContent, "clio_review_count:1|0|1", "the file card follows");
  test.assert(settled.length === 1 && settled[0], "a ClioWrite window on the same file settles after the decision");

  // Taking the voice revision: one card, and its words become AI words.
  env.press(cards()[0].querySelector(".cl-rev-take"));
  same(engine.resolves.length, 2, "the voice revision is its own decision");
  test.assert(engine.resolves[1].accept && engine.resolves[1].records.every((record) => classOf(record) === "voice"), "and it takes only that card's rows");
  const ranges = engine.agent.aiTextRanges("doc-review");
  test.assert(ranges.length > 0 && ranges.some((range) => "这种回流没有声势，却改变了县城的年龄结构。".includes(range.text) && range.text.length > 1),
    `the accepted words reach the AI-words ledger (${JSON.stringify(ranges.map((range) => range.text))})`);
  same(engine.quire.revisions(engine.adapter).length, 0, "nothing is left to decide");
  test.assert(!cards().length && panel.querySelector(".cl-doc-note")?.textContent === "clio_review_done", "and the panel says so");
  same(card.querySelector(".cl-file-sub").textContent, "clio_review_done", "as does the file card");

  // 在 ClioWrite 打开: the desk's own road to the editor.
  env.press(panel.querySelector(".cl-doc-open"));
  test.assert(opened.length === 1 && opened[0].item.mountedName === "三联访谈.docx" && opened[0].context.intent === "edit",
    "在 ClioWrite 打开 opens the file in the editor");
  env.key(panel.querySelector(".cl-panel-body"), "Escape");
  test.assert(panel.hidden && !panel.classList.contains("is-closing"), "Esc closes the document at once");
}

// The default on a voice card sends it back: the writer's sentence stays, and
// nothing is marked.
{
  const engine = await revisedDocument("doc-voice");
  const env = boot("classic", {
    AISystem6ClioWriteAgentDelivery: engine.agent,
    AISystem6ClioWriteReview: engine.review,
    ClioWorksQuireReview: engine.ctx.ClioWorksQuireReview,
  });
  const panel = env.$(".clio-panel");
  env.shell.documents.show({ docId: "doc-voice", name: "三联访谈.docx", adapter: engine.adapter });
  test.assert(!panel.hidden && panel.classList.contains("is-doc"), "Classic shows the document in the panel too");
  const voice = panel.querySelector('.cl-rev-card[data-kind="voice"]');
  env.press(voice.querySelector(".btn.default"));
  const decision = engine.resolves.at(-1);
  test.assert(decision && !decision.accept && decision.records.every((record) => engine.agent.metaForRecord(engine.adapter, record)?.class === "voice"),
    "the voice card's default sends back only its own rows");
  test.assert(engine.adapter.paragraphs().some((p) => p.text === "这是一场静悄悄的迁徙。"), "the writer's sentence is as it was");
  same(engine.agent.aiTextRanges("doc-voice").length, 0, "and nothing is marked AI words");
  same([...panel.querySelectorAll(".cl-rev-card")].map((el) => el.dataset.kind).join(), "errand,errand", "the errands still wait");

  // A document no window has opened yet: its revisions come when ClioWrite opens it.
  env.shell.documents.show({ docId: "not-open", name: "别的.docx" });
  test.assert(panel.querySelector(".cl-doc-note")?.textContent === "clio_review_waiting" && panel.querySelector(".cl-doc-batch").hidden,
    "a file ClioWrite has not opened says its revisions arrive when it does");
}

// --- 8. The real task layer (M3) ---------------------------------------------
// The task link of cliotalk-agent.js drives the real /api/agent/tasks routes
// (the router and handlers, a stub engine as in agent-tasks, a temp agent
// home) and hands the shell what the server answers. A message starts a
// task over a lent .docx; the plan card is the engine's plan, 照这个做 and
// 我自己写 are further turns, the hand-over brings the document's edits back
// through projection-after → AgentProjection.diff → ClioWrite's delivery
// queue → the file card → document mode, and 它说交了／实际改了 compares the
// summary with what the desk measured. Stop/Esc and the two-task cap go to
// the same routes.
{
  const { createRequire } = await import("node:module");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const crypto = await import("node:crypto");
  const { Readable } = await import("node:stream");
  const require = createRequire(import.meta.url);
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-cliotalk-tasks-")));
  process.env.AI_SYSTEM6_AGENT_HOME = path.join(scratch, "agent-home");
  process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";
  const runs = require("../../apps/server/server/agent/runs.js");
  const folders = require("../../apps/server/server/agent/folders.js");
  const { agentToken } = require("../../apps/server/server/agent/agent-token.js");
  const router = require("../../apps/server/server/router.js");

  // The page's agent API, as cliotalk-agent.js's api(): the per-boot token,
  // JSON in and out, a refusal thrown with its code.
  async function api(url, body, method = body === undefined ? "GET" : "POST") {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = Readable.from(payload ? [Buffer.from(payload)] : []);
    Object.assign(req, {
      method,
      url,
      headers: { host: "127.0.0.1:4173", "x-ai-system6-agent-token": agentToken, ...(payload ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) } : {}) },
      socket: { remoteAddress: "127.0.0.1" },
    });
    const out = { status: 0, text: "" };
    await router.resolveRoute(req)(req, {
      destroyed: false, writableEnded: false, headersSent: false,
      writeHead(status) { out.status = status; this.headersSent = true; },
      end(text) { out.text = String(text || ""); this.writableEnded = true; },
    });
    const json = out.text ? JSON.parse(out.text) : {};
    if (out.status >= 400) throw Object.assign(new Error(json.error || `HTTP ${out.status}`), { code: json.code || "" });
    return json;
  }

  // The engine follows a script per turn (its prompts, counted over the
  // section); `hold` keeps a turn working until released.
  const prompts = [];
  let script = () => ({});
  let hold = null;
  runs.configureRunsForTests({
    resolveKey: async () => "k-test",
    startEngine: (options) => {
      const cwd = fs.realpathSync(options.work);
      return Promise.resolve({
        sessionId: "11111111-2222-3333-4444-555555555555",
        cwd,
        async prompt(text) {
          prompts.push(text);
          const plan = script(prompts.length, cwd) || {};
          for (const [name, body] of Object.entries(plan.files || {})) fs.writeFileSync(path.join(cwd, name), body);
          (plan.proposals || []).forEach((doc, index) => {
            fs.mkdirSync(path.join(cwd, ".ais6-proposals"), { recursive: true });
            fs.writeFileSync(path.join(cwd, ".ais6-proposals", `${index + 1}-${doc.kind}.json`), JSON.stringify({ v: 1, reason: "", createdAt: new Date().toISOString(), ...doc }));
          });
          if (plan.hold) await plan.hold;
          return { stopReason: "end_turn" };
        },
        async cancel() {},
        async close() {},
        kill() {},
      });
    },
  });

  // The desk's own engines (projection, delivery, the 修订 list's take) and
  // the lent document, as the writer's Project Hard Disk holds it.
  const desk = makeContext();
  desk.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
  loadScripts(desk, REVIEW_ENGINE);
  desk.__paragraphs = ["三、他们为什么回来", ...Object.keys(EDITS), "县城的租克涨得快。"];
  const bytes = await vm.runInContext(`(async () => {
    const L = await ClioWorksQuireAdapter.loadCodec();
    const D = L.D;
    const doc = D.newDoc();
    D.touchList(doc.main);
    doc.main.blocks.push(...globalThis.__paragraphs.map((text) => D.para([D.text(text, {})], {})));
    D.reindex(doc);
    return new Uint8Array(await (await L.docx.write(doc, { format: "docx" })).arrayBuffer());
  })()`, desk);

  // cliotalk-agent.js, as the page loads it; its link is what submit() makes.
  const agentCtx = vm.createContext({
    console, TextEncoder, setTimeout, clearTimeout,
    t: (key, ...args) => (key.startsWith("agent_error_") ? `plain:${key}` : args.length ? `${key}:${args.join("|")}` : key),
    localStorage: { getItem: () => null, setItem() {} },
    window: {},
  });
  vm.runInContext(read("app/features/cliotalk-agent.js"), agentCtx, { filename: "cliotalk-agent.js" });
  const agentModel = agentCtx.window.AISystem6ClioTalkAgent.model;
  test.assert(typeof agentModel.createTaskLink === "function", "cliotalk-agent.js offers the task link");

  const env = boot("liquid-glass", {
    AISystem6ClioWriteAgentDelivery: desk.AISystem6ClioWriteAgentDelivery,
    AISystem6ClioWriteReview: desk.AISystem6ClioWriteReview,
    ClioWorksQuireReview: desk.ClioWorksQuireReview,
    AISystem6ClioWrite: { settleExternalEdit: () => true },
  });
  const { $, shell } = env;
  const panel = $(".clio-panel");
  const messages = $("#messages");
  const link = (extra = {}) => agentModel.createTaskLink({
    api,
    shell: () => shell,
    projection: () => desk.AISystem6AgentProjection,
    ensureDelivery: async () => desk.AISystem6ClioWriteAgentDelivery,
    sha256: async (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex"),
    errorText: agentModel.agentErrorText,
    approveWords: () => "照这个做",
    pollMs: 5,
    ...extra,
  });
  async function until(check, label, ms = 8000) {
    const limit = Date.now() + ms;
    while (!check() && Date.now() < limit) await new Promise((resolve) => setTimeout(resolve, 5));
    test.assert(check(), label);
  }
  const state = () => shell.tasks.current()?.task?.state;
  const docFolder = (cwd) => path.join(cwd, ".ais6-documents", fs.readdirSync(path.join(cwd, ".ais6-documents"))[0], "正文.md");
  const edit = (cwd, edits) => {
    const file = docFolder(cwd);
    const text = fs.readFileSync(file, "utf8").split("\n").map((line) => {
      const mark = /^\{#¶\d+\} ?/.exec(line);
      const body = mark ? line.slice(mark[0].length) : line;
      return mark && edits[body] != null ? mark[0] + edits[body] : line;
    }).join("\n");
    fs.writeFileSync(file, text);
  };
  const planDoc = { kind: "plan", title: "核对第三节的数字", payload: { steps: [{ text: "读三联访谈.docx 第三节", touches: ["三联访谈.docx"] }, { text: "数字有出入的写成修订", touches: ["三联访谈.docx"] }] } };
  const askDoc = { kind: "question", title: "以哪份为准？", payload: { text: "预算表和访谈名单对不上时，以哪份为准？", options: ["预算表", "访谈名单"] } };
  const madeDoc = { kind: "new-document", title: "核对说明", payload: { format: "md", name: "核对说明.md", content: "# 核对说明\n\n三处和来源不一样。\n" } };
  script = (n, cwd) => {
    if (n === 1) return { proposals: [planDoc] };
    if (n === 2) return { proposals: [askDoc] };
    if (n === 3) {
      edit(cwd, EDITS);
      return { proposals: [madeDoc, { kind: "deliver", title: "交付", payload: { summary: "对了 12 处，3 处和来源不一样，已经写成修订放进三联访谈.docx。" } }] };
    }
    edit(cwd, { "县城的租克涨得快。": "县城的租客涨得快。" });
    return { proposals: [{ kind: "deliver", title: "交付", payload: { summary: "又改了 3 处错字。" } }] };
  };

  const task = link();
  const started = await task.start({ prompt: "第三节里的几个数字帮我对一下。", lent: [{ id: "file-sanlian", name: "三联访谈.docx", format: "docx", bytes }] });
  test.assert(started.state === "planning" && started.mounts.length === 1 && started.mounts[0].kind === "object" && started.mounts[0].name === "三联访谈.docx",
    `a message in 代理 creates a real task over the lent document (${started.state}, ${JSON.stringify(started.mounts)})`);
  const view = messages.querySelector(":scope > .clio-task");
  same(view?.querySelector(".cl-task-status")?.textContent, "clio_task_planning", "the thread says Clio is drafting a plan");
  same($("#send").dataset.mode, "stop", "while it drafts, Send is Stop");

  await until(() => state() === "awaiting_plan" && view.querySelector(".cl-card.is-plan"), "the engine's plan arrives as the plan card");
  const plan = view.querySelector(".cl-card.is-plan");
  same([...plan.querySelectorAll(".cl-plan-steps > li")].map((item) => item.textContent).join("|"), planDoc.payload.steps.map((step) => step.text).join("|"), "the plan card lists the engine's steps");
  same(plan.querySelector(".cl-card-title").textContent, planDoc.title, "and is titled as the engine titled it");
  env.press(plan.querySelector(".cl-actions > .btn.default"));
  await until(() => prompts.length === 2, "照这个做 starts turn 2");
  const afterApprove = await api(`/api/agent/tasks/${started.id}`);
  test.assert(afterApprove.turns[1].prompt === "照这个做" && afterApprove.turns[1].level === "propose",
    `照这个做 is a turn with approvePlan: it runs at the lent document's level (${afterApprove.turns[1].level})`);

  await until(() => state() === "awaiting_answer" && view.querySelector(".cl-card.is-question.is-ask"), "the engine's question arrives as the question card");
  test.assert(!panel.hidden && panel.querySelector(".cl-checklist"), "the progress panel opened when the work started");
  const question = view.querySelector(".cl-card.is-question");
  same([...question.querySelectorAll(".cl-option span")].map((el) => el.textContent).join("|"), askDoc.payload.options.join("|"), "with the engine's options");
  env.press([...question.querySelectorAll(".cl-actions > .btn")].pop());
  $("#prompt").value = "两份都不对，以县统计局的公报为准。";
  env.submit();
  await until(() => prompts.length === 3, "我自己写 sends the typed words as turn 3");
  const turns3 = (await api(`/api/agent/tasks/${started.id}`)).turns;
  same(turns3[2].prompt, "两份都不对，以县统计局的公报为准。", "the writer's own words are the turn's prompt, verbatim");
  same(question.querySelector(".cl-card-answer").textContent, "clio_task_you_wrote:两份都不对，以县统计局的公报为准。", "and the card says what the writer wrote");

  await until(() => state() === "delivered" && view.querySelector(".cl-file"), "the hand-over brings the document back as a file card");
  const deliver = view.querySelector(".cl-deliver");
  same(deliver?.querySelector(".cl-reckon-claim")?.textContent, "对了 12 处，3 处和来源不一样，已经写成修订放进三联访谈.docx。", "the summary is the engine's words");
  const measured = () => [...deliver.querySelectorAll(".is-measured .cl-reckon-line")].map((el) => el.textContent).join("|");
  same(measured(), "clio_task_measured_doc:三联访谈.docx|3|clio_task_measured_new:1", "实际改了 is what the desk measured: three revisions in the document and one new document");
  test.assert(!deliver.querySelector(".cl-reckon").classList.contains("is-mismatch") && deliver.querySelector(".cl-reckon-flag").hidden,
    "the summary's 3 处 agrees with the desk's count: no difference marker");
  same(view.querySelector(".cl-file-sub").textContent, "clio_review_waiting", "the revisions wait for ClioWrite to open the file");

  // The candidate is in 产出 and opens in the output panel.
  shell.togglePanel();
  if (panel.hidden) shell.togglePanel();
  const output = panel.querySelector(".cl-progress-list .cl-output");
  same(output?.querySelector(".cl-progress-name")?.textContent, "核对说明.md", "the new document is listed under Made");
  env.press(output);
  test.assert(panel.querySelector(".cl-panel-body")?.textContent.includes("三处和来源不一样"), "and opens in the output panel");

  // Nothing touched the document until the writer opens it; then ClioWrite's
  // delivery writes the signed revisions, and the card opens document mode.
  const adapter = await vm.runInContext(`ClioWorksQuireAdapter.open(globalThis.__bytes, { name: "三联访谈.docx" })`, Object.assign(desk, { __bytes: bytes }));
  same(desk.ClioWorksQuireReview.revisions(adapter).length, 0, "the document holds no revision before the writer opens it");
  desk.AISystem6ClioWriteAgentDelivery.onDocumentMounted({ docId: "file-sanlian", adapter });
  const signed = desk.ClioWorksQuireReview.revisions(adapter);
  test.assert(signed.length > 0 && signed.every((record) => record.author === "ClioTalk"), `opening it delivers ClioTalk's signed revisions (${signed.length})`);
  env.press(view.querySelector(".cl-file-main"));
  test.assert(!panel.hidden && panel.classList.contains("is-doc") && shell.documents.current() === "file-sanlian", "the file card opens the document in the panel");
  same(panel.querySelectorAll(".cl-rev-card").length, 3, "one card per revised paragraph");
  test.assert(adapter.paragraphs().some((p) => p.text.includes("三成")), "the writer's words are still there until a card is taken");

  // A follow-up is the task's next turn; its words show in the thread.
  await task.turn("最后一段的错字也顺手改了。");
  same(view.querySelector(".cl-task-prompt")?.textContent, "最后一段的错字也顺手改了。", "a follow-up shows as the writer's words in the task");
  await until(() => state() === "delivered" && view.querySelectorAll(".cl-deliver").length === 2, "the follow-up turn hands its work over");
  const second = view.querySelectorAll(".cl-deliver")[1];
  same([...second.querySelectorAll(".is-measured .cl-reckon-line")].map((el) => el.textContent).join("|"), "clio_task_measured_doc:三联访谈.docx|1",
    "实际改了 counts the follow-up turn's own edit");
  test.assert(second.querySelector(".cl-reckon").classList.contains("is-mismatch") && !second.querySelector(".cl-reckon-flag").hidden
    && second.querySelector(".cl-reckon-flag").textContent === "clio_task_mismatch", "it says 3 处, the desk measured 1: the difference is marked");
  test.assert(!view.querySelectorAll(".cl-deliver")[0].querySelector(".cl-reckon").classList.contains("is-mismatch"), "the first hand-over still agrees");
  task.close();

  // Stop and Esc: the task's own /stop.
  let release;
  script = () => ({ hold: new Promise((resolve) => { release = resolve; }) });
  const stopping = link();
  const held = await stopping.start({ prompt: "把第二节也对一遍。", lent: [{ id: "file-two", name: "第二节.docx", format: "docx", bytes }] });
  await until(() => state() === "planning" && shell.tasks.current()?.task?.id === held.id, "a second task shows planning");
  env.front = $('[data-window="assistant"]');
  const esc = env.key($("#prompt"), "Escape");
  test.assert(esc.defaultPrevented, "Esc stops the running task");
  await until(() => state() === "stopped", "the stop reached the server");
  same((await api(`/api/agent/tasks/${held.id}`)).task.state, "stopped", "the server's task is stopped");
  release?.();
  stopping.close();

  // Two tasks working: a third answers task_limit, in plain words.
  const releases = [];
  script = () => ({ hold: new Promise((resolve) => { releases.push(resolve); }) });
  const [grant, other] = ["Notes", "Drafts"].map((name) => {
    const dir = path.join(scratch, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "a.md"), "a\n");
    return folders.grantFolder(dir, "propose");
  });
  const busyOne = await api("/api/agent/tasks", { prompt: "one", mounts: [{ kind: "folder", id: grant.id }] });
  const busyTwo = await api("/api/agent/tasks", { prompt: "two", mounts: [{ kind: "folder", id: other.id }] });
  const third = link();
  let refused = "";
  try { await third.start({ prompt: "three", folderId: grant.id }); } catch (error) { refused = error.code; }
  same(refused, "task_limit", "a third task is refused by the server's cap");
  test.assert([...messages.querySelectorAll(".cl-task-error")].some((el) => el.textContent === "plain:agent_error_task_limit" && el.getAttribute("role") === "alert"),
    "and the thread says so in the translated line, not the code");
  for (const id of [busyOne.task.id, busyTwo.task.id]) await api(`/api/agent/tasks/${id}/settle`, {});
  releases.forEach((resolve) => resolve());
  third.close();

  // Every refusal the task routes can give has its plain line in both languages.
  const codes = [...new Set([...read("apps/server/server/agent/tasks.js").matchAll(/taskError\("([a-z_]+)"/g)].map((match) => match[1]))];
  const en = read("app/data/translations-en.js");
  const zh = read("app/data/translations-zh.js");
  const missing = codes.filter((code) => !en.includes(`agent_error_${code}:`) || !zh.includes(`agent_error_${code}:`));
  test.assert(codes.length > 10 && !missing.length, `every task error code has a plain line in English and Chinese (missing: ${missing.join() || "none"})`);
  fs.rmSync(scratch, { recursive: true, force: true });
}

// --- 4. Follow-ups queued while a turn runs ---------------------------------
{
  const env = boot();
  const { $, tasks } = env;
  const prompt = $("#prompt");
  const sent = [];
  let refuse = false;
  const take = (method) => (task, value) => {
    sent.push(`${method}:${typeof value === "string" ? value : value?.id}`);
    if (!refuse) return Promise.resolve();
    refuse = false;
    return Promise.reject(new Error("refused"));
  };
  tasks.connect({ stop: take("stop"), queue: take("queue"), unqueue: take("unqueue") });
  const queued = (state, queue, extra = {}) => {
    const next = snapshot(state === "stopped" ? "working" : state);
    next.task.queue = queue;
    if (state === "stopped") next.task.state = "stopped";
    Object.assign(next.task, extra);
    return next;
  };
  const rows = () => [...env.document.querySelectorAll(".cl-task-queue-item")];

  tasks.apply(queued("working", []));
  test.assert(!env.document.querySelector(".cl-task-queue"), "with nothing queued the thread has no queue element");
  test.assert(!kinds($(".clio-task")).includes("undefined"), "and the thread holds only its cards and its status line");

  // Return queues what the writer typed while the turn runs; the box empties.
  prompt.value = "把标题改短一点";
  const queuedKey = env.key(prompt, "Enter");
  test.assert(queuedKey.defaultPrevented && prompt.value === "" && sent.join() === "queue:把标题改短一点", "Return while a turn runs queues the typed words and empties the box");
  prompt.value = "第二行\n接着写";
  env.key(prompt, "Enter", { shiftKey: true });
  prompt.value = "";
  test.assert(sent.length === 1 && !env.key(prompt, "Enter").defaultPrevented && sent.length === 1, "Shift+Return and an empty box queue nothing");
  prompt.value = "这句发不出去";
  refuse = true;
  env.key(prompt, "Enter");
  await tick();
  same(prompt.value, "这句发不出去", "a refused follow-up (the cap, say) gives the words back to the box");
  prompt.value = "";

  // The snapshot lists them under the running turn, each with a Remove button.
  tasks.apply(queued("working", [{ id: "q-a", text: "把标题改短一点" }, { id: "q-b", text: "Keep the 2019 story" }]));
  const box = env.document.querySelector(".cl-task-queue");
  const first = rows()[0];
  test.assert(box && !box.hidden && box.querySelector(".cl-task-queue-h").dataset.i18n === "clio_task_queue_running", "queued follow-ups sit under the running turn: Queued, sent when this turn ends");
  same(rows().map((row) => row.querySelector(".cl-task-queue-text").textContent).join("|"), "把标题改短一点|Keep the 2019 story", "in the order they were queued, verbatim");
  same(rows()[1].querySelector("button").getAttribute("aria-label"), "clio_task_queue_remove_label:Keep the 2019 story", "each Remove button names its message");
  tasks.apply(queued("working", [{ id: "q-a", text: "把标题改短一点" }, { id: "q-b", text: "Keep the 2019 story" }, { id: "q-c", text: "Third" }]));
  test.assert(rows()[0] === first && rows().length === 3, "a later snapshot keeps the rows it has (no button is rebuilt under a click)");
  env.press(rows()[1].querySelector("button"));
  same(sent.at(-1), "unqueue:q-b", "Remove asks the transport to take that message out");
  tasks.apply(queued("working", [{ id: "q-a", text: "把标题改短一点" }, { id: "q-c", text: "Third" }]));
  same(rows().map((row) => row.querySelector(".cl-task-queue-text").textContent).join("|"), "把标题改短一点|Third", "and it leaves the list");

  // At a plan the queue waits for the writer: it goes along with the answer.
  tasks.apply(queued("awaiting_plan", [{ id: "q-a", text: "把标题改短一点" }]));
  same(env.document.querySelector(".cl-task-queue-h").dataset.i18n, "clio_task_queue_held", "at a plan the heading says the queue goes along when the writer approves or answers");

  // The task ended first: the queue is gone and the thread says so.
  tasks.apply(queued("stopped", [], { queueDropped: { count: 2, reason: "stopped" } }));
  const note = env.document.querySelector(".cl-task-queue-note");
  test.assert(note && !note.hidden && note.textContent === "clio_task_queue_dropped:2" && env.document.querySelector(".cl-task-queue-list").hidden, "a stopped task says how many queued messages were not sent");
  tasks.apply(queued("stopped", []));
  test.assert(!env.document.querySelector(".cl-task-queue"), "and the note goes when nothing is left to say");

  // Outside a running turn Return is not taken over.
  tasks.apply(queued("delivered", []));
  prompt.value = "继续";
  test.assert(!env.key(prompt, "Enter").defaultPrevented && sent.filter((entry) => entry.startsWith("queue:")).length === 2, "when no turn runs, Return is the composer's own");
  prompt.value = "";

  const lang = read("app/features/cliotalk-shell.js");
  for (const key of ["clio_task_queue_running", "clio_task_queue_held", "clio_task_queue_remove", "clio_task_queue_remove_label", "clio_task_queue_dropped", "clio_task_queue_dropped_start"]) {
    test.assert(new RegExp(`en: \\{[\\s\\S]*${key}:[\\s\\S]*zh: \\{[\\s\\S]*${key}:`).test(lang), `${key} has a line in both languages`);
  }
  test.assertIncludes(css, ".cl-task-queue {", "the queue has styles");
  test.assertIncludes(css, '.clio-shell[data-skin="classic"] .cl-task-queue', "including Classic's ruled box");
}

// --- 5. The task link: queueing and polling ----------------------------------
{
  const agentCtx = vm.createContext({
    console, TextEncoder, setTimeout, clearTimeout, crypto,
    t: (key) => key,
    localStorage: { getItem: () => null, setItem() {} },
    window: {},
  });
  vm.runInContext(read("app/features/cliotalk-agent.js"), agentCtx, { filename: "cliotalk-agent.js" });
  const { createTaskLink } = agentCtx.window.AISystem6ClioTalkAgent.model;
  const env = boot();
  const calls = [];
  const scheduled = [];
  let state = "working";
  let queue = [];
  const view = () => ({ id: "task-q1", title: "t", state, mounts: [{ kind: "folder", id: "f", name: "F", level: "change" }], queue, turns: ["run-1"], usage: { tokens: 0 } });
  const api = async (route, body) => {
    calls.push({ route, body });
    if (route === "/api/agent/tasks") return { task: view() };
    if (route.endsWith("/queue")) { queue = [{ id: "q-1", text: body.text }]; return { task: view() }; }
    if (route.endsWith("/remove")) { queue = []; return { task: view() }; }
    return { task: view(), turns: [{ id: "run-1", n: 1, prompt: "x", state: state === "working" ? "running" : "done", result: { proposals: [] } }] };
  };
  const link = createTaskLink({
    api,
    shell: () => env.shell,
    projection: () => ({}),
    ensureDelivery: async () => ({}),
    sha256: async () => "",
    errorText: String,
    approveWords: () => "go",
    connectors: async () => [{ name: "notes", url: "http://127.0.0.1:9/mcp" }],
    schedule: (fn) => { scheduled.push(fn); return () => {}; },
  });
  await link.start({ prompt: "x", folderId: "f" });
  await link.settled();
  await link.transport.queue({ id: "task-q1" }, "补一句");
  const posted = calls.find((entry) => entry.route === "/api/agent/tasks/task-q1/queue");
  test.assert(posted?.body.text === "补一句" && posted.body.connectors?.[0]?.name === "notes", "queueing posts the words with the connectors of this moment (the server never stores them)");
  same(env.shell.tasks.current().task.queue[0].text, "补一句", "and the shell draws the queue the server answered with");
  await link.transport.unqueue({ id: "task-q1" }, "q-1");
  test.assert(calls.some((entry) => entry.route === "/api/agent/tasks/task-q1/queue/q-1/remove"), "Remove posts to the queue entry's own route");
  same(env.shell.tasks.current().task.queue.length, 0, "and the queue it answered with is empty");

  // The turn ended with a follow-up waiting: the server starts the next turn
  // by itself, so the link keeps reading until the queue is gone.
  await link.transport.queue({ id: "task-q1" }, "第二句");
  state = "delivered";
  scheduled.length = 0;
  await link.refresh();
  test.assert(scheduled.length === 1, "a delivered task with follow-ups waiting is still read");
  queue = [];
  state = "working";
  await link.refresh();
  await link.refresh();
  test.assert(scheduled.length >= 2, "and the turn the server started is read as a running one");
  state = "delivered";
  scheduled.length = 0;
  await link.refresh();
  test.assert(scheduled.length === 0, "a delivered task with an empty queue is not polled");
  link.close();

  // 收好 / Done settles the task, and settling runs the skill and memory gate (M8).
  const gateRuns = [];
  state = "delivered";
  const doneLink = createTaskLink({
    api: async (route, body) => { if (route.endsWith("/settle")) state = "settled"; return api(route, body); },
    shell: () => env.shell, projection: () => ({}), ensureDelivery: async () => ({}), sha256: async () => "", errorText: String, approveWords: () => "go",
    schedule: () => () => {},
    extensions: async () => ({ STRINGS: {}, store: { beginTask: () => ({}), contextText: () => "", endTask: (info) => { gateRuns.push(info); return { used: [], proposed: null }; } } }),
  });
  await doneLink.start({ prompt: "x", folderId: "f" });
  await doneLink.settled();
  const doneButton = env.$(".cl-task-done");
  test.assert(doneButton && !doneButton.hidden, "a delivered task shows 收好 / Done");
  env.press(doneButton);
  for (let i = 0; i < 400 && !gateRuns.length; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  test.assert(calls.some((entry) => entry.route === "/api/agent/tasks/task-q1/settle") && gateRuns.length === 1, "pressing Done settles the task through its route and runs the gate once");
  doneLink.close();
}

// --- 5. Long-task harness: ledger, Continue, Fork ---------------------------

{
  const env = boot();
  const { $, tasks } = env;
  const sent = [];
  tasks.connect({ resume: () => { sent.push("resume"); }, fork: (task, n, text) => { sent.push(`fork:${n}:${text}`); } });
  const ended = snapshot("delivered");
  Object.assign(ended.task, { ledger: { facts: ["two tables read"], done: ["counted heads"], next: ["draft the page"], stuck: true, looping: false, failingStep: "" } });
  Object.assign(ended.turns[0], { n: 1, prompt: "Make the brief\nfrom the tables", state: "done", snapshot: "/kept/turn-1" });
  tasks.apply(ended);
  await tick();
  env.press($(".cl-thread-progress"));
  await tick();
  const panel = $(".clio-panel");
  const text = (selector) => [...panel.querySelectorAll(selector)].map((el) => el.textContent).join("|");
  test.assert(text(".cl-progress-value").includes("two tables read") && text(".cl-progress-value").includes("counted heads") && text(".cl-progress-empty").includes("clio_task_ledger_stuck"),
    "the progress panel shows the engine's ledger, and says its own words when it calls itself stuck");
  const fork = panel.querySelector(".cl-task-fork");
  test.assert(!!fork && /clio_task_turn_n:1/.test(text(".cl-progress-name")), "each ended turn has a row with Fork");
  $("#prompt").value = "Try the other angle";
  env.press(fork);
  await tick();
  same(sent.join(), "fork:1:Try the other angle", "Fork sends the turn number and the words typed in the box");

  const cut = snapshot("working");
  Object.assign(cut.task, { state: "stopped", interrupted: true });
  tasks.apply(cut);
  await tick();
  const cont = $(".cl-task-continue");
  test.assert(cont && !cont.hidden && /interrupted/.test($(".cl-task-status").dataset.i18n), "an interrupted task says so and offers Continue");
  env.press(cont);
  await tick();
  same(sent.at(-1), "resume", "Continue asks the transport to resume the task");
  const plain = snapshot("working");
  plain.task.state = "stopped";
  tasks.apply(plain);
  await tick();
  test.assert($(".cl-task-continue").hidden, "a task the writer stopped has no Continue");
}

test.assertIncludes(css, ".clio-panel.is-doc {\n  width: 620px;", "the document panel is 620px wide");

test.finish();
