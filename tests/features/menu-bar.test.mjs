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
const apps = read("styles/50-apps.css");
const liquid = read("styles/70-liquid-glass.css");
const native = read("native/Sources/AISystemMacApp/main.swift");
const nativeMultiFinder = read("native/Sources/AISystemCore/MultiFinderApp.swift");
const nativeMenuBar = read("native/Sources/AISystemDesktop/MenuBarView.swift");
const menuContext = { document: {}, activeAppId: "finder" };
vm.runInNewContext(`${menus}\nglobalThis.__menuSets = applicationMenuSets;`, menuContext);
const menuSets = menuContext.__menuSets;
const menuActions = [...menus.matchAll(/menuItem\("([^"]+)"/g)].map((match) => match[1]);
const menuBarRules = [...responsive.matchAll(/\.menu-bar\s*\{([^}]*)\}/g)].map((match) => match[1]);

test.assertIncludes(manifest, '"app/data/menus.js"', "menu data loads before the application runtime");
test.assertIncludes(html, 'id="app-menu-slot"', "system chrome keeps a stable application-menu insertion point");
test.assertNotIncludes(html, 'data-i18n="menu_file"', "application menus are no longer hard-coded in index.html");
test.assertNotIncludes(html, 'id="foreground-app-label"', "Finder mode does not repeat the current application name at the right edge");
test.assertNotIncludes(multiFinder, 'querySelector("#foreground-app-label")', "foreground changes do not render a redundant application label");
test.assertIncludes(menus, "const applicationMenuSets = Object.freeze({", "applications declare menu sets as data");
test.assertIncludes(menus, 'if (appId === "writingStudio") return "teachText"', "Writing Studio resolves to the TeachText menu set");
test.assertIncludes(menus, "quickDraft: quickDraftMenus", "Quick Draft owns an independent application menu set");
test.assertNotIncludes(menus, "quickDraft: teachTextMenus", "Quick Draft never inherits Writing Studio menus");
test.assertIncludes(multiFinder, 'var menuOwnerAppId = "finder"', "desk accessories retain a separate host-menu owner");
test.assertIncludes(menus, "const systemSpecialItems = [", "Special has one shared system section");
test.assertIncludes(menus, 'menuItem("empty-trash", "empty_trash")', "Finder retains its trash command");
test.assertIncludes(menus, 'menuItem("start-new-clio-chat", "new_conversation", "new-document")', "ClioTalk owns its explicit new-conversation command");
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
test.assert(
  menuBarRules.length > 0 && menuBarRules.every((rule) => !rule.includes("overflow-x: auto")),
  "the mobile menu bar does not turn into a clipping scroll container"
);
test.assertIncludes(responsive, "border-left: 1px solid var(--menu-divider-color)", "mobile third-level menus expose an indented hierarchy line");
test.assertIncludes(responsive, "--menu-item-fg: var(--menu-item-active-fg)", "open and hovered mobile submenu items use the active foreground");
test.assertIncludes(foundation, "left: 100%", "desktop third-level menus fly out to the right");
test.assertIncludes(liquid, "--menu-shortcut-color: currentColor", "Liquid Glass shortcut labels follow the hovered menu-item foreground");
test.assertIncludes(liquid, "--menu-item-active-fg: #ffffff", "Liquid Glass hovered menu items use a clear light foreground");
test.assertIncludes(foundation, "--menu-bar-border: 1px solid var(--ink)", "Classic menu chrome uses a one-pixel bottom rule");
test.assertIncludes(foundation, "--menu-panel-shadow: 1px 1px 0 var(--ink)", "Classic menus use a restrained one-pixel hard shadow");
test.assert(
  menuBarRules.some((rule) => rule.includes("border-bottom: var(--menu-bar-border)"))
    && menuBarRules.every((rule) => !rule.includes("border-bottom: 2px")),
  "Late menu-bar layers preserve the shared one-pixel rule"
);
test.assertNotIncludes(html, "apple-menu-happy-mac", "The Apple menu no longer embeds the startup Happy Mac component");
test.assertMatches(foundation, /\.apple::before,[\s\S]*\.apple::after \{[\s\S]*content: "";[\s\S]*position: absolute;/, "The Apple menu restores the original compact-computer painter");
test.assertMatches(foundation, /\.apple::before \{[\s\S]*width: 2px;[\s\S]*height: 2px;[\s\S]*background: currentColor;[\s\S]*box-shadow:/, "The restored menu glyph keeps its clean 16-pixel currentColor grid");
test.assertMatches(apps, /\.menu-bar \.sys-icon \{[\s\S]*color: inherit;[\s\S]*background: transparent;/, "Menu-bar system icons inherit the button colour so every open menu reverses its glyph");
test.assertMatches(liquid, /body\.use-liquid-glass :is\(\.menu-bar, \.control-strip\) \.sys-icon[\s\S]*color: inherit;[\s\S]*filter: none;/, "Liquid menu glyphs stay monochrome and clean while inheriting active colour through the shared chrome selector");
test.assertMatches(apps, /\.menu-bar \.sys-icon \.sys-icon-liquid \.icon-fill,[\s\S]*fill: none;[\s\S]*stroke: currentColor;/, "Liquid menu fills and accents reverse through the shared menu-icon rule");
test.assertIncludes(foundation, ".multifinder-menu.is-open > .multifinder-button .multifinder-icon", "MultiFinder's glyph reverses even when the menu stays open without focus");
test.assertNotIncludes(foundation, "--apple-menu-happy-mac-scale", "The menu no longer carries Happy Mac scaling state");
test.assertIncludes(liquid, "--menu-panel-shadow: var(--liquid-menu-panel-shadow)", "Liquid Glass owns a softer menu-panel shadow twin");
test.assertNotIncludes(responsive, "box-shadow: var(--system-shadow)", "Late responsive menu rules do not restore the heavier window shadow");
test.assertIncludes(nativeMenuBar, "private static let appleGlyphDots", "The native menu restores the original compact-computer dot grid");
test.assertNotIncludes(nativeMenuBar, "drawLiquidAppleGlyph", "The native Liquid menu no longer substitutes a separate Happy Mac painter");
test.assertIncludes(actions, 'activeAppId === "writingStudio" ? "teachText"', "shortcut dispatch normalizes Writing Studio ownership");
test.assertIncludes(actions, "function getApplicationCommandRegistry()", "menu handlers, availability and shortcuts resolve through one command registry");
test.assertIncludes(native, "nativeMenus(for app: MultiFinderApp", "native rebuilds menus from the same application ownership model");
test.assertIncludes(native, "refreshForegroundApplicationMenu()", "native foreground activation refreshes the menu bar");
test.assertIncludes(nativeMultiFinder, "case finder, quickDraft, teachText", "native MultiFinder recognizes Quick Draft as an application");
test.assertIncludes(nativeMultiFinder, '"quick-draft": .quickDraft', "native Quick Draft no longer resolves to TeachText");
test.assertNotIncludes(native, '.item(L10n.t("quick_draft_label")),\n            .item(L10n.t("question_sheet"))', "native Writing Studio no longer advertises Quick Draft");
test.assertIncludes(native, '.item(L10n.t("enter_writing_studio"))', "native Quick Draft offers the one-way Writing Studio entry");
test.assert(
  Object.values(menuSets).every((definitions) => (
    definitions.filter((definition) => !definition.menuCondition).length <= 4
    && definitions.filter((definition) => definition.menuCondition).length <= 1
  )),
  "every application has at most four stable top-level menus plus one contextual workflow menu"
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
