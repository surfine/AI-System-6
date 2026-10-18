// A true first launch opens About on its "First time here" face: three equal
// doors (pick a Mac, write one line, watch the film), not a wizard and not a
// mounted Welcome Floppy. Resumable work always wins; any door, or an
// ordinary ClioTalk exchange, completes the introduction; Replay Introduction
// reopens the same face and never resets completion. (DESIGN.md, 2026-10-16.)

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("start-here-guide");
const appJs = read("app.js");
const actions = read("app/core/actions.js");
const boot = read("app/core/boot.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const guide = read("app/features/writer-guide.js");
const about = read("app/features/about-desk.js");
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
  /if \(aboutStartup\.show === true \|\| \(aboutStartup\.show === null && !clioOnboardingCompleted\)\) \{[\s\S]{0,260}?assistant\?\.classList\.add\("is-hidden"\);[\s\S]{0,160}?openAboutFirstTime\(\{ startup: true \}\);\s*\n\s*return;/,
  "a true first launch, or a writer who asked for it, opens About's first-time face and nothing else"
);
test.assertMatches(
  desktopRuntime,
  /!clioOnboardingCompleted && aboutStartup\.show === null && aboutStartup\.shows >= 2\) \{\s*\n\s*completeClioOnboarding\("seen-twice"\)/,
  "someone who closed the doors twice is not shown them a third time"
);
// Someone who wrote a paragraph is not on first launch, whatever the flag
// says. The restored Working Session always wins over onboarding.
test.assertMatches(
  boot,
  /const resumedWorkingSession = !writerMode[\s\S]*if \(!clioOnboardingCompleted && !resumedWorkingSession\) \{[\s\S]*?openStartupItems\(\)/,
  "resumable work is never dropped for onboarding"
);
test.assertNotIncludes(guide, "openFirstRunClioTalk", "ClioTalk is no longer the front door");
test.assertMatches(guide, /async function openAboutFirstTime\(\{ startup = false \} = \{\}\) \{\s*\n\s*await ensureAboutModule\(\);\s*\n\s*return window\.AISystem6About\.open\(\{ face: "first", startup \}\);/, "the front door is About's first-time face, loaded on demand");

// --- The doors ------------------------------------------------------------

for (const door of ["mac", "line", "film"]) {
  test.assertIncludes(about, `door("${door}", "about_door_${door}"`, `the ${door} door exists`);
  test.assertIncludes(en, `about_door_${door}:`, `English copy names the ${door} door`);
  test.assertIncludes(zh, `about_door_${door}:`, `Chinese copy names the ${door} door`);
}
test.assertMatches(about, /function playFilm\(\) \{[\s\S]*?if \(face === "first"\) finishDoor\("film"\);/, "the film door counts once play is pressed");
test.assertMatches(about, /appearanceGrid\(\{ onPick: \(\) => finishDoor\("mac"\) \}\)/, "picking a Mac finishes that door");
test.assertMatches(about, /landLineOnNotePad\(text\);\s*\n\s*await finishDoor\("line"\);/, "a kept line lands as a Note Pad slip and finishes that door");
test.assertMatches(about, /async function finishDoor\(door\) \{[\s\S]*?completeClioOnboarding\(`about-\$\{door\}`\)[\s\S]*?show: false/, "a finished door completes the introduction and clears Show at startup");
test.assertMatches(about, /async function lineToClio\(\) \{[\s\S]*?promptInput\.value = t\("about_door_ask_prompt", keptLine\);[\s\S]*?promptInput\.focus\(\);\s*\n\s*\}/, "Clio only asks: the composer is filled, never sent");
test.assertNotMatches(about, /requestSubmit|submitUserText/, "no door sends a message on the writer's behalf");
test.assertMatches(about, /if \(!can\.ok\) \{\s*\n\s*ask\.disabled = true;\s*\n\s*ask\.dataset\.balloonHelpDisabled = can\.reason;\s*\n\s*row\.append\(ask, el\("p", "about-fine", t\(can\.reason\)\)\);/, "without a model the ask button is grey and says why");
test.assertNotIncludes(en, "Tell me what you are working on", "charter: desktop first copy never asks what the user is working on");
test.assertNotIncludes(zh, "告诉我你正在做什么", "charter: desktop 首句文案不以询问对方在做什么开场");
const firstFace = about.slice(about.indexOf("function renderFirst(host)"), about.indexOf("// ---- Render"));
test.assertNotMatches(firstFace, /provider|api[_ ]?key|apiKey|open-control|model_settings/i, "the first face never leads with provider fields");

// --- ClioTalk keeps its ordinary welcome ------------------------------------

test.assertMatches(
  chatMessages,
  /const welcomeKey = providerResolving\s*\n\s*\? "clio_provider_resolving_message"\s*\n\s*: !modelReady\s*\n\s*\? "clio_model_required_message"/,
  "ClioTalk opens with its ordinary welcome; there is no first-run greeting"
);
for (const key of ["clio_first_welcome_message:", "clio_starter_idea:", "clio_starter_explore:"]) {
  test.assertNotIncludes(en, key, `retired first-run copy ${key} is gone from English`);
  test.assertNotIncludes(zh, key, `retired first-run copy ${key} is gone from Chinese`);
}
test.assertIncludes(chatMessages, '"clio_shared_quota_spent"', "a spent shared budget still says so in the ordinary welcome");

// --- Completion and migration ----------------------------------------------

test.assertMatches(
  chatMessages,
  /requiresDurableChatFile\s*\n\s*&& typeof isClioIntroductionActive === "function"\s*\n\s*&& isClioIntroductionActive\(\)\s*\n\s*\) \{\s*\n\s*void completeClioOnboarding\("first-chat"\);/,
  "sending the first durable Chat message completes onboarding; Temporary Chat and SideAsk do not"
);
test.assertIncludes(actions, '"skip-clio-introduction": () => completeClioOnboarding("skipped")', "explicitly skipping completes onboarding");
test.assertIncludes(windowManager, 'if (name === "about") await window.AISystem6About?.closing?.();', "closing About lets it tear the film down and count a dismissed first face");
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

test.assertIncludes(actions, '"replay-clio-introduction": () => openAboutFirstTime()', "the replay action reopens About's first-time face");
test.assertIncludes(actions, 'registerCommand?.("replay-clio-introduction"', "replay is a registered command available everywhere");
test.assert(
  html.split('data-action="replay-clio-introduction"').length - 1 >= 3,
  "the Apple menu, Control Panel, and Help Folder share the one replay action"
);
test.assertMatches(html, /apple-menu-popover[\s\S]{0,600}data-action="replay-clio-introduction"/, "Replay Introduction lives in the Apple menu Start section");

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

test.assertIncludes(about, 'button("about_place_site"', "About keeps the project site");
test.assertIncludes(about, 'button("about_place_source"', "About keeps the source code link");
test.assertIncludes(about, "function filmCard(", "About keeps the film");
test.assertIncludes(actions, '"play-teaser-demo": playWelcomeTour', "the deterministic 30-second tour keeps its entrypoint");
test.assertIncludes(read("app/data/system-dictionary.js"), 'id: "install-web-app"', "iPhone install instructions live in System Help");
test.assertIncludes(read("app/data/system-dictionary.js"), 'id: "quick-tour"', "System Help keeps a door to the quick introduction");

test.finish();
