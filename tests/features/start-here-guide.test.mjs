// Start Here mounts a real, read-only Welcome Floppy. The first-run surface is
// Finder itself; the writing route, AI calls, and project creation stay opt-in.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("start-here-guide");
const actions = read("app/core/actions.js");
const boot = read("app/core/boot.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const guide = read("app/features/writer-guide.js");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const windowManager = read("app/core/window-manager.js");
const workingSession = read("app/core/working-session.js");
const wireup = read("app/core/wireup.js");
const cloudModel = read("app/features/cloud-model.js");
const chatMessages = read("app/core/chat-messages.js");
const writingDemo = read("app/features/writing-demo.js");
const workspaceProfile = read("app/core/workspace-profile.js");

const diskMarkup = html.match(/<section class="window finder-window welcome-disk-window[\s\S]*?<section class="window guide-window/)?.[0] || "";
const readMeMarkup = html.match(/<section class="window guide-window[\s\S]*?<section class="window rebuild-flow-window/)?.[0] || "";

test.assertMatches(desktopRuntime, /if \(!guideSeen\)[\s\S]*setWorkspaceProfile\(workspaceProfileDesktop, \{ persist: false \}\)[\s\S]*openWelcomeFloppy\(\)/, "first launch mounts Welcome Floppy on the ordinary Desktop");
test.assertNotMatches(desktopRuntime, /if \(!guideSeen\)[\s\S]*openWindow\("guide"\)/, "first launch does not cover Finder with the Read Me window");
test.assertMatches(desktopRuntime, /if \(!guideSeen\)[\s\S]*getWindow\("assistant"\)[\s\S]*classList\.add\("is-hidden"\)/, "first launch does not leave ClioTalk behind the floppy");
// This used to read `guideSeen && ...`, which skipped the resume until the
// Welcome Floppy had been closed. It cost a writer their sentence: type before
// finishing onboarding, get interrupted, and the work was dropped and then
// overwritten by autosave. Someone who wrote a paragraph is not on first
// launch. The floppy still owns a true first launch — an empty desk with
// nothing to resume — which is what the assertion below actually protects.
test.assertMatches(boot, /const resumedWorkingSession = !writerMode[\s\S]*if \(!guideSeen && !resumedWorkingSession\) \{[\s\S]*openStartupItems\(\)/, "a true first launch still meets the Welcome Floppy, and resumable work is never dropped for onboarding");

test.assertIncludes(diskMarkup, 'data-window="welcomeDisk"', "Welcome Floppy is a named Finder window");
test.assertIncludes(diskMarkup, 'class="window-pane finder-grid welcome-disk-grid window-frame-scroller"', "the floppy uses the ordinary Finder grid and frame");
for (const control of ["close-box", "resize-box", "shade-box", "grow-box"]) {
  test.assertIncludes(diskMarkup, control, `Welcome Floppy keeps the native ${control} control`);
}
test.assertIncludes(html, 'id="mounted-welcome-disk" type="button" data-open="welcomeDisk" hidden', "the mounted floppy is a real desktop object that is absent for returning users");
test.assertIncludes(guide, 'icon.hidden = false', "mounting Start Here reveals the desktop floppy");
test.assertMatches(guide, /async function openWelcomeFloppy\(\)[\s\S]*syncWelcomeFloppyState\(\);[\s\S]*openWindow\("welcomeDisk"\)/, "Start Here mounts, synchronizes, and opens the Finder volume");

for (const action of ["open-welcome-read-me", "play-teaser-demo", "open-clio-model-settings", "welcome-iphone-help"]) {
  test.assertIncludes(diskMarkup, `data-action="${action}"`, `Welcome Floppy carries the ${action} object`);
}
test.assertMatches(diskMarkup, /finder-item is-selected[\s\S]*data-action="open-welcome-read-me"/, "Read Me First is the Finder-default selection");
test.assertIncludes(diskMarkup, 'id="welcome-iphone-item"', "the iPhone handoff is a real conditional Finder object");
test.assertMatches(guide, /isIosWebPlatform\(\)[\s\S]*isStandaloneWebApp\(\)[\s\S]*iphone\.hidden = !showIphone[\s\S]*showIphone \? 4 : 3/, "the fourth object appears only on iPhone or iPad outside standalone mode");

test.assertIncludes(readMeMarkup, 'data-i18n="guide_welcome_heading"', "Read Me First explains the product premise");
for (const key of ["guide_route_step_material", "guide_route_step_question", "guide_route_step_write", "guide_route_step_review"]) {
  test.assertIncludes(readMeMarkup, `data-i18n="${key}"`, `Read Me First introduces ${key}`);
}
for (const action of ["open-project-site", "open-github-repo", "open-guide-promo"]) {
  test.assertIncludes(readMeMarkup, `data-action="${action}"`, `Read Me First keeps ${action} available`);
}
test.assertNotIncludes(readMeMarkup, "guide-step", "Read Me First is one document, not a wizard");
test.assertNotIncludes(readMeMarkup, "guide-nav", "the old page-by-page navigation is gone");
test.assertNotIncludes(readMeMarkup, "guide-start-route", "onboarding never starts Writing Studio's route");
test.assertNotIncludes(readMeMarkup, "guide-start-quick-draft", "onboarding never starts a draft");

test.assertMatches(guide, /const aiKey = shared \? "welcome_ai_website_ready" : guideHasReadyModel\(\) \? "welcome_ai_ready" : "welcome_ai_setup"/, "the AI object reflects the real configured source");
test.assertIncludes(zh, 'welcome_ai_website_ready: "网站 AI 已就绪"', "Chinese AI status says ready rather than inventing a connection");
test.assertNotIncludes(zh, 'welcome_ai_website_ready: "网站 AI 已连接"', "Welcome Floppy never labels untested website AI as connected");
test.assertIncludes(cloudModel, 'typeof syncWelcomeFloppyState === "function"', "model changes refresh the mounted floppy");
test.assertIncludes(chatMessages, 'typeof syncWelcomeFloppyState === "function"', "ClioTalk model changes refresh the mounted floppy");
test.assertIncludes(actions, '"open-clio-model-settings": openModelSettings', "the AI object reuses Control Panel instead of duplicating setup");
test.assertIncludes(actions, '"welcome-iphone-help": showWelcomeIphoneHelp', "the iPhone object delegates to the platform instructions");

test.assertIncludes(actions, '"play-teaser-demo": playWelcomeTour', "the tour object uses the deterministic teaser entrypoint");
test.assertMatches(writingDemo, /Teaser mode[\s\S]*needs no model or network/, "the tour does not depend on AI or the network");
test.assertMatches(writingDemo, /function teaserDemoSnapshot\(\)[\s\S]*durable: teaserDemoSnapshotDurable\(\)/, "the tour snapshots durable user state");
test.assertMatches(writingDemo, /finally \{[\s\S]*await teaserDemoRestore\(snapshot\)/, "the tour restores the desk on success, failure, or Escape");

test.assertIncludes(actions, '"open-guide": openWelcomeFloppy', "the Start Here menu remounts Welcome Floppy");
test.assertIncludes(html, '<button data-action="open-guide" data-i18n="start_here">', "Start Here remains in the Apple menu");
test.assertMatches(windowManager, /if \(name === "welcomeDisk"\) \{\n\s*guideSeen = true;\n\s*saveDeskState\(\);/, "closing Welcome Floppy completes first-run without hiding product features");
test.assertIncludes(workingSession, 'new Set(["about", "saveChat", "guide", "welcomeDisk"])', "Welcome Floppy and its Read Me never become recoverable work windows");
test.assertIncludes(windowManager, '"welcomeDisk",\n  "finder"', "mobile treats Welcome Floppy as a Finder page");
test.assertNotMatches(workspaceProfile, /const studioWindowNames = new Set\(\[[^\]]*"welcomeDisk"/, "Writing Studio does not own Welcome Floppy");
test.assertNotIncludes(guide, "localStorage", "Welcome Floppy reuses the existing guideSeen boundary");
test.assertIncludes(wireup, "initializeWelcomeFloppy();", "first paint synchronizes conditional floppy objects");
test.assertIncludes(read("apps/desktop/styles/40-icons.css"), ".finder-grid .finder-item[hidden]", "appearance display rules cannot reveal an unavailable conditional Finder object");
test.assertIncludes(read("apps/desktop/styles/10-windows.css"), ".welcome-disk-grid", "the short Welcome Floppy grid stays compact inside a phone-height Finder page");
test.assertMatches(read("apps/desktop/app.js"), /applyTheme[\s\S]*requestAnimationFrame[\s\S]*\.window\.is-finder-content-fit:not\(\.is-hidden\)[\s\S]*fitFinderWindowToContents/, "live appearance changes refit open Finder windows after icon geometry changes");

for (const key of [
  "welcome_floppy", "welcome_floppy_read_only", "welcome_read_me", "welcome_read_me_hint",
  "welcome_ai_setup", "welcome_ai_ready", "welcome_ai_website_ready", "welcome_keep_on_iphone",
]) {
  test.assertIncludes(en, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese copy exists for ${key}`);
}

test.finish();
