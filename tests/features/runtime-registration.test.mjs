// The runtime's registration and initialization contracts: a refused
// registration leaves nothing behind, two callers share one initialization,
// a failed initialization can be retried, and a lazy placeholder can hand its
// id over to the real command exactly once.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("runtime-registration");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

// --- A registration that cannot be completed leaves nothing behind ----------
run(`
  window.__registrationError = null;
  try {
    window.AISystem6Runtime.registerApplication({
      id: "half-registered",
      windowName: "halfRegistered",
      mount: () => {},
      commands: {
        "half-first": { handler: () => "first" },
        "half-second": { isAvailable: () => true },
      },
    });
  } catch (error) {
    window.__registrationError = String(error?.message || error);
  }
`);
test.assert(
  /half-second/.test(run("window.__registrationError || ''")),
  "a command with no handler is refused, and the error names it"
);
test.assert(
  run('window.AISystem6Runtime.getApplication("half-registered")') === null,
  "the application is not registered at all"
);
test.assert(
  run('window.AISystem6Runtime.hasCommand("half-first")') === false,
  "and the commands that were valid are not left registered either"
);

// --- Ids and required functions are validated, with the entry named ---------
run(`
  window.__missingIdError = null;
  window.__badMountError = null;
  try { window.AISystem6Runtime.registerApplication({ windowName: "nameless" }); }
  catch (error) { window.__missingIdError = String(error?.message || error); }
  try {
    window.AISystem6Runtime.registerApplication({ id: "bad-mount", mount: "not a function" });
  } catch (error) { window.__badMountError = String(error?.message || error); }
`);
test.assert(/non-empty application id/.test(run("window.__missingIdError || ''")), "an application needs an id");
test.assert(
  /bad-mount/.test(run("window.__badMountError || ''")) && /mount/.test(run("window.__badMountError || ''")),
  "a mount that is not a function is refused, and the error names the application and the field"
);

// --- Two callers share one initialization ----------------------------------
run(`
  window.__mountRuns = 0;
  window.__mountRelease = null;
  window.__mountGate = new Promise((resolve) => { window.__mountRelease = resolve; });
  window.AISystem6Runtime.registerApplication({
    id: "shared-init",
    windowName: "sharedInit",
    mount: async () => { window.__mountRuns += 1; await window.__mountGate; return "bound"; },
  });
`);
const sharedOutcome = await run(`
  (async () => {
    let firstSettled = false;
    let secondSettled = false;
    const first = window.AISystem6Runtime.mountApplication("shared-init").then((value) => {
      firstSettled = true;
      return value;
    });
    const second = window.AISystem6Runtime.mountApplication("shared-init").then((value) => {
      secondSettled = true;
      return value;
    });
    await Promise.resolve();
    await Promise.resolve();
    const early = { firstSettled, secondSettled, runs: window.__mountRuns };
    window.__mountRelease();
    const results = await Promise.all([first, second]);
    return {
      early,
      runs: window.__mountRuns,
      results,
      mounted: window.AISystem6Runtime.getApplication("shared-init").mounted,
    };
  })()
`);
test.assert(sharedOutcome.early.runs === 1, "two concurrent mounts run the application's initialization once");
test.assert(
  sharedOutcome.early.firstSettled === false && sharedOutcome.early.secondSettled === false,
  "neither caller is told it succeeded before the initialization finished"
);
test.assert(
  sharedOutcome.results.every((result) => result.ok === true && result.result === "bound"),
  "both callers get the same completed result"
);
test.assert(sharedOutcome.mounted === true, "the application only counts as mounted once initialization succeeded");

// --- A failed initialization is retryable ----------------------------------
run(`
  window.__failingRuns = 0;
  window.AISystem6Runtime.registerApplication({
    id: "failing-init",
    windowName: "failingInit",
    mount: async () => { window.__failingRuns += 1; throw new Error("bind failed"); },
  });
`);
// The result object, not a rejection: every caller in the app checks `.ok`
// (restoreApplication hands the same shape straight back), so a throw has to
// arrive as a failure result with the reason.
const failure = await run('window.AISystem6Runtime.mountApplication("failing-init")');
test.assert(
  failure.ok === false && failure.status === "mount-failed" && String(failure.error?.message) === "bind failed",
  "a mount that throws reports the failure, with the reason, instead of success"
);
test.assert(
  run('window.AISystem6Runtime.getApplication("failing-init").mounted') === false,
  "and the application is not marked mounted"
);
await run('window.AISystem6Runtime.mountApplication("failing-init").catch(() => null)');
test.assert(run("window.__failingRuns") === 2, "a later open is a real retry, not a permanent no-op");

// --- A lazy placeholder hands its id to the real command, once -------------
run(`
  window.__lazyEnsures = 0;
  window.AISystem6Runtime.registerLazyCommand("taken-over", {
    ensure: async () => { window.__lazyEnsures += 1; },
  });
  window.AISystem6Runtime.registerCommand("taken-over", { handler: () => "real" });
  window.__stealError = null;
  try {
    window.AISystem6Runtime.registerLazyCommand("taken-over", { ensure: async () => {} });
  } catch (error) { window.__stealError = String(error?.message || error); }
`);
const takenOver = await run('window.AISystem6Runtime.dispatchCommand("taken-over")');
test.assert(takenOver.status === "success" && takenOver.result === "real", "the real command answers for the id");
test.assert(
  /taken-over/.test(run("window.__stealError || ''")),
  "another module cannot claim an id that is already registered, and the error names it"
);
test.assert(
  run('window.AISystem6Runtime.listCommands().includes("taken-over")')
  && run('window.AISystem6Runtime.listLazyCommands().includes("taken-over")')
  && run('window.AISystem6Runtime.hasCommand("taken-over")') === true,
  "a read-only enumeration answers what exists without handing out the registry itself"
);
test.assert(
  run('Object.isFrozen(window.AISystem6Runtime)') === true
  && run('typeof window.AISystem6Runtime.c') === "undefined"
  && run('typeof window.AISystem6Runtime.lazyCommands') === "undefined",
  "the surface stays frozen and the registries themselves are not handed out"
);

