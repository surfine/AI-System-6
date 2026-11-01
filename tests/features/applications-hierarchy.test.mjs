// Applications window hierarchy: the root keeps the seven writing-route apps,
// creative tools (and Text Lightroom) move into "Create", and everything for
// after work (the old Extras and Games, 潮汐信笺 among them) into "After Hours".
// One source of truth drives the items, folder labels, path bar,
// and handlers; file behaviors (Alias, Clipping, Stationery, Label, Droplet)
// never appear as top-level applications.

import { admittedApplicationGroup, createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("applications-hierarchy");
const app = read("app.js");
const actions = read("app/core/actions.js");
const windowManager = read("app/core/window-manager.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");
const admissions = read("app/core/app-admissions.js");

// The rows themselves moved into the admission table (one line per window now
// declares that it is listed, where, and under which label), so "this folder
// keeps this action" is read from there, and each branch is asserted to draw
// from the table rather than from a second copy.
const listedGroup = admittedApplicationGroup;
for (const [folder, group] of [["create", "create"], ["After Hours", "extras"], ["After Hours", "games"], ["root", "root"]]) {
  test.assertIncludes(app, `applicationItems?.("${group}")`, `the ${folder} branch draws its rows from the admission table`);
}

test.assertIncludes(app, "applicationsFolderPathDefinitions", "the folder hierarchy has one source of truth");
test.assertIncludes(app, '["create", { labelKey: "applications_create"', "the Create folder is declared");
test.assertIncludes(app, '["afterHours", { labelKey: "applications_after_hours"', "the After Hours folder is declared");
test.assertIncludes(app, 'extras: "afterHours", games: "afterHours"', "the old Extras and Games paths still land in After Hours");
test.assertIncludes(app, "function navigateApplicationsFolderPath", "folder navigation is centralized");
test.assertIncludes(app, "open-applications-folder-path:create", "the Create folder is reachable from the root");
test.assertIncludes(app, "open-applications-folder-path:afterHours", "the After Hours folder is reachable from the root");
test.assertNotIncludes(app, "open-applications-folder-path:games", "Games is no longer a folder of its own at the root");
test.assertIncludes(actions, "open-applications-folder-path", "the folder navigation action is wired into the registry");

const rootBlock = app.slice(app.indexOf("// Root: the seven writing-route apps"), app.indexOf("], location);", app.indexOf("// Root: the seven writing-route apps")));
// The seven: ClioTalk, TeachText, Reader, Scrapbook, DocMap, Searcher, Quick Draft
// (Writing Studio is the desktop profile's own row, not an eighth app).
for (const action of [
  "open-writing-studio",
  "open-quick-draft",
  "open-assistant",
  "open-reader",
  "open-find-path",
  "open-teachtext",
  "open-scrapbook",
  "open-docmap",
]) {
  const fromTable = listedGroup(action) === "root";
  test.assert(
    fromTable || rootBlock.includes(`action: "${action}"`),
    `root keeps ${action} (${fromTable ? "from the admission table" : "in its own markup"})`,
  );
}
test.assert(listedGroup("open-aaron-blog") === "extras", "潮汐信笺 is in After Hours, not at the root");
test.assertIncludes(admissions, 'appAction: "open-lightroom", applicationGroup: "create"', "Text Lightroom is a Create app with its own row, not a Quick Draft row");
test.assertNotIncludes(rootBlock, "open-lightroom", "the root does not list Text Lightroom");
for (const action of ["open-rebuild-flow", "play-writing-demo"]) {
  test.assertNotIncludes(rootBlock, `action: "${action}"`, `${action} stays in Extras instead of the root Applications view`);
}
test.assertNotIncludes(rootBlock, "getDropletItems", "Droplets are drop tools, not top-level applications");

const createBlock = app.slice(app.indexOf('applicationsFinderPath === "create"'), app.indexOf("], location);", app.indexOf('applicationsFinderPath === "create"')));
for (const action of ["open-clio-stage", "open-clio-chart", "open-liquid-cover", "open-cmf-studio", "open-soundscape"]) {
  test.assert(listedGroup(action) === "create", `Create keeps ${action} (from the admission table)`);
}

const extrasBlock = app.slice(app.indexOf('applicationsFinderPath === "afterHours"'), app.indexOf("], location);", app.indexOf('applicationsFinderPath === "afterHours"')));
test.assertNotIncludes(extrasBlock, 'action: "open-quick-draft"', "Quick Draft is a root application, not an Extras child");
for (const action of ["open-endfield-terminal", "open-bureaucracy-meme", "open-time-machine", "open-rebuild-flow", "play-writing-demo"]) {
  const fromTable = listedGroup(action) === "extras";
  test.assert(
    fromTable || extrasBlock.includes(`action: "${action}"`),
    `Extras keeps ${action} (${fromTable ? "from the admission table" : "in its own markup"})`,
  );
}
// Puzzle and Memory Cards left the Apple menu; After Hours is where they are
// reached now, beside the games.
for (const action of ["open-puzzle", "open-memory-cards"]) {
  test.assertIncludes(extrasBlock, `action: "${action}"`, `${action} is reached from After Hours`);
}
test.assertNotIncludes(read("index.html"), 'data-action="open-puzzle"', "the Apple menu no longer lists Puzzle");
test.assertNotIncludes(read("index.html"), 'data-action="open-memory-cards"', "the Apple menu no longer lists Memory Cards");

test.assertIncludes(translationsEn, "applications_create: \"Create\"", "EN Create folder label");
test.assertIncludes(translationsEn, "applications_after_hours: \"After Hours\"", "EN After Hours folder label");
test.assertIncludes(translationsZh, "applications_create:", "zh Create folder label");
test.assertIncludes(translationsZh, 'applications_after_hours: "下班后"', "zh After Hours folder label");

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

for (const action of [
  "open-writing-studio", "open-quick-draft", "open-assistant", "open-reader",
  "open-find-path", "open-teachtext", "open-scrapbook", "open-docmap",
  "open-clio-stage", "open-clio-chart", "open-liquid-cover", "open-cmf-studio",
  "open-image-prompt-studio", "open-soundscape", "open-endfield-terminal",
  "open-bureaucracy-meme", "open-time-machine", "open-rebuild-flow",
  "play-writing-demo", "play-teaser-demo", "open-micropolis", "open-openttd",
  "open-doom", "open-bonsai-city",
]) {
  test.assertIncludes(app, `"${action}": "app_desc_`, `${action} has one runtime description key`);
}
test.assertIncludes(app, "description: descriptionKey ? t(descriptionKey)", "rendered Finder application items carry localized descriptions");
test.assertIncludes(desktopRuntime, "fileInfoDescriptionEl.textContent = description", "Get Info shows the runtime application description");

// --- One name per object, fewer doors on a new desk (owner rulings 2026-10-31) ---
const html = read("index.html");
const persistence = read("app/core/persistence-status.js");
const en = translationsEn;
const zh = translationsZh;
const names = [
  ["assistant_title", "ClioTalk", "ClioTalk"],
  ["assistant_label", "ClioTalk", "ClioTalk"],
  ["teachtext_label", "TeachText", "稿纸"],
  ["clio_write_label", "ClioWrite", "文稿"],
  ["quick_draft_label", "Quick Draft", "钟点稿"],
  ["lightroom_title", "Text Lightroom", "文字亮室"],
  ["image_manager", "Picture Album", "画片簿"],
  ["context_panel", "Memory Inspector", "记忆边界"],
  ["file_floppy", "File Floppy", "文件软盘"],
  ["find_file", "Find…", "查找…"],
  ["searcher_label", "Searcher", "Searcher 寻源"],
  ["notification_center", "System Messages", "系统消息"],
  ["bureaucracy_meme_label", "Bureaucracy Meme", "官僚梗图"],
  ["applications_after_hours", "After Hours", "下班后"],
  ["accessories_menu", "Accessories", "附件"],
];
for (const [key, english, chinese] of names) {
  test.assertIncludes(en, `${key}: "${english}"`, `${key} reads ${english}`);
  test.assertIncludes(zh, `${key}: "${chinese}"`, `${key} reads ${chinese}`);
}
test.assertNotMatches(zh, /TeachText 文稿|ClioWrite 文稿/, "the two 文稿 are two names no longer");
test.assertNotMatches(`${en}\n${zh}`, /Draft Desk|Image Manager|Context Panel|DAA Meme/, "internal and retired names are not drawn to the writer");

// The Apple menu: five rows, Help and Accessories as submenus, nothing section-labelled.
const appleMenu = html.slice(html.indexOf('class="menu-popover apple-menu-popover"'), html.indexOf('id="apple-multifinder-apps"'));
test.assertIncludes(appleMenu, 'data-i18n="help">Help</button>', "one Help submenu");
test.assertIncludes(appleMenu, 'data-i18n="accessories_menu">Accessories</button>', "one Accessories submenu");
test.assertNotIncludes(appleMenu, "menu-section-label", "the Apple menu has no section labels");
for (const action of ["open-system-help", "replay-clio-introduction", "open-key-caps", "toggle-balloon-help"]) {
  test.assertMatches(appleMenu, new RegExp(`data-i18n="help"[\\s\\S]*data-action="${action}"`), `${action} is reached from Help`);
}

// A new desk keeps seven icons; a desk that existed keeps every one.
test.assertIncludes(html, 'data-open="aaronBlog" data-desk-seed="full"', "潮汐信笺 is a seeded-only icon");
test.assertIncludes(html, 'data-action="open-quick-draft" data-balloon-help="balloon_quick_draft" data-desk-seed="full"', "Quick Draft is a seeded-only icon");
test.assertMatches(persistence, /applyDeskIconSeed\(settings === undefined\)/, "only a desk with no saved settings is new");
test.assertMatches(persistence, /seed = isNewDesk \? "lean" : "full"/, "an existing desk resolves to full");

// Applications root: the seven, then Create and After Hours.
test.assertMatches(app, /applications_create[\s\S]{0,200}applications_after_hours/, "the root ends in Create and After Hours");
test.assertNotIncludes(app, '"applications_games"', "Games and Extras are one folder");


test.finish();
