// A minimize control is a control, or it is not drawn at all.
//
// The owner's ruling of 2026-09-25: a Mac OS X era draws its yellow lamp only
// together with its Dock, because a window put away needs a place to go and a
// way back. No era has its Dock yet, so no era grants the registry capability
// `minimize-lamp`; Big Sur, which drew a three-lamp leading group for two days,
// draws the product's close-left / zoom-right pair again. NeXTSTEP keeps its
// own miniaturize button and its Dock's miniwindows, and it is the era this
// contract uses to pin the state machine the coming Docks will share.
//
// Minimize is not WindowShade. Rolling a window up in place stays the title-bar
// double-click in every era, and Hide keeps using it. So two more rules live
// here: a miniaturized window that lands in an appearance with no way back is
// rolled up where it stood (never released to full size, never stranded), and
// bringing an application forward unrolls only what Hide rolled up -- a window
// the writer rolled up is the writer's (Mac OS 8 HIG).
//
// This contract runs the real boot and the real appearance registry. One
// harness limit is worth naming: a title bar whose controls come from the
// <template> in index.html has no close box in this VM, so the document window
// used for the controls below is Note Pad, whose control is static markup.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("window-minimize-lamp");
const vmw = createAppBootVm();

// The boot VM boots the eager module set. The miniaturize state machine and the
// NeXTSTEP shell are lazy modules, and two browser primitives they reach for
// are missing from the shim's DOM. Declared here, next to the contract that
// boots them, so the shared harness keeps serving the modules it was built for.
vmw.run(`
  if (typeof document.createComment !== "function") {
    document.createComment = (text) => Object.assign(document.createElement("#comment"), { textContent: text });
  }
  if (typeof queueMicrotask !== "function") queueMicrotask = (fn) => Promise.resolve().then(fn);
`);

const lampCount = () => vmw.run('document.querySelectorAll(".window[data-window] > .title-bar > .minimize-box").length');
const has = (name, cls) => vmw.run(`getWindow(${JSON.stringify(name)}).classList.contains(${JSON.stringify(cls)})`);

test.assert(
  vmw.run('document.querySelectorAll(".window[data-window]").length > 0 ? "yes" : "no"') === "yes",
  "the desk really has managed windows, so an absent lamp means absent and not an empty desk",
);

// 1. The registry rule. A lamp ships with its era's Dock or not at all.
const lampEras = vmw.run('AISystem6Theme.themes.filter((theme) => theme.capabilities.includes("minimize-lamp")).map((theme) => theme.id)');
test.assert(
  vmw.run('AISystem6Theme.themes.every((theme) => !theme.capabilities.includes("minimize-lamp") || theme.capabilities.includes("dock"))'),
  "no appearance grants the minimize lamp unless it also has a dock capability",
);
test.assert(lampEras.length === 0, `no appearance grants the minimize lamp today, because no era's Dock has shipped (found: ${lampEras.join(", ") || "none"})`);

// 2. An era whose windows had no miniaturize button carries no lamp and loads
//    no module: adding a shared control must not restyle Classic or Platinum.
await vmw.context.AISystem6Theme.applyTheme("classic", { announce: false, persist: false });
test.assert(lampCount() === 0, "Classic draws no minimize lamp, because its windows never had one");
test.assert(
  vmw.run("!window.AISystem6WindowMinimizeLoaded"),
  "and it does not load the miniaturize module at all, so an era without the control pays nothing for it",
);

// 3. Big Sur, the era that shipped the lamp without its Dock, draws none now.
await vmw.context.AISystem6Theme.applyTheme("big-sur", { persist: false });
await vmw.context.AISystem6Theme.whenReady();
test.assert(vmw.run('AISystem6Theme.hasCapability("minimize-lamp") === false'), "Big Sur does not grant the minimize lamp");
test.assert(lampCount() === 0, "Big Sur draws no minimize lamp on any window");
test.assert(
  vmw.run("!window.AISystem6WindowMinimizeLoaded"),
  "and Big Sur does not load the miniaturize module",
);
test.assert(
  vmw.run('getWindow("notePad").querySelector(":scope > .title-bar > .close-box") !== null'),
  "Big Sur's windows keep their Close lamp, so the absence above is the yellow lamp's alone",
);

