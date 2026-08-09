// Start Here is a quiet system-owned welcome window. It points to the Apple and
// Special menus, then gives the desktop back. AI setup remains optional and
// delegates to the existing Control Panel.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("start-here-guide");
const actions = read("app/core/actions.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const wireup = read("app/core/wireup.js");
const chatMessages = read("app/core/chat-messages.js");
const workspaceProfile = read("app/core/workspace-profile.js");
const dictionary = read("app/data/system-dictionary.js");
const guide = read("app/features/writer-guide.js");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const windowCss = read("styles/10-windows.css");
const responsiveCss = read("styles/60-responsive.css");
const boot = read("app/core/boot.js");
const windowManager = read("app/core/window-manager.js");
const workingSession = read("app/core/working-session.js");

const guideMarkup = html.match(/<section class="window guide-window[\s\S]*?<section class="window rebuild-flow-window/)?.[0] || "";

test.assertIncludes(desktopRuntime, "if (!guideSeen)", "first launch opens Start Here before normal startup items");
test.assertMatches(desktopRuntime, /if \(!guideSeen\) \{[\s\S]*setWorkspaceProfile\(workspaceProfileDesktop, \{ persist: false \}\)[\s\S]*openWindow\("guide"\)/, "first launch places Start Here on the ordinary Desktop instead of Writing Studio");
test.assertMatches(desktopRuntime, /if \(!guideSeen\) \{[\s\S]*getWindow\("assistant"\)[\s\S]*classList\.add\("is-hidden"\)[\s\S]*openWindow\("guide"\)/, "first launch does not leave ClioTalk open behind Start Here");
test.assertMatches(boot, /const resumedWorkingSession = guideSeen[\s\S]*if \(!guideSeen\) \{[\s\S]*openStartupItems\(\)/, "unfinished OOBE skips stale working-session restoration");
test.assertIncludes(guideMarkup, 'id="guide-welcome-step"', "OOBE has one welcome surface");
test.assertMatches(guideMarkup, /<div class="title-bar">\s*<button class="close-box"[^>]*><\/button>\s*<h2 id="guide-title"[\s\S]*?<\/h2>\s*<\/div>/, "Start Here uses the ordinary close-title structure for a fixed system window");
test.assertNotMatches(windowCss, /\.guide-window[^,{]*\.title-bar/, "Start Here does not redraw or override the shared title bar");
test.assertNotIncludes(guideMarkup, "resize-box", "Start Here does not claim the Zoom control reserved for full application windows");
test.assertMatches(guideMarkup, /class="close-box"[^>]*tabindex="-1"/, "the DA close box does not enter the two-action keyboard loop");
test.assertIncludes(guideMarkup, 'data-i18n="guide_welcome_heading"', "the welcome states the time-travel premise");
test.assertIncludes(guideMarkup, 'data-i18n="guide_welcome_body"', "the welcome leaves two lightweight menu clues");
test.assertIncludes(guideMarkup, 'class="btn default" type="button" data-action="guide-start-quick-draft" data-i18n="guide_short_draft" aria-keyshortcuts="Enter"', "the shortest success path is the Return-key default action");
test.assertIncludes(guideMarkup, 'data-action="guide-open-model-settings"', "AI setup remains a secondary action");
test.assertNotIncludes(guideMarkup, 'data-action="open-github-repo"', "first success is not displaced by a source-code link");
test.assertIncludes(actions, '"open-github-repo": () => window.open("https://github.com/surfine/AI-System-6"', "Start Here GitHub action is centrally registered and opens the public source snapshot");
test.assertMatches(responsiveCss, /\.guide-window\.is-mobile-system-page[\s\S]*\.button-row[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "mobile keeps the Start Here button group in two rows of two");
test.assertNotIncludes(guideMarkup, "guide_ai_later", "AI guidance is folded into the single short paragraph");
test.assertNotIncludes(guideMarkup, "guide-cloud-key", "OOBE does not duplicate the cloud credential form");
test.assertNotIncludes(guideMarkup, "data-guide-source", "OOBE does not ask the user to choose a model source");
test.assertIncludes(guideMarkup, 'data-action="guide-start-route"', "the long-project route is explicit and secondary to Draft Desk");
test.assertNotIncludes(guideMarkup, "play-writing-demo", "OOBE does not launch the live demo");
test.assertNotIncludes(guideMarkup, "guide-open-cliotalk", "OOBE does not push the user into chat");

test.assertMatches(guide, /async function dismissGuide\(\)[\s\S]*guideSeen = true;[\s\S]*await closeWindow\("guide"\);[\s\S]*saveDeskState\(\);/, "Start Exploring persists completion and closes OOBE");
test.assertMatches(guide, /function openGuideModelSettings\(\)[\s\S]*guideSeen = true;[\s\S]*closeWindow\("guide"\);[\s\S]*openModelSettings\(\);[\s\S]*saveDeskState\(\);/, "Connect AI completes OOBE and delegates to model settings");
test.assertMatches(guide, /function openModelSettings\(\)[\s\S]*openWindow\("control"\);[\s\S]*setControlTab\(\);/, "model setup reuses the existing Control Panel");
test.assertMatches(guide, /function syncGuideWelcomeState[\s\S]*guide_welcome_body_connected[\s\S]*guide_ai_settings[\s\S]*defaultButton\.focus/, "reopened OOBE reflects model state and focuses its default action");
test.assertMatches(guide, /function initializeGuideOobe[\s\S]*event\.key === "Enter"[\s\S]*startGuidedQuickDraft\(\)[\s\S]*event\.key === "Escape"[\s\S]*dismissGuide\(\)[\s\S]*event\.key !== "Tab"/, "Return starts the short-draft path while Escape dismisses OOBE");
test.assertMatches(wireup, /win\.dataset\.window === "guide"[\s\S]*await dismissGuide\(\)/, "the close box completes OOBE instead of leaving it pending");
test.assertIncludes(chatMessages, 'typeof syncGuideWelcomeState === "function"', "model connection changes refresh an open Start Here window in place");
test.assertIncludes(actions, '"guide-open-model-settings": openGuideModelSettings', "the welcome action is centrally registered");
test.assertNotIncludes(guide, "localStorage", "OOBE does not introduce another persistence boundary");
test.assertMatches(windowCss, /\.guide-window \{[\s\S]*left: 50%;[\s\S]*top: 50%;[\s\S]*transform: translate\(-50%, -50%\);/, "Start Here is centered on the desktop");
test.assertIncludes(windowManager, 'const centeredSystemWindowNames = new Set(["about", "guide"])', "reopening Start Here discards stale saved coordinates and recenters it");
test.assertMatches(workingSession, /applyWindowSessionFrame\(win, entry\.frame \|\| \{\}\);[\s\S]*isCenteredSystemWindow\(win\)[\s\S]*placeCenteredSystemWindow\(win\)/, "working-session restore cannot reapply stale coordinates after Start Here is centered");
test.assertIncludes(workingSession, 'const workingSessionExcludedWindowNames = new Set(["about", "saveChat", "guide"])', "Start Here is a system OOBE, not recoverable work-session content");
test.assertMatches(workingSession, /visibleWindows = windows[\s\S]*!workingSessionExcludedWindowNames\.has\(entry\.name\)/, "legacy snapshots cannot reopen Start Here after OOBE completion");
test.assertMatches(responsiveCss, /\.guide-window\.is-mobile-system-page[\s\S]*inset: auto;[\s\S]*top: 50%;[\s\S]*transform: translate\(-50%, -50%\);/, "mobile keeps Start Here as a centered floating window so the desktop remains visible");
test.assertMatches(responsiveCss, /\.guide-window\.is-mobile-system-page[\s\S]*border-radius: var\(--window-radius, 0\);/, "mobile restores Liquid Glass window corners while Classic remains square");

for (const key of ["guide_welcome_heading", "guide_welcome_body", "guide_welcome_body_connected", "guide_connect_ai", "guide_ai_settings", "guide_short_draft", "guide_long_project", "guide_continue_project"]) {
  test.assertIncludes(en, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese copy exists for ${key}`);
}
test.assertIncludes(en, "Quick Draft turns an idea or material into a short piece. Writing Studio handles research, structure, sections, and review.", "OOBE distinguishes the short and long writing routes without internal concepts");
test.assertIncludes(zh, "「钟点稿」快速把想法和材料写成一篇稿；「创作坊」用于研究、结构、分段写作和审阅。需要 AI 时再连接。", "Chinese OOBE uses the product names and approved compact copy");
test.assertIncludes(dictionary, "Start Here leaves AI optional", "System Help matches the optional-AI first experience");
test.assertIncludes(dictionary, "开始使用”不会强制连接 AI", "Chinese System Help matches the optional-AI first experience");

// OOBE is owned by the system, not Writing Studio. It remains reachable from
// the Desktop while Writing Studio always opens its own default surface.
test.assertNotMatches(workspaceProfile, /const studioWindowNames = new Set\(\[[^\]]*"guide"/, "Start Here is not a studio-only window");
test.assertNotMatches(workspaceProfile, /const writingStudioOwnedWindowNames = new Set\(\[[^\]]*"guide"/, "Writing Studio does not own OOBE");
test.assertNotIncludes(workspaceProfile, '"open-guide",', "Desktop profile does not block reopening OOBE");
test.assertNotIncludes(workspaceProfile, '"guide-",', "OOBE actions are not classified as studio commands by prefix");
test.assertIncludes(workspaceProfile, "await openWritingStudioDefaultSurface()", "opening Writing Studio never re-enters OOBE");
test.assertIncludes(html, '<button data-action="open-guide" data-i18n="start_here">', "Start Here stays available as a system menu item");

test.finish();
