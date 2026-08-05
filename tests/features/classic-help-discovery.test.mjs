// Classic Mac OS discovery is progressive: OOBE offers two quiet clues,
// startup settings explain Finder versus MultiFinder, and user-activated
// Balloon Help identifies unfamiliar objects without replacing System Help.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("classic-help-discovery");
const html = read("index.html");
const app = read("app.js");
const manifest = read("scripts/runtime-manifest.mjs");
const menus = read("app/data/menus.js");
const actions = read("app/core/actions.js");
const wireup = read("app/core/wireup.js");
const windowManager = read("app/core/window-manager.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const persistence = read("app/core/persistence-status.js");
const boot = read("app/core/boot.js");
const balloon = read("app/core/balloon-help.js");
const guide = read("app/features/writer-guide.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const dictionary = read("app/data/system-dictionary.js");
const foundation = read("styles/00-foundation.css");
const liquid = read("styles/70-liquid-glass.css");

test.assertIncludes(manifest, '"app/core/balloon-help.js"', "Balloon Help loads as a small system runtime, not a separate app");
test.assertIncludes(menus, 'menuItem("toggle-balloon-help", "show_balloon_help")', "Special offers the historical Show Balloons command");
test.assertIncludes(actions, '"toggle-balloon-help": toggleBalloonHelp', "the command reaches the shared Balloon Help mode");
test.assertIncludes(windowManager, '"toggle-balloon-help": true', "the global help command is deliberately available");
test.assertMatches(windowManager, /action === "toggle-balloon-help"[\s\S]*hide_balloon_help[\s\S]*show_balloon_help/, "the menu switches between Show and Hide wording");

test.assertMatches(html, /id="balloon-help"[^>]*popover="manual"/, "one system-owned tooltip can enter the browser top layer above modal dialogs");
test.assertIncludes(html, 'data-balloon-help="balloon_multifinder_switcher"', "the MultiFinder application switcher can identify itself");
test.assertIncludes(html, 'data-balloon-help-disabled="balloon_clio_send_disabled"', "disabled AI controls can explain why they are unavailable");
test.assertMatches(balloon, /function balloonHelpKeyFor\(target\)[\s\S]*balloonHelpDisabled/, "balloon copy follows the target's live availability state");
test.assertMatches(balloon, /pointerover[\s\S]*focusin[\s\S]*pointerdown/, "pointer, keyboard, and explicit touch help are supported");
test.assertMatches(balloon, /showPopover[\s\S]*positionBalloonHelp/, "showing a balloon promotes it above dialog top layers before positioning it");
test.assertIncludes(balloon, 'matches?.(":popover-open")', "hiding a balloon also removes it from the browser top layer");
test.assertIncludes(balloon, 'event.pointerType !== "touch"', "touch inspection is distinct from pointer hover");
test.assertMatches(balloon, /if \(!target\.closest\("\.menu-bar"\)\)[\s\S]*preventDefault\(\)/, "touch help inspects desktop objects without activating them while keeping the menu available");
test.assertIncludes(balloon, 'const BALLOON_HELP_STORAGE_KEY', "the user's Balloon Help choice persists across sessions");
test.assertIncludes(balloon, 'window.matchMedia("(hover: hover)")', "the discoverable default applies to hover-capable devices only");
test.assertIncludes(balloon, "balloonHelpTouchedInspect", "the hover default never arms touch inspect mode");

test.assertIncludes(html, 'id="startup-environment-help"', "startup settings contain one concise environment explanation");
test.assertIncludes(desktopRuntime, 't("startup_environment_explanation")', "the startup choice explains both environments before the user changes it");
test.assertIncludes(en, "Finder uses one application at a time. MultiFinder keeps several applications open", "English startup copy compares both task models");
test.assertIncludes(zh, "Finder 一次使用一个应用。MultiFinder 让多个应用保持打开，并从菜单栏右侧切换。", "Chinese startup copy uses the approved compact comparison");
test.assertIncludes(zh, "MultiFinder 已开启。可从菜单栏右侧切换正在运行的应用。", "the one-time switcher clue uses the approved status feedback");
test.assertMatches(desktopRuntime, /multiFinderOnlyOption\.dataset\.balloonHelp = "balloon_startup_multifinder_only"[\s\S]*aria-disabled[\s\S]*delete multiFinderOnlyOption\.dataset\.balloonHelp/, "Finder-only startup choices explain their MultiFinder requirement only while disabled");
test.assertMatches(balloon, /function syncWindowBalloonHelpTargets[\s\S]*balloon_windowshade[\s\S]*balloon_zoom_box[\s\S]*balloon_grow_box/, "WindowShade, Zoom, and grow keep distinct help semantics");
test.assertMatches(balloon, /function disabledMenuBalloonHelpKey[\s\S]*balloon_disabled_menu_project[\s\S]*balloon_disabled_menu_selection[\s\S]*balloon_disabled_menu_context/, "disabled menu commands receive a concise reason instead of repeating their label");
test.assertIncludes(windowManager, "syncDisabledMenuBalloonHelp()", "menu availability refreshes disabled-command help at the same time");
test.assertIncludes(wireup, "syncWindowBalloonHelpTargets()", "window control help is installed after native grow boxes exist");
test.assertIncludes(app, "let multiFinderSwitcherHintSeen = false", "the post-enable switcher clue has a one-time state");
test.assertIncludes(persistence, "multiFinderSwitcherHintSeen,", "the one-time MultiFinder clue uses the existing settings record");
test.assertIncludes(persistence, "settings.multiFinderSwitcherHintSeen", "the one-time clue restores without a new storage boundary");
test.assertMatches(desktopRuntime, /nextEnvironment === "multifinder"[\s\S]*multiFinderSwitcherHintSeen = false/, "choosing MultiFinder arms its switcher clue");
test.assertIncludes(boot, "revealMultiFinderSwitcherHint()", "the clue appears only after the desktop finishes booting");
test.assertMatches(guide, /function dismissGuide\(\)[\s\S]*requestAnimationFrame\(\(\) => revealMultiFinderSwitcherHint\(\)\)/, "entering the desktop can reveal an already-enabled MultiFinder switcher without another restart");
test.assertMatches(balloon, /function revealMultiFinderSwitcherHint\(\)[\s\S]*!guideSeen[\s\S]*isMultiFinderMode\(\)[\s\S]*multifinder_switcher_discovery/, "the switcher clue waits for completed OOBE and an active MultiFinder environment");

for (const key of [
  "show_balloon_help",
  "hide_balloon_help",
  "balloon_multifinder_switcher",
  "balloon_clio_send_disabled",
  "startup_environment_explanation",
  "multifinder_switcher_discovery",
  "balloon_startup_multifinder_only",
  "balloon_zoom_box",
  "balloon_grow_box",
  "balloon_windowshade",
  "balloon_text_disk",
  "balloon_project_cd",
  "balloon_question_sheet",
  "balloon_review_desk",
  "balloon_ask_bar",
  "balloon_cloud_status",
  "balloon_time_machine_archive",
  "balloon_docmap_layout",
  "balloon_bureaucracy_download_disabled",
  "balloon_reader_open_clio_stage_disabled",
  "balloon_docmap_save_disabled",
  "balloon_disabled_menu_selection",
  "balloon_disabled_menu_project",
  "balloon_disabled_menu_context",
]) {
  test.assertIncludes(en, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese copy exists for ${key}`);
}

test.assertIncludes(dictionary, 'id: "balloon-help"', "System Help documents the optional Balloon Help mode");
test.assertIncludes(dictionary, "adapted from System 7", "Help records Balloon Help's actual historical source");
test.assertIncludes(dictionary, "points to the Apple and Special menus", "System Help matches the current minimal OOBE");

test.assertMatches(html, /<header class="menu-bar"[\s\S]*id="balloon-help"[\s\S]*<\/header>/, "Balloon Help inherits the existing system menu layer instead of adding z-index debt");
test.assertMatches(foundation, /\.balloon-help \{[\s\S]*var\(--balloon-help-bg\)/, "Classic uses the shared system balloon geometry");
test.assertMatches(foundation, /\.balloon-help \{[\s\S]*inset: auto;[\s\S]*margin: 0;/, "the top-layer balloon keeps its measured viewport position instead of popover auto-centering");
test.assertMatches(foundation, /\.menu-sub-popover,\s*\.balloon-help \{\s*z-index: var\(--z-system-menu-subpopover\)/, "balloons stay readable above open menus by sharing an existing system layer");
test.assertIncludes(foundation, "body.is-balloon-help [data-balloon-help]", "help mode gives eligible objects a visible pointer affordance");
test.assertIncludes(liquid, "--balloon-help-radius: 18px", "Liquid Glass changes balloon material through tokens");
test.assertNotIncludes(liquid, "body.use-liquid-glass .balloon-help", "Liquid Glass does not fork the Balloon Help DOM or selector");

test.finish();