// --- A handler's own failure is not a successful dispatch -------------------
run(`
  window.AISystem6Runtime.registerCommand("declined-command", {
    handler: () => ({ ok: false, reason: "declined" }),
  });
  window.AISystem6Runtime.registerCommand("throwing-command", {
    handler: () => { throw new Error("boom"); },
  });
  window.AISystem6Runtime.registerCommand("succeeding-command", {
    handler: () => ({ ok: true, saved: true }),
  });
`);
const declined = await run('window.AISystem6Runtime.dispatchCommand("declined-command")');
test.assert(
  declined.ok === false && declined.status === "handler-failed" && declined.reason === "declined",
  "a handler that reports its own failure is not dressed up as a successful dispatch"
);
test.assert(
  declined.result?.reason === "declined",
  "and the handler's own result still reaches the caller"
);
const threw = await run('window.AISystem6Runtime.dispatchCommand("throwing-command")');
test.assert(threw.status === "error", "a handler that throws keeps its own status");
const succeeded = await run('window.AISystem6Runtime.dispatchCommand("succeeding-command")');
test.assert(
  succeeded.ok === true && succeeded.status === "success" && succeeded.result?.saved === true,
  "a business success is still a success"
);

// --- Unavailable comes with a reason every surface can show ----------------
run(`
  window.AISystem6Runtime.registerCommand("needs-selection", {
    handler: () => "ran",
    isAvailable: () => false,
    unavailableReason: () => "select-something-first",
  });
  window.AISystem6Runtime.registerCommand("no-reason", {
    handler: () => "ran",
    isAvailable: () => false,
  });
`);
const availability = await run(`({
  blocked: window.AISystem6Runtime.commandAvailability("needs-selection"),
  silent: window.AISystem6Runtime.commandAvailability("no-reason"),
  unknown: window.AISystem6Runtime.commandAvailability("never-registered"),
  ready: window.AISystem6Runtime.commandAvailability("succeeding-command"),
})`);
test.assert(
  availability.blocked.available === false && availability.blocked.reason === "select-something-first",
  "a disabled command reports the reason the surfaces can show"
);
test.assert(
  availability.silent.available === false && availability.silent.reason === "",
  "a command with no reason still reports honestly that it is unavailable"
);
test.assert(
  availability.unknown.available === false && availability.unknown.reason === "unregistered",
  "an unknown command is unavailable for a reason of its own"
);
test.assert(availability.ready.available === true, "an available command says so");
const blockedDispatch = await run('window.AISystem6Runtime.dispatchCommand("needs-selection")');
test.assert(
  blockedDispatch.status === "unavailable" && blockedDispatch.reason === "select-something-first",
  "dispatching it carries the same reason rather than an empty refusal"
);

// --- Diagnostics that can be pasted into a bug report -----------------------
const diagnostics = await run(`
  (() => {
    const described = window.AISystem6Runtime.describeRuntime();
    return {
      frozen: Object.isFrozen(described),
      commandCount: described.commands,
      lazyCount: described.lazyCommands,
      renderTasks: described.renderTasks,
      applications: described.applications,
      hasCommandKeys: Object.keys(described).some((key) => /body|questionSheet|content|text/.test(key)),
      appFields: [...new Set(described.applications.flatMap((app) => Object.keys(app)))].sort(),
    };
  })()
`);
test.assert(
  diagnostics.frozen === true && diagnostics.commandCount > 0 && diagnostics.renderTasks > 0,
  "the runtime can describe what it holds, as a frozen read-only summary"
);
test.assert(
  diagnostics.appFields.join(",") === "id,mounted,windowName",
  "each application is described by id, window name and mount state only"
);
test.assert(
  diagnostics.hasCommandKeys === false,
  "and nothing that could carry the writer's own text is part of the summary"
);

// --- Watching one slice instead of the whole desk ---------------------------
const watchOutcome = await run(`
  (async () => {
    const stores = window.AISystem6StateStores;
    const seen = [];
    deskPersistenceWritable = true;
    persistDeskState = async () => true;
    const stop = stores.watch(stores.projects, (change) => change?.detail?.projects ?? null, { immediate: true })(
      (value, change) => { seen.push({ value, initial: change?.initial === true }); }
    );
    await stores.projects.commit(() => {});
    // A refused commit emits an error event. That is not a data change, so the
    // view must not be told the slice moved.
    persistDeskState = async () => false;
    await stores.projects.commit(() => {}).catch(() => null);
    stop();
    persistDeskState = async () => true;
    await stores.projects.commit(() => {});
    return seen;
  })()
`);
test.assert(
  watchOutcome.length >= 1 && watchOutcome[0].initial === true,
  "a view that asks for the current slice gets it immediately"
);
test.assert(
  watchOutcome.length === 2 && typeof watchOutcome[1].value === "number",
  "an error event is not delivered as a data change, and a slice that did not move is not re-sent"
);
test.assert(
  watchOutcome.filter((entry) => entry.initial !== true).length === 1,
  "unsubscribing stops the view from hearing about later commits"
);

test.finish();