// 4. NeXTSTEP's miniaturize button acts on the window it sits on, and the
//    window that comes back from its Dock miniwindow is the same element with
//    the writer's text, caret and scroll: miniaturizing is not "close and
//    reopen", and two slips that look alike are not interchangeable when one
//    of them holds unsaved work.
await vmw.context.AISystem6Theme.applyTheme("nextstep", { persist: false });
await vmw.waitFor(() => vmw.run("!!window.AISystem6NextstepShellLoaded && !!window.AISystem6WindowMinimizeLoaded && !!window.AISystem6NextstepDock"));
await vmw.context.handleAction("open-note-pad");
vmw.run("window.AISystem6NextstepShell.sync()");
const notePadApp = vmw.run('getWindowAppId(getWindow("notePad"))');
test.assert(
  vmw.run('getWindow("notePad").querySelector(":scope > .title-bar > .nextstep-miniaturize") !== null'),
  "a NeXTSTEP document window carries the miniaturize button",
);
test.assert(
  vmw.run('document.querySelector(\'.window[data-window="about"] > .title-bar > .nextstep-miniaturize\') === null'),
  "About refuses it, because that window is not a slip a writer miniaturizes",
);
test.assert(lampCount() === 0, "NeXTSTEP draws its own button, never the Mac OS X lamp");

const writerText = "The line I was in the middle of.\nAnd the line below it.\n";
vmw.run(`
  const field = document.getElementById("note-pad-text");
  field.value = ${JSON.stringify(writerText)};
  field.dispatchEvent(new Event("input"));
  field.focus();
  field.setSelectionRange(11, 11);
  field.scrollTop = 36;
  field.__contractId = "same-node";
`);
vmw.run('getWindow("notePad").querySelector(":scope > .title-bar > .nextstep-miniaturize").dispatchEvent(new Event("click"))');
test.assert(has("notePad", "is-minimized"), "pressing the button miniaturizes that window instead of doing nothing or closing it");
test.assert(!has("notePad", "is-active"), "a miniaturized window gives up the front, because it is no longer on screen");
vmw.run("window.AISystem6NextstepDock.sync()");
await vmw.waitFor(() => vmw.run('!!document.querySelector(\'.nextstep-dock-windows [data-miniwindow="notePad"]\')'));
vmw.run('document.querySelector(\'.nextstep-dock-windows [data-miniwindow="notePad"]\').dispatchEvent(new Event("dblclick"))');
await vmw.waitFor(() => !has("notePad", "is-minimized"));
test.assert(
  vmw.run('document.getElementById("note-pad-text").__contractId === "same-node"'),
  "the window that returns from its miniwindow is the same document node, not a reopened copy",
);
test.assert(
  vmw.run('document.getElementById("note-pad-text").value') === writerText,
  "the writer's own text survives the round trip through the miniwindow",
);
test.assert(
  vmw.run('(() => { const f = document.getElementById("note-pad-text"); return f.selectionStart === 11 && f.selectionEnd === 11 && f.scrollTop === 36; })()'),
  "the caret and the scroll position come back with the window",
);

// 5. The application entry. NeXTSTEP's application icon activates the
//    application and leaves a miniwindow where it is, because there the window
//    has its own icon; on a system-owned menu bar the application row is also
//    the way back to a window that is no longer on screen.
vmw.run('runtimeEnvironment = "multifinder"');
test.assert(
  vmw.run(`(() => {
    const app = ${JSON.stringify(notePadApp)};
    visibleWindowsForApp(app).forEach((win) => minimizeWindow(win));
    return visibleWindowsForApp(app).length;
  })()`) === 0,
  "the fixture really puts every window of the application away",
);
vmw.run(`switchToApp(${JSON.stringify(notePadApp)})`);
test.assert(
  vmw.run(`visibleWindowsForApp(${JSON.stringify(notePadApp)}).length === 0`),
  "the application icon alone (NeXTSTEP's Dock) activates the application and leaves the window miniaturized",
);
await vmw.context.AISystem6Theme.applyTheme("aqua", { persist: false });
test.assert(has("notePad", "is-minimized"), "Aqua under MultiFinder keeps it put away, because its switcher lists put-away windows");
vmw.run("renderMultiFinderMenu()");
test.assert(
  vmw.run('document.querySelector(\'#multifinder-popover .multifinder-miniwindow[data-miniwindow="notePad"]\') !== null'),
  "the switcher names the window that was put away, so it is not a window with no way back",
);
vmw.run(`activateApplicationRow(${JSON.stringify(notePadApp)})`);
test.assert(
  vmw.run(`visibleWindowsForApp(${JSON.stringify(notePadApp)}).length > 0`),
  "asking for an application whose windows are all miniaturized brings one back rather than opening nothing",
);
vmw.run('minimizeWindow(getWindow("notePad"))');
test.assert(
  vmw.run(`(() => {
    const module = window.AISystem6WindowMinimize;
    delete window.AISystem6WindowMinimize;
    try {
      renderMultiFinderMenu();
      const row = document.querySelector('#multifinder-popover .multifinder-miniwindow[data-miniwindow="notePad"]');
      row?.dispatchEvent(new Event("click"));
      return Boolean(row) && !getWindow("notePad").classList.contains("is-minimized");
    } finally {
      window.AISystem6WindowMinimize = module;
    }
  })()`),
  "and its row brings it back even in an era that never loaded the miniaturize module",
);

