// The second pilot: the same instance interfaces on a different application.
// Binding happens once per mount cycle, a real destroy releases the bindings
// and the next mount binds again, and an answer that arrives after the pad
// moved on is not written into it.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import vm from "node:vm";

const test = createFeatureTest("translation-pad-instance");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

// The pad's window is built by the control panel module, so the harness loads
// the modules the real boot would have loaded before the pad is opened.
["app/features/translation-pad.js"].forEach((path) => {
  vm.runInContext(read(path), vmw.context, { filename: path });
});

test.assert(
  run('typeof window.AISystem6TranslationPad?.dispose === "function"') === true,
  "the pad exposes a dispose step for a real destroy"
);

const binding = await run(`
  (() => {
    const api = window.AISystem6TranslationPad;
    api.mount();
    api.mount();
    const bound = api.resourceCount();
    const first = api.dispose();
    const second = api.dispose();
    const released = api.resourceCount();
    api.mount();
    return { bound, first: first.disposed, second: second.disposed, released, rebound: api.resourceCount() };
  })()
`);
test.assert(binding.bound > 0, "mounting the pad binds its controls");
test.assert(
  binding.first === true && binding.second === false,
  "dispose runs once and a second call is a no-op"
);
test.assert(binding.released === 0, "a destroyed pad holds no bindings");
test.assert(binding.rebound === binding.bound, "the next mount binds again, exactly as many as before");

// --- A stale answer does not overwrite the pad ------------------------------
const stale = await run(`
  (async () => {
    const api = window.AISystem6TranslationPad;
    const source = document.querySelector("#translation-pad-source");
    const result = document.querySelector("#translation-pad-result");
    if (!source || !result) return { skipped: "the pad markup is not in this harness" };
    source.value = "A sentence that needs translating.";
    getTranslationTargetForUi = () => "zh";
    beginLongTask = () => true;
    endLongTask = () => {};
    const pending = [];
    translateTextWithLocalModel = (text) => new Promise((resolve) => {
      pending.push({ text, resolve });
    });

    const first = api.translate();
    await Promise.resolve();
    // A second run starts before the first answers, and the pad is what the
    // writer is looking at: only the current run may write it.
    const second = api.translate();
    await Promise.resolve();
    pending[0].resolve("OLD ANSWER");
    await first;
    pending[1].resolve("CURRENT ANSWER");
    await second;
    return { value: result.value, status: document.querySelector("#translation-pad-status")?.textContent || "" };
  })()
`);
test.assert(stale.skipped === undefined, "the pad markup is present in the harness");
test.assert(
  stale.value === "CURRENT ANSWER",
  "an answer from a superseded run does not overwrite the newer translation"
);

const cleared = await run(`
  (async () => {
    const api = window.AISystem6TranslationPad;
    const source = document.querySelector("#translation-pad-source");
    const result = document.querySelector("#translation-pad-result");
    source.value = "Another sentence.";
    let resolveModel = null;
    translateTextWithLocalModel = () => new Promise((resolve) => { resolveModel = resolve; });
    const pending = api.translate();
    await Promise.resolve();
    // The writer clears the pad while the model is still working; the answer
    // that is already on its way belongs to text that is gone.
    document.querySelector("#translation-pad-clear").dispatchEvent(new Event("click", { bubbles: true }));
    const afterClear = result.value;
    resolveModel("LATE ANSWER FOR CLEARED TEXT");
    await pending;
    return { afterClear, final: result.value };
  })()
`);
test.assert(
  cleared.afterClear === "" && cleared.final === "",
  "an answer for text the writer cleared does not refill the pad"
);

test.finish();
