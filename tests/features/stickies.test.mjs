// Stickies／便利贴 — Note Pad's notes, To Do's next actions and Hold That
// Thought's pile as one object (owner ruling 2026-10-31). Replaces the
// todo-da, held-place and note-pad contracts.
//
// What this holds: the old piles are copied in faithfully and only once; an
// Inbox capture clarifies into an action or a note; a pin survives the trip
// through storage; ⌥⌘N still captures first and lands as a held sticky.

import vm from "node:vm";

import { createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";

const test = createFeatureTest("stickies");

const source = read("app/features/stickies.js");
const heldPlace = read("app/core/held-place.js");
const persistence = read("app/core/persistence-status.js");
const config = read("app/core/config.js");
const actions = read("app/core/actions.js");
const accessories = read("app/features/teachtext-accessories.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// ---- One lazy window, eager data --------------------------------------------
test.assert(lazyRuntimePaths.includes("app/features/stickies.js"), "the window is a lazy module");
test.assert(!lazyRuntimePaths.includes("app/features/todo-da.js") && !lazyRuntimePaths.includes("app/features/hold-that-thought.js"), "the two old windows are gone, not hidden");
test.assertIncludes(config, '"app/features/stickies.js"], false, ["styles.stickies.css"]', "one loader brings the module and its sheet");
test.assertIncludes(persistence, "    stickies: deskStickies,\n    stickiesMigrated,", "stickies ride the desk settings");
test.assertIncludes(persistence, "if (Array.isArray(settings.stickies)) deskStickies = settings.stickies;", "and come back on every boot, unconditionally");
test.assertIncludes(persistence, "    notePadPages,", "the old Note Pad key is still written as it was, for one version");
test.assertIncludes(persistence, "    todoDaItems,", "and so is the old To Do key");
test.assertNotMatches(heldPlace, /localStorage\.(setItem|removeItem)/, "the held-thought keys are read, never rewritten or removed");
const record = windowRegistryRecords().todo;
test.assert(record?.app === "accessories" && record.builtByModule === true, "Stickies is a Desk Accessory built by its module");
test.assert(!windowRegistryRecords().holdThought, "Hold That Thought's window became the Held view");

// ---- The old commands land in the right view --------------------------------
test.assertIncludes(source, '"open-todo-da": { handler: () => openStickies("next")', "To Do opens Stickies at Next");
test.assertIncludes(accessories, '["open-note-pad",()=>ensureTodoDaModule().then(()=>openStickies("notes"))]', "Note Pad opens Stickies at Notes");
test.assertIncludes(actions, '"open-hold-thought": async () => { await ensureTodoDaModule(); await openStickies("held"); }', "Held Thoughts opens the Held view");
test.assertIncludes(accessories, 'window.AISystem6Stickies.add({ text })', "a line sent to the Note Pad becomes a note sticky");
test.assertIncludes(actions, '"undo": () => window.AISystem6Stickies?.undo() ||', "⌘Z asks Stickies before the Finder and the text field");
test.assertIncludes(source, 'originalType: "sticky"', "a deleted sticky goes to the Trash");
test.assertIncludes(read("app/core/desktop-runtime.js"), 'item.originalType === "sticky"', "and can be put back from there");

// ---- Executed: the pure half ----------------------------------------------------
const pure = source.slice(source.indexOf("const STICKY_KINDS"), source.indexOf("// ---- The window"));
const context = vm.createContext({ console });
vm.runInContext(`let deskStickies = []; let stickiesMigrated = false; let deskPersistenceWritable = true;
let saves = 0; function saveDeskState() { saves += 1; }
let notePadPages = []; let todoDaItems = []; let legacyHeld = []; function readHeldThoughts() { return legacyHeld; }
${pure}`, context);
const run = (code) => vm.runInContext(code, context);

// A seeded desk: two Note Pad pages (one blank, one with trailing whitespace),
// two To Do items (one done), one held thought with its context.
run(`notePadPages = [{ text: "first page\\n  keeps its spacing  \\n", from: null }, { text: "", from: null }, "plain string page"];
todoDaItems = [
  { id: "t1", text: "call the printer", done: true, doneAt: "2026-08-01T00:00:00.000Z", createdAt: "2026-07-30T09:00:00.000Z", projectId: "p1", projectName: "Zine" },
  { id: "t2", text: "send proofs", done: false, doneAt: "", createdAt: "2026-07-31T09:00:00.000Z", projectId: "", projectName: "" },
];
legacyHeld = [{ id: "h1", at: 1767225600000, where: "teachText", title: "TeachText", fieldId: "teach-text-body", start: 12, end: 12, sentence: "Two sentences in.", reading: "Source A", clipboard: "copied", handoff: "Friday", doing: "mid-argument", next: "finish para 3" }];`);
const added = run("migrateLegacyStickies()");
const after = JSON.parse(run("JSON.stringify(deskStickies)"));
test.assert(added === 5 && after.length === 5, `5 legacy records become 5 stickies (got ${added}); the blank page is the only thing left behind`);
const byId = Object.fromEntries(after.map((sticky) => [sticky.id, sticky]));
test.assert(byId["notepad-0"].text === "first page\n  keeps its spacing  \n" && byId["notepad-0"].kind === "note", "a Note Pad page keeps every byte, as a note");
test.assert(byId["notepad-2"].text === "plain string page", "the oldest string-shaped pages come too");
test.assert(byId["todo-t1"].kind === "action" && byId["todo-t1"].done === true && byId["todo-t1"].doneAt === "2026-08-01T00:00:00.000Z", "a done action stays done, with its timestamp");
test.assert(byId["todo-t1"].createdAt === "2026-07-30T09:00:00.000Z" && byId["todo-t1"].projectName === "Zine", "and keeps when it was made and which project it came from");
test.assert(byId["held-h1"].kind === "held" && byId["held-h1"].text === "mid-argument", "a held thought becomes a held sticky with its words");
test.assert(byId["held-h1"].held.fieldId === "teach-text-body" && byId["held-h1"].held.start === 12 && byId["held-h1"].held.next === "finish para 3" && byId["held-h1"].held.at === 1767225600000, "and keeps the context the way back needs");
test.assert(run("stickiesMigrated") === true, "the desk remembers the copy was made");

// Idempotent twice over: the flag stops a second run, and ids stop duplicates
// even if the flag were lost.
test.assert(run("migrateLegacyStickies()") === 0 && run("deskStickies.length") === 5, "a second run with the flag set adds nothing");
run("stickiesMigrated = false");
test.assert(run("migrateLegacyStickies()") === 0 && run("deskStickies.length") === 5, "and a second run without it adds nothing either");
run("stickiesMigrated = false; deskPersistenceWritable = false");
test.assert(run("migrateLegacyStickies()") === 0 && run("stickiesMigrated") === false, "a desk that has not loaded yet is never marked migrated");

// ---- Clarify: Inbox → action or note ----------------------------------------------
run(`deskStickies.push(normalizeSticky({ id: "in1", text: "maybe ring Ana", inbox: true }), normalizeSticky({ id: "in2", text: "a quote I liked", inbox: true }));`);
test.assert(run("stickiesInView('inbox').map((s) => s.id).join()") === "in1,in2", "quick-add captures wait in the Inbox");
test.assert(run("stickiesInView('review').some((s) => s.id === 'in1')"), "and Review lists them until they are clarified");
run("clarifySticky(findSticky('in1'), 'action'); clarifySticky(findSticky('in2'), 'note');");
test.assert(run("stickiesInView('inbox').length") === 0, "one press each clears the Inbox");
test.assert(run("stickiesInView('next').some((s) => s.id === 'in1')"), "an action lands in Next");
test.assert(run("stickiesInView('notes').some((s) => s.id === 'in2')"), "a note lands in Notes");
test.assert(run("stickiesInView('next').some((s) => s.id === 'todo-t2') && !stickiesInView('next').some((s) => s.id === 'todo-t1')"), "Next holds open actions only; done ones are in Done");
test.assert(run("stickiesInView('review', deskStickies, Date.parse('2026-10-31')).some((s) => s.id === 'todo-t2')"), "an action untouched for a week comes up in Review");
test.assert(!run("clarifySticky(findSticky('in2'), 'held')"), "clarifying never invents a held thought");

// ---- Pin / unpin, through storage --------------------------------------------
run("findSticky('in2').pin = { x: 400, y: 120, collapsed: true };");
const stored = JSON.parse(run("JSON.stringify(deskStickies)"));
const back = vm.runInContext(`(${JSON.stringify(stored)}).map(normalizeSticky)`, context).find((sticky) => sticky.id === "in2");
test.assert(back.pin.x === 400 && back.pin.y === 120 && back.pin.collapsed === true, "a pin survives the trip through the desk settings");
test.assertIncludes(persistence, "deskStickies.some((sticky) => sticky.pin)) ensureTodoDaModule().then(() => window.AISystem6Stickies?.boot());", "and a pinned desk brings the module in at boot to put them back");
run("findSticky('in2').pin = null");
test.assert(vm.runInContext(`normalizeSticky(${JSON.stringify({ ...back, pin: null })}).pin`, context) === null, "unpinned stays unpinned");
const parked = run("clampStickyPosition(-50, 3, { width: 200, height: 150 }, { width: 1280, height: 800, top: 20 })");
test.assert(parked.x === 0 && parked.y === 20, "a sticky cannot be parked under the menu bar or off the left edge");
test.assertIncludes(source, "const grabX = event.clientX - rect.left;", "dragging keeps the grab offset, 1:1 with the pointer");
test.assertIncludes(source, "return typeof isNarrowViewport === \"function\" ? !isNarrowViewport() : true;", "on a phone nothing floats; pinned stickies stay in the window");

// ---- ⌥⌘N capture lands as a held sticky --------------------------------------
test.assertIncludes(actions, 'id: "hold-that-thought", key: "n", code: "KeyN", option: true, action: "hold-that-thought", display: "⌥⌘N"', "the capture key is unchanged");
const calls = [];
class HTMLTextAreaElement {}
const titled = (title) => ({ querySelector: () => ({ textContent: title }), classList: { contains: () => true } });
const held = vm.createContext({
  console,
  HTMLTextAreaElement,
  deskPersistenceWritable: true,
  Date,
  window: {},
  localStorage: { getItem: () => null },
  document: {
    activeElement: null,
    getElementById: () => null,
    querySelector: (selector) => (selector.startsWith(".window.is-active") ? { dataset: { window: "teachText" } } : null),
    addEventListener() {},
  },
  getWindow: (name) => titled(name === "teachText" ? "TeachText" : name),
  getActiveProject: () => null,
  currentWritingRouteStop: () => "manuscript",
  setStatus: () => {},
  t: (key) => key,
  saveDeskState: () => calls.push("save"),
  ensureTodoDaModule: async () => { calls.push("ensure"); },
  openStickies: async (view, id) => { calls.push(`open:${view}:${id}`); },
});
vm.runInContext(heldPlace, held);
await vm.runInContext("holdThatThought()", held);
const caught = JSON.parse(vm.runInContext("JSON.stringify(deskStickies)", held));
test.assert(caught.length === 1 && caught[0].kind === "held", "⌥⌘N lands one held sticky");
test.assert(caught[0].held.where === "teachText" && caught[0].held.routeStop === "manuscript", "with where the writer was");
test.assert(calls[0] === "save" && calls.at(-1) === `open:held:${caught[0].id}`, "written before the window is asked for, then opened at Held on that sticky");
test.assert(vm.runInContext("hasHeldPlace() && heldThoughtWhere() === 'TeachText'", held), "the Apple menu's way back names the place");
await vm.runInContext("holdThatThought()", held);
test.assert(vm.runInContext("deskStickies.length", held) === 1, "a second press inside a minute, nothing written, refreshes rather than stacks");

// ---- Copy, both languages ----------------------------------------------------------
test.assertIncludes(en, 'stickies: "Stickies"', "English names the object Stickies");
test.assertIncludes(zh, 'stickies: "便利贴"', "Chinese names it 便利贴");
for (const key of ["stickies_view_inbox", "stickies_view_next", "stickies_view_notes", "stickies_view_held", "stickies_view_done", "stickies_view_review", "stickies_make_action", "stickies_make_note", "stickies_pin", "stickies_unpin", "stickies_empty_inbox", "stickies_empty_review", "stickies_deleted", "sticky_colour_yellow"]) {
  test.assertIncludes(en, `${key}:`, `English names ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese names ${key}`);
}
test.assertMatches(zh, /stickies_empty_next: "[^"]*「下一步」|stickies_empty_next: "[^"]*「收件」/, "Chinese empty states quote view names with 「」");

test.finish();
