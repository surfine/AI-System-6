// IME safety: while Chinese/Japanese/Korean composition is in flight, Enter
// must never submit, confirm, save, or dispatch a shortcut.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("input-method-safety");
const guardSource = read("app/core/input-guard.js");
const modal = read("app/core/modal.js");
const wireup = read("app/core/wireup.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const markdownEditor = read("app/core/markdown-editor.js");
const alarmClock = read("app/features/alarm-clock.js");
const clioChart = read("app/features/clio-chart.js");
const liquidCover = read("app/features/liquid-cover.js");
const actions = read("app/core/actions.js");
const askBar = read("app/core/ask-bar.js");

// The shared guard treats isComposing and the legacy WebKit 229 as composing.
{
  const context = vm.createContext({ window: {} });
  vm.runInContext(guardSource, context);
  const isComposition = context.window.AISystem6InputGuard.isComposition;
  test.assert(isComposition({ isComposing: true }) === true, "isComposing blocks submission");
  test.assert(isComposition({ isComposing: false, keyCode: 229 }) === true, "keyCode 229 blocks submission on legacy WebKit");
  test.assert(isComposition({ isComposing: false, keyCode: 13 }) === false, "a plain Enter is not composition");
  test.assert(isComposition({ isComposing: false, key: "Enter" }) === false, "a plain keydown Enter is not composition");
}

// Every Enter-submit path routes through the shared guard.
test.assertIncludes(actions, "eventIsTextComposition(event)", "global shortcut dispatch skips composition");
test.assertIncludes(modal, '!eventIsTextComposition(event)', "the input modal does not confirm during composition");
test.assertIncludes(wireup, "eventIsTextComposition(event)", "ClioTalk composer skips composition Enter");
test.assertIncludes(wireup, "projectDiskNameInput.addEventListener", "project name input is guarded");
test.assertIncludes(wireup, "readerUrlInput.addEventListener", "Reader URL input is guarded");
test.assertIncludes(desktopRuntime, '!eventIsTextComposition(event)', "the new-project dialog is guarded");
test.assertIncludes(markdownEditor, '!eventIsTextComposition(event)', "the Markdown editor does not transform during composition");
test.assertIncludes(alarmClock, '!eventIsTextComposition(event)', "Alarm Clock does not commit during composition");
test.assertIncludes(clioChart, '!eventIsTextComposition(event)', "ClioChart does not edit cells during composition");
test.assertIncludes(liquidCover, '!eventIsTextComposition(event)', "Cover Glass does not finish during composition");

// Draft Desk has no Enter-to-generate path: the body is a multiline textarea
// and generation is button-driven, so composition can never fire a draft.
test.assertNotIncludes(askBar, 'event.key === "Enter"', "ask bars never intercept Enter themselves");
test.assertIncludes(
  wireup,
  'event.key !== "Enter" || eventIsTextComposition(event)',
  "the composer's Enter path is the guarded one"
);

test.finish();
