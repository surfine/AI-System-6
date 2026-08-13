// Start Here is a quiet system-owned setup assistant: what this machine is,
// what it uses for a model, then the desktop back. It never opens the writing
// route for a first-time visitor — that is Writing Studio's job — and the
// shared website model is already connected rather than offered as a form.

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
const cloudModel = read("app/features/cloud-model.js");
const webPlatform = read("app/core/web-platform.js");

for (const id of ["guide-welcome-step", "guide-ai-step", "guide-ready-step"]) {
  test.assertIncludes(guideMarkup, `id="${id}"`, `the setup assistant has the ${id} page`);
}
test.assertIncludes(guide, 'const guideStepIds = ["guide-welcome-step", "guide-ai-step", "guide-ready-step"]', "the assistant moves through what it is, its model, then the desktop");
test.assertIncludes(guideMarkup, 'id="guide-step-counter"', "the assistant says which page the reader is on");
test.assertMatches(guideMarkup, /data-action="guide-back"[\s\S]*data-action="guide-continue"/, "movement is Go Back then Continue, in that order");
test.assertMatches(guideMarkup, /<div class="title-bar">\s*<button class="close-box"[^>]*><\/button>\s*<h2 id="guide-title"[\s\S]*?<\/h2>\s*<\/div>/, "Start Here uses the ordinary close-title structure for a fixed system window");
test.assertNotMatches(windowCss, /\.guide-window[^,{]*\.title-bar/, "Start Here does not redraw or override the shared title bar");
test.assertNotIncludes(guideMarkup, "resize-box", "Start Here does not claim the Zoom control reserved for full application windows");
test.assertMatches(guideMarkup, /class="close-box"[^>]*tabindex="-1"/, "the DA close box does not enter the two-action keyboard loop");
test.assertIncludes(guideMarkup, 'data-i18n="guide_welcome_heading"', "the welcome states the time-travel premise");
test.assertIncludes(guideMarkup, 'data-i18n="guide_welcome_body"', "the welcome says what the machine does before it asks for anything");
for (const key of ["guide_route_step_material", "guide_route_step_question", "guide_route_step_write", "guide_route_step_review"]) {
  test.assertIncludes(guideMarkup, `data-i18n="${key}"`, `the first page shows the route step ${key} as named objects`);
}
test.assertIncludes(guideMarkup, 'class="btn default" type="button" data-action="guide-continue" data-i18n="guide_continue" aria-keyshortcuts="Enter"', "Return moves to the next page, and never straight into a draft");
test.assertNotIncludes(guideMarkup, 'data-action="guide-start-quick-draft"', "OOBE does not open Quick Draft; writing belongs to Writing Studio");
test.assertNotIncludes(guideMarkup, 'data-action="guide-start-route"', "OOBE does not open the writing route for a first-time visitor");
test.assertIncludes(guideMarkup, 'data-action="guide-open-model-settings"', "bringing your own API key stays one click away");
test.assertIncludes(guideMarkup, 'data-action="guide-open-local-ai"', "a model on this machine stays one click away");
test.assertIncludes(guideMarkup, 'data-action="open-project-site"', "the assistant links out to the project site");
test.assertIncludes(guideMarkup, 'data-action="open-github-repo"', "the assistant links out to the public source");
test.assertIncludes(guideMarkup, 'data-action="open-guide-promo"', "the assistant offers the promotional film");
test.assertIncludes(actions, '"open-github-repo": () => window.open("https://github.com/surfine/AI-System-6"', "Start Here GitHub action is centrally registered and opens the public source snapshot");
test.assertIncludes(actions, '"open-project-site": () => window.open("https://aisystem6.pages.dev/"', "the project site action is centrally registered");
test.assertIncludes(actions, '"open-guide-promo": () => window.open("https://www.bilibili.com/video/BV1ht3m6UEDb/"', "the promotional film action is centrally registered");
test.assertMatches(responsiveCss, /\.guide-window\.is-mobile-system-page \.guide-nav \.button-row \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "mobile gives Go Back and Continue equal thumb targets");
test.assertNotIncludes(guideMarkup, "guide_ai_later", "AI guidance is folded into the single short paragraph");
test.assertNotIncludes(guideMarkup, "guide-cloud-key", "OOBE does not duplicate the cloud credential form");
test.assertNotIncludes(guideMarkup, "data-guide-source", "OOBE does not ask the user to choose a model source");
test.assertNotIncludes(guideMarkup, "play-writing-demo", "OOBE does not launch the live demo");
test.assertNotIncludes(guideMarkup, "guide-open-cliotalk", "OOBE does not push the user into chat");

// The public site gives everyone a model with no setup step. BYOK is invited
// by the daily-limit message, not by a form on the first screen.
test.assertMatches(cloudModel, /function enableWebsiteAiByDefault\(\)[\s\S]*publicSharedCloudAvailable[\s\S]*credentialMode: "shared",\n\s*active: true/, "the shared website model is the default connection on a public deployment");
test.assertMatches(cloudModel, /function enableWebsiteAiByDefault\(\)[\s\S]*cloudRuntimeApiKey \|\| cloudConfig\?\.credentialId \|\| cloudConfig\?\.active/, "an own key or an existing connection is never overwritten by the default");
test.assertMatches(cloudModel, /function enableWebsiteAiByDefault\(\)[\s\S]*localModelState\?\.ready \|\| localModelState\?\.loaded/, "a loaded local model is never overwritten by the default");
test.assertIncludes(cloudModel, "async function runCloudStatusCheck()", "the connection check is a named function, not a click handler only");
test.assertMatches(cloudModel, /async function connectWebsiteAi\(\)[\s\S]*const connected = await runCloudStatusCheck\(\);[\s\S]*connected \? "cloud_connected_shared" : "website_ai_unavailable"[\s\S]*return connected;/, "Website AI replaces its connecting message with the settled result instead of leaving a stale progress state");
test.assertIncludes(cloudModel, "window.AISystem6CloudModel = Object.freeze({", "model connection is exposed to the rest of the desk as a named API");
test.assertMatches(guide, /async function connectGuideWebsiteAi\(\)[\s\S]*connected = await connect\(\);[\s\S]*guideAiStatusKey = connected \? "" : "guide_ai_failed"/, "Start Here reports the real connection result, success or failure");
test.assertMatches(guide, /function syncGuideAiStep[\s\S]*cloudCredentialMode\(\) === "shared"[\s\S]*cloud_shared_active_hint/, "a shared connection keeps saying where the text is sent");

// The iPhone has no install prompt to offer, so the steps are written out.
test.assertMatches(webPlatform, /const iosSteps = !standalone && !deferredWebInstallPrompt && isIosWebPlatform\(\);[\s\S]*web_install_ios_steps/, "iOS shows the Share to Home Screen steps without pressing a button first");

test.assertMatches(guide, /async function dismissGuide\(\)[\s\S]*guideSeen = true;[\s\S]*await closeWindow\("guide"\);[\s\S]*saveDeskState\(\);/, "Start Exploring persists completion and closes OOBE");
test.assertMatches(guide, /function openGuideModelSettings\(\)[\s\S]*guideSeen = true;[\s\S]*closeWindow\("guide"\);[\s\S]*openModelSettings\(\);[\s\S]*saveDeskState\(\);/, "Connect AI completes OOBE and delegates to model settings");
test.assertMatches(guide, /function openModelSettings\(\)[\s\S]*openWindow\("control"\);[\s\S]*setControlTab\(\);/, "model setup reuses the existing Control Panel");
test.assertMatches(guide, /function syncGuideWelcomeState[\s\S]*if \(focusDefault\) \{\n\s*guideStepIndex = 0;[\s\S]*guideDefaultActionButton\(guide\)/, "a reopened assistant starts at the first page and focuses its default action");
test.assertMatches(guide, /function syncGuideWelcomeState[\s\S]*applyGuideStepVisibility\(guide\);\n\s*syncGuideAiStep\(guide\);\n\s*syncGuideReadyStep\(guide\);/, "a model connecting refreshes the assistant without moving the page");
test.assertMatches(guide, /function initializeGuideOobe[\s\S]*event\.key === "Enter"[\s\S]*guideDefaultActionButton\(guide\)\?\.click\(\)[\s\S]*event\.key === "Escape"[\s\S]*dismissGuide\(\)[\s\S]*event\.key !== "Tab"/, "Return takes the page's own default action while Escape dismisses OOBE");
test.assertMatches(guide, /async function guideStepContinue\(\)[\s\S]*guideStepIndex < guideStepIds\.length - 1[\s\S]*await dismissGuide\(\);/, "Continue on the last page hands the desktop back");
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

for (const key of [
  "guide_welcome_heading", "guide_welcome_body",
  "guide_route_step_material", "guide_route_step_question", "guide_route_step_write", "guide_route_step_review",
  "guide_ai_heading", "guide_ai_body", "guide_ai_body_local",
  "guide_ai_ready_heading", "guide_ai_ready_body",
  "guide_ai_connecting", "guide_ai_connected", "guide_ai_failed",
  "guide_use_own_key", "guide_ready_heading", "guide_ready_body",
  "guide_back", "guide_continue", "guide_start_using", "guide_step_counter",
  "guide_project_site", "guide_source_code", "guide_promo_short",
  "guide_continue_project",
]) {
  test.assertIncludes(en, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese copy exists for ${key}`);
}
test.assertIncludes(en, "It never speaks for you: your voice, your judgement and your rough edges stay yours.", "the welcome states the charter before any feature");
test.assertIncludes(zh, "它不替你说话：你的语气、你的判断、你那些不圆滑的地方，都留着。", "Chinese welcome states the charter before any feature");
test.assertIncludes(zh, "网站的共享额度默认就给你用着，不注册，不填密钥，没有要设置的东西。", "Chinese copy states that the shared model needs no setup");
test.assertIncludes(zh, "桌面上摆着的都是能打开的东西：写短的用「钟点稿」，做长稿进「创作坊」", "the last page points at the writing objects instead of opening one");
test.assertIncludes(dictionary, "the shared website allowance is already connected, so Start Here reports the model instead of asking for one", "System Help matches the no-setup default and the local exception");
test.assertIncludes(dictionary, "在你自己的机器上，“开始使用”不会强制连接 AI", "Chinese System Help matches the no-setup default and the local exception");

// OOBE is owned by the system, not Writing Studio. It remains reachable from
// the Desktop while Writing Studio always opens its own default surface.
test.assertNotMatches(workspaceProfile, /const studioWindowNames = new Set\(\[[^\]]*"guide"/, "Start Here is not a studio-only window");
test.assertNotMatches(workspaceProfile, /const writingStudioOwnedWindowNames = new Set\(\[[^\]]*"guide"/, "Writing Studio does not own OOBE");
test.assertNotIncludes(workspaceProfile, '"open-guide",', "Desktop profile does not block reopening OOBE");
test.assertNotIncludes(workspaceProfile, '"guide-",', "OOBE actions are not classified as studio commands by prefix");
test.assertIncludes(workspaceProfile, "await openWritingStudioDefaultSurface()", "opening Writing Studio never re-enters OOBE");
test.assertIncludes(html, '<button data-action="open-guide" data-i18n="start_here">', "Start Here stays available as a system menu item");

test.finish();
