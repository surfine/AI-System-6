// M8 slice 1 (sections 3.5 and 4.5, first cut): after a task the agent may
// PROPOSE a skill or a memory; nothing takes effect until the writer accepts.
//
// Owner rulings under test:
//   V6   skills and memory exist at project level and desktop level
//   V10  a proposal waits as a pending file; at most 10 wait
//   V11  the gate runs at the end of a task only: one proposal per task, the
//        pattern repeated at least twice, and an accepted output
//   V12  memory edited during a task is not seen until the next task
// The channel (server), the store (page, run here over an in-memory host) and
// the window wiring are driven for real; the eager injection filters are read.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("agent-skill-memory");
const proposals = require("../../apps/server/server/agent/proposals.js");
const registry = require("../../apps/desktop/app/core/agent-tool-registry.js");
const library = require("../../apps/desktop/app/features/extensions-library.js");

// --- The channel: schema, tools, one per run, never in a read-level turn ----------------

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ais6-skill-memory-"));
function channelWith(files) {
  const work = fs.mkdtempSync(path.join(scratch, "work-"));
  const channel = path.join(work, ".ais6-proposals");
  fs.mkdirSync(channel, { recursive: true });
  Object.entries(files).forEach(([name, doc]) => fs.writeFileSync(path.join(channel, name), JSON.stringify(doc)));
  return { work, channel };
}
const skillDoc = (payload = {}) => ({ v: 1, kind: "skill", title: "年报表格转图表", reason: "", createdAt: "2026-10-31T08:00:00.000Z", payload: { name: "年报表格转图表", whenToUse: "拿到年报里的表格时", steps: [{ text: "读表格" }, { text: "画图" }], tools: ["web", "chart.read"], ...payload } });
const memoryDoc = (payload = {}) => ({ v: 1, kind: "memory", title: "用词", reason: "", createdAt: "2026-10-31T08:00:00.000Z", payload: { text: "落落的稿子用「县城」不用「小城」", reason: "重复出现", ...payload } });

let c = channelWith({ "1-skill.json": skillDoc({ extra: "dropped" }), "2-mem.json": memoryDoc() });
let got = proposals.collectProposals(c.work, c.channel);
test.assert(got.gathered[0]?.kind === "skill" && got.gathered[0].payload.steps.length === 2 && !("extra" in got.gathered[0].payload), "a valid skill proposal harvests and unknown fields are dropped");
test.assert(got.gathered.length === 1 && got.dropped === 1, "one skill or memory per run: the second is dropped and only counted");
c = channelWith({ "1-mem.json": memoryDoc({ junk: 1 }) });
got = proposals.collectProposals(c.work, c.channel);
test.assert(got.gathered[0]?.kind === "memory" && got.gathered[0].payload.text.includes("县城") && !("junk" in got.gathered[0].payload), "a valid memory proposal harvests with its text");
c = channelWith({ "1.json": skillDoc({ tools: ["web", "shell.exec"] }) });
test.assert(proposals.collectProposals(c.work, c.channel).gathered.length === 0, "a skill naming a tool outside the desk tool list is dropped whole");
c = channelWith({ "1.json": skillDoc({ steps: [] }), "2.json": skillDoc({ name: " " }), "3.json": memoryDoc({ text: "x".repeat(4001) }), "4.json": memoryDoc({ text: "  " }) });
got = proposals.collectProposals(c.work, c.channel);
test.assert(got.gathered.length === 0 && got.dropped === 4, "empty steps, empty name, an over-long memory and an empty memory are dropped and counted");
c = channelWith({ "1.json": skillDoc(), "2.json": memoryDoc() });
got = proposals.collectProposals(c.work, c.channel, { kinds: [...proposals.READ_KINDS] });
test.assert(got.gathered.length === 0 && got.dropped === 2, "a read-level turn (plan gate, shared read-only) offers neither a skill nor a memory");
test.assert(proposals.EXTENSION_KINDS.join() === "skill,memory" && proposals.KINDS.includes("skill") && proposals.KINDS.includes("memory"), "the two kinds are in the channel's list");

