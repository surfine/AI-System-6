// System Help is a utility window that reads like the Finder, not like a
// documentation site: one control strip, a route-led grouped list of objects,
// and a Get Info entry that names where the object sits and what it opens.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("system-help");
const html = read("index.html");
const feature = read("app/features/dictionary-help.js");
const handles = read("app/core/dom-handles.js");
const wireup = read("app/core/wireup.js");
const app = read("app.js");
const dictionary = read("app/data/system-dictionary.js");
const surfaces = read("styles/30-surfaces.css");
const foundation = read("styles/00-foundation.css");
const liquid = read("styles/70-liquid-glass.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// One control strip. The closed set of groups uses the System 6 select
// harness; the former chip grid wrapped to a second row and read as web UI.
test.assertIncludes(html, 'class="system-help-control-row"', "search and group menu share one control strip");
test.assertMatches(html, /system-help-control-row[\s\S]*?<select id="system-help-group"/, "the group filter is a System 6 select, not a row of chips");
test.assertIncludes(html, '<div class="select-wrap"><select id="system-help-group"', "the group menu uses the shared select harness");
test.assertNotIncludes(html, 'id="system-help-categories"', "the wrapping category chip grid is gone");
test.assertNotIncludes(surfaces, ".system-help-categories", "no styles are left for the retired chip grid");
test.assertIncludes(feature, "refreshSystemSelectControl(systemHelpGroupSelect)", "repopulating the options refreshes the visible System 6 control");

// The list is a Finder list view: grouped, one line per object, with the
// object's own icon.
test.assertIncludes(feature, 'const systemHelpGroupOrder = ["route", "tools", "model", "desktop", "concept"]', "groups read in route-first order");
test.assertMatches(feature, /function orderedSystemHelpEntries[\s\S]*routeStop/, "the writing route reads in route order, not authored order");
test.assertIncludes(feature, 'heading.className = "system-help-group"', "each group prints one heading row");
test.assertIncludes(feature, 'renderSystemIcon(systemHelpEntryIcon(entry), { size: "help-row" })', "every row shows the object's own system icon");
test.assertMatches(surfaces, /\.system-help-list button \{[\s\S]*grid-template-columns: var\(--system-help-row-icon-size\)/, "rows are one line: icon, name, second name");
test.assertMatches(surfaces, /\.system-help-list button\.is-selected \.sys-icon \{[\s\S]*--help-row-selected-fg/, "a selected row inverts its 1-bit art instead of swapping icons");

// The entry is a Get Info window, not a card.
test.assertIncludes(feature, 'class="system-help-head"', "the object identifies itself with icon and name");
test.assertIncludes(feature, 'class="system-help-info"', "labelled rows replace the stacked paragraphs");
test.assertMatches(feature, /function systemHelpRouteRibbon[\s\S]*is-current/, "route objects show where they sit on the writing route");
test.assertIncludes(feature, 'const routeRibbon = entry.category === "route"', "the route line appears for route objects only");
test.assertMatches(surfaces, /\.system-help-card \{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto/, "the header and the action row stay put while the rows scroll");

// Actions belong to the object; System Help never offers to open itself.
test.assertIncludes(feature, 'entry.action === "open-system-help" ? "" : systemHelpActionLabel(entry)', "System Help drops the self-referential open action");
test.assertMatches(feature, /function systemHelpActionLabel[\s\S]*actionLabelZh[\s\S]*entry\.termZh[\s\S]*system_help_open_feature/, "an entry may name its own verb and Chinese actions use the Chinese object name");
test.assertIncludes(dictionary, 'actionLabelZh: "插入文件软盘"', "a floppy is inserted, not opened");

// The data carries the grouping, the icons, and the route.
test.assertNotIncludes(dictionary, 'category: "help"', "the seven old categories are retired");
test.assertNotIncludes(dictionary, 'category: "assistant"', "the seven old categories are retired");
test.assertNotIncludes(en, "system_help_category_", "no translation key survives for the retired categories");
test.assertNotIncludes(zh, "system_help_category_", "no translation key survives for the retired categories");
for (const stop of [
  'id: "project-disk"',
  'id: "file-disk"',
  'id: "question-sheet"',
  'id: "outline"',
  'id: "section-drafts"',
  'id: "teachtext"',
  'id: "review-desk"',
  'id: "project-cd"',
]) {
  test.assertIncludes(dictionary, stop, `the route entry ${stop} exists`);
}
test.assertMatches(dictionary, /id: "review-desk",[\s\S]{0,260}?category: "route",[\s\S]{0,180}?routeStop: 7/, "Review Desk owns route stop 7");
test.assertMatches(dictionary, /id: "claim-check",[\s\S]{0,260}?category: "tools"/, "Fact Check remains a summoned Review Desk tool");
test.assertMatches(dictionary, /id: "teachtext",[\s\S]{0,180}?term: "Manuscript"[\s\S]{0,180}?termZh: "正文"/, "the route names the Manuscript while TeachText remains its application id");
for (const stop of [1, 2, 3, 4, 5, 6, 7, 8]) {
  test.assertIncludes(dictionary, `routeStop: ${stop},`, `route stop ${stop} is numbered`);
}
test.assertMatches(dictionary, /term: "Scrapbook",[\s\S]{0,400}?termZh: "Scrapbook"/, "Scrapbook stays a brand name in Chinese");
test.assertMatches(dictionary, /term: "Question Sheet",[\s\S]{0,400}?termZh: "问题单"/, "the Chinese name matches the product naming table");
test.assertMatches(dictionary, /term: "Section Drafts",[\s\S]{0,400}?termZh: "章节草稿"/, "the Chinese name matches the product naming table");
for (const helpId of ["control-strip", "menu-bar-extras", "system-messages", "system-clock", "system-status"]) {
  test.assertIncludes(dictionary, `id: "${helpId}"`, `System Help documents ${helpId}`);
}
test.assertIncludes(dictionary, 'termZh: "气球帮助"', "System Help uses the product's Chinese Balloon Help name");
test.assertIncludes(dictionary, 'id: "image-prompt-studio"', "System Help documents the Image Prompt Studio tool");
test.assertIncludes(dictionary, 'termZh: "图片提示词工作室"', "System Help uses the product's Chinese Image Prompt Studio name");
for (const helpId of ["quick-draft", "workspace-profiles", "working-session", "system-integrity", "provisional-ai-output"]) {
  test.assertIncludes(dictionary, `id: "${helpId}"`, `System Help documents ${helpId}`);
}
test.assertIncludes(dictionary, "Project Hard Disk, model, and System Messages", "System Help scopes mutual exclusion to the three duplicated controls");
test.assertIncludes(dictionary, "both remain in the menu bar", "System Help preserves the MultiFinder and clock exceptions");
test.assertIncludes(dictionary, "share the same unread count", "System Help keeps System Messages tied to one source");
test.assertIncludes(dictionary, "both use one time source", "System Help keeps the clock tied to one source");
test.assertIncludes(feature, 'currentLanguage === "zh" || detectDictionaryTermLanguage(alias) !== "zh"', "aliases stay language-matched with the desk");

// Wiring and handles.
test.assertIncludes(handles, 'const systemHelpGroupSelect = document.querySelector("#system-help-group")', "the group menu has a DOM handle");
test.assertIncludes(handles, 'const systemHelpScopeEl = document.querySelector("#system-help-scope")', "the details bar scope has a DOM handle");
test.assertIncludes(app, "systemHelpGroupSelect,", "app.js destructures the group menu handle");
test.assertIncludes(app, "systemHelpScopeEl,", "app.js destructures the scope handle");
test.assertIncludes(app, 'let selectedSystemHelpGroup = "all"', "the selected group is desktop state, not module state");
test.assertMatches(wireup, /systemHelpGroupSelect\?\.addEventListener\("change"[\s\S]*renderSystemHelp/, "changing the group re-renders through the lazy module");
test.assertIncludes(feature, 't("system_help_searching", query)', "the details bar reports the live search instead of a static label");

// Theme parity through tokens only.
for (const token of [
  "--system-help-row-icon-size",
  "--system-help-group-bg",
  "--system-help-group-border-bottom",
  "--system-help-head-border-bottom",
  "--system-help-group-menu-width",
]) {
  test.assertIncludes(foundation, `${token}:`, `${token} has a Classic default`);
}
test.assertIncludes(liquid, "--system-help-group-bg: var(--glass-reading-surface)", "the sticky group heading stays solid on glass");
test.assertIncludes(liquid, "--system-help-panel-bg: var(--glass-reading-surface)", "both scrollers stay solid on glass");
test.assertIncludes(liquid, "--system-help-row-icon-size: 22px", "solid glass object art gets its two extra pixels through a token");
test.assertNotIncludes(liquid, "body.use-liquid-glass .system-help-list", "Liquid Glass does not fork the System Help list");
test.assertNotIncludes(liquid, "body.use-liquid-glass .system-help-info", "Liquid Glass does not fork the Get Info rows");

// Copy exists in both languages.
for (const key of [
  "system_help_show",
  "system_help_searching",
  "system_help_position",
  "system_help_definition",
  "system_help_group_route",
  "system_help_group_tools",
  "system_help_group_model",
  "system_help_group_desktop",
  "system_help_group_concept",
  "system_help_groups",
]) {
  test.assertIncludes(en, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese copy exists for ${key}`);
}

test.finish();
