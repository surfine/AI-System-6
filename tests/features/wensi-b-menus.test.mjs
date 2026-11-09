// 文思泉涌 · the application menu bar.
//
// A menu is where an app lies most cheaply: a row that is greyed forever, a row
// that prints a key it never answers, a row that only repeats a button. This
// contract holds every row to something real — a registered command, a label in
// both languages, a key that dispatches that same row — and to the desk's own
// Window menu instead of a hand-rolled copy.

import vm from "node:vm";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("wensi-b-menus");
const source = read("app/features/wensi-quanyong.js");
const enSource = read("app/data/translations-en.js");
const zhSource = read("app/data/translations-zh.js");
const actionsSource = read("app/core/actions.js");

// The rows the desk owns for every application. A module must not re-declare
// them; it prints them and the core answers them.
const CORE_ROWS = Object.freeze(["undo", "redo", "cut", "copy", "paste", "select-all", "close-active-window"]);

const registeredSets = new Map();
const commands = new Map();

const menuInternals = {
  menu: (id, labelKey, items, extra = {}) => ({ id, labelKey, items, ...extra }),
  menuItem: (action, labelKey, shortcutId = "", extra = {}) => ({ type: "item", action, labelKey, shortcutId, ...extra }),
  menuSeparator: { type: "separator" },
  submenu: (labelKey, items, extra = {}) => ({ type: "submenu", labelKey, items, ...extra }),
  // The real one carries tabs/pinned/dock/window-list rows; the contract only
  // needs to know the module asked for it rather than writing its own.
  windowMenu: () => ({ id: "window", labelKey: "menu_window", items: [{ type: "window-list" }] }),
};

const context = vm.createContext({
  window: {
    AISystem6MenuInternals: menuInternals,
    AISystem6RegisterApplicationMenuSet: (appId, definitions) => registeredSets.set(appId, definitions),
    AISystem6Runtime: {
      registerCommand: (action, definition) => commands.set(action, definition),
      registerApplication: () => {},
      forEachCommand: () => {},
      getLazyCommand: () => null,
      commandCount: () => commands.size,
    },
    addEventListener: () => {},
  },
  document: {
    documentElement: { lang: "zh" },
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
  },
  console,
  setTimeout,
  clearTimeout,
});
vm.runInContext(source, context, { timeout: 2000 });
const api = context.window.AISystem6WensiQuanyong;

test.assert(api && typeof api.menuDefinition === "function", "the module exposes its menu definition");

// ---- the set is registered, composed from the desk's own Window menu ----

test.assert(registeredSets.has("wensiQuanyong"), "the set is registered for the window name the desk uses");
const set = registeredSets.get("wensiQuanyong");
const ids = set.map((entry) => entry.id);
test.assert(JSON.stringify(ids) === JSON.stringify(["file", "edit", "view", "article", "site", "window"]),
  "the bar is File, Edit, View, Article, Site, Window — in that order, and nothing else");
const windowMenu = set.find((entry) => entry.id === "window");
test.assert(windowMenu === menuInternals.windowMenu() || windowMenu.items.some((item) => item.type === "window-list"),
  "the Window menu is the desk's own, so its rows can never drift from every other application's");

// ---- every row is a real row ----

const rows = [];
const collectRows = (items) => {
  for (const item of items) {
    if (item.type === "separator" || item.type === "window-list") continue;
    if (item.type === "submenu") {
      test.assert(item.labelKey, `submenu ${item.labelKey || "(none)"} has a label`);
      collectRows(item.items);
      continue;
    }
    rows.push(item);
  }
};
collectRows(set.flatMap((entry) => entry.items));

test.assert(rows.length >= 10, "the bar carries the app's verbs, not a stub");
for (const row of rows) {
  test.assert(typeof row.action === "string" && row.action, `row ${row.labelKey} names an action`);
  test.assert(typeof row.labelKey === "string" && row.labelKey, `row ${row.action} names a label`);
  test.assert(!row.disabled, `row ${row.action} is not permanently greyed`);
}

const moduleActions = rows.filter((row) => !CORE_ROWS.includes(row.action)).map((row) => row.action);
test.assert(moduleActions.every((action) => commands.has(action)),
  "every row the module owns has a registered command behind it");
test.assert(moduleActions.every((action) => typeof commands.get(action).handler === "function"),
  "and every one of those commands has a handler, not a placeholder");

// The module's own actions are exactly the rows it declares — no orphan command.
const declaredActions = api.menuActions();
test.assert(declaredActions.every((action) => moduleActions.includes(action)),
  "every registered menu command appears in the bar (no dead registrations)");

// ---- labels exist in both languages (the bar renders through the eager t()) ----

const labels = [...new Set(rows.map((row) => row.labelKey).concat(set.map((entry) => entry.labelKey)))];
const missingEn = labels.filter((key) => !new RegExp(`^\\s{4}${key}:`, "m").test(enSource));
const missingZh = labels.filter((key) => !new RegExp(`^\\s{4}${key}:`, "m").test(zhSource));
test.assert(missingEn.length === 0, `every menu label exists in English (missing: ${missingEn.join(", ") || "none"})`);
test.assert(missingZh.length === 0, `every menu label exists in Chinese (missing: ${missingZh.join(", ") || "none"})`);

// ---- a printed key dispatches the row it is printed on ----

const shortcutRows = read("app/core/actions.js");
const shortcutOf = (id) => {
  const pattern = new RegExp(`\\{ id: "${id}",[^}]*?action: "([^"]+)"`);
  const match = shortcutRows.match(pattern);
  return match ? match[1] : "";
};
for (const row of rows) {
  if (!row.shortcutId) continue;
  const action = shortcutOf(row.shortcutId);
  test.assert(action === row.action, `the key printed on ${row.action} runs ${row.action} (it runs "${action || "nothing"}")`);
}

// 文思泉涌's two keys are scoped to its own window, so they never shadow another app's.
for (const id of ["wensi-new", "wensi-save"]) {
  const pattern = new RegExp(`\\{ id: "${id}",[^}]*?scope: \\["wensiQuanyong"\\]`);
  test.assert(pattern.test(actionsSource), `${id} is scoped to the 文思泉涌 window`);
}

// ---- view rows are modes, not free-floating verbs ----

const viewItems = set.find((entry) => entry.id === "view").items.filter((item) => item.type === "item");
test.assert(JSON.stringify(viewItems.map((item) => item.action)) === JSON.stringify(["wensi-view-write", "wensi-view-preview", "wensi-view-split"]),
  "the View menu opens with the three view modes, in the order the window shows them");
const faceRows = set.find((entry) => entry.id === "view").items.find((item) => item.type === "submenu");
test.assert(faceRows.items.length === 7 && faceRows.items.every((item) => item.action.startsWith("wensi-face-")),
  "the sidebar submenu carries the seven inspector faces, each a real command");

test.finish();