// --- The store over an in-memory host ----------------------------------------------------

function world({ projectId = "p1", project = null } = {}) {
  const files = [];
  const state = { projectId, saves: 0, n: 0 };
  const host = {
    registry,
    files: () => files,
    projectId: () => state.projectId,
    project: () => project,
    folderFor: (scope) => (scope === "desktop" ? null : "folder-1"),
    uniqueName: (name) => name,
    add: (file) => { files.unshift(file); state.saves += 1; },
    update: () => { state.saves += 1; },
    remove: (file) => { files.splice(files.indexOf(file), 1); state.saves += 1; },
    now: () => `2026-10-31T09:00:${String(state.n++ % 60).padStart(2, "0")}.000Z`,
    uuid: () => `id-${state.n++}`,
    consolidate: async (texts) => `Merged (${texts.length})`,
  };
  return { files, state, store: library.createStore(host) };
}
const okTask = (id, extra = {}) => ({ id, ended: true, acceptedOutputs: 1, repeats: 2, ...extra });
const skillPayload = { name: "Chart a table", whenToUse: "When a report has a table", steps: [{ text: "Read the table" }], tools: ["chart.read"] };
const memPayload = (text = "Use Arabic numerals") => ({ text });

// V11: the gate.
let w = world();
test.assert(w.store.propose({ kind: "skill", payload: skillPayload, task: okTask("t1", { ended: false }) }).reason === "task_not_ended", "V11: nothing is proposed before the task has ended");
test.assert(w.store.propose({ kind: "skill", payload: skillPayload, task: okTask("t1", { acceptedOutputs: 0 }) }).reason === "no_accepted_output", "V11: a task without an accepted output proposes nothing");
test.assert(w.store.propose({ kind: "memory", payload: memPayload(), task: okTask("t1", { repeats: 1 }) }).reason === "not_repeated", "V11: a pattern seen once proposes nothing (skills and memory alike)");
test.assert(w.files.length === 0 && w.state.saves === 0, "a refused proposal writes nothing");
test.assert(w.store.propose({ kind: "skill", payload: { ...skillPayload, tools: ["bash"] }, task: okTask("t1") }).reason === "bad_payload", "a skill with an unknown tool is refused by the page too");
test.assert(w.store.propose({ kind: "skill", payload: skillPayload, task: okTask("t1") }).ok === true, "a repeated pattern with an accepted output at the end of a task is proposed");
test.assert(w.store.propose({ kind: "memory", payload: memPayload(), task: okTask("t1") }).reason === "one_per_task", "V11: a second proposal in the same task is refused, even of the other kind");
test.assert(w.store.propose({ kind: "memory", payload: memPayload(), task: okTask("t2") }).ok === true, "the next task may propose one");
const rebuilt = world();
rebuilt.files.push({ ...w.files.find((file) => file.sourceTaskId === "t1") });
test.assert(rebuilt.store.propose({ kind: "skill", payload: skillPayload, task: okTask("t1") }).reason === "one_per_task", "a task whose proposal is already on disk cannot propose again after a reload");

