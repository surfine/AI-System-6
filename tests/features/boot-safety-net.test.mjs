// Boot safety net contract: a slow boot that keeps finishing steps is not a
// failure; boot that stops moving for twenty seconds is, and so is boot that
// is still going after two minutes. Runs the real script with fake timers.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("boot-safety-net");
const source = read("app/core/boot-safety-net.js");
const bootSource = read("app/core/boot.js");

function harness() {
  let clock = 0;
  let timers = [];
  const failures = [];
  const dataset = {};
  const window = {
    performance: { now: () => clock },
    setTimeout: (fn, ms) => { timers.push({ at: clock + ms, fn }); return timers.length; },
    addEventListener() {},
    showBootFailure: (error) => failures.push(error.message),
  };
  const document = { body: { dataset, classList: { add() {} } }, getElementById: () => null };
  const context = vm.createContext({ window, document, console: { error() {} }, Date });
  vm.runInContext(source, context);
  const advance = (ms) => {
    const end = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers = timers.slice(1);
      clock = next.at;
      next.fn();
    }
    clock = end;
  };
  return { window, dataset, failures, advance };
}

{
  const h = harness();
  h.advance(20000);
  test.assert(h.failures.length === 1 && /no progress for 20 seconds/.test(h.failures[0]) && h.dataset.appReady === "error",
    "boot that never reports a step fails after twenty seconds");
}
{
  const h = harness();
  for (let step = 0; step < 6; step += 1) { h.advance(9000); h.window.AISystem6BootProgress(`step ${step}`); }
  h.dataset.appReady = "ready";
  h.advance(60000);
  test.assert(h.failures.length === 0, "a 54-second boot that keeps finishing steps is not reported as a failure");
  test.assert(h.window.AISystem6BootProgressLog().length === 6, "the progress log keeps the steps boot reported");
}
{
  const h = harness();
  h.advance(15000); h.window.AISystem6BootProgress("desk state");
  h.advance(19000);
  test.assert(h.failures.length === 0, "the stall clock restarts at each step");
  h.advance(1500);
  test.assert(h.failures.length === 1 && /last step: desk state/.test(h.failures[0]), "a stall twenty seconds after the last step fails and names that step");
}
{
  const h = harness();
  for (let at = 0; at < 130000; at += 5000) { h.window.AISystem6BootProgress("looping"); h.advance(5000); }
  test.assert(h.failures.length === 1 && /within 120 seconds/.test(h.failures[0]), "boot that keeps reporting but never finishes fails at the two-minute ceiling");
}
{
  const h = harness();
  h.dataset.appReady = "ready";
  h.advance(200000);
  test.assert(h.failures.length === 0, "a ready desk is never replaced by the failure screen");
}

test.assertIncludes(bootSource, "function markBootProgress(step)", "boot reports its progress to the safety net");
test.assertIncludes(bootSource, "} finally {\n    markBootProgress(label);", "every boot step reports when it ends, failed or not");
test.assertIncludes(bootSource, 'markBootProgress("appearance");', "the appearance wait, the slowest step under Liquid Glass, reports too");

test.finish();
