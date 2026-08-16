// Public-safe Menu Bar contract: Apple menu, application menus, and keyboard
// shortcut labels come from one declarative registry.

import { createFeatureTest, read } from "../../helpers/feature-test-harness.mjs";

const test = createFeatureTest("public-menu-bar");
const html = read("index.html");
const menus = read("app/data/menus.js");
const actions = read("app/core/actions.js");

test.assertIncludes(html, 'class="menu-bar"', "the menu bar is a system surface");
test.assertIncludes(html, 'class="apple"', "the Apple menu exists");
test.assertIncludes(html, 'id="current-app-menu-label">Finder</strong>', "the Aqua application menu starts with the Finder owner");
test.assertNotIncludes(html, '<strong>AI System 6</strong>', "the Aqua application title is not a hard-coded environment label");
test.assertIncludes(menus, "const menu = (id, labelKey, items", "menus are declared through one factory");
test.assertIncludes(menus, "syncCurrentApplicationMenu(appId);", "application-menu rendering keeps the Mac OS X owner title and verbs synchronized");
test.assertIncludes(menus, "menuItem(", "menu items are declared declaratively");
test.assertIncludes(actions, "syncKeyboardShortcutLabels", "menu shortcut labels resync with the platform");
test.assertIncludes(html, "data-balloon-help", "menu controls carry help labels");

test.finish();