// Pending is not live, and accept is the only way in.
w = world();
const made = w.store.propose({ kind: "skill", payload: { ...skillPayload, skillStatus: "enabled", provenance: "author" }, task: okTask("a") }).record;
test.assert(made.artifactKind === "ai-skill-pending" && made.provenance === "proposed" && made.sourceTaskId === "a" && !made.skillStatus, "a proposed skill waits as a pending file; fields the proposal carried do not turn it on");
test.assert(made.body.includes("## When to use") && made.body.includes("- chart.read") && made.skillTools.join() === "chart.read", "its body is SKILL.md: name, when to use, steps, tools");
const memo = w.store.propose({ kind: "memory", payload: { ...memPayload(), memoryStatus: "active" }, task: okTask("b") }).record;
test.assert(memo.artifactKind === "project-memory-pending" && !memo.memoryStatus && w.store.memoryUsage("project").used === 0, "a proposed memory waits as a pending file and is not counted in the usage");
const injectable = () => w.files.filter((file) => (file.artifactKind === "ai-skill" && file.skillStatus === "enabled") || (file.artifactKind === "project-memory" && file.memoryStatus === "active"));
test.assert(injectable().length === 0 && w.store.beginTask("x1").skills.length === 0 && w.store.beginTask("x1").memory.length === 0, "no pending file is in what a task would read");
test.assert(w.store.discard(made.id).ok && !w.files.includes(made) && w.store.accept(made.id).reason === "not_pending", "the writer can decline a proposal and it is gone");
test.assert(w.store.accept("nope").reason === "not_pending" && w.store.discard(w.files[0].id).ok, "accept and discard only act on pending files");
w = world();
const again = w.store.propose({ kind: "skill", payload: skillPayload, task: okTask("c") }).record;
const accepted = w.store.accept(again.id);
test.assert(accepted.ok && again.artifactKind === "ai-skill" && again.skillStatus === "enabled" && again.provenance === "learned" && again.skillManifest.id === "chart-a-table", "accept turns a pending skill into an enabled ai-skill, provenance learned");
test.assert(w.store.discard(again.id).reason === "not_pending", "a live skill cannot be discarded through the proposal path");

// V10: the queue.
w = world();
for (let i = 1; i <= library.QUEUE_CAP; i += 1) w.store.propose({ kind: "skill", payload: skillPayload, task: okTask(`q${i}`) });
test.assert(w.store.waiting().length === 10 && library.QUEUE_CAP === 10, "V10: ten proposals wait as pending files");
test.assert(w.store.propose({ kind: "skill", payload: skillPayload, task: okTask("q11") }).reason === "queue_full" && w.store.waiting().length === 10, "V10: the eleventh is refused and the queue stays at ten");
test.assert(w.store.propose({ kind: "memory", payload: memPayload(), task: okTask("q12") }).ok, "the cap is per kind: a full skill queue does not stop a memory proposal");
w.store.discard(w.store.waiting().find((entry) => entry.kind === "skill").id);
test.assert(w.store.propose({ kind: "skill", payload: skillPayload, task: okTask("q13") }).ok, "clearing one skill makes room for the next");

// Memory limit: counted on live memory only, accept refused when over, nothing compacted.
w = world({ project: { memoryCharLimit: 30 } });
const liveOne = { id: "m1", projectId: "p1", artifactKind: "project-memory", memoryStatus: "active", body: "x".repeat(25), name: "m1" };
const disabled = { id: "m2", projectId: "p1", artifactKind: "project-memory", memoryStatus: "disabled", body: "y".repeat(500), name: "m2" };
w.files.push(liveOne, disabled);
test.assert(w.store.memoryUsage("project").used === 25 && w.store.memoryUsage("project").limit === 30, "usage is the live memories' length; a disabled one and a pending one are not counted; the project's own limit applies");
const big = w.store.propose({ kind: "memory", payload: memPayload("z".repeat(10)), task: okTask("m") }).record;
const refused = w.store.accept(big.id);
test.assert(refused.ok === false && refused.reason === "memory_full" && refused.used === 25 && refused.limit === 30 && refused.need === 10, "accept is refused when it would pass the limit, with the numbers for the message");
test.assert(big.artifactKind === "project-memory-pending" && liveOne.body === "x".repeat(25) && w.files.length === 3, "a refused accept changes nothing: no shortening, no removal, no merge");
w.files.splice(w.files.indexOf(liveOne), 1);
test.assert(w.store.accept(big.id).ok && w.store.memoryUsage("project").used === 10, "after the writer deletes one, accept works and usage follows");
test.assert(world().store.memoryUsage("project").limit === 2000, "the default limit is 2,000 characters");

