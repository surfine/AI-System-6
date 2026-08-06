// Desktop maintenance: "Rebuild Desktop" and Project Disk First Aid as
// invisible background hygiene. It repairs derived indexes and clearly broken
// internal pointers on boot idle, project switches, and backup imports. It
// must not add UI, show status text, or touch user content.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("desktop-maintenance");
const manifest = read("scripts/runtime-manifest.mjs");
const maintenance = read("app/core/desktop-maintenance.js");
const config = read("app/core/config.js");
const boot = read("app/core/boot.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const exportImport = read("app/features/export-import.js");
const queue = read("app/core/derived-index-queue.js");
const menus = read("app/data/menus.js");
const actions = read("app/core/actions.js");
const translations = read("app/data/translations-en.js");

test.assertIncludes(manifest, '"app/core/desktop-maintenance.js"', "the maintenance engine is a lazy module");
test.assertNotIncludes(manifest.split("lazyRuntimePaths = [")[0], "app/core/desktop-maintenance.js", "the maintenance engine is not part of the startup bundle list");

test.assertIncludes(maintenance, "window.AISystem6DesktopMaintenance", "the maintenance engine exposes an internal API");
test.assertIncludes(maintenance, "function repairRecordIds", "duplicate or missing record ids are repaired");
test.assertIncludes(maintenance, "folder:cycle", "folder cycles are broken safely");
test.assertIncludes(maintenance, "folder:orphan-parent", "dangling folder parents are reparented to root");
test.assertIncludes(maintenance, "record:orphan-folder", "records with missing folders are returned to the root");
test.assertIncludes(maintenance, "function repairDanglingLinks", "dangling reference links are cleared");
test.assertIncludes(maintenance, "projectCd:orphan", "orphaned Project CD items are removed");
test.assertIncludes(maintenance, "trash:orphan", "orphaned trash records are removed");
test.assertIncludes(maintenance, "rebuild-index", "stale or missing derived indexes are rebuilt internally");
test.assertIncludes(maintenance, "resync-index", "stale derived products are re-synchronized");
test.assertIncludes(maintenance, "renderDocuments?.()", "repairs refresh the Finder surfaces quietly");
test.assertIncludes(maintenance, "console.info", "the engine reports only to the console");

test.assertNotIncludes(maintenance, "setStatus(", "maintenance never shows status text");
test.assertNotIncludes(maintenance, "data-i18n", "maintenance adds no UI labels");
test.assertNotIncludes(maintenance, "openWindow(", "maintenance opens no windows");
test.assertNotIncludes(menus, "desktop-maintenance", "no menu item exposes maintenance");
test.assertNotIncludes(actions, "desktop-maintenance", "no command handler exposes maintenance");
test.assertNotIncludes(translations, "maintenance", "no user-facing copy names maintenance");

test.assertIncludes(config, "function scheduleDesktopMaintenance", "one invisible scheduler loads the lazy engine");
test.assertIncludes(boot, 'scheduleDesktopMaintenance("boot")', "boot schedules a deferred sweep after the app is ready");
test.assertIncludes(desktopRuntime, 'scheduleDesktopMaintenance("project")', "project switches trigger a quiet sweep");
test.assertIncludes(exportImport, 'scheduleDesktopMaintenance("import")', "backup imports trigger a quiet sweep");
test.assertIncludes(queue, "derivedIndexSilent", "background rebuilds can suppress index notifications");
test.assertIncludes(queue, "options.silent", "the queue accepts silent rebuild requests");

test.finish();
