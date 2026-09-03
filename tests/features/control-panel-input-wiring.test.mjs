// Real execution, converting a static family: control-panel-tabs.test.mjs
// (still present, still valid) checks that the Local/Cloud/General tab
// markup and CSS exist. It cannot see whether typing into one of those
// panels' fields actually reaches application state — which is exactly the
// shape of one of this lane's three named P0s ("Control Panel could not be
// typed into"). A disabled input, an unwired listener, or a listener that
// throws before reaching its target all look identical to source-reading: an
// <input> tag exists, with data-* attributes that look right.
//
// This test opens the real Control Panel window and simulates real typing
// (tests/helpers/app-boot-vm.mjs's typeInto: set .value, fire real "input"
// and "change" events through the element's own listener list — see
// makeElement's addEventListener/dispatchEvent) against two real, currently
// wired listeners in app/core/wireup.js: the endpoint field invalidating a
// stale local-model connection, and the settings-autosave listener shared by
// eight Control Panel fields.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("control-panel-input-wiring");

// Case 1: typing a new endpoint invalidates whatever connection state was
// live before — wireup.js's `invalidateLocalConnection`, wired to the
// "input" event on #endpoint and #local-api-token.
{
  const vmw = createAppBootVm();
  const ctx = vmw.context;
  await ctx.handleAction("open-control");

  const endpointInput = vmw.getElementById("endpoint");
  test.assert(endpointInput.disabled !== true, "the Local Model endpoint field is not disabled once Control Panel is open");

  // Seed a "previously connected" state so invalidation is observable.
  vmw.run("localLmStudioConnectionEnabled = true; localModelState.server = true; localModelState.ready = true;");
  test.assert(vmw.run("localLmStudioConnectionEnabled") === true, "the connection-enabled flag starts true (test setup sanity)");

  vmw.typeInto(endpointInput, "http://127.0.0.1:9999/v1/chat/completions");
  test.assert(
    endpointInput.value === "http://127.0.0.1:9999/v1/chat/completions",
    "the endpoint field accepts the typed value (not blocked, not reverted)"
  );
  test.assert(
    vmw.run("localLmStudioConnectionEnabled") === false,
    "typing a new endpoint reaches invalidateLocalConnection() and clears the stale connection flag"
  );
  test.assert(
    vmw.run("localModelState.server") === false && vmw.run("localModelState.ready") === false,
    "typing a new endpoint resets the local model's server/ready state, not just a cosmetic label"
  );
}

// Case 2: typing into any of the fields wireup.js groups together schedules
// a settings save — proven by observing the real debounce actually run
// (setTimeout is inert by default in this harness; overriding it here to
// fire immediately is a deliberate, scoped exception for this one test, not
// a change to the harness's default behavior).
{
  const vmw = createAppBootVm({ setTimeout: (fn) => { fn(); return 1; } });
  const ctx = vmw.context;
  await ctx.handleAction("open-control");

  // saveDeskState is a top-level function declaration (hoisted, real), not
  // a `let` — but scheduleSettingsSave's setTimeout callback calls it by
  // its bare name, which resolves through the SAME shared lexical scope
  // run() uses, so reassigning it here really does intercept the real call.
  // __saveDeskStateCalls is a plain property on the context (== globalThis
  // inside the VM — see app-boot-vm.mjs), set directly rather than through
  // run() so it exists before anything reads it.
  ctx.__saveDeskStateCalls = 0;
  vmw.run("saveDeskState = () => { __saveDeskStateCalls += 1; return true; };");

  const contextLengthInput = vmw.getElementById("context-length");
  vmw.typeInto(contextLengthInput, "8192");
  test.assert(
    ctx.__saveDeskStateCalls >= 1,
    "typing into a Control Panel field (#context-length) schedules and runs a real settings save"
  );
}

test.finish();
// A real boot triggers real background async work this test never awaits
// (here: Control Panel's onOpen model-discovery chain, findLmStudioModels).
// test.finish() does not exit on success, so a later rejection from that
// unrelated chain — the VM has no real network or IndexedDB to satisfy it —
// would otherwise flip an already-passed run's exit code. Two existing
// feature tests (cloud-files-node, server-security) use the same guard for
// the same reason.
process.exit(0);