// V6: two levels.
w = world();
const d = w.store.propose({ kind: "memory", scope: "desktop", payload: memPayload("About me: I write columns"), task: okTask("d1") }).record;
test.assert(d.projectId === "desktop" && d.scope === "desktop" && d.folderId === null, "V6: a desktop-level proposal is a file of the reserved desktop disk, not of the open project");
test.assert(w.store.propose({ kind: "memory", payload: memPayload(), task: okTask("d2") }).record.projectId === "p1", "V6: a project-level one belongs to the open project");
test.assert(w.store.accept(d.id).ok && w.store.memoryUsage("desktop").used === "About me: I write columns".length && w.store.memoryUsage("project").used === 0, "V6: each level counts its own memory against its own limit");
const noProject = world({ projectId: "" });
test.assert(noProject.store.propose({ kind: "skill", payload: skillPayload, task: okTask("n1") }).reason === "no_project" && noProject.store.propose({ kind: "skill", scope: "desktop", payload: skillPayload, task: okTask("n2") }).ok, "V6: with no project open only the desktop level can take a proposal");
test.assert(w.store.entries("memory").some((entry) => entry.scope === "desktop") && w.store.entries("memory").some((entry) => entry.scope === "project"), "both levels are listed");
w.state.projectId = "p2";
test.assert(w.store.entries("memory").every((entry) => entry.scope === "desktop"), "another project's files are not shown; the desktop level stays");

// V12: the snapshot.
w = world();
const first = { id: "k1", projectId: "p1", artifactKind: "project-memory", memoryStatus: "active", body: "Rule one", name: "k1" };
const skill = { id: "s1", projectId: "p1", artifactKind: "ai-skill", skillStatus: "enabled", body: "# S", name: "S SKILL.md" };
w.files.push(first, skill);
const snap = w.store.beginTask("task-A");
first.body = "Rule one, edited mid-task";
w.files.push({ id: "k2", projectId: "p1", artifactKind: "project-memory", memoryStatus: "active", body: "Added mid-task", name: "k2" });
first.memoryStatus = "disabled";
const same = w.store.beginTask("task-A");
test.assert(same === snap && snap.memory.length === 1 && snap.memory[0].text === "Rule one" && snap.skills.length === 1, "V12: edits, additions and switching off during a task are not in that task's snapshot");
test.assert(Object.isFrozen(snap) && Object.isFrozen(snap.memory) && Object.isFrozen(snap.memory[0]), "the snapshot is frozen");
const next = w.store.beginTask("task-B");
test.assert(next.memory.length === 1 && next.memory[0].text === "Added mid-task", "V12: the next task sees what changed");
test.assert(w.store.snapshotOf("task-A").memory[0].text === "Rule one", "the first task's snapshot is still what it started with");

// --- The eager side: injection and toggles cannot see a pending file ------------------------

