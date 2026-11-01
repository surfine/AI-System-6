import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

// Desk-level Undo: labelled inverses for Trash and reply discards, one step per
// selection, the Finder joining as a provider, and the wiring that offers the
// stack to Edit > Undo when a window has no history of its own.
const test = createFeatureTest("desk-undo");
const trashItems = [];
const restored = [];
const context = vm.createContext({
  window: {}, Date, Promise, console, trashItems, activeProjectId: "p1",
  t: (key) => key, setStatus: () => {}, updateMenuState: () => {},
  restoreTrashItem: (item) => { restored.push(item.title); return true; },
  finishTrashPutAway: (item) => { trashItems.splice(trashItems.indexOf(item), 1); },
});
vm.runInContext(read("app/core/desk-undo.js"), context);
const desk = context.window.AISystem6DeskUndo;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const trash = (title) => { const item = { title }; trashItems.unshift(item); return item; };

test.assert(!desk.canUndo() && desk.undoLabel() === "", "an empty desk has nothing to undo");
desk.together(() => { desk.trashed([trash("a")]); desk.trashed([trash("b")]); });
test.assert(desk.canUndo() && desk.undoLabel() === "undo_label_trash", "a selection moved to the Trash is one named step");
desk.silently(() => desk.trashed([trash("finder-drop")]));
test.assert(desk.undoLabel() === "undo_label_trash" && trashItems.length === 3, "a drop the Finder logs itself is not registered twice");
desk.undo();
await settle();
test.assert(restored.join() === "a,b" && trashItems.length === 1, `one Undo puts the whole selection back (${restored})`);
test.assert(!desk.canUndo(), "and the step is spent");

let finderAt = 0;
const finderStep = { at: 0, label: "undo_label_rename" };
let finderUndone = 0;
desk.provide({ next: () => (finderUndone ? null : { ...finderStep, at: finderAt }), undo: () => { finderUndone += 1; return true; } });
finderAt = 10;
test.assert(desk.undoLabel() === "undo_label_rename", "a Finder step shows through the desk menu");
let reply = 0;
desk.push({ label: "undo_label_discard_reply", undo: () => { reply += 1; return true; }, redo: () => true });
test.assert(desk.undoLabel() === "undo_label_discard_reply", "the newest step wins, wherever it was recorded");
desk.undo(); await settle();
test.assert(reply === 1 && desk.canRedo(), "an entry with a redo can be redone");
desk.undo(); await settle();
test.assert(finderUndone === 1, "then Undo walks on to the Finder's step");

const text = { value: "hello world", focus() {}, setSelectionRange(a, b) { this.sel = [a, b]; }, dispatchEvent() {} };
const typed = [];
context.document = { execCommand: (name, _, value) => { typed.push([name, value, text.sel.join("-")]); text.value = text.value.slice(0, text.sel[0]) + (value || "") + text.value.slice(text.sel[1]); return true; } };
desk.replaceText(text, "hello there world");
test.assert(JSON.stringify(typed) === JSON.stringify([["insertText", "there ", "6-6"]]) && text.value === "hello there world", "accepted text is typed over only the changed middle, as one native edit");

const windowManager = read("app/core/window-manager.js");
test.assert(/own\.canUndo\(\) \|\| own\.canRedo\(\)\) \? own : window\.AISystem6DeskUndo/.test(windowManager), "a window with nothing of its own to undo hands Edit > Undo to the desk");
for (const file of ["scrapbook", "documents-chat", "project-disk", "file-disk", "export-import"]) {
  test.assert(read(`app/features/${file}.js`).includes("AISystem6DeskUndo."), `${file} registers its Trash writes`);
}
test.assert(read("app/core/desktop-runtime.js").includes("AISystem6DeskUndo.trashed"), "moving a disk to the Trash registers its inverse");
const en = read("app/data/translations-en.js"), zh = read("app/data/translations-zh.js");
for (const key of ["undo_label_trash", "undo_label_move", "undo_label_rename", "undo_label_use_result", "undo_label_discard_reply", "desk_undo_unavailable"]) {
  test.assert(en.includes(`${key}:`) && zh.includes(`${key}:`), `${key} is translated in both languages`);
}
test.finish();
