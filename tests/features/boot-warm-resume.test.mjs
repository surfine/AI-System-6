// Warm resume: a refresh or same-session reopen cancels the visual boot hold
// (≤300ms human delay), while a new session or explicit Restart keeps the full
// Happy Mac ceremony. Data loads are never skipped.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("boot-warm-resume");
const desktopRuntime = read("app/core/desktop-runtime.js");
const windowManager = read("app/core/window-manager.js");
const boot = read("app/core/boot.js");

test.assertIncludes(desktopRuntime, '"ai-system6-boot-seen"', "warm resume uses a session-only boot flag");
test.assertIncludes(desktopRuntime, "function sessionBootSeen", "the warm flag is read from sessionStorage");
test.assertIncludes(desktopRuntime, "function clearSessionBootSeen", "Restart can force a cold boot");
test.assertIncludes(desktopRuntime, "warmResume ? (index === steps.length - 1 ? 80 : 0)", "warm resume cancels the visual holds");
test.assertIncludes(desktopRuntime, "warmResume ? 140 : 260", "warm fade is shorter than the cold fade");
test.assertIncludes(desktopRuntime, "if (!warmResume) markSessionBootSeen()", "only a cold boot records the flag");
test.assertIncludes(windowManager, "clearSessionBootSeen()", "explicit Restart clears the warm flag");
test.assertIncludes(boot, "await loadDeskState()", "warm boot never skips desk-state load");
test.assertIncludes(boot, "restoreWorkingSession()", "warm boot never skips the Working Session restore");
test.assertIncludes(desktopRuntime, "playSystemSound(\"boot\")", "the boot sound survives warm resume");

test.finish();
