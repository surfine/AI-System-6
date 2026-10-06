// Warm resume: a refresh or same-session reopen cancels the visual boot hold
// (≤300ms human delay), while a new session or explicit Restart keeps the full
// Happy Mac ceremony. Data loads are never skipped.

import { createFeatureTest, forEachAstChild, parseJsSource, read } from "../helpers/feature-test-harness.mjs";

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
// Warm resume only shortens the visual holds; it never skips storage. The
// desk-state load is now raced against an 8s IndexedDB guard so a wedged
// transaction cannot leave a phone on Sad Mac, and it is still awaited before
// the desk paints — so the contract follows the call, not the old
// `await loadDeskState()` line.
test.assertMatches(
  boot,
  /await Promise\.race\(\[\s*loadDeskState\(\)/,
  "warm boot never skips desk-state load: the restore is raced and awaited"
);
test.assert(
  (() => {
    const calls = [];
    const visit = (node) => {
      if (node.type === "CallExpression" && node.callee?.name === "loadDeskState") calls.push(node);
      forEachAstChild(node, visit);
    };
    visit(parseJsSource(boot));
    return calls.length === 1;
  })(),
  "boot reaches loadDeskState through exactly one call expression, so no warm branch sidesteps it"
);
test.assertIncludes(boot, "restoreWorkingSession()", "warm boot never skips the Working Session restore");
test.assertIncludes(desktopRuntime, "const warmResume = sessionBootSeen();", "warm detection precedes the boot sound decision");
const soundOrderBlock = desktopRuntime.match(/const warmResume = sessionBootSeen\(\);[\s\S]*?if \(!warmResume\) playSystemSound\("boot"\);[\s\S]*?playSystemSound\("boot"\);?/)?.[0] || "";
test.assertIncludes(
  desktopRuntime,
  "if (!warmResume) playSystemSound(\"boot\")",
  "warm resume never queues a boot chime"
);
test.assert(
  desktopRuntime.indexOf("const warmResume = sessionBootSeen();")
    < desktopRuntime.indexOf("if (!warmResume) playSystemSound(\"boot\")"),
  "the warm flag is read before any sound plays"
);

test.finish();
