// A true first launch opens ClioTalk as the front door. Onboarding is one
// conversation surface, not a wizard or a mounted Welcome Floppy: resumable
// work always wins, the starters only fill the composer, and Replay
// Introduction is a session state that never resets completion.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("start-here-guide");
const appJs = read("app.js");
const actions = read("app/core/actions.js");
const boot = read("app/core/boot.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const guide = read("app/features/writer-guide.js");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const windowManager = read("app/core/window-manager.js");
const workingSession = read("app/core/working-session.js");
const persistence = read("app/core/persistence-status.js");
const chatMessages = read("app/core/chat-messages.js");

// --- First launch routing -------------------------------------------------

test.assertMatches(
  desktopRuntime,
  /function openStartupItems\(\) \{\s*\n\s*if \(!clioOnboardingCompleted\) \{[\s\S]*?setWorkspaceProfile\(workspaceProfileDesktop, \{ persist: false \}\);/,
  "first launch stays on the ordinary Desktop profile without persisting it"
);
test.assertMatches(
  desktopRuntime,
  /if \(!clioOnboardingCompleted\) \{\s*\n\s*openFirstRunClioTalk\(\);\s*\n\s*return;/,
  "a true first launch opens ClioTalk instead of mounting a Welcome Floppy"
);
// Someone who wrote a paragraph is not on first launch, whatever the flag
// says. The restored Working Session always wins over onboarding.
test.assertMatches(
  boot,
  /const resumedWorkingSession = !writerMode[\s\S]*if \(!clioOnboardingCompleted && !resumedWorkingSession\) \{[\s\S]*?openStartupItems\(\)/,
  "resumable work is never dropped for onboarding"
);
test.assertMatches(
  guide,
  /async function openFirstRunClioTalk\(\)[\s\S]*?openWindow\("assistant"\)[\s\S]*?AISystem6ClioProvider\?\.resolve\?\.\(\{ reason: "first-run" \}\)/,
  "first run opens the existing ClioTalk window and starts the provider resolver in the background"
);

// --- The introduction surface ----------------------------------------------

test.assertIncludes(guide, "return clioIntroductionReplay || !clioOnboardingCompleted;", "the introduction is active for new users and during a replay");
test.assertMatches(
  chatMessages,
  /const welcomeKey = readOnly\s*\n\s*\? "clio_read_only_message"\s*\n\s*: providerResolving\s*\n\s*\? "clio_provider_resolving_message"/,
  "the empty state tells the truth about read-only and connecting states first"
);
test.assertIncludes(chatMessages, '? "clio_first_welcome_message"', "a true first use greets with the Clio introduction");
test.assertIncludes(chatMessages, ': (clioTalkTemporaryMode ? "temporary_welcome_message" : "welcome_message")', "returning users keep the ordinary ClioTalk welcome");
for (const starter of ["idea", "notes", "file", "explore"]) {
  test.assertMatches(chatMessages, new RegExp(`\\["${starter}", "clio_starter_${starter}"\\]`), `the introduction offers the ${starter} starter`);
}
test.assertMatches(
  guide,
  /function activateClioStarter\(starterId = ""\)[\s\S]*?promptInput\.value = t\(key\);[\s\S]*?promptInput\.focus\(\);/,
  "a starter only puts an editable phrase into the composer"
);
test.assertNotMatches(
  guide,
  /function activateClioStarter\(starterId = ""\)[\s\S]*?(requestSubmit|submitUserText|handleAction)/,
  "starters never auto-send or auto-execute a feature"
);
test.assertIncludes(en, "clio_first_welcome_message:", "English copy exists for the Clio introduction");
test.assertIncludes(zh, "clio_first_welcome_message:", "Chinese copy exists for the Clio introduction");

// --- Completion and migration ----------------------------------------------

test.assertMatches(
  chatMessages,
  /requiresDurableChatFile\s*\n\s*&& typeof isClioIntroductionActive === "function"\s*\n\s*&& isClioIntroductionActive\(\)\s*\n\s*\) \{\s*\n\s*void completeClioOnboarding\("first-chat"\);/,
  "sending the first durable Chat message completes onboarding; Temporary Chat and SideAsk do not"
);
test.assertIncludes(actions, '"skip-clio-introduction": () => completeClioOnboarding("skipped")', "explicitly skipping completes onboarding");
test.assertIncludes(windowManager, 'await completeClioOnboarding("closed");', "closing the first-run ClioTalk window also completes onboarding");
test.assertMatches(
  guide,
  /async function completeClioOnboarding\(reason = "completed"\)[\s\S]*?clioOnboardingCompleted = true;[\s\S]*?await saveDeskState\(\);/,
  "completion is persisted through the ordinary settings record"
);
test.assertNotIncludes(guide, "clioOnboardingCompleted = false", "nothing resets the persisted completion flag");
test.assertNotIncludes(guide, "localStorage", "onboarding state lives in the settings record, not a parallel store");

// Legacy migration: the old guideSeen flag is a read-only source, meaningful
// existing work counts as completed, and saves write only the new field.
test.assertMatches(
  persistence,
  /clioOnboardingCompleted = typeof settings\.clioOnboardingCompleted === "boolean"\s*\n\s*\? settings\.clioOnboardingCompleted\s*\n\s*: guideSeen;/,
  "legacy guideSeen users are migrated without a second onboarding"
);
test.assertMatches(
  persistence,
  /function hasMeaningfulClioOnboardingWork\(\)[\s\S]*?chatFiles\.some[\s\S]*?questionSheet/,
  "existing real work marks onboarding as completed"
);
test.assertMatches(persistence, /^\s*clioOnboardingCompleted,$/m, "saves persist the new completion field");
test.assertNotMatches(persistence, /^\s*guideSeen,$/m, "saves no longer write the legacy guideSeen field");

// --- Replay Introduction -----------------------------------------------------

test.assertIncludes(guide, "if (replay) clioIntroductionReplay = true;", "Replay Introduction is a session-only state");
test.assertIncludes(actions, '"replay-clio-introduction": () => openClioIntroduction({ replay: true })', "the replay action reuses the introduction surface");
test.assertIncludes(actions, 'registerCommand?.("replay-clio-introduction"', "replay is a registered command available everywhere");
test.assert(
  html.split('data-action="replay-clio-introduction"').length - 1 >= 3,
  "the Apple menu, Control Panel, and Help Folder share the one replay action"
);
test.assertMatches(html, /apple-menu-popover[\s\S]{0,600}data-action="replay-clio-introduction"/, "Replay Clio Introduction lives in the Apple menu Start section");

// --- The Welcome Floppy is gone ---------------------------------------------

test.assertNotIncludes(html, 'data-window="welcomeDisk"', "no Welcome Floppy window remains in the markup");
test.assertNotIncludes(html, 'data-window="guide"', "no Read Me guide window remains in the markup");
test.assertNotIncludes(windowManager, "welcomeDisk", "the window manager no longer special-cases the Welcome Floppy");
test.assertIncludes(workingSession, 'new Set(["about", "saveChat"])', "the Working Session exclusion list no longer carries guide windows");
test.assertNotIncludes(appJs, "welcomeDisk", "no desktop object mounts a Welcome Floppy");
for (const key of ["welcome_floppy:", "welcome_read_me:", "welcome_ai_setup:", "guide_welcome_heading:"]) {
  test.assertNotIncludes(en, key, `dead English copy ${key} is removed`);
  test.assertNotIncludes(zh, key, `dead Chinese copy ${key} is removed`);
}

// --- Discovery surfaces the floppy used to carry ------------------------------

test.assertMatches(html, /about-links[\s\S]{0,400}data-action="open-project-site"[\s\S]{0,200}data-action="open-github-repo"[\s\S]{0,200}data-action="open-guide-promo"/, "About keeps the project site, source, and film links");
test.assertIncludes(actions, '"play-teaser-demo": playWelcomeTour', "the deterministic 30-second tour keeps its entrypoint");
test.assertIncludes(read("app/data/system-dictionary.js"), 'id: "install-web-app"', "iPhone install instructions live in System Help");
test.assertIncludes(read("app/data/system-dictionary.js"), 'id: "quick-tour"', "System Help keeps a door to the quick introduction");

test.finish();
