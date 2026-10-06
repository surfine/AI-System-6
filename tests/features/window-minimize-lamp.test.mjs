// A minimize control is a control, or it is not drawn at all.
//
// The owner's ruling of 2026-09-25: a Mac OS X era draws its yellow lamp only
// together with its Dock, because a window put away needs a place to go and a
// way back. Snow Leopard's Dock shipped first, and every Mac OS X era's Dock
// followed the same day, so the seven Mac OS X eras grant the registry
// capability `minimize-lamp` together with `dock`, and no Classic-family era
// does. Big Sur, which once drew a lamp with no Dock behind it for two days,
// now draws it because its Dock is there. NeXTSTEP keeps its own
// miniaturize button and its Dock's miniwindows, and it is the era this
// contract uses to pin the state machine the Mac OS X Dock shares.
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
test.assert(
  JSON.stringify(lampEras) === JSON.stringify(["aqua", "tiger", "snow-leopard", "lion", "yosemite", "big-sur", "liquid-glass"]),
  `the seven Mac OS X eras grant the minimize lamp, each with its Dock (found: ${lampEras.join(", ") || "none"})`,
);
test.assert(
  vmw.run('AISystem6Theme.themes.filter((theme) => ["classic", "nextstep"].includes(theme.family)).every((theme) => !theme.capabilities.includes("minimize-lamp"))'),
  "no Classic-family era and not NeXTSTEP grants the Mac OS X lamp: their windows never had one",
);

// 2. An era whose windows had no miniaturize button carries no lamp and loads
//    no module: adding a shared control must not restyle Classic or Platinum.
await vmw.context.AISystem6Theme.applyTheme("classic", { announce: false, persist: false });
test.assert(lampCount() === 0, "Classic draws no minimize lamp, because its windows never had one");
test.assert(
  vmw.run("!window.AISystem6WindowMinimizeLoaded"),
  "and it does not load the miniaturize module at all, so an era without the control pays nothing for it",
);

