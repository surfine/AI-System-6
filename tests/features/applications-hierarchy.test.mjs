// Applications window hierarchy: the root keeps only the apps that explain
// the product line, creative tools move into "Create", and experiments into
// "Extras". One source of truth drives the items, folder labels, path bar,
// and handlers; file behaviors (Alias, Clipping, Stationery, Label, Droplet)
// never appear as top-level applications.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("applications-hierarchy");
const app = read("app.js");
const actions = read("app/core/actions.js");
const windowManager = read("app/core/window-manager.js");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

test.assertIncludes(app, "applicationsFolderPathDefinitions", "the folder hierarchy has one source of truth");
test.assertIncludes(app, '["create", { labelKey: "applications_create"', "the Create folder is declared");
test.assertIncludes(app, '["extras", { labelKey: "applications_extras"', "the Extras folder is declared");
test.assertIncludes(app, "function navigateApplicationsFolderPath", "folder navigation is centralized");
test.assertIncludes(app, "open-applications-folder-path:create", "the Create folder is reachable from the root");
test.assertIncludes(app, "open-applications-folder-path:extras", "the Extras folder is reachable from the root");
test.assertIncludes(actions, "open-applications-folder-path", "the folder navigation action is wired into the registry");

const rootBlock = app.slice(app.indexOf("// Root: high-frequency apps"), app.indexOf("], location);", app.indexOf("// Root: high-frequency apps")));
for (const action of [
  "open-writing-studio",
  "open-assistant",
  "open-reader",
  "open-find-path",
  "open-teachtext",
  "open-scrapbook",
  "open-docmap",
]) {
  test.assertIncludes(rootBlock, `action: "${action}"`, `root keeps ${action}`);
}
for (const action of ["open-rebuild-flow", "play-writing-demo"]) {
  test.assertNotIncludes(rootBlock, `action: "${action}"`, `${action} stays in Extras instead of the root Applications view`);
}
test.assertNotIncludes(rootBlock, "getDropletItems", "Droplets are drop tools, not top-level applications");

const createBlock = app.slice(app.indexOf('applicationsFinderPath === "create"'), app.indexOf("], location);", app.indexOf('applicationsFinderPath === "create"')));
for (const action of ["open-clio-stage", "open-clio-chart", "open-liquid-cover", "open-cmf-studio", "open-soundscape"]) {
  test.assertIncludes(createBlock, `action: "${action}"`, `Create keeps ${action}`);
}

const extrasBlock = app.slice(app.indexOf('applicationsFinderPath === "extras"'), app.indexOf("], location);", app.indexOf('applicationsFinderPath === "extras"')));
for (const action of ["open-endfield-terminal", "open-bureaucracy-meme", "open-time-machine", "open-rebuild-flow", "play-writing-demo"]) {
  test.assertIncludes(extrasBlock, `action: "${action}"`, `Extras keeps ${action}`);
}
// Puzzle and Memory Cards are Desk Accessories: they live in the Apple menu
// (Utility DA), not in the Applications folder's Extras lab.
for (const action of ["open-puzzle", "open-memory-cards"]) {
  test.assertNotIncludes(extrasBlock, `action: "${action}"`, `${action} is a desk accessory, not an Extras application`);
}

test.assertIncludes(translationsEn, "applications_create: \"Create\"", "EN Create folder label");
test.assertIncludes(translationsEn, "applications_extras: \"Extras\"", "EN Extras folder label");
test.assertIncludes(translationsZh, "applications_create:", "zh Create folder label");
test.assertIncludes(translationsZh, "applications_extras:", "zh Extras folder label");

// Browsing into a subfolder has to move the location, not just the contents:
// the window renames itself, the trail gains a level, and the back button
// climbs one folder before it leaves the window (it used to close it).
test.assertIncludes(app, "function applicationsFolderPathTrail", "Applications exposes its folder trail");
test.assertIncludes(app, "function applicationsFolderCurrentLabel", "Applications can name the folder it is showing");
test.assertIncludes(app, 'if (winName === "applications") {', "the reused window renames itself per folder");
test.assertIncludes(windowManager, 'if (windowName === "applications") {', "the breadcrumb builder walks the Applications trail");
test.assertIncludes(windowManager, "applicationsFolderPathTrail", "the breadcrumb reads the same trail app.js defines");
test.assertIncludes(windowManager, 'if (targetWindowName === "applications") {', "a breadcrumb click navigates to an Applications folder");
test.assertIncludes(windowManager, '"parentPath" in definition', "back climbs one folder only when inside one");

// 创作坊 is the Writing Studio, an established product object named in the
// onboarding guide and balloon help. The Create folder must not reuse it, or
// the Applications list shows two identically named rows.
test.assertIncludes(translationsZh, 'applications_create: "创意工具"', "the Create folder has its own zh name");
test.assertNotIncludes(translationsZh, 'applications_create: "创作坊"', "the Create folder does not collide with the Writing Studio");
test.assertIncludes(translationsZh, 'writing_studio: "创作坊"', "the Writing Studio keeps its established name");

test.finish();