const documentsChat = read("app/features/documents-chat.js");
const projectDisk = read("app/features/project-disk.js");
test.assertIncludes(documentsChat, '(!activeOnly || file.memoryStatus === "active")', "the memory injection takes only active memories, so nothing but an accepted one reaches a task");
test.assertNotIncludes(documentsChat, '(!activeOnly || file.memoryStatus !== "disabled")', "the old pass-everything-but-disabled filter is gone");
test.assertIncludes(projectDisk, "if (!file.memoryStatus) {", "boot normalisation fills a missing memory status only and never rewrites another value");
test.assert(library.PENDING.skill !== library.LIVE.skill && library.PENDING.memory !== library.LIVE.memory, "pending files use their own artifact kinds, so the existing injection, toggles and menus never match them");
test.assertIncludes(documentsChat, 'item.artifactKind === "ai-skill"', "the skill toggle and injection match ai-skill only");
for (const [file, source] of [["extensions-library.js", read("app/features/extensions-library.js")]]) {
  test.assertNotMatches(source, /innerHTML|insertAdjacentHTML|marked\.parse|indexedDB|localStorage|fetch\(/, `${file} renders data as text and touches no storage or network of its own`);
}
test.assertNotMatches(read("app/features/extensions-library.js"), /\.body\s*=\s*[^=]|\.body\s*\+=/, "no code path rewrites the body of a skill or memory");
test.assertIncludes(read("app/core/config.js"), '"app/features/extensions-window.js", "app/features/extensions-library.js"]', "the library rides the Extensions loader, after the window and its hooks");

// --- The window: Waiting count, Skills and Memory panels ------------------------------------

class Node_ {
  constructor(tag) { this.tag = tag; this.children = []; this.className = ""; this.dataset = {}; this.listeners = {}; this.attrs = {}; this.type = ""; this._text = ""; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  insertBefore(node) { this.children.unshift(node); return node; }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { (this.listeners.click || []).forEach((fn) => fn()); }
  all(match) { return this.children.flatMap((child) => [...(match(child) ? [child] : []), ...child.all(match)]); }
  querySelector(selector) { return this.all((node) => node.className.split(/\s+/).includes(selector.slice(1)))[0] || null; }
}
const providers = {};
const renderers = {};
let renders = 0;
const win = {
  AISystem6AgentToolRegistry: registry,
  AISystem6Extensions: { render: () => { renders += 1; }, setCountProvider: (id, fn) => { providers[id] = fn; }, setPanelRenderer: (id, fn) => { renderers[id] = fn; }, setFooterRenderer: () => {} },
};
win.window = win;
const chatFiles = [{ id: "L1", projectId: "p1", artifactKind: "ai-skill", skillStatus: "enabled", body: "# Mine", name: "Mine SKILL.md" }];
const status = [];
const sandbox = vm.createContext({
  window: win, document: { createElement: (tag) => new Node_(tag) }, currentLanguage: "en", chatFiles, projects: [{ id: "p1" }],
  isProjectMounted: true, activeProjectId: "p1", saveDeskState: () => {}, markDeskDirty: () => {}, ensureFolder: () => ({ id: "f" }), ensureProjectMemoryFolder: () => ({ id: "f" }),
  nextAvailableFileName: (name) => name, crypto: { randomUUID: () => `u${Math.random()}` }, setStatus: (message) => status.push(message), console,
});
vm.runInContext(read("app/features/extensions-library.js"), sandbox);
const live = win.AISystem6ExtensionsLibrary;
test.assert(live && typeof providers.waiting === "function" && ["skills", "memory"].every((id) => typeof providers[id] === "function" && typeof renderers[id] === "function") && typeof renderers.waiting === "function", "the module fills the count and panel hooks of Skills, Memory and Waiting");
test.assert(providers.waiting() === 0 && providers.skills() === 1 && providers.memory() === 0, "counts start from the real records: one skill, nothing waiting");
const proposed = live.store.propose({ kind: "memory", payload: { text: "Quote verbatim, and say who said it to whom" }, task: okTask("w1") });
test.assert(proposed.ok && chatFiles[0].artifactKind === "project-memory-pending" && providers.waiting() === 1 && providers.memory() === 1 && renders >= 2, "a proposal that passes the gate shows in the Waiting count and asks the window to repaint");
const panel = new Node_("div");
renderers.waiting(panel);
const item = panel.all((node) => node.dataset.extensionsItem === proposed.record.id)[0];
test.assert(item && item.className.includes("is-pending") && item.textContent.includes("It suggested this; waiting for you") && item.textContent.includes("Quote verbatim"), "the waiting list shows the pending memory, dashed, with where it came from");
const buttons = item.all((node) => node.tag === "button");
test.assert(buttons.length === 2 && buttons[0].textContent === "Accept" && buttons[1].textContent === "Not this one", "two buttons: Accept and Not this one");
chatFiles.push({ id: "full", projectId: "p1", artifactKind: "project-memory", memoryStatus: "active", body: "x".repeat(1990), name: "full" });
const panel2 = new Node_("div");
renderers.memory(panel2);
test.assert(panel2.textContent.includes("2,000") && panel2.textContent.includes("nothing is shortened"), "the Memory page ends with the usage line and says nothing is compacted for the writer");
const row2 = panel2.all((node) => node.dataset.extensionsItem === proposed.record.id)[0];
row2.all((node) => node.tag === "button")[0].click();
const note = panel2.querySelector(".extensions-note");
test.assert(chatFiles[0].artifactKind === "project-memory-pending" && note && note.textContent.includes("Memory is full") && status.length === 1, "pressing Accept on a memory that no longer fits is refused with the reason, and the file stays pending");
chatFiles.pop();
const panel3 = new Node_("div");
renderers.waiting(panel3);
panel3.all((node) => node.tag === "button")[0].click();
test.assert(chatFiles[0].artifactKind === "project-memory" && chatFiles[0].memoryStatus === "active" && providers.waiting() === 0, "Accept is what turns it on: it is then an active project memory and leaves the Waiting count");
test.assert(library.STRINGS.zh.accept === "采纳" && Object.keys(library.STRINGS.en).join() === Object.keys(library.STRINGS.zh).join(), "the module's own strings exist in English and Chinese with the same keys");

// --- M8 foundations: wiring into tasks, memory curation, desktop export ---------------------------

const roles = require("../../apps/desktop/app/core/agent-roles.js");
const DAY = 86_400_000;

// Wiring: a task's snapshot is the engine's first words (memory, skills, the roles it may hand a
// sub-task to), and the end of the task runs the gate on what the engine offered.
w = world();
w.files.push({ id: "wm", projectId: "p1", artifactKind: "project-memory", memoryStatus: "active", body: "Quote verbatim", name: "wm" },
  { id: "wd", projectId: "desktop", artifactKind: "project-memory", memoryStatus: "active", body: "I write columns", name: "wd" },
  { id: "ws", projectId: "p1", artifactKind: "ai-skill", skillStatus: "enabled", body: "# Chart\nDo it", name: "Chart SKILL.md" });
const context = w.store.contextText(w.store.beginTask("T"), roles.enabledTargets());
test.assert(context.includes("[m1] (project) Quote verbatim") && context.includes("[m2] (desktop) I write columns") && context.includes("[s1] Chart") && context.includes("researcher:") && context.includes('"kind":"handoff"'),
  "the context carries project and desktop memory, the skills (tagged) and the roles a sub-task may go to");
const ended = w.store.endTask({ snapshotKey: "T", task: okTask("task-1"), runId: "run-1", summaries: ["Done as the rule [m1] says"], proposals: [{ kind: "memory", payload: { text: "Numbers as Arabic digits", scope: "desktop" } }] });
test.assert(ended.proposed?.artifactKind === "project-memory-pending" && ended.proposed.projectId === "desktop" && w.store.waiting().length === 1,
  "at task end an offered memory passes the gate and waits in Waiting for you (the engine may say desktop level)");
test.assert(w.files.find((f) => f.id === "wm").useCount === 1 && ended.used.join() === "wm", "a note the hand-over cited counts as used");
test.assert(w.store.endTask({ snapshotKey: "T", task: okTask("task-1"), proposals: [{ kind: "memory", payload: { text: "Another" } }] }).reason === "one_per_task", "a second offer in the same task is refused");
const link = read("app/features/cliotalk-agent.js");
test.assert(link.includes("library.store.beginTask(snapshotKey)") && link.includes("...(deskContext ? { deskContext } : {})") && read("apps/server/server/agent/runs.js").includes('String(input.deskContext || "")') && read("apps/server/server/routes/agent.js").includes("deskContext"),
  "the task link takes the snapshot at start and sends it with every turn; the server puts it ahead of the prompt");
test.assertIncludes(read("apps/server/server/agent/engine-host.js"), "you may offer ONE of: skill:", "the engine's preamble says it may offer a skill or a memory");

// Curation: cap refuses, use is tracked, stale and archived follow idleness, tidy-up is one whole
// version the writer accepts, and it can be rolled back.
w = world({ project: { memoryCharLimit: 45 } });
const mem = (id, body, lastUsedAt) => ({ id, projectId: "p1", artifactKind: "project-memory", memoryStatus: "active", body, name: id, ...(lastUsedAt ? { lastUsedAt } : {}) });
const recent = "2026-10-31T09:00:00.000Z";
const iso = (days) => new Date(Date.parse(recent) - days * DAY).toISOString();
w.files.push(mem("a", "A".repeat(20), recent), mem("b", "B".repeat(10), iso(15)), mem("c", "C".repeat(5), iso(31)), mem("d", "D".repeat(5)));
test.assert(w.store.canAdd("project", 6).ok === false && w.store.canAdd("project", 5).ok === true, "over the cap is refused (the writer's own save asks canAdd first), never shortened");
test.assert(w.store.entries("memory").find((e) => e.id === "b").stale && !w.store.entries("memory").find((e) => e.id === "a").stale, "a note unused 14 days while others were used is marked stale");
const snapNow = w.store.beginTask("C1");
test.assert(w.files.find((f) => f.id === "c").memoryStatus === "archived" && !snapNow.memory.some((m) => m.id === "c") && snapNow.memory.some((m) => m.id === "b"), "unused 30 days: archived, and not in the task's snapshot (14 days only warns)");
test.assert(w.files.find((f) => f.id === "d").lastUsedAt === w.files.find((f) => f.id === "d").lastUsedAt && !!w.files.find((f) => f.id === "d").lastUsedAt && w.files.find((f) => f.id === "d").memoryStatus === "active", "a note with no use stamp starts its clock instead of being archived");
test.assert(w.store.restore("c").ok && w.files.find((f) => f.id === "c").memoryStatus === "active", "an archived note can be brought back");
w = world();
w.files.push(mem("x", "Use Arabic digits", recent), mem("y", "Numbers: Arabic digits", recent));
const tidied = await w.store.tidy("project");
const merged = tidied.record;
test.assert(tidied.ok && merged.artifactKind === "project-memory-pending" && merged.replaces.join() === "x,y" && w.files.filter((f) => f.memoryStatus === "active").length === 2, "tidy up asks for one merged version; it waits and nothing changes yet");
test.assert(w.store.accept(merged.id).ok && w.files.filter((f) => f.id !== merged.id).every((f) => f.memoryStatus === "disabled") && merged.memoryStatus === "active", "accepting takes the merged version whole: it is live and the entries it replaces are switched off");
test.assert(w.store.rollback(merged.id).ok && w.files.filter((f) => f.id !== merged.id).every((f) => f.memoryStatus === "active") && merged.memoryStatus === "disabled" && merged.body === "Merged (2)", "roll back brings the previous entries back as they were and switches the merged one off");

// Desktop level: its own export and import.
w = world();
w.files.push({ id: "e1", projectId: "desktop", scope: "desktop", artifactKind: "project-memory", memoryStatus: "active", body: "About me", name: "About me", sourceTaskId: "t-x", provenance: "learned", useCount: 3 }, mem("p", "project only", recent));
const dump = w.store.exportDesktop();
test.assert(dump.format === "ai-system-6-desktop-extensions" && dump.files.length === 1 && dump.files[0].body === "About me" && dump.files[0].useCount === 3 && !("sourceTaskId" in dump.files[0]), "export carries the desktop level only, with no foreign task references");
const other = world();
const first_ = other.store.importDesktop(JSON.parse(JSON.stringify(dump)));
test.assert(first_.ok && first_.added === 1 && other.files[0].projectId === "desktop" && other.store.importDesktop(dump).skipped === 1 && other.store.importDesktop({ nope: 1 }).reason === "not_an_export", "import adds desktop-level files, skips a duplicate and refuses a file that is not an export");

// Window: the Memory page has Tidy up, export and import; Roles lists the built-in roles with switches.
test.assertIncludes(read("app/features/extensions-library.js"), 'setFooterRenderer("memory"', "the Memory and Skills pages carry the footer buttons even when empty");
test.assert(roles.ROLES.length === 5 && roles.targets().length === 4 && roles.ROLES.every((r) => r.tools.every((id) => registry.isKnownToolId(id))), "five built-in roles, four of them hand-off targets, every tool id in the registry");
roles.setEnabled("checker", false);
roles.setEnabled("clio", false);
test.assert(!roles.enabledTargets().some((r) => r.id === "checker") && roles.isEnabled("clio"), "a built-in role can be switched off; the main agent cannot");
roles.setEnabled("checker", true);

fs.rmSync(scratch, { recursive: true, force: true });
test.finish();
