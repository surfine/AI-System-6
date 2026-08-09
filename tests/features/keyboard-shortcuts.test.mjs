import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("keyboard-shortcuts");
const actions = read("app/core/actions.js");
const documentsChat = read("app/features/documents-chat.js");
const menus = read("app/data/menus.js");
const app = read("app.js");
const html = read("index.html");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

test.assertIncludes(actions, "const keyboardShortcutRegistry = [", "shortcuts have one shared registry");
test.assertIncludes(actions, "event.defaultPrevented || eventIsTextComposition(event)", "handled editor shortcuts are not dispatched twice");
test.assertIncludes(actions, "function shortcutUsesCommandKey", "the platform decides Command vs Control");
test.assertIncludes(actions, "shortcutModifierPressed(event)", "shortcut dispatch accepts the platform modifier");
test.assertIncludes(actions, ".replace(/⌘/g, \"Ctrl\")", "non-Mac menus render Control instead of Command");
test.assertIncludes(actions, "suppressInEditable && getActiveEditableElement()", "Finder-only shortcuts do not override text editing");
test.assertIncludes(actions, 'id: "new-document", key: "n"', "Command-N creates a document");
test.assertIncludes(actions, 'scope: ["teachText", "clioTalk", "quickDraft"]', "Command-S / Ctrl+S includes Draft Desk");
test.assertIncludes(
  actions,
  'activeWin?.dataset.window === "quickDraft"',
  "Command-N routes Draft Desk through its public New API"
);
test.assertIncludes(
  actions,
  "window.AISystem6QuickDraft?.newDocument",
  "the Draft Desk New command enters through the public API"
);
for (const command of ["undo", "redo", "cut", "copy", "paste", "select-all"]) {
  test.assertIncludes(actions, `"${command}": () => runEditCommand("${command}")`, `${command} dispatches through the shared edit command router`);
}
test.assertIncludes(documentsChat, "async function runEditCommand(command)", "edit commands resolve through one router");
test.assertIncludes(documentsChat, "function getActiveEditableElement", "the edit router targets the focused editable element");
test.assertIncludes(
  documentsChat,
  "if ((tag === \"textarea\" || (tag === \"input\" && ![\"button\", \"checkbox\", \"file\", \"radio\"].includes(active.type))) && !active.disabled)",
  "native text editing wins while an input field has focus"
);
test.assertIncludes(actions, 'id: "new-folder", key: "n", shift: true', "Shift-Command-N creates a folder");
test.assertIncludes(actions, 'id: "system-help", key: "?", shift: true', "Command-question-mark opens Help");
test.assertIncludes(actions, 'id: "control-panel", key: ","', "Command-comma opens settings");
test.assertNotIncludes(actions, 'id: "sideask", key:', "SideAsk does not consume a global shortcut");
test.assertNotIncludes(actions, 'id: "searcher", key:', "Searcher does not consume a global shortcut");
test.assertNotIncludes(actions, 'id: "scrapbook", key:', "Scrapbook does not consume a global shortcut");
test.assertNotIncludes(actions, 'id: "reader", key:', "Reader does not consume a global shortcut");
test.assertNotIncludes(actions, 'id: "dictation", key:', "Dictation Pad does not consume a global shortcut");

const registrySource = actions.match(/const keyboardShortcutRegistry = \[([\s\S]*?)\n\];/)?.[1] || "";
const dispatchEntries = [...registrySource.matchAll(/\{([^}\n]+)\}/g)]
  .map((match) => match[1])
  .filter((entry) => !entry.includes("dispatch: false"))
  .map((entry) => {
    const key = entry.match(/key: "([^"]+)"/)?.[1];
    if (!key) return null;
    return `${entry.includes("shift: true") ? "shift+" : ""}${entry.includes("option: true") ? "option+" : ""}${key}`;
  })
  .filter(Boolean);
test.assert(
  new Set(dispatchEntries).size === dispatchEntries.length,
  "no two dispatched actions claim the same key combination",
);

test.assertIncludes(html, 'id="shortcut-grid"', "Key Caps exposes the generated shortcut grid");
test.assertIncludes(menus, 'menuItem("new-document", "new_document", "new-document")', "generated menu labels read from the shortcut registry");
test.assertIncludes(actions, 'scope: ["finder"]', "Finder shortcuts declare an application scope");
test.assertIncludes(actions, 'candidate.scope === "global"', "global shortcuts remain available across applications");
test.assertIncludes(actions, 'candidate.scope.includes(shortcutAppId)', "application shortcuts resolve against the foreground app");
test.assertIncludes(app, "syncKeyboardShortcutLabels();", "language changes resync menu shortcut labels");
test.assertIncludes(app, "renderKeyCapsShortcuts();", "language changes rerender Key Caps");
test.assertIncludes(translationsEn, "physical keyboard", "English hint explains mobile keyboard requirements");
test.assertIncludes(translationsZh, "实体键盘", "Chinese hint explains mobile keyboard requirements");

test.finish();