// 3. Big Sur, the era that once shipped the lamp without its Dock, draws it
//    again now that its Dock is there.
await vmw.context.AISystem6Theme.applyTheme("big-sur", { persist: false });
await vmw.context.AISystem6Theme.whenReady();
await vmw.waitFor(() => vmw.run("!!window.AISystem6WindowMinimizeLoaded"));
test.assert(vmw.run('AISystem6Theme.hasCapability("minimize-lamp") && AISystem6Theme.hasCapability("dock")'), "Big Sur grants the lamp together with its Dock");
// Owner, 2026-09-25 evening: until the writer asks for it, a Mac OS X era
// draws no yellow lamp (and no Dock) — the verb starts off.
vmw.run('localStorage.removeItem("ai-system-6-minimize"); localStorage.removeItem("ai-system-6-dock"); window.AISystem6WindowMinimize.syncLamps()');
test.assert(
  vmw.run("window.AISystem6WindowMinimize.minimizeEnabled() === false") && lampCount() === 0,
  "with no stored choice Big Sur starts with minimize off and draws no yellow lamp",
);
vmw.run("window.AISystem6WindowMinimize.setMinimizeEnabled(true); window.AISystem6WindowMinimize.setDockVisible(true)");
test.assert(
  vmw.run('getWindow("notePad").querySelector(":scope > .title-bar > .close-box + .minimize-box") !== null'),
  "Big Sur's yellow lamp sits right after Close, the order the group is drawn in",
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
await vmw.context.AISystem6Theme.applyTheme("platinum", { persist: false });
// Platinum draws no lamp and has no Dock, so this desk has no way back to a
// miniwindow and releaseOrphanedMiniwindows rolls the window up in place.
test.assert(
  !has("notePad", "is-minimized"),
  "Platinum neither draws the lamp nor has a Dock, so a window put away under NeXTSTEP is rolled up rather than left in a list that does not exist",
);
await vmw.context.AISystem6Theme.applyTheme("aqua", { persist: false });
// Aqua draws the lamp and has its Dock, and under MultiFinder its switcher
// lists the put-away windows too.
vmw.run(`(() => {
  const win = getWindow("notePad");
  if (win.classList.contains("is-collapsed")) toggleCollapsed(win);
  focusWindow(win);
  minimizeWindow(win);
})()`);
test.assert(has("notePad", "is-minimized"), "the window is put away again, this time while the module owns the state");
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
// The put-away list moved into the module, so with no module there is no list
// at all. That is safe because a desk without the module never has a window in
// this state (releaseOrphanedMiniwindows rolls it up), so the two absences
// agree -- there is nothing stranded.
test.assert(
  vmw.run(`(() => {
    const module = window.AISystem6WindowMinimize;
    delete window.AISystem6WindowMinimize;
    try {
      renderMultiFinderMenu();
      return document.querySelector('#multifinder-popover .multifinder-miniwindow[data-miniwindow="notePad"]') === null;
    } finally {
      window.AISystem6WindowMinimize = module;
    }
  })()`),
  "with no miniaturize module there is no put-away list, because that module now owns both the state and the rows",
);
vmw.run("renderMultiFinderMenu()");
test.assert(
  vmw.run(`(() => {
    const row = document.querySelector('#multifinder-popover .multifinder-miniwindow[data-miniwindow="notePad"]');
    row?.dispatchEvent(new Event("click"));
    return Boolean(row) && !getWindow("notePad").classList.contains("is-minimized");
  })()`),
  "and its row (drawn by the module) brings it back, the same call the Dock will use",
);

// 5b. The Apple menu's own list of put-away windows. It lives in the module
//     (renderAppleMenuSection) and is filled into #apple-minimized-windows, the
//     container index.html leaves in the Apple menu popover. In Finder mode,
//     where no switcher is shown, it is the only list a writer can reach.
await vmw.context.AISystem6Theme.applyTheme("nextstep", { persist: false });
await vmw.context.AISystem6Theme.whenReady();
vmw.run(`(() => {
  runtimeEnvironment = "finder";
  document.querySelectorAll(".window[data-window]").forEach((win) => {
    win.classList.add("is-hidden");
    win.classList.remove("is-minimized", "is-active", "is-collapsed", "is-app-hidden");
  });
})()`);
await vmw.context.openWindow("notePad");
vmw.run('focusWindow(getWindow("notePad")); minimizeWindow(getWindow("notePad"));');
test.assert(has("notePad", "is-minimized"), "Finder mode really puts the window away");
test.assert(
  vmw.run('document.getElementById("apple-minimized-windows").classList.contains("is-hidden") === false'),
  "the Apple menu's minimized-windows section is shown the moment a window is put away, because in Finder mode it is the only list",
);
const appleRow = () => vmw.run(`(() => {
  const row = document.querySelector('#apple-minimized-windows .apple-minimized-window[data-miniwindow="notePad"]');
  return row ? { text: row.textContent, action: row.dataset.action ?? null, node: row } : null;
})()`);
const appleRowBefore = appleRow();
test.assert(appleRowBefore !== null, "and it holds a row for the window, grouped under the put-away list");
test.assert(
  typeof appleRowBefore?.text === "string" && appleRowBefore.text.startsWith("◆"),
  "the row is marked with the leading diamond the Mac OS X Window menu uses for a minimized window",
);
test.assert(
  appleRowBefore?.action === null,
  "the row carries no data-action, because the NeXTSTEP menu mirrors every .apple-menu-popover > [data-action] and a delegate would double-handle the click",
);
vmw.run(`(() => {
  const win = getWindow("notePad");
  win.__appleRowSentinel = "same-node";
  document.querySelector('#apple-minimized-windows .apple-minimized-window[data-miniwindow="notePad"]').dispatchEvent(new Event("click"));
})()`);
test.assert(
  vmw.run('!getWindow("notePad").classList.contains("is-minimized") && getWindow("notePad").__appleRowSentinel === "same-node"'),
  "clicking the Apple menu row restores the same window node, not a reopened copy",
);
test.assert(
  vmw.run('document.getElementById("apple-minimized-windows").classList.contains("is-hidden") === true'),
  "and the section hides again once nothing is put away",
);

// 5c. Mac OS X's next-focus rule. Minimizing an application's last window
//     leaves the application frontmost; the old rule handed the front to
//     whatever window was next in the z-order (and to "finder" when there was
//     none), which is not what a Mac does. The focus only leaves the window.
vmw.run(`(() => {
  runtimeEnvironment = "multifinder";
  document.querySelectorAll(".window[data-window]").forEach((win) => {
    win.classList.add("is-hidden");
    win.classList.remove("is-minimized", "is-active", "is-collapsed", "is-app-hidden");
  });
})()`);
await vmw.context.openWindow("notePad");
vmw.run('focusWindow(getWindow("notePad"))');
test.assert(has("notePad", "is-active"), "the fixture has Note Pad in front and it is its application's only open window");
// No other application's window is visible, so the old rule would have set
// activeAppId to "finder"; the Mac rule keeps the window's own application.
vmw.run('minimizeWindow(getWindow("notePad"))');
test.assert(
  vmw.run(`activeAppId === ${JSON.stringify(notePadApp)} && activeAppId !== "finder"`),
  "minimizing an application's only window leaves that application in front, not Finder",
);
test.assert(
  vmw.run('document.activeElement === document.body || !document.activeElement?.classList?.contains("window")'),
  "and only the caret leaves the window; the application still owns the front",
);

// 5d. Two windows of one application: putting the front one away brings the
//     other one of the same application forward, never a window of another app.
vmw.run(`document.querySelectorAll(".window[data-window]").forEach((win) => {
  win.classList.add("is-hidden");
  win.classList.remove("is-minimized", "is-active", "is-collapsed", "is-app-hidden");
})`);
await vmw.context.openWindow("documents");
await vmw.context.openWindow("projects");
const documentsApp = vmw.run('getWindowAppId(getWindow("documents"))');
const projectsApp = vmw.run('getWindowAppId(getWindow("projects"))');
if (documentsApp !== projectsApp) {
  test.assert(false, `skipping the same-application pair check: documents is ${documentsApp} and projects is ${projectsApp}, so the VM has no two windows sharing an application`);
} else {
  vmw.run('focusWindow(getWindow("documents"))');
  test.assert(has("documents", "is-active"), "the fixture has the first window of the pair in front");
  vmw.run('minimizeWindow(getWindow("documents"))');
  test.assert(has("documents", "is-minimized"), "the first window is put away");
  test.assert(
    vmw.run('getWindow("projects").classList.contains("is-active")'),
    "and the other window of the same application comes forward, not a window of another application",
  );
  test.assert(
    vmw.run(`activeAppId === ${JSON.stringify(projectsApp)}`),
    "the same application stays in front, the rule it shares with the single-window case",
  );
}

// 5e. Writer Mode draws no lamp and has no Dock, so a window must not vanish
//     into a list that is not on that desk.
const writerModeBefore = vmw.run("writerMode");
vmw.run("writerMode = true");
test.assert(
  vmw.run('minimizeWindow(getWindow("projects")) === false'),
  "with Writer Mode on, minimize refuses outright rather than flagging a window no control there can restore",
);
test.assert(
  vmw.run('!getWindow("projects").classList.contains("is-minimized")'),
  "and the window is left exactly as it was",
);
vmw.run(`writerMode = ${writerModeBefore === true ? "true" : "false"}`);

// Return the desk to the state step 6 expects: Note Pad visible again, the
// pair used above out of the way.
vmw.run(`(() => {
  for (const name of ["documents", "projects"]) getWindow(name)?.classList.add("is-hidden");
  const win = getWindow("notePad");
  win.classList.remove("is-hidden", "is-minimized", "is-collapsed");
})()`);

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
  /await (?:startupTaskWithTimeout\()?window\.AISystem6Theme\?\.whenReady\?\.\(\)[\s\S]{0,500}releaseOrphanedMiniwindows\(\);\s*document\.body\.dataset\.appReady = "ready";/,
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
