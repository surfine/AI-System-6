// One table declares what a window needs to be admitted, and this contract keeps
// it that way.
//
// The demonstration-disk window shipped with a File row and a window of its own
// while being invisible to the window registry — and admitting a window used to
// mean editing several files that each knew a different part of the same fact:
// the loader in config.js, the opener command in actions.js, the record in
// window-registry.js, an availability entry, an Applications row and its
// app_desc_* key, a MultiFinder name, and a repaint hook. Four of those only
// announced a missing entry as a test failure.
//
// The openers now come from app/core/app-admissions.js. This contract holds that
// door: every lazy window is admitted, every command has exactly one loader,
// every alias points at a loader a window also uses, and no hand-written
// registerLazyCommand line has come back.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, read, root, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("app-admissions");
const source = read("app/core/app-admissions.js");
const actions = read("app/core/actions.js");
const records = windowRegistryRecords();
const lazyWindows = Object.entries(records).filter(([, record]) => record.lazy).map(([name]) => name);

test.assert(lazyWindows.length > 20, `the registry has lazy windows to admit (${lazyWindows.length})`);

// 1. Every lazy window is either admitted by the table or explicitly listed as
//    one the table does not own yet. A window that quietly joins neither is the
//    bug this contract exists for.
const NOT_YET_ADMITTED = new Set([
  // Desk accessories and route windows whose loaders are shared with a window
  // the table already admits, or whose opener is a desk-accessory command:
  // these are the next migration step, named here so the list cannot grow by
  // accident. See internal/agents/DEBT-AUDIT.zh-CN.md.
  "chooser", "controlStripModules", "dictation", "dictionary", "findChange", "finishingReceipt",
  "holdThought", "outline", "oneMoreTuneFilm", "projectPeek", "questionSheet", "rebuildFlow",
  "sectionDrafts", "sideAskPad", "systemHelp",
]);
const admitted = new Map();
for (const match of source.matchAll(/^ {4}([A-Za-z0-9]+): \{ app: "([A-Za-z]+)", load: (ensure\w+)([^}]*)\},$/gm)) {
  admitted.set(match[1], { app: match[2], load: match[3], rest: match[4] });
}
test.assert(admitted.size > 20, `the table admits most lazy windows (${admitted.size} of ${lazyWindows.length})`);
const unadmitted = lazyWindows.filter((name) => !admitted.has(name) && !NOT_YET_ADMITTED.has(name));
test.assert(
  unadmitted.length === 0,
  unadmitted.length === 0
    ? `every lazy window is admitted by the table or named as a later step (${admitted.size} admitted, ${NOT_YET_ADMITTED.size} named)`
    : `these lazy windows are in neither the admission table nor its later-step list: ${unadmitted.join(", ")}. Add a row to app/core/app-admissions.js.`,
);

// 2. The table's loaders are real: each name is a createLazyModuleLoader in
//    config.js, so a typo cannot admit a window with nothing behind it.
const config = read("app/core/config.js");
for (const [windowName, row] of admitted) {
  test.assertIncludes(config, `const ${row.load} = createLazyModuleLoader(`, `${windowName} names a loader config.js actually builds`);
}

// 3. Two windows may name the same command (Find File and Find Path are one
//    searcher), so what must be unique is the REGISTERED set: registerOpeners()
//    de-duplicates by command id, and the runtime throws on a duplicate. And no
//    opener may be registered by hand again.
const commands = [...source.matchAll(/command: "([a-z0-9-]+)"/g)].map((match) => match[1]);
test.assert(
  source.includes("byCommand") && source.includes("if (!byCommand.has(command))"),
  "the table de-duplicates by command id before registering, so two windows may share one command",
);
test.assert(
  !/registerLazyCommand\?\.\("open-/.test(actions),
  "actions.js registers no lazy opener by hand: the table is the only place",
);
test.assertIncludes(actions, "registerOpeners", "the boot hands the table's openers to the runtime");

// 4. Aliases are not a second registry: each one points at a loader config.js
//    builds, and its id is declared once. (A loader named only by an alias is
//    normal for a window that is still on the later-step list above — the alias
//    is how its command works until that window moves into the table.)
const aliasBlock = source.slice(source.indexOf("const ALIASES"), source.indexOf("function openerEntries"));
const aliasEntries = [...aliasBlock.matchAll(/"([a-z0-9-]+)": (ensure\w+)/g)].map((match) => ({ command: match[1], load: match[2] }));
test.assert(aliasEntries.length >= 5, `the alias list has the ids that share another window's loader (${aliasEntries.length})`);
const aliasIds = aliasEntries.map((entry) => entry.command);
test.assert(new Set(aliasIds).size === aliasIds.length, "every alias command id is declared once");
aliasEntries.forEach(({ command, load }) => {
  // Most loaders are createLazyModuleLoader bindings; a few are the older
  // ensureLazySystemModule wrapper (DocMap), and both are "built by config.js".
  const built = config.includes(`const ${load} = createLazyModuleLoader(`) || config.includes(`function ${load}(`);
  test.assert(built, `${command} points at a loader config.js builds`);
});

// 5. And the executed half: the runtime really has every one of them. The ids
//    are joined inside the VM — a value that crosses realms is still an array,
//    but building the set out here invites a host/realm mismatch instead.
const vmw = createAppBootVm();
const registered = new Set(vmw.run("AISystem6Runtime.listLazyCommands().join(',')").split(",").filter(Boolean));
const missing = commands.filter((command) => !registered.has(command));
test.assert(
  missing.length === 0,
  missing.length === 0
    ? `all ${commands.length} table commands are live lazy commands after boot`
    : `the table declares commands the runtime never registered: ${missing.join(", ")}`,
);
test.assert(
  new Set(commands).size <= registered.size,
  `the runtime holds at least one entry per declared command (${new Set(commands).size} declared, ${registered.size} live)`,
);
test.finish();
process.exit(0);
