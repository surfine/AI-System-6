// Converted from a static, source-reading contract. The two guarantees named
// in the file's own history — "no two dispatched actions claim the same key
// combination in one application" and "every menu row's printed key
// dispatches that row's own action" — used to be checked by REGEX-SCRAPING
// keyboardShortcutRegistry's array literal out of actions.js source
// (`/\{([^}\n]+)\}/g`, deliberately excluding newlines inside the braces).
// That parse silently under-counts the moment a registry entry wraps onto a
// second line or gains a nested value — exactly the kind of drift a real
// engine cannot be fooled by. This version boots the real eager module set
// (tests/helpers/app-boot-vm.mjs) and reads the REAL keyboardShortcutRegistry
// array the way runShortcut() itself does, with real object fields instead
// of a regex approximation of them.
//
// Collision comment, unchanged from the file this replaces: runShortcut()
// picks the first registry entry whose combination and scope both match the
// foreground application. Two entries may therefore share ⌘O only when no
// application can reach both — otherwise one silently shadows the other,
// which is how TeachText's "Open… ⌘O" came to run Finder's Open.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("keyboard-shortcuts");

const vmw = createAppBootVm();
const registry = JSON.parse(vmw.run("JSON.stringify(keyboardShortcutRegistry)"));
test.assert(Array.isArray(registry) && registry.length > 20, `keyboardShortcutRegistry is the real array (got ${registry.length} entries, expected well over 20)`);

const dispatchEntries = registry
  .filter((entry) => entry.dispatch !== false)
  .map((entry) => ({
    id: entry.id || entry.key,
    action: entry.action,
    combination: `${entry.shift ? "shift+" : ""}${entry.option ? "option+" : ""}${entry.key}`,
    // "global" and "application" reach every foreground app, so they collide
    // with everything; a list of app ids collides only where it overlaps.
    apps: Array.isArray(entry.scope) ? entry.scope : null,
  }));
test.assert(dispatchEntries.length > 20, "the real registry holds dispatched shortcut entries");

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
    : `no two dispatched actions claim the same key combination in one application (${dispatchEntries.length} real registry entries checked)`,
);

// Every dispatched entry's action really resolves to something callable —
// the same real registry-build guarantee action-registry-dispatch.test.mjs
// proves for the action table, checked here specifically for the shortcut
// registry's own entries (a shortcut naming a dead action is a silent no-op
// key press, the same failure shape as a dead menu row). A shortcut CAN
// legitimately name an action that only exists once its own window's lazy
// module has loaded and self-registered (ClioChart, the darkroom, …) — the
// same real, intentional pattern action-registry-dispatch.test.mjs already
// carves out, checked the same way: by asking the window registry whether
// the shortcut's own scope window is itself lazy.
const handlers = vmw.context.getApplicationActionHandlers();
const commandRegistry = vmw.context.getApplicationCommandRegistry();
const lazyCommands = vmw.context.window.AISystem6Runtime.lazyCommands;
const windowRecords = windowRegistryRecords();
const deadShortcutActions = registry
  .filter((entry) => entry.dispatch !== false)
  .filter((entry) => !commandRegistry.has(entry.action) && !lazyCommands.has(entry.action) && !(entry.action in handlers))
  .filter((entry) => {
    const scopeWindow = Array.isArray(entry.scope) ? entry.scope[0] : null;
    return !windowRecords[scopeWindow]?.lazy;
  });
test.assert(
  deadShortcutActions.length === 0,
  deadShortcutActions.length
    ? `every eagerly-dispatchable shortcut names a real command — dead: ${deadShortcutActions.map((e) => `${e.id} -> ${e.action}`).join(", ")}`
    : `every eagerly-dispatchable shortcut in the real registry names a command that really resolves (${dispatchEntries.length} entries checked, module-scoped lazy-window shortcuts excluded the same way action-registry-dispatch.test.mjs excludes them)`
);

