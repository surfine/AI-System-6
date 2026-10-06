// Boot failure recovery: the Sad Mac offers Retry, Start without restoring
// windows, and a minimal Recovery panel — and none of them touch project data.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("boot-recovery");
const boot = read("app/core/boot.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const workingSession = read("app/core/working-session.js");
const recoveryStorage = read("app/core/recovery-storage.js");
const html = read("index.html");

// Boot re-entry is guarded; recovery reloads must NOT wait on that guard —
// a hung boot left Retry / Start-without-windows dead on iPhone (Aaron 2026-10-05).
test.assertIncludes(boot, "let bootInProgress = false", "boot has a re-entry guard");
test.assertIncludes(boot, "if (bootInProgress) return false", "boot() itself still refuses to double-enter");
test.assertIncludes(boot, "function forceBootReload", "recovery force-reloads even while boot is hung");
test.assertIncludes(boot, "finally {\n    bootInProgress = false;\n  }", "the guard releases when boot settles");
test.assertIncludes(boot, "continuing without durable storage", "a desk-state load failure still paints the desk");
test.assertIncludes(boot, 'startupTaskWithTimeout(window.AISystem6WriteLease?.acquireAtBoot?.()', "write-lease acquisition cannot hang boot");
test.assertIncludes(boot, "window.location.reload()", "Retry / safe-start / Recovery retry all reload into a fresh runtime");
test.assertIncludes(boot, "async function retryBoot", "retryBoot remains as an internal helper");

// Start without restoring windows clears ONLY the Working Session.
test.assertIncludes(boot, "async function startBootWithoutSession", "safe-mode-lite exists");
test.assertIncludes(boot, "clearWorkingSession()", "start-without-windows clears the Working Session");
test.assertIncludes(boot, "BOOT_SKIP_SESSION_KEY", "safe-start sets a one-shot skip if clearWorkingSession cannot finish");
test.assertNotIncludes(boot.slice(boot.indexOf("async function startBootWithoutSession"), boot.indexOf("function startupTaskWithTimeout")), "resetSystemStorage", "safe-mode-lite never resets projects");
test.assertIncludes(workingSession, "deleteWorkingSessionSnapshot", "clearing the session only removes the session key");

// Recovery is DB-independent of the normal runtime.
test.assertIncludes(recoveryStorage, "listRecoverableProjects", "Recovery lists projects straight from IndexedDB");
test.assertIncludes(recoveryStorage, "exportRecoveryProjectBackup", "Recovery exports a backup directly from IndexedDB");
test.assertIncludes(boot, "AISystem6RecoveryStorage?.recoveryStorageStatus", "the Recovery panel reads storage status from the DB layer");
test.assertIncludes(boot, "listRecoverableProjects", "the Recovery panel renders the DB project list");
test.assertIncludes(boot, "projectStorageSnapshot", "the Recovery panel reports real browser persistent-storage status");
test.assertNotIncludes(recoveryStorage, "handleAction(", "recovery-storage never depends on the action router");
test.assertNotIncludes(recoveryStorage, "renderProjectDisks", "recovery-storage never depends on the desktop");

// The Sad Mac exposes the three recovery actions and a minimal panel.
test.assertIncludes(desktopRuntime, 'getElementById("boot-failure-actions")?.classList.remove("is-hidden")', "boot failure reveals the recovery actions");
test.assertIncludes(desktopRuntime, 'getElementById("boot-without-session")?.classList.add("default")', "phone / WebClip recovery defaults to continuing without restoring windows");
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
