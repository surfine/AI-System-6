// Boot failure recovery: the Sad Mac offers Retry, Start without restoring
// windows, and a minimal Recovery panel — and none of them touch project data.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("boot-recovery");
const boot = read("app/core/boot.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const workingSession = read("app/core/working-session.js");
const html = read("index.html");

// Retry is guarded so two boots can never run at once.
test.assertIncludes(boot, "let bootInProgress = false", "boot has a re-entry guard");
test.assertIncludes(boot, "if (bootInProgress) return false", "retry refuses to double-boot");
test.assertIncludes(boot, "finally {\n    bootInProgress = false;\n  }", "the guard releases when boot settles");

// Start without restoring windows clears ONLY the Working Session.
test.assertIncludes(boot, "async function startBootWithoutSession", "safe-mode-lite exists");
test.assertIncludes(boot, "await clearWorkingSession()", "start-without-windows clears the Working Session");
test.assertNotIncludes(boot.slice(boot.indexOf("async function startBootWithoutSession"), boot.indexOf("function startupTaskWithTimeout")), "resetSystemStorage", "safe-mode-lite never resets projects");
test.assertIncludes(workingSession, "deleteWorkingSessionSnapshot", "clearing the session only removes the session key");

// The Sad Mac exposes the three recovery actions and a minimal panel.
test.assertIncludes(desktopRuntime, 'getElementById("boot-failure-actions")?.classList.remove("is-hidden")', "boot failure reveals the recovery actions");
test.assertIncludes(html, 'id="boot-retry"', "Retry exists on the Sad Mac");
test.assertIncludes(html, 'id="boot-without-session"', "Start without restoring windows exists");
test.assertIncludes(html, 'id="boot-recovery"', "Recovery exists");
test.assertIncludes(html, 'id="boot-recovery-modal"', "the Recovery panel exists");
test.assertIncludes(html, 'id="boot-recovery-export"', "Recovery can export a Project Backup");
test.assertIncludes(html, 'id="boot-recovery-reset-session"', "Recovery can reset the Working Session");
test.assertIncludes(boot, "handleAction(\"reset-ai-connection\")", "Recovery can reset the AI connection");
test.assertIncludes(boot, "bootRecoveryStatus", "Recovery reports storage / projects / session / AI status");
test.assertNotIncludes(html.slice(html.indexOf("boot-recovery-modal"), html.indexOf("boot-recovery-modal") + 1200), "erase", "Recovery never offers a destructive erase");

test.finish();
