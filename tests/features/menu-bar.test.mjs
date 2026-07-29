import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import vm from "node:vm";

const test = createFeatureTest("menu-bar");
const html = read("index.html");
const menus = read("app/data/menus.js");
const manifest = read("scripts/runtime-manifest.mjs");
const multiFinder = read("app/core/multi-finder.js");
const windows = read("app/core/window-manager.js");
const actions = read("app/core/actions.js");
const responsive = read("styles/60-responsive.css");
const foundation = read("styles/00-foundation.css");
const liquid = read("styles/70-liquid-glass.css");
const native = read("native/Sources/AISystemMacApp/main.swift");
const menuContext = { document: {}, activeAppId: "finder" };
vm.runInNewContext(`${menus}\nglobalThis.__menuSets = applicationMenuSets;`, menuContext);
const menuSets = menuContext.__menuSets;
const menuActions = [...menus.matchAll(/menuItem\("([^"]+)"/g)].map((match) => match[1]);

test.assertIncludes(manifest, '"app/data/menus.js"', "menu data loads before the application runtime");
test.assertIncludes(html, 'id="app-menu-slot"', "system chrome keeps a stable application-menu insertion point");
test.assertNotIncludes(html, 'data-i18n="menu_file"', "application menus are no longer hard-coded in index.html");
test.assertNotIncludes(html, 'id="foreground-app-label"', "Finder mode does not repeat the current application name at the right edge");
test.assertNotIncludes(multiFinder, 'querySelector("#foreground-app-label")', "foreground changes do not render a redundant application label");
test.assertIncludes(menus, "const applicationMenuSets = Object.freeze({", "applications declare menu sets as data");
test.assertIncludes(menus, 'if (appId === "writingStudio") return "teachText"', "Writing Studio resolves to the TeachText menu set");
test.assertNotIncludes(menus, "quickDraft: teachTextMenus", "Quick Draft inherits menus through Writing Studio ownership");
test.assertIncludes(multiFinder, 'var menuOwnerAppId = "finder"', "desk accessories retain a separate host-menu owner");
test.assertIncludes(menus, "const systemSpecialItems = [", "Special has one shared system section");
test.assertIncludes(menus, 'menuItem("empty-trash", "empty_trash")', "Finder retains its trash command");
test.assertIncludes(menus, 'menuItem("start-new-clio-chat", "new_conversation")', "ClioTalk owns its explicit new-conversation command");
test.assertIncludes(windows, "renderAppMenuBar(menuOwnerAppId || activeAppId)", "menu state renders the host application menu");
test.assertIncludes(multiFinder, "renderAppMenuBar(menuOwnerAppId)", "desktop and MultiFinder foreground changes share host-menu resolution");
test.assertIncludes(menus, 'submenu("writing_tools", writingTools)', "Writing Tools lives inside Edit instead of taking a top-level menu");
test.assertNotIncludes(menus, 'submenu("selection_services"', "Selection Services stays in the Edit popover instead of becoming a third-level menu");
test.assert(
  Object.values(menuSets).every((definitions) => definitions
    .flatMap((definition) => definition.items)
    .filter((item) => item.type === "submenu")
    .every((item) => item.labelKey !== "selection_services")),
  "no application nests Selection Services"
);
test.assert(
  Object.values(menuSets).every((definitions) => definitions
    .flatMap((definition) => definition.items)
    .filter((item) => item.type === "submenu")
    .every((item) => item.items.length > 0 && item.items.every((child) => child.type !== "submenu"))),
  "every third-level menu is populated and nesting stops after one submenu layer"
);
test.assertIncludes(menus, "bureaucracyMeme: bureaucracyMemeMenus", "Bureaucracy Meme has an independent application menu set");
test.assertNotIncludes(menus, "isPortraitDocumentFlow", "menu semantics do not branch on screen size");
test.assertNotIncludes(menus, "isMultiFinderMode", "menu semantics do not branch on task model");
test.assertIncludes(responsive, "overflow: visible", "mobile menu popovers are not clipped by the menu bar");
test.assertNotIncludes(responsive, "overflow-x: auto", "the mobile menu bar does not turn into a clipping scroll container");
test.assertIncludes(responsive, "border-left: 1px solid var(--menu-divider-color)", "mobile third-level menus expose an indented hierarchy line");
test.assertIncludes(responsive, "--menu-item-fg: var(--menu-item-active-fg)", "open and hovered mobile submenu items use the active foreground");
test.assertIncludes(foundation, "left: 100%", "desktop third-level menus fly out to the right");
test.assertIncludes(liquid, "--menu-shortcut-color: currentColor", "Liquid Glass shortcut labels follow the hovered menu-item foreground");
test.assertIncludes(liquid, "--menu-item-active-fg: #ffffff", "Liquid Glass hovered menu items use a clear light foreground");
test.assertIncludes(actions, 'activeAppId === "writingStudio" ? "teachText"', "shortcut dispatch normalizes Writing Studio ownership");
test.assertIncludes(actions, "function getApplicationCommandRegistry()", "menu handlers, availability and shortcuts resolve through one command registry");
test.assertIncludes(native, "nativeMenus(for app: MultiFinderApp", "native rebuilds menus from the same application ownership model");
test.assertIncludes(native, "refreshForegroundApplicationMenu()", "native foreground activation refreshes the menu bar");
test.assert(
  Object.values(menuSets).every((definitions) => definitions.length <= 4),
  "every application has at most four top-level menus beyond Apple"
);
test.assert(
  Object.values(menuSets).every((definitions) => definitions
    .filter((definition) => definition.id !== "edit")
    .every((definition) => !definition.items.some((item) => item.type === "submenu" && item.labelKey === "writing_tools"))),
  "Writing Tools exists only inside Edit"
);
test.assert(
  [...new Set(menuActions)].every((action) => actions.includes(`"${action}":`)),
  "every clickable application-menu item has a real action handler"
);
const zToken = (name) => Number(foundation.match(new RegExp(`--${name}:\\s*(\\d+)`))?.[1]);
test.assert(
  zToken("z-window-priority") < zToken("z-system-menu")
    && zToken("z-system-menu") < zToken("z-system-menu-popover")
    && zToken("z-system-menu-popover") < zToken("z-system-menu-subpopover")
    && zToken("z-system-menu-subpopover") < zToken("z-system-modal-scrim")
    && zToken("z-system-modal-scrim") < zToken("z-system-modal"),
  "z-order keeps menus above windows and system modals above menus"
);

test.finish();
