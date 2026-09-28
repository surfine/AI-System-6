// The Finder list view's sort-direction button reverses the sorted column, one
// remembered choice per window.
//
// The order itself is compareFinderItemsByMode's: name and kind ascending,
// size and date descending. Reversal flips the sorted array, and the header
// says which direction the column reads in.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("finder-sort-direction");
const projectDisk = read("app/features/project-disk.js");
const documentsChat = read("app/features/documents-chat.js");
const printDirectory = read("app/features/print-directory.js");

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return null;
  // The body opens at ") {": a default parameter such as `reversed = false`
  // would otherwise be taken for the body.
  const bodyStart = source.indexOf(") {", start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return null;
}

const modeLine = projectDisk.split("\n").find((line) => line.includes("const finderViewModeOrder =")) || "";
const storageKeyLine = projectDisk.split("\n").find((line) => line.includes("const finderSortReversedStorageKey =")) || "";
const sortFunctions = [
  "getFinderItemName",
  "getFinderItemKindLabel",
  "getFinderItemModifiedAt",
  "getFinderItemSizeValue",
  "normalizeFinderViewMode",
  "isFinderListMode",
  "compareFinderItemsByMode",
  "sortFinderItemsForView",
  "finderSortedColumn",
  "finderSortDirection",
  "readFinderSortReversedStore",
  "finderSortReversed",
  "toggleFinderSortReversed",
].map((name) => readFunction(projectDisk, name)).join("\n");

function buildRuntime(store) {
  const values = new Map(Object.entries(store || {}));
  const localStorage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
  };
  // The functions run in their own VM context with only the globals they read.
  const context = vm.createContext({ localStorage, currentLanguage: "en", t: (key) => key });
  vm.runInContext(`${modeLine}\n${storageKeyLine}\n${sortFunctions}\n`
    + "globalThis.api = { sortFinderItemsForView, compareFinderItemsByMode, normalizeFinderViewMode, "
    + "isFinderListMode, finderSortedColumn, finderSortDirection, finderSortReversed, toggleFinderSortReversed };", context);
  const api = context.api;
  return { ...api, values };
}

test.assert(Boolean(modeLine) && Boolean(readFunction(projectDisk, "sortFinderItemsForView")), "the sort contract reads out of project-disk.js");

const runtime = buildRuntime();

const a = { name: "Apple", modifiedAt: "2024-01-01", sizeValue: 10 };
const b = { name: "banana", modifiedAt: "2025-06-01", sizeValue: 30 };
const c = { name: "Cherry", modifiedAt: "2023-03-01", sizeValue: 20 };
const items = [b, c, a];

test.assert(
  runtime.sortFinderItemsForView(items, "name").map((item) => item.name).join() === "Apple,banana,Cherry",
  "name mode sorts A to Z",
);
test.assert(
  runtime.sortFinderItemsForView(items, "name", true).map((item) => item.name).join() === "Cherry,banana,Apple",
  "name mode reversed sorts Z to A",
);
test.assert(
  runtime.sortFinderItemsForView([...items], "name").map((item) => item.name).join() === "Apple,banana,Cherry",
  "the two-argument call behaves exactly as before",
);

test.assert(
  runtime.sortFinderItemsForView(items, "date").map((item) => item.name).join() === "banana,Apple,Cherry",
  "date mode is newest first",
);
test.assert(
  runtime.sortFinderItemsForView(items, "date", true).map((item) => item.name).join() === "Cherry,Apple,banana",
  "date mode reversed is oldest first",
);

test.assert(
  runtime.sortFinderItemsForView(items, "icon") === items && runtime.sortFinderItemsForView(items, "small-icon", true) === items,
  "icon modes return the list untouched even when reversed",
);

test.assert(
  runtime.finderSortDirection("name", false) === "ascending"
    && runtime.finderSortDirection("date", false) === "descending"
    && runtime.finderSortDirection("name", true) === "descending"
    && runtime.finderSortDirection("date", true) === "ascending",
  "the sorted column reports its direction, and reversal flips it",
);

test.assert(
  ["name", "list", "kind", "size", "date", "icon"].map((mode) => runtime.finderSortedColumn(mode)).join() === "0,0,1,2,3,-1",
  "the sorted column index follows the mode, and icon modes have none",
);

const windows = buildRuntime();
windows.toggleFinderSortReversed("projects");
test.assert(
  windows.values.get("ai-system-6-finder-sort-reversed") === '{"projects":true}'
    && windows.finderSortReversed("projects") === true && windows.finderSortReversed("documents") === false,
  "the reversal is remembered per window",
);
windows.toggleFinderSortReversed("projects");
test.assert(windows.finderSortReversed("projects") === false, "toggling the same window flips it back");
test.assert(
  buildRuntime({ "ai-system-6-finder-sort-reversed": "{not json" }).finderSortReversed("projects") === false,
  "a corrupt stored value reads as not reversed",
);

// Behaviour above, wiring here: every list that shows or prints a window's
// items passes that window's own reversal, and the header is one shared part.
function callsIn(source, name, needle) {
  const body = readFunction(source, name) || "";
  return body.split(needle).length - 1;
}

test.assert(
  callsIn(projectDisk, "renderProjectDisks", 'renderFinderListHeader("projects", mode') >= 1
    && callsIn(projectDisk, "renderProjectDisks", 'sortFinderItemsForView(getProjectRootFinderItems(), mode, finderSortReversed("projects"))') === 1,
  "renderProjectDisks builds the shared header and sorts by the projects reversal",
);
test.assert(
  callsIn(documentsChat, "renderDocuments", 'renderFinderListHeader("documents", mode') >= 1
    && callsIn(documentsChat, "renderDocuments", 'sortFinderItemsForView([...folderItems, ...fileItems], mode, finderSortReversed("documents"))') === 1,
  "renderDocuments builds the shared header and sorts by the documents reversal",
);
test.assert(
  callsIn(printDirectory, "getDocumentsPrintDirectoryItems", 'finderSortReversed("documents")') === 1
    && callsIn(printDirectory, "buildPrintDirectorySnapshot", "finderSortReversed(activeName)") === 1
    && callsIn(printDirectory, "buildPrintDirectorySnapshot", 'finderSortReversed("projects")') === 1,
  "the printed directory carries each window's reversal",
);

test.finish();
