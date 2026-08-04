// Working Session exists to protect the user's in-progress work from ordinary
// refreshes, while preserving Special > Restart/Shut Down as explicit reset
// gestures for transient state.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("working-session");
const workingSession = read("app/core/working-session.js");
const boot = read("app/core/boot.js");
const windowManager = read("app/core/window-manager.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const manifest = read("scripts/runtime-manifest.mjs");

test.assertIncludes(workingSession, 'const workingSessionStorageKey = "workingSession:v1"', "stores resume snapshots under a versioned Working Session key");
test.assertIncludes(workingSession, "function registerWorkingSessionAdapter(adapter)", "uses an adapter registry instead of one-off feature patches");
test.assertIncludes(workingSession, 'workingSessionExcludedWindowNames = new Set(["about", "saveChat", "guide"])', "system welcome and modal windows are excluded from resumable work");
[
  "windows",
  "selection",
  "assistant",
  "teachText",
  "fileFloppy",
  "reader",
  "writingFlow",
  "reviewDesk",
].forEach((id) => {
  test.assertIncludes(workingSession, `id: "${id}"`, `documents and registers the ${id} resume adapter`);
});

test.assertIncludes(boot, "restoreWorkingSession()", "ordinary startup attempts to resume the previous work session");
test.assertIncludes(boot, "openStartupItems()", "falls back to normal startup items when no Working Session can be restored");
test.assertMatches(boot, /installWorkingSessionAutosave\(\)/, "installs autosave after boot wiring is ready");

test.assertMatches(windowManager, /async function restartSystem\(\)[\s\S]*await clearWorkingSession\(\)/, "Special > Restart clears transient Working Session state");
test.assertMatches(windowManager, /async function shutDownSystem\(\)[\s\S]*await clearWorkingSession\(\)/, "Special > Shut Down clears transient Working Session state");
test.assertIncludes(windowManager, "function arrangeOutlineTeachTextSplit()", "window manager has a dedicated Outline + TeachText split layout");
test.assertIncludes(windowManager, "function arrangeActiveWritingWorkspace()", "window manager arranges whichever phase workspace is open as a manuscript pair");
test.assertMatches(windowManager, /\["outline", "sectionDrafts", "reviewDesk", "teachText"\]\.includes\(name\)[\s\S]*arrangeActiveWritingWorkspace\(\)/, "opening any route writing window arranges the active phase workspace");
test.assertMatches(windowManager, /const wasAlreadyOpen =[\s\S]*const shouldPlaceWindow = !skipPlacement\s*&& !wasAlreadyOpen[\s\S]*&& win\.dataset\.userPositioned !== "true"[\s\S]*shouldPlaceWindow && \["outline", "sectionDrafts", "reviewDesk", "teachText"\]\.includes\(name\)/, "re-opening an already visible or user-positioned writing window focuses it without moving the writing layout");
test.assertIncludes(windowManager, "function markWindowUserPositioned(win)", "window manager records user-positioned windows as spatial memory");
test.assertIncludes(windowManager, "function placeNewWindowAvoidingVisibleWindows(win)", "new floating windows avoid visible old windows without moving them");
test.assertIncludes(windowManager, "if (outline.dataset.userPositioned === \"true\" || teachText.dataset.userPositioned === \"true\") return", "automatic Outline + TeachText split does not override user-positioned writing windows");
test.assertMatches(windowManager, /applyFrame\(outline[\s\S]*applyFrame\(teachText/, "Outline is placed before TeachText in the split");
test.assertMatches(desktopRuntime, /async function eraseSelectedProjectDisk\(\)[\s\S]*clearWorkingSession\(\{ projectId \}\)/, "Erase Disk clears only the erased project's Working Session scope");

test.assertIncludes(manifest, '"app/core/working-session.js"', "loads Working Session in the runtime bundle");
test.assertNotIncludes(workingSession, "localStorage", "does not reintroduce scattered localStorage persistence for resume state");
test.assertIncludes(workingSession, "userPositioned: win.dataset.userPositioned === \"true\"", "captures user-positioned window state");
test.assertIncludes(workingSession, "win.dataset.userPositioned = entry.userPositioned ? \"true\" : \"false\"", "restores user-positioned window state");
test.assertIncludes(workingSession, "layoutGroup: win.dataset.layoutGroup || \"\"", "captures the app/layout group used by window placement");
test.assertMatches(workingSession, /app\/: inline layout styles|setInlineStyleValue|style\.setProperty/, "uses a centralized style helper for restored runtime frames");
test.assert(!/\.style\.(left|top|right|bottom|width|height|padding|margin)\s*=/.test(workingSession), "does not add direct inline layout assignments");
test.assertIncludes(workingSession, "function captureTextControlWorkingSession(control)", "one route-wide contract captures caret, selection, direction, scroll, and focus");
test.assertIncludes(workingSession, "function restoreTextControlWorkingSession(control, state = {}, options = {})", "one route-wide contract restores text-control working position");
[
  "questionEditor",
  "outlineEditor",
  "draftEditor",
].forEach((key) => {
  test.assertIncludes(workingSession, `${key}: captureTextControlWorkingSession`, `${key} protects in-progress writing position`);
});
test.assertIncludes(workingSession, "editor: captureTextControlWorkingSession(teachTextBodyInput)", "TeachText uses the same caret and focus contract as upstream writing surfaces");
test.assertIncludes(workingSession, "editor: captureTextControlWorkingSession(reviewDeskBodyInput)", "Review Desk uses the same caret and focus contract as the manuscript");
test.assertMatches(workingSession, /if \(draftSectionSelectEl && state\.draftSection\)[\s\S]*restoreTextControlWorkingSession\(draftBodyInput/, "Section Drafts restores its chapter before its caret and selection");
test.assertMatches(workingSession, /if \(reviewSectionSelectEl && state\.section\)[\s\S]*selectStyleCheckSection\(index\)[\s\S]*selectClaimCheckSection\(index\)/, "Review Desk restores the selected chapter and both review projections");
test.assertIncludes(workingSession, "activeWindowName: activeWin?.dataset.window", "the same snapshot preserves the foreground route window");
test.assertIncludes(workingSession, 'shadeWidth: inlineStyleValue(win, "--window-shade-width")', "captures a shaded window's horizontal size");
test.assertMatches(
  workingSession,
  /const shadeWidth = entry\.shadeWidth[\s\S]*entry\.frame\?\.width[\s\S]*getBoundingClientRect\(\)\.width[\s\S]*setInlineStyleValue\(win, "--window-shade-width", entry\.collapsed \? shadeWidth : ""\)/,
  "restores WindowShade width and repairs snapshots created before that field existed"
);

test.finish();
