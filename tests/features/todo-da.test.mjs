// To Do 待办 — the cross-project next-action list.
//
// A SECOND object beside ClioProject, and the naming law is the boundary:
// Clio- marks an application (the plan for one project), a plain noun marks a
// desk accessory (the actions that follow a person). The two never fold
// together. The accessory speaks Note Pad's shared vocabulary — two status
// slots, one button row with one default, the .da-origin provenance row, the
// width-ladder token — and its items follow Note Pad's storage pattern with
// one hard rule on top: no cap, and nothing is ever auto-dropped.

import vm from "node:vm";

import { createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";

const test = createFeatureTest("todo-da");

const source = read("app/features/todo-da.js");
const accessories = read("app/features/teachtext-accessories.js");
const persistence = read("app/core/persistence-status.js");
const config = read("app/core/config.js");
const actions = read("app/core/actions.js");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// ---- Two objects, not one ---------------------------------------------------
test.assertNotIncludes(source, "AISystem6ClioProject", "the accessory never reaches into the plan");
test.assertNotIncludes(read("app/features/clio-project-window.js"), "todoDaItems", "and the plan never reaches into the actions");

// ---- Lazy window, eager items ----------------------------------------------
//
// The window is a lazy module; the ITEMS are not. Their normalizer lives in
// the eager accessory host and both the snapshot and the restore run
// unconditionally, so the list survives every boot whether or not the window
// is ever summoned. This is the anti-alarm-clock: a lazy DA whose saved state
// waits on its own module loading is a DA that forgets.
test.assert(lazyRuntimePaths.includes("app/features/todo-da.js"), "the window is a lazy module, not a boot cost");
test.assertIncludes(
  config,
  'createLazyModuleLoader("AISystem6TodoDaLoaded", ["app/core/application-shell.js", "app/features/todo-da.js"])',
  "a loader names it, so it can actually arrive"
);
test.assertIncludes(accessories, "function normalizeTodoDaItems", "the normalizer is eager, beside Note Pad's");
test.assertIncludes(persistence, "    todoDaItems,", "the items ride in the desk settings like Note Pad's pages");
test.assertIncludes(
  persistence,
  "if (Array.isArray(settings.todoDaItems)) todoDaItems = normalizeTodoDaItems(settings.todoDaItems);",
  "and come back on every boot, unconditionally"
);
test.assertNotIncludes(persistence, 'typeof normalizeTodoDaItems === "function"', "the restore is never gated on a lazy module having loaded");

// ---- The Desk Accessory vocabulary ------------------------------------------
const record = windowRegistryRecords().todo;
test.assert(!!record, "the window has a registry record");
test.assert(record.app === "accessories", "and it is a Desk Accessory, not an application");
test.assert(record.builtByModule === true, "built by its module, like the other summoned accessories");
// The harness hands non-literal registry fields back as source text.
test.assert(
  String(record.width).includes('"--da-width-pad"'),
  "the width comes from the DA width ladder, not a private number"
);
test.assertIncludes(source, 'class="status-bar-leading" id="todo-da-count"', "the left status slot counts what is open");
test.assertIncludes(source, 'class="status-bar-trailing" id="todo-da-scope"', "the right slot names the cross-project scope");
test.assertIncludes(source, 'origin.className = "da-origin"', "the provenance row is the shared .da-origin");
const defaultButtons = [...source.matchAll(/class="btn default"/g)];
test.assert(defaultButtons.length === 1, "one button row, one default button — Add");

// Plain-noun naming, in both languages.
test.assertIncludes(en, 'todo_da: "To Do"', "English names the accessory To Do");
test.assertIncludes(zh, 'todo_da: "待办"', "Chinese names it 待办");
["todo_da_count", "todo_da_scope", "todo_da_origin", "todo_da_placeholder", "todo_da_add", "todo_da_remove_done", "todo_da_empty"].forEach((key) => {
  test.assertIncludes(en, `${key}:`, `English names ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese names ${key}`);
});

// The Apple menu's Utility DA group carries the entry.
test.assertIncludes(html, '<button data-action="open-todo-da" data-i18n="todo_da">', "the Apple menu lists To Do");
test.assertIncludes(actions, '"open-todo-da",{ensure:ensureTodoDaModule}', "opening it is a lazy command");

// ---- No cap, never auto-dropped, executed -----------------------------------
const slice = accessories.slice(
  accessories.indexOf("function normalizeTodoDaItems"),
  accessories.indexOf("// Every part except the four long-standing handles"),
);
const context = vm.createContext({});
vm.runInContext(slice, context);

const many = context.normalizeTodoDaItems(
  Array.from({ length: 500 }, (_, index) => ({ id: `t${index}`, text: `action ${index}`, done: index % 2 === 0 })),
);
test.assert(many.length === 500, "five hundred actions are five hundred actions — no cap");
test.assert(many.every((item, index) => item.done === (index % 2 === 0)), "done actions are kept, not dropped");

const kept = context.normalizeTodoDaItems([
  { id: "a", text: "call the printer", done: true, doneAt: "2026-08-01T00:00:00.000Z", projectId: "p1", projectName: "Zine" },
  { text: "  ", done: false },
  "garbage-shape",
]);
test.assert(kept.length === 1 && kept[0].id === "a" && kept[0].done === true, "a finished action survives normalization whole");
test.assert(kept[0].projectName === "Zine", "and remembers which project it came from");

// The only exit is the writer's own Remove Done.
test.assertIncludes(source, "function removeDoneTodoDaItems", "removal exists as an explicit command");
test.assertNotIncludes(source, ".shift(", "nothing rolls off the front");
test.assertNotIncludes(source, ".slice(0,", "and nothing is trimmed to a budget");

test.finish();
