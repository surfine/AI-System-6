// Contract: classic eras get the System 6.0.8 Finder menus (owner decision 10);
// modern eras keep finderMenus. Item order, separators and key equivalents are pinned.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("finder-menus-system6");
const classicEra = { value: true };
const ctx = {
  window: { AISystem6Theme: { themes: [], getReleaseReadyThemes: () => [], hasCapability: () => false } },
  isClassicFinderEra: () => classicEra.value,
  activeAppId: "finder",
  menuOwnerAppId: "",
  t: (k) => k,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
const asked = [];
ctx.ensureFinderMenusModule = () => { asked.push(1); return new Promise(() => {}); };
const api = vm.runInContext(`${read("app/data/menus.js")}\n;({ applicationMenuSets, lazyApplicationMenuSets, menuSetIdForApp, menuSetForApp, finderMenus });`, ctx);
test.assert(api.menuSetIdForApp("finder") === "finder" && asked.length === 1, "until finder-menus.js is in, a classic era keeps finderMenus and asks for the module once");
api.menuSetIdForApp("finder");
test.assert(asked.length === 1, "the module is asked for only once");
test.assert(!read("app/data/menus.js").includes("finderClassicMenus"), "the System 6 rows stay out of the boot bundle");
vm.runInContext(read("app/core/finder-menus.js"), ctx);

const keys = read("app/core/actions.js");
const shortcutDisplay = (id) => {
  const line = keys.split("\n").find((l) => l.includes(`{ id: "${id}",`)) || "";
  return line.match(/menuDisplay: "([^"]+)"/)?.[1] || line.match(/ display: "([^"]+)"/)?.[1];
};
const rows = (menu) => menu.items.map((i) => (i.type === "separator" ? "-" : i.action));
const byId = (set, id) => set.find((m) => m.id === id);

const classic = api.lazyApplicationMenuSets.get("finderClassic");
test.assert(Array.isArray(classic), "finderClassic is a registered menu set");
test.assert(api.menuSetIdForApp("finder") === "finderClassic", "classic era selects finderClassic");
classicEra.value = false;
test.assert(api.menuSetIdForApp("finder") === "finder", "modern era keeps the finder set");
classicEra.value = true;

test.assert(JSON.stringify(rows(byId(classic, "file"))) === JSON.stringify([
  "new-folder", "open-menu-selection", "print-current", "close-active-window", "-",
  "open-file-info", "duplicate-selection", "put-away", "-",
  "page-setup", "print-directory", "-",
  "eject-menu-selection", "-",
  "make-alias", "rename-file", "attach-selected-to-cliotalk", "move-file-trash",
  "insert-text-disk", "open-demo-disks", "open-project-overview",
]), "classic File menu order");
test.assert(JSON.stringify(rows(byId(classic, "edit"))) === JSON.stringify([
  "undo", "-", "cut", "copy", "paste", "clear-edit", "select-all", "-", "show-clipboard",
]), "classic Edit menu order");
test.assert(JSON.stringify(rows(byId(classic, "view"))) === JSON.stringify([
  "view-small-icons", "view-icons", "view-by-name", "view-by-date", "view-by-size", "view-by-kind",
]), "classic View menu order");
const special = rows(byId(classic, "special"));
test.assert(JSON.stringify(special.slice(0, 7)) === JSON.stringify([
  "finder-clean-up", "empty-trash", "erase-disk", "set-startup-project", "-", "restart-system", "shut-down-system",
]), "classic Special menu leads with the System 6 rows");
test.assert(special.filter((a) => a === "restart-system").length === 1 && special.filter((a) => a === "shut-down-system").length === 1,
  "Restart and Shut Down appear exactly once");
test.assert(special.slice(7)[0] === "-" && special.slice(-1)[0] !== "-", "product rows trail after one separator, no dangling separator");

const fileItems = byId(classic, "file").items;
const editItems = byId(classic, "edit").items;
const expectKeys = [
  [fileItems, "new-folder", "new-folder-classic", "⌘N"], [fileItems, "open-menu-selection", "open", "⌘O"],
  [fileItems, "close-active-window", "close-window", "⌘W"], [fileItems, "open-file-info", "get-info", "⌘I"],
  [fileItems, "duplicate-selection", "duplicate", "⌘D"], [fileItems, "eject-menu-selection", "eject", "⌘E"],
  [editItems, "undo", "undo", "⌘Z"], [editItems, "cut", "cut", "⌘X"], [editItems, "copy", "copy", "⌘C"],
  [editItems, "paste", "paste", "⌘V"], [editItems, "select-all", "select-all", "⌘A"],
];
for (const [items, action, shortcutId, display] of expectKeys) {
  const row = items.find((i) => i.action === action);
  test.assert(row?.shortcutId === shortcutId && shortcutDisplay(shortcutId) === display, `${action} carries ${display}`);
}

const modernFile = byId(api.finderMenus, "file").items;
test.assert(modernFile[0].action === "new-folder" && shortcutDisplay("new-folder") === "⇧⌘N"
  && modernFile[1].action === "open-menu-selection" && modernFile[2].action === "open-with" && modernFile[3].action === "close-active-window",
  "modern File menu keeps New Folder ⇧⌘N, Open, then Open With, Close");
test.assert(!byId(classic, "file").items.some((i) => i.action === "open-with"), "the System 6 File menu has no Open With");

for (const lang of ["en", "zh"]) {
  const src = read(`app/data/translations-${lang}.js`);
  for (const key of ["clean_up_selection", "clean_up_window", "clean_up_desktop", "clean_up_by_name", "print_item"]) {
    test.assertMatches(src, new RegExp(`\\b${key}:`), `${lang} carries ${key}`);
  }
}
test.assert(byId(classic, "edit").items.find((i) => i.action === "clear-edit")?.labelKey === "edit_clear", "the classic Edit > Clear row has its own label");
test.assertMatches(read("app/data/translations-zh.js"), /\n\s+edit_clear: "清除",/, "zh Edit > Clear reads 清除");
test.assertMatches(read("app/data/translations-zh.js"), /\n\s+clear: "清空",/, "other Clear buttons keep 清空");
const fileRows = byId(classic, "file").items;
test.assert(fileRows.filter((i) => i.action === "print-directory").length === 1, "Print and Print Directory are two commands");
test.assert(fileRows.find((i) => i.action === "print-directory")?.labelKey === "print_directory_classic"
  && byId(classic, "special").items.find((i) => i.action === "erase-disk")?.labelKey === "erase_disk_classic", "Print Directory… and Erase Disk… carry the System 6 ellipsis");
for (const lang of ["en", "zh"]) {
  const src = read(`app/data/translations-${lang}.js`);
  test.assertMatches(src, /\bprint_directory_classic: "[^"]+…"/, `${lang} Print Directory… ends with an ellipsis`);
  test.assertMatches(src, /\berase_disk_classic: "[^"]+…"/, `${lang} Erase Disk… ends with an ellipsis`);
}
test.finish();
