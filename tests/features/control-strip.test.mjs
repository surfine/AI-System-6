// Control Strip: Mac OS 9's floating status surface, adapted to AI System 6.
// This contract locks the lazy lifecycle, the unified preference state and
// its legacy migration, the manageable module registry, the edge-anchored
// geometry (move/resize/reorder/remove), the Control Strip Modules folder,
// the Soundscape subscription bridge, and the shared Classic/Liquid DOM.
// Real-browser behavior is covered by tests/e2e/control-strip.spec.mjs.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("control-strip");
const manifest = read("scripts/runtime-manifest.mjs");
const html = read("index.html");
const persistence = read("app/core/persistence-status.js");
const domHandles = read("app/core/dom-handles.js");
const wireup = read("app/core/wireup.js");
const config = read("app/core/config.js");
const boot = read("app/core/boot.js");
const actions = read("app/core/actions.js");
const windowManager = read("app/core/window-manager.js");
const appBundleSource = read("app.js");
const dragDrop = read("app/core/drag-drop.js");
const module = read("app/features/control-strip.js");
const modules = read("app/features/control-strip-modules.js");
const projectDisk = read("app/features/project-disk.js");
const cloudModel = read("app/features/cloud-model.js");
const multiFinder = read("app/core/multi-finder.js");
const quickDraftHandoff = read("app/features/quick-draft-handoff.js");
const folder = read("app/features/control-strip-modules-folder.js");
const soundscape = read("app/features/soundscape.js");
const foundation = read("styles/00-foundation.css");
const liquidGlass = read("styles/70-liquid-glass.css");
const stripCss = read("styles/89-control-strip.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

function zValue(source, name) {
  const match = String(source).match(new RegExp(`${name}\\s*:\\s*([0-9]+)`));
  return match ? Number(match[1]) : NaN;
}

// --- Control Panel entry ---------------------------------------------------

test.assertIncludes(html, 'id="control-strip" type="checkbox" />', "Control Panel exposes a Control Strip checkbox");
test.assertNotMatches(html, /id="control-strip"[^>]*checked/, "Control Strip is off by default");
test.assert(html.indexOf('id="control-strip"') > html.indexOf('id="control-panel-general"'), "the checkbox lives in the General tab");
test.assertIncludes(html, 'id="control-tab-strip"', "Control Panel has a dedicated Control Strip tab");
test.assertIncludes(html, 'id="control-panel-strip"', "the Control Strip tab owns a settings panel");
[
  "control-strip-show",
  "control-strip-hotkey",
  "control-strip-hotkey-record",
  "control-strip-hotkey-clear",
  "control-strip-font",
  "control-strip-font-size",
  "control-strip-module-list",
  "control-strip-move-up",
  "control-strip-move-down",
  "control-strip-enable",
  "control-strip-disable",
  "control-strip-reset",
].forEach((id) => test.assertIncludes(html, `id="${id}"`, `the Control Strip settings panel has #${id}`));

// --- Persistence and migration --------------------------------------------

test.assertIncludes(persistence, "controlStripState", "Control Strip preferences live in one record in the desk settings");
test.assertIncludes(persistence, "function defaultControlStripState", "the record has a real default shape");
["version", "enabled", "visible", "collapsed", "edge", "offsetRatio", "expandedLength", "moduleOrder", "disabledModules", "scrollOffset", "hotkey", "menuFont", "menuFontSize"]
  .forEach((field) => {
    test.assertIncludes(persistence, `${field}:`, `controlStripState carries ${field}`);
  });
test.assertIncludes(persistence, "restoreControlStripState(settings)", "the unified record is restored on boot");
test.assertIncludes(persistence, "settings.controlStripCollapsed === true", "legacy collapsed data still migrates");
test.assertIncludes(persistence, "controlStrip: controlStripState.enabled", "the master switch persists through the unified record");
test.assertIncludes(persistence, "controlStripState,", "the full record is written with saveDeskState");
test.assertIncludes(domHandles, "controlStripInput", "the checkbox is wired into the shared DOM handles");
test.assertIncludes(domHandles, "controlStripHotkeyInput", "the hot key field is wired into the shared DOM handles");
test.assertIncludes(domHandles, "controlStripModuleList", "the module list is wired into the shared DOM handles");
test.assertIncludes(wireup, "applyControlStripState()", "toggling the checkbox applies the runtime state");
test.assertIncludes(wireup, "saveDeskState()", "toggling the checkbox persists");
test.assertIncludes(wireup, "window.AISystem6ControlStrip?.renderSettings?.()", "opening the Control Strip tab loads the settings renderer");
test.assertIncludes(config, "function ensureControlStripModule", "the strip loads from one lazy loader");
test.assertIncludes(config, "function ensureControlStripModulesModule", "module descriptors load through a second lazy loader");
test.assertIncludes(config, "function ensureControlStripModulesFolderModule", "the Control Strip Modules folder loads lazily");
test.assertIncludes(config, "function applyControlStripState", "enabling loads the module; disabling removes it");
test.assertIncludes(boot, "applyControlStripState({ silent: true })", "the strip activates after boot without blocking it");
test.assertIncludes(manifest, '"app/features/control-strip.js"', "the strip is a lazy module");
test.assertIncludes(manifest, '"app/features/control-strip-modules.js"', "module descriptors are a lazy module");
test.assertIncludes(manifest, '"app/features/control-strip-modules-folder.js"', "the Control Strip Modules folder is a lazy module");
test.assert(manifest.indexOf('"app/features/control-strip.js"') < manifest.indexOf('"app/features/control-strip-modules.js"'),
  "the shell loads before its descriptors");
test.assert(manifest.indexOf('"app/features/control-strip-modules.js"') < manifest.indexOf('"app/features/control-strip-modules-folder.js"'),
  "the folder loads after the descriptors");
test.assertNotIncludes(manifest.split("lazyRuntimePaths = [")[0], "app/features/control-strip.js", "the strip is not part of the startup bundle list");

// --- Registry API ----------------------------------------------------------

test.assertIncludes(module, "window.AISystem6ControlStrip", "the strip exposes a lifecycle API");
test.assertIncludes(module, "function registerModule", "modules register through one registry");
test.assertIncludes(module, "function unregisterModule", "modules unregister cleanly");
test.assertIncludes(module, "function disable()", "disabling removes the strip from the desk");
test.assertIncludes(module, "Mac OS 9", "the strip records which system it reproduces");
test.assertIncludes(module, 'state === "unknown"', "a module with no real source is not registered");
test.assertIncludes(module, "already registered", "duplicate ids are rejected instead of silently overwritten");
test.assertIncludes(module, "rejected an invalid module descriptor", "invalid descriptors cannot crash the desk");
test.assertIncludes(module, "dispose?.()", "unregister disposes the descriptor");
test.assertNotMatches(module + modules, /runModelTask|requestChat|createProject|downloadMarkdown/, "menus change settings or open existing windows; they never start work");
test.assertNotMatches(module + modules, /submenu|subMenu/, "one flat menu per module, never a second menu bar");
test.assertNotMatches(module + modules, /已连接|Connected/, "network status never claims a model connection");
test.assertIncludes(module, "menu-popover", "module menus reuse the existing menu primitive");
test.assertIncludes(module, "descriptor.renderMenu(popover)", "menu-bar extras can render their canonical menu into the strip host");
test.assertIncludes(module, "descriptor.menuClass", "shared menus retain their canonical component styling");
test.assertIncludes(module, "queueMicrotask(() => closeStripMenu())", "a command in a shared menu closes its Control Strip host after delegation");
test.assertIncludes(module, "stripModuleRegistry", "one registry owns available modules");
test.assertIncludes(module, "orderedEnabledModuleIds", "enabled and ordered views derive from persisted state");
test.assertIncludes(module, "reconcileModuleState", "new modules are appended without disturbing user order");
test.assertIncludes(module, "handleModuleDrop", "the strip accepts module files dropped from the folder");
test.assertIncludes(module, "scrollStripBy", "overflow scrolling exists");
test.assertIncludes(module, "beginHotkeyRecording", "the hot key recorder is exposed");
test.assertIncludes(module, "event.altKey", "Option is expressed through event.altKey");
test.assertIncludes(module, "STRIP_DRAG_THRESHOLD", "a reliable drag threshold exists");
test.assertIncludes(module, "stripSuppressClickUntil", "a drag suppresses the same-round click");
test.assertIncludes(module, "stripRefreshDeferred", "a background refresh never dismisses an open module menu");
test.assertMatches(module, /function onHandleClick\(\)[\s\S]{0,180}?playSystemSound\?\.\("click"\)/,
  "the deliberate collapse/expand action gets one mechanical click");
test.assertIncludes(module, 'playSystemSound?.("menu")', "Control Strip menu choices get the shared menu sound");
test.assertNotMatches(module, /pointer(over|out)[\s\S]{0,160}?playSystemSound/,
  "ordinary hover never produces Control Strip sound noise");
test.assertIncludes(module, "function syncMenuExtraExclusivity", "the strip has one owner for menu-bar-extra mutual exclusion");
test.assertIncludes(module, "stripEnabled && stripPrefs().visible !== false", "menu extras return when the strip is not actually shown");
test.assertIncludes(module, 'document.querySelectorAll("[data-control-strip-counterpart]")', "mutual exclusion is scoped to declared counterparts");
test.assertIncludes(module, 'extra.classList.toggle("is-control-strip-counterpart-hidden", stripOwnsExtras)', "counterpart menu extras cannot appear beside the Control Strip");
test.assertIncludes(module, 'extra.setAttribute("aria-hidden", String(stripOwnsExtras))', "hidden counterparts also leave the accessibility tree");

// --- First-party module descriptors ---------------------------------------

test.assertIncludes(modules, "window.AISystem6ControlStripModules", "built-in descriptors are exposed to the shell and the folder");
// A tile is a control you set in one click, the way the classic strip carried
// volume, the printer selector and the CD transport. Read-only gauges
// (network, context, indexing, long tasks, output queue) were removed: their
// state belongs to System Status, the Context Panel and Searcher, which can
// actually explain it.
["soundscape", "projectDisk", "model", "writingBell", "appearance", "balloonHelp", "volume", "finderEnvironment", "notifications", "clock"]
  .forEach((slot) => {
    test.assertIncludes(modules, `id: "${slot}"`, `${slot} is a declared module descriptor`);
  });
["network", "context", "indexing", "longTasks", "outputQueue"].forEach((slot) => {
  test.assertNotMatches(modules, new RegExp(`id: "${slot}"`), `${slot} is not a Control Strip tile: it is a readout, not a control`);
});
["defaultOrder", "defaultEnabled", "finderIcon", "openOwner"].forEach((field) => {
  test.assertIncludes(modules, `${field}:`, `descriptors carry ${field}`);
});
test.assertIncludes(modules, "subscribe: controlStripSubscribeSoundscape", "Soundscape modules subscribe to player state");
test.assertIncludes(modules, "ensureRuntime: controlStripEnsureSoundscapeRuntime", "strip modules load the Soundscape adapter lazily");
test.assertNotMatches(modules, /\bbattery\b|screen depth|\bresolution\b|\bprinter\b|\bairport\b/i, "no browser-unreachable hardware is faked");
test.assertIncludes(modules, "toggleLiquidGlassAppearance()", "the appearance tile sets the appearance instead of linking to a panel");
test.assertIncludes(modules, "setBalloonHelpEnabled(", "the Balloon Help tile sets Balloon Help directly");
test.assertIncludes(modules, 'menuClass: "project-switcher-popover"', "the disk tile adopts the menu-bar project switcher styling");
test.assertIncludes(modules, "renderProjectSwitcher(popover)", "the disk tile reuses the menu-bar project renderer");
test.assertIncludes(projectDisk, "renderProjectSwitcher(targetPopover = projectSwitcherPopoverEl)", "the project switcher renderer accepts an adapted host");
test.assertIncludes(modules, 'menuClass: "cloud-model-popover"', "the model tile adopts the menu-bar model styling");
test.assertIncludes(modules, "window.renderCloudModelPopover?.(popover)", "the model tile reuses the menu-bar model renderer");
test.assertIncludes(cloudModel, "targetPopover || document.querySelector(\"#cloud-model-popover\")", "the model renderer keeps its menu-bar host as the default");
test.assertIncludes(multiFinder, "async function setFinderEnvironment", "Finder mode has one shared state transition");
test.assertIncludes(quickDraftHandoff, 'setFinderEnvironment("multifinder"', "Quick Draft uses the same Finder mode transition as the strip");
test.assertIncludes(modules, "subscribe: controlStripSubscribeNotifications", "the notification module follows the canonical unread indicator");
test.assertIncludes(modules, "subscribe: controlStripSubscribeClock", "the clock module follows the system clock cadence");
test.assertIncludes(modules, "formatSystemClockTime()", "the clock module uses the menu clock formatter");
test.assertIncludes(persistence, "function formatSystemClockTime", "menu bar and strip share one clock formatter");

// --- Folder -----------------------------------------------------------------

test.assertIncludes(html, "open-control-strip-modules", "System Folder exposes a Control Strip Modules folder");
test.assertIncludes(html, "five_items", "System Folder counts five items with the folder");
test.assertIncludes(html, 'data-window="controlStripModules"', "the folder opens a Finder window");
test.assertIncludes(html, "control-strip-modules-grid", "the folder window has a module grid");
test.assert(html.match(/data-control-strip-module=/g)?.length >= 10, "the folder window declares every built-in module");
test.assertIncludes(html, 'data-control-strip-module="finderEnvironment"', "the folder exposes the Finder/MultiFinder module");
test.assertIncludes(html, "ten_items", "the module folder count matches its ten built-ins");
test.assertIncludes(html, 'data-control-strip-counterpart="projectDisk"', "Project Hard Disk declares its Control Strip counterpart");
test.assertIncludes(html, 'data-control-strip-counterpart="model"', "the model indicator declares its Control Strip counterpart");
test.assertIncludes(html, 'data-control-strip-counterpart="finderEnvironment"', "Finder/MultiFinder declares its Control Strip counterpart");
test.assertIncludes(html, 'data-control-strip-counterpart="notifications"', "System Messages declares its Control Strip counterpart");
test.assertIncludes(html, 'data-control-strip-counterpart="clock"', "the menu clock declares its Control Strip counterpart");
test.assertIncludes(appBundleSource, "getControlStripModuleFinderItems", "the shared Finder renderer knows the module files");
test.assertIncludes(appBundleSource, 'winName === "controlStripModules"', "the static finder handles the module folder");
test.assertIncludes(windowManager, '"controlStripModules"', "window manager registers the folder window");
test.assertIncludes(actions, '"open-control-strip-modules"', "the folder opens through the action registry");
test.assertIncludes(actions, '"open-control-strip-module"', "module files open through the action registry");
test.assertIncludes(dragDrop, '"control-strip-module"', "module files use the shared drag-and-drop path");
test.assertIncludes(folder, "openOwner", "double-click opens the module's owner window");
test.assertIncludes(folder, "control_strip_module_info", "modules without an owner window still explain themselves");

// --- Soundscape bridge ------------------------------------------------------

test.assertIncludes(soundscape, "function subscribePlayer", "Soundscape exposes a subscription API");
test.assertIncludes(soundscape, "playerListeners.forEach", "a listener error cannot block the others");
test.assertIncludes(soundscape, "notifyPlayerListeners", "state changes notify subscribers");
test.assertIncludes(soundscape, "function ensureRuntime", "the strip can run the Soundscape adapter without attach()");
test.assertNotMatches(soundscape, /classList\.contains\("is-hidden"\)[^\n]*systemRequestInFlight/, "system music sync no longer depends on the window being visible");

// --- Balloon Help ----------------------------------------------------------

test.assertIncludes(module, "balloon_${descriptor.labelKey}", "modules carry Balloon Help, not only a tooltip");
test.assertMatches(zh, /balloon_control_strip_volume:[^\n]*应用音量|control_strip_volume: "应用音量"/,
  "the volume module never passes itself off as system volume");
test.assertIncludes(zh, 'control_strip_label: "控制条"', "Chinese UI uses the localized Control Strip brand name");
test.assertIncludes(zh, 'control_strip_collapse: "收起控制条"', "the collapse affordance is localized in Chinese");
for (const key of [
  "balloon_control_strip_soundscape",
  "balloon_control_strip_project_disk",
  "balloon_control_strip_model",
  "balloon_control_strip_finder_environment",
  "balloon_control_strip_notifications",
  "balloon_control_strip_clock",
  "balloon_control_strip_writing_bell",
  "balloon_control_strip_volume",
]) {
  test.assertIncludes(en, `${key}:`, `English Balloon Help exists for ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese Balloon Help exists for ${key}`);
}
for (const retired of ["network", "context", "indexing", "long_tasks", "output_queue"]) {
  test.assertNotIncludes(en, `balloon_control_strip_${retired}:`, `retired ${retired} module help is removed`);
  test.assertNotIncludes(zh, `balloon_control_strip_${retired}:`, `retired ${retired} module help is removed in Chinese`);
}

// --- Geometry, scroll, and collapse ----------------------------------------

test.assertNotMatches(stripCss, /\.control-strip\.is-collapsed\s*\{[^}]*\bwidth:/,
  "the collapsed strip keeps its width, so no layout is animated");
test.assertIncludes(module, "syncStripToolbarStops", "the toolbar is one tab stop walked with the arrow keys");
test.assertIncludes(module, "moveStripToolbarFocus", "arrow keys move module focus");
test.assertIncludes(module, "onHandleKeydown", "the handle has keyboard alternatives for resize and move");
test.assertIncludes(module, "scrollModuleIntoView", "focused modules scroll into view");
test.assertIncludes(module, 'window.innerHeight - rect.top + 2', "module menus anchor above the movable strip");
test.assertIncludes(stripCss, "--control-strip-menu-bottom", "the menu consumes its runtime strip anchor");
test.assertNotIncludes(stripCss, "aria-live", "no aria-live spam for live counts");

test.assertNotMatches(stripCss, /!important/, "no new !important in the strip stylesheet");
test.assertNotMatches(stripCss, /z-index\s*:\s*[0-9]+/, "no new arbitrary z-index in the strip stylesheet");
test.assertIncludes(foundation, "--control-strip-thickness: var(--system-menu-height)", "the strip and menu bar share one height token");
test.assertIncludes(stripCss, "z-index: var(--z-control-strip)", "the strip consumes its global floating layer");
test.assertIncludes(stripCss, "shape-rendering: crispEdges", "compact module icons keep crisp pixel edges");
test.assertMatches(stripCss, /\.control-strip-module \.sys-icon\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;/s,
  "Liquid Glass does not shrink strip glyphs inside the global icon tile padding");
test.assertIncludes(liquidGlass, "body.use-liquid-glass :is(.menu-bar, .control-strip) .sys-icon", "the late Liquid Glass icon layer preserves the strip's compact glyph reset without duplicating its theme selector");
test.assertIncludes(stripCss, "--system-icon-shape-rendering: crispEdges", "the strip keeps crisp glyphs through the late Liquid Glass SVG rule");
test.assertIncludes(stripCss, ".control-strip-menu.project-switcher-popover", "the shared project menu is sized for the strip host");
test.assertIncludes(stripCss, ".control-strip-menu.cloud-model-popover", "the shared model menu is sized for the strip host");
test.assertMatches(stripCss, /\.control-strip-module \.multifinder-icon\s*\{[^}]*currentColor/s,
  "the Finder mode tile reuses the crisp menu-bar glyph and follows inversion color");
test.assertMatches(stripCss, /\.control-strip-handle::after\s*\{[^}]*currentColor 0 2px/s,
  "the handle grip follows foreground color and stays visible when the tab inverts");

// --- Themes ------------------------------------------------------------------

test.assertNotMatches(liquidGlass, /body\.use-liquid-glass \.control-strip\s*\{/, "the strip material is themed by tokens, not a selector twin");
test.assertIncludes(liquidGlass, "--control-strip-hover-bg", "Liquid Glass uses a light hover material instead of a full black inversion");
test.assertIncludes(liquidGlass, "--control-strip-thickness: var(--menu-bar-height)", "Liquid Glass strip follows its taller menu bar token");
test.assertIncludes(stripCss, "background: var(--control-strip-hover-bg)", "strip hover states consume the owned material token");
test.assertIncludes(foundation, "--z-control-strip", "the floating layer is a named token, not a literal");
test.assertIncludes(persistence, "controlStripCollapsed", "the collapsed state persists in the existing settings record");
test.assertIncludes(module, "renderModuleSettingsList();", "the module list re-renders after the lazy registry populates");
test.assert(zValue(foundation, "--z-control-strip") > zValue(foundation, "--z-window-priority"),
  "the strip floats above windows, as it does in Mac OS 9");
test.assert(zValue(foundation, "--z-control-strip") > zValue(foundation, "--z-window-layer-max"),
  "the strip stays above the window manager's highest dynamic layer");
test.assert(zValue(foundation, "--z-control-strip") > zValue(foundation, "--z-window-pinned"),
  "the strip stays above pinned windows");
test.assert(zValue(foundation, "--z-control-strip") < zValue(foundation, "--z-system-menu"),
  "…but never above the system menu bar");

test.finish();
