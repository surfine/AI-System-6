// Contract: boot() actually runs, and a throw from one non-essential step
// never stops the rest of the desk from coming up.
//
// Every other boot contract in this suite (boot-warm-resume, boot-recovery,
// lazy-loader) is a grep over boot.js's source text. That is precisely the
// class of gap that let a temporal-dead-zone ReferenceError in a boot-path
// refactor reach a white screen — the desk never appeared — while all 253
// contracts stayed green: none of them ever called boot(). This one does,
// through the vm harness in tests/helpers/boot-vm.mjs, and injects the same
// class of failure (a throw from a dependency boot() calls) to prove the
// degraded-boot behavior actually holds at runtime, not just in the diff.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createBootContext } from "../helpers/boot-vm.mjs";

const test = createFeatureTest("boot-resilience");

function tdzError(name) {
  // The exact shape of the incident this contract exists for: a `let`/`const`
  // referenced before its declaration runs.
  return new ReferenceError(`Cannot access '${name}' before initialization`);
}

// 1. A clean boot reaches the ready state at all — the baseline the fault
// injection below is measured against.
{
  const { context, bodyDataset, consoleErrors } = createBootContext();
  const result = await context.boot();
  test.assert(result === undefined, "boot() returns normally when every step succeeds");
  test.assert(bodyDataset.appReady === "ready", "a clean boot reaches the ready state");
  test.assert(consoleErrors.length === 0, "a clean boot logs no errors");
}

// 2. A non-essential step throws a TDZ-style ReferenceError (the Alarm
// Clock's own initializer, exactly like app/features/alarm-clock.js failing
// to install initializeAlarmClock). The desk must still finish booting, and
// the failure must leave a trace both a user and a developer can find.
{
  const { context, bodyDataset, notifications, consoleErrors } = createBootContext({
    initializeAlarmClock: () => { throw tdzError("alarmClockState"); },
  });
  await context.boot();
  test.assert(bodyDataset.appReady === "ready", "a non-essential step throwing still reaches the ready state");
  test.assert(
    consoleErrors.some((args) => String(args[0]).includes('"alarm_clock"') && args[1] instanceof ReferenceError),
    "the failure is logged with the step name and the real error object (developer trace)"
  );
  test.assert(
    notifications.some((n) => n.message.includes("alarm_clock") && n.message.includes("before initialization")),
    "the failure reaches Notification Center naming what failed (user trace)"
  );
}

// A step that fails before loadDeskState() runs (Clock, the Alarm Clock
// preload/init, Version) needs special handling: loadDeskState() restores
// the persisted notification list with a wholesale splice-replace, not a
// merge, which would silently erase a notification pushed a moment earlier.
// This reproduces that replace (real loadDeskState does the same thing) and
// proves the queue-then-flush in boot() survives it.
{
  const { context, bodyDataset, notifications } = createBootContext({
    updateClock: () => { throw tdzError("clockFace"); },
    loadDeskState: async () => { notifications.length = 0; },
  });
  await context.boot();
  test.assert(bodyDataset.appReady === "ready", "a pre-loadDeskState step throwing still reaches the ready state");
  test.assert(
    notifications.some((n) => n.message.includes("Clock") && n.message.includes("before initialization")),
    "a failure from before loadDeskState() still survives its wholesale notification-list replace"
  );
}

// 3. The same failure, but on one lazy-preload in the Promise.all block
// (ensureAlarmClockModule rejecting, as a real network/script failure
// would). The sibling preloads in the same batch must still be awaited.
{
  let projectCdPrintLoaded = false;
  const { context, bodyDataset } = createBootContext({
    ensureAlarmClockModule: async () => { throw tdzError("alarmClockModule"); },
    ensureProjectCdPrintModule: async () => { projectCdPrintLoaded = true; },
  });
  await context.boot();
  test.assert(bodyDataset.appReady === "ready", "a rejected Promise.all entry still reaches the ready state");
  test.assert(projectCdPrintLoaded === true, "a sibling preload in the same batch still runs");
}

// 4. A render step for one Finder-style window throws; the windows after it
// in the boot sequence must still render — the concrete "one broken module
// must not blank the rest of the desk" requirement.
{
  const rendered = [];
  const { context, bodyDataset } = createBootContext({
    renderTrash: () => { throw tdzError("trashState"); },
    renderDocuments: () => { rendered.push("documents"); },
    renderMountedTextDisk: () => { rendered.push("mountedTextDisk"); },
    renderProjectCd: () => { rendered.push("projectCd"); },
  });
  await context.boot();
  test.assert(bodyDataset.appReady === "ready", "one window's render throwing still reaches the ready state");
  test.assert(
    rendered.join(",") === "documents,mountedTextDisk,projectCd",
    "every render step after the broken one still ran, in order"
  );
}

// 5. A step scheduled after boot() has already returned (the 8-second
// maintenance timer) is outside boot()'s own try/catch entirely — the
// clearest case where an uncaught throw would previously have been
// completely invisible. It must still surface, not vanish.
{
  const { context, bodyDataset, consoleErrors } = createBootContext({
    scheduleDesktopMaintenance: () => { throw tdzError("maintenanceQueue"); },
  });
  await context.boot();
  test.assert(bodyDataset.appReady === "ready", "boot() itself still completes before the deferred timer fires");
  await new Promise((resolve) => setTimeout(resolve, 40));
  test.assert(
    consoleErrors.some((args) => String(args[0]).includes("Desktop maintenance") && args[1] instanceof ReferenceError),
    "the deferred timer's throw is still logged instead of vanishing as an unhandled exception"
  );
}

// 6. Essential steps are the deliberate exception: loadDeskState is not
// wrapped, so its failure is still supposed to stop boot and hand off to the
// existing Sad Mac recovery screen — degrading everything would hide a
// genuinely broken Project Hard Disk load behind an empty desk instead of
// the recovery UI built for exactly that case.
{
  const shownFailures = [];
  const { context, bodyDataset } = createBootContext({
    loadDeskState: async () => { throw new Error("IndexedDB unavailable"); },
    showBootFailure: (error) => { shownFailures.push(error); },
  });
  await context.boot();
  test.assert(bodyDataset.appReady === "error", "an essential step's failure still aborts boot instead of degrading");
  test.assert(
    shownFailures.length === 1 && shownFailures[0].message === "IndexedDB unavailable",
    "the existing Sad Mac recovery screen still receives the real error"
  );
}

test.finish();
