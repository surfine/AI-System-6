// Real execution, converting a static family: keyboard-shortcuts.test.mjs
// checks the shape of keyboardShortcutRegistry and a handful of specific
// entries by reading actions.js as text. It cannot see whether pressing the
// actual key combination reaches handleAction — that depends on real
// runtime facts (activeAppId, document.activeElement, scope matching) a
// source read cannot evaluate.
//
// This fires real keydown events through document-level dispatch — the same
// path wireup.js's own keydown listener uses to call runShortcut() — via
// app-boot-vm.mjs's fireKeydown, and confirms three distinct real behaviors:
// a global shortcut opening its window, a scoped shortcut requiring the
// right activeAppId, and suppressInEditable actually suppressing dispatch
// while the caret is in a text field (not just existing as a flag in the
// registry — the flag doing its job).

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("keyboard-shortcut-dispatch");

function spyOnHandleAction(vmw) {
  vmw.run(`
    globalThis.__handleActionCalls = [];
    globalThis.__originalHandleAction = handleAction;
    handleAction = (...args) => { __handleActionCalls.push(args[0]); return __originalHandleAction(...args); };
  `);
  return () => vmw.run("__handleActionCalls");
}

// Case 1: a global-scope shortcut (⌘, — Control Panel) opens its window from
// a cold boot, with no project or app focus required.
{
  const vmw = createAppBootVm();
  const controlWindow = vmw.windowElement("control");
  // Closed, not hidden. index.html gives the Control Panel `is-collapsed`
  // rather than `is-hidden` — one of four windows that start that way — and
  // window-manager.js reads both as "not on screen". This line asked for
  // `is-hidden` while the harness invented its own window element to answer
  // with; it now reads the real markup.
  test.assert(
    controlWindow.classList.contains("is-collapsed") || controlWindow.classList.contains("is-hidden"),
    "Control Panel starts closed (test setup sanity)",
  );

  vmw.fireKeydown(vmw.document.body, { key: ",", metaKey: true });
  const settled = await vmw.waitFor(() => controlWindow.classList.contains("is-active"));
  test.assert(settled, "pressing Cmd+, dispatches through runShortcut() and opens the real Control Panel window");
}

// Case 2: a scope-gated shortcut (⌘1 — Question Sheet, scope ["teachText"])
// only fires when activeAppId genuinely matches its scope.
{
  const vmw = createAppBootVm();
  vmw.run(`
    projects.push({ id: "shortcut-test", name: "Shortcut Test" });
    activeProjectId = "shortcut-test";
    activeProject = projects[0];
  `);
  const getCalls = spyOnHandleAction(vmw);

  vmw.run('activeAppId = "finder";');
  vmw.fireKeydown(vmw.document.body, { key: "1", metaKey: true });
  test.assert(
    !getCalls().includes("open-question-sheet"),
    "Cmd+1 does not dispatch Question Sheet while a different app (Finder) is focused"
  );

  vmw.run('activeAppId = "teachText";');
  vmw.fireKeydown(vmw.document.body, { key: "1", metaKey: true });
  test.assert(
    getCalls().includes("open-question-sheet"),
    "Cmd+1 dispatches Question Sheet once TeachText's app scope is actually focused"
  );
}

// Case 3: suppressInEditable actually suppresses dispatch — a Finder
// shortcut (⌘⌫ move-to-trash) must not fire while the caret sits in a real
// text input, and must fire normally otherwise.
{
  const vmw = createAppBootVm();
  vmw.run('activeAppId = "finder";');
  const getCalls = spyOnHandleAction(vmw);

  const textInput = vmw.makeElement("input");
  textInput.type = "text";
  vmw.document.activeElement = textInput;
  vmw.fireKeydown(vmw.document.body, { key: "backspace", metaKey: true });
  test.assert(
    !getCalls().includes("move-file-trash"),
    "Cmd+Backspace is suppressed while a real text input holds focus (suppressInEditable actually gates dispatch)"
  );

  vmw.document.activeElement = null;
  vmw.fireKeydown(vmw.document.body, { key: "backspace", metaKey: true });
  test.assert(
    getCalls().includes("move-file-trash"),
    "Cmd+Backspace dispatches normally once focus leaves the text input"
  );
}

test.finish();
// See control-panel-input-wiring.test.mjs's comment on this same line.
process.exit(0);
