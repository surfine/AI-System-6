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
    const scopeList = entry.match(/scope: \[([^\]]*)\]/)?.[1];
    return {
      id: entry.match(/id: "([^"]+)"/)?.[1] || key,
      combination: `${entry.includes("shift: true") ? "shift+" : ""}${entry.includes("option: true") ? "option+" : ""}${key}`,
      // "global" and "application" reach every foreground app, so they collide
      // with everything; a list of app ids collides only where it overlaps.
      apps: scopeList ? [...scopeList.matchAll(/"([^"]+)"/g)].map((match) => match[1]) : null,
    };
  })
  .filter(Boolean);
test.assert(dispatchEntries.length > 20, "the registry parses into dispatched shortcut entries");

// runShortcut() picks the first registry entry whose combination and scope both
// match the foreground application. Two entries may therefore share ⌘O only
// when no application can reach both — otherwise one silently shadows the
// other, which is how TeachText's "Open… ⌘O" came to run Finder's Open.
const reachesSameApp = (left, right) => {
  if (!left.apps || !right.apps) return true;
  return left.apps.some((app) => right.apps.includes(app));
};
const collisions = [];
for (let index = 0; index < dispatchEntries.length; index += 1) {
  for (let other = index + 1; other < dispatchEntries.length; other += 1) {
    const [left, right] = [dispatchEntries[index], dispatchEntries[other]];
    if (left.combination !== right.combination) continue;
    if (reachesSameApp(left, right)) collisions.push(`${left.combination}: ${left.id} vs ${right.id}`);
  }
}
test.assert(
  collisions.length === 0,
  collisions.length
    ? `no two dispatched actions claim the same key combination in one application — ${collisions.join("; ")}`
    : "no two dispatched actions claim the same key combination in one application",
);

// Every menu row that prints a key must name a registry entry whose action is
// the row's own action. A row may not advertise another command's key.
const menuRows = [...menus.matchAll(/menuItem\("([a-z0-9-]+)", "([a-z0-9_]+)", "([a-z0-9-]+)"/g)];
test.assert(menuRows.length > 10, "menus.js declares rows that print a keyboard shortcut");
const registryPairs = new Map(
  [...registrySource.matchAll(/id: "([^"]+)"[^\n]*?action: "([^"]+)"/g)].map((match) => [match[1], match[2]])
);
const liars = menuRows
  .filter(([, action, , shortcutId]) => registryPairs.get(shortcutId) !== action)
  .map(([, action, , shortcutId]) => `${action} prints ${shortcutId} (${registryPairs.get(shortcutId) || "unknown"})`);
test.assert(
  liars.length === 0,
  liars.length
    ? `every menu row's printed key dispatches that row's own action — ${liars.join("; ")}`
    : "every menu row's printed key dispatches that row's own action",
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