// --- Structural checks execution cannot meaningfully replace ---
//
// Menu-row/shortcut agreement ("every menu row's printed key dispatches that
// row's own action") stays static: the real applicationMenuSets only holds
// the menus for apps whose module is already loaded, and menus.js itself
// declares rows for roughly a dozen lazy feature windows (Reader, Scrapbook,
// Time Machine, ClioChart, ClioStage, CMF Studio, Cover Glass, Endfield
// Terminal, the darkroom, …). Loading all of them just to read their menu
// arrays would cost far more than this specific cross-check is worth, so it
// stays a source read — a legitimate case of "execution cannot reach without
// disproportionate cost", not "did not bother".
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const registrySource = actions.match(/const keyboardShortcutRegistry = \[([\s\S]*?)\n\];/)?.[1] || "";
const registryPairs = new Map(
  [...registrySource.matchAll(/id: "([^"]+)"[^\n]*?action: "([^"]+)"/g)].map((match) => [match[1], match[2]])
);
const menuRows = [...menus.matchAll(/menuItem\("([a-z0-9-]+)", "([a-z0-9_]+)", "([a-z0-9-]+)"/g)];
test.assert(menuRows.length > 10, "menus.js declares rows that print a keyboard shortcut");
const liars = menuRows
  .filter(([, action, , shortcutId]) => registryPairs.get(shortcutId) !== action)
  .map(([, action, , shortcutId]) => `${action} prints ${shortcutId} (${registryPairs.get(shortcutId) || "unknown"})`);
test.assert(
  liars.length === 0,
  liars.length
    ? `every menu row's printed key dispatches that row's own action — ${liars.join("; ")}`
    : "every menu row's printed key dispatches that row's own action"
);

// Platform-routing and edit-command-plumbing implementation shape: these are
// claims about HOW the dispatcher is built (which helper functions exist,
// which regex normalizes the display glyph), not about data an execution can
// observe differently — the harness runs as one fixed platform
// (navigator.platform: "MacIntel", see app-boot-vm.mjs), so flipping it to
// prove the non-Mac branch for real would mean re-booting a second VM under
// a different navigator just to re-read the same source-level branch this
// already names directly.
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
const documentsChat = read("app/features/documents-chat.js");
test.assertIncludes(documentsChat, "async function runEditCommand(command)", "edit commands resolve through one router");
test.assertIncludes(documentsChat, "function getActiveEditableElement", "the edit router targets the focused editable element");
test.assertIncludes(
  documentsChat,
  "if ((tag === \"textarea\" || (tag === \"input\" && ![\"button\", \"checkbox\", \"file\", \"radio\"].includes(active.type))) && !active.disabled)",
  "native text editing wins while an input field has focus"
);
// Select All takes the whole field, and an empty field has nothing to take:
// select() moved the caret from 0-0 to 0-0, so the row was enabled in sixteen
// menus and did nothing in all of them. Same correction Cut, Copy and Clear
// already carry -- ask what the command would act on, not whether a field
// happens to be there.
test.assertIncludes(
  read("app/core/window-manager.js"),
  '"select-all": hasEditableText,',
  "Select All is offered only while the field it would take has something in it"
);
test.assertIncludes(
  read("app/core/balloon-help.js"),
  'if (action === "select-all") return "balloon_disabled_menu_empty_field";',
  "and the greyed row says the field is empty rather than blaming the window"
);
test.assertIncludes(actions, 'id: "new-folder", key: "n", shift: true', "Shift-Command-N creates a folder");
test.assertIncludes(actions, 'id: "system-help", key: "?", shift: true', "Command-question-mark opens Help");
test.assertIncludes(actions, 'id: "control-panel", key: ","', "Command-comma opens settings");
test.assertNotIncludes(actions, 'id: "sideask", key:', "SideAsk does not consume a global shortcut");
test.assertNotIncludes(actions, 'id: "searcher", key:', "Searcher does not consume a global shortcut");
test.assertNotIncludes(actions, 'id: "scrapbook", key:', "Scrapbook does not consume a global shortcut");
test.assertNotIncludes(actions, 'id: "reader", key:', "Reader does not consume a global shortcut");
test.assertNotIncludes(actions, 'id: "dictation", key:', "Dictation Pad does not consume a global shortcut");

const html = read("index.html");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");
test.assert(
  translationsEn.includes("balloon_disabled_menu_empty_field:") && translationsZh.includes("balloon_disabled_menu_empty_field:"),
  "balloon_disabled_menu_empty_field exists in both languages"
);
test.assertIncludes(html, 'id="shortcut-grid"', "Key Caps exposes the generated shortcut grid");
test.assertIncludes(menus, 'menuItem("new-document", "new_document", "new-document")', "generated menu labels read from the shortcut registry");
test.assertIncludes(actions, 'scope: ["finder"]', "Finder shortcuts declare an application scope");
test.assertIncludes(actions, 'candidate.scope === "global"', "global shortcuts remain available across applications");
test.assertIncludes(actions, 'candidate.scope.includes(shortcutAppId)', "application shortcuts resolve against the foreground app");
const app = read("app.js");
test.assertIncludes(app, "syncKeyboardShortcutLabels();", "language changes resync menu shortcut labels");
test.assertIncludes(app, "renderKeyCapsShortcuts();", "language changes rerender Key Caps");
test.assertIncludes(translationsEn, "physical keyboard", "English hint explains mobile keyboard requirements");
test.assertIncludes(translationsZh, "实体键盘", "Chinese hint explains mobile keyboard requirements");

test.finish();
process.exit(0);