// 6. No way back means WindowShade in place, never a stranded window and never
//    a full release. Classic's Apple menu lists applications but not windows,
//    so a window that was miniaturized elsewhere is rolled up where it stood:
//    a title bar on the desk, unrolled by the double-click every era has.
vmw.run('minimizeWindow(getWindow("notePad"))');
await vmw.context.AISystem6Theme.applyTheme("classic", { persist: false });
test.assert(vmw.run("appearanceHoldsMiniwindows() === false"), "Classic has no way back to a miniwindow");
test.assert(!has("notePad", "is-minimized"), "so the window is no longer put away where nothing can reach it");
test.assert(has("notePad", "is-collapsed") && !has("notePad", "is-hidden"), "it is rolled up in place, WindowShade, still on the desk");
test.assert(
  vmw.run('document.getElementById("note-pad-text").value') === writerText,
  "the rolled-up window still holds the writer's text",
);
vmw.run('toggleCollapsed(getWindow("notePad"))');
test.assert(!has("notePad", "is-collapsed"), "and the ordinary WindowShade toggle unrolls it");
test.assertMatches(
  read("app/core/boot.js"),
  /await window\.AISystem6Theme\?\.whenReady\(\);[\s\S]{0,400}releaseOrphanedMiniwindows\(\);\s*document\.body\.dataset\.appReady = "ready";/,
  "boot asks the same question once the appearance is final, so a saved miniwindow cannot reopen hidden",
);

// 7. On a phone the screen belongs to one window. Putting that window away must
//    hand the screen on, not leave it full-screen with a minimized flag; and a
//    window caught in that state by an appearance with no way back was never
//    hidden, so only its flag is cleared.
await vmw.context.AISystem6Theme.applyTheme("aqua", { persist: false });
const portraitBefore = vmw.run("isPortraitDocumentFlow");
vmw.context.isPortraitDocumentFlow = () => true;
try {
  await vmw.context.openWindow("teachText");
  vmw.run('focusWindow(getWindow("teachText")); syncMobileAppForeground();');
  test.assert(has("teachText", "is-mobile-fullscreen"), "the phone fixture really gives TeachText the screen");
  vmw.run('minimizeWindow(getWindow("teachText"))');
  test.assert(
    has("teachText", "is-minimized") && !has("teachText", "is-mobile-fullscreen"),
    "a window put away on a phone gives up the full-screen shell",
  );
  vmw.run('restoreMinimizedWindow(getWindow("teachText"))');
  test.assert(
    !has("teachText", "is-minimized") && has("teachText", "is-mobile-fullscreen"),
    "and the window that comes back takes the screen again",
  );
  vmw.run('getWindow("teachText").classList.add("is-minimized")');
  await vmw.context.AISystem6Theme.applyTheme("classic", { persist: false });
  test.assert(
    !has("teachText", "is-minimized") && !has("teachText", "is-collapsed"),
    "a full-screen window caught flagged by an era with no way back only loses the flag, because it was never hidden",
  );
} finally {
  vmw.context.isPortraitDocumentFlow = portraitBefore;
  vmw.run("syncMobileAppForeground()");
}

// 8. Hide rolls an application's windows up and marks them; showing the
//    application unrolls the marked ones and nothing else. A window the writer
//    rolled up stays rolled up when its application comes forward.
vmw.run(`
  runtimeEnvironment = "multifinder";
  for (const name of ["notePad", "teachText"]) {
    const win = getWindow(name);
    if (win.classList.contains("is-collapsed")) toggleCollapsed(win);
  }
  toggleCollapsed(getWindow("notePad"));
`);
const teachTextApp = vmw.run('getWindowAppId(getWindow("teachText"))');
test.assert(has("notePad", "is-collapsed") && !has("teachText", "is-collapsed"), "the fixture has one window the writer rolled up and one open");
vmw.run(`hideApp(${JSON.stringify(notePadApp)}); hideApp(${JSON.stringify(teachTextApp)});`);
test.assert(has("teachText", "is-collapsed"), "Hide rolls the open window up");
vmw.run(`switchToApp(${JSON.stringify(notePadApp)})`);
test.assert(has("notePad", "is-collapsed"), "switching to an application leaves the window the writer rolled up rolled up");
vmw.run(`switchToApp(${JSON.stringify(teachTextApp)})`);
test.assert(!has("teachText", "is-collapsed"), "and unrolls the window Hide rolled up");
vmw.run(`hideApp(${JSON.stringify(teachTextApp)}); focusWindow(getWindow("teachText")); switchToApp(${JSON.stringify(teachTextApp)});`);
test.assert(!has("teachText", "is-collapsed"), "clicking a hidden application's rolled-up window first does not cost Hide its mark");
vmw.run(`hideApp(${JSON.stringify(teachTextApp)}); showAllApps();`);
test.assert(
  !has("teachText", "is-collapsed") && has("notePad", "is-collapsed"),
  "Show All undoes Hide the same way, and leaves the writer's own shade alone",
);

test.finish();
