// The Mac OS X Dock: a projection, not a second desk.
//
// The owner's ruling of 2026-09-25 gives a Mac OS X era its yellow minimize
// lamp only together with its Dock, because a window put away needs a place to
// go and a way back. Snow Leopard is the first era whose Dock ships, so this
// contract runs the real boot and the real Dock module against a real
// Snow Leopard desk and pins the user-visible promises the Dock makes:
//
//   - it is drawn only for an era that grants it (Classic neither draws it nor
//     loads the module, and NeXTSTEP keeps its own Dock);
//   - its cells are a PROJECTION of objects the desk already owns -- the icon
//     column's shown application cells, the running table, the put-away
//     windows, the Applications folder and the Trash -- so a cell the desk
//     withholds is not on the Dock either;
//   - one click activates (an application whose only windows are put away
//     brings the newest back, and a minimized window's cell restores the same
//     window node);
//   - the Trash cell carries the drop target the desk's drag-drop delegate
//     reads, so a file dropped on it lands in the same Trash;
//   - with Writer Mode on, or with the Dock switched off, the root is gone and
//     the reserve released, so nothing is stranded and no window is placed as
//     if a Dock were still there.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("desk-dock");
const vmw = createAppBootVm();

// The boot VM boots the eager module set; the miniaturize state machine and the
// Dock are lazy modules, and two browser primitives they reach for are missing
// from the shim's DOM. Declared here, next to the contract that boots them, so
// the shared harness keeps serving the modules it was built for.
vmw.run(`
  if (typeof document.createComment !== "function") {
    document.createComment = (text) => Object.assign(document.createElement("#comment"), { textContent: text });
  }
  if (typeof queueMicrotask !== "function") queueMicrotask = (fn) => Promise.resolve().then(fn);
`);

const dockCount = () => vmw.run('document.querySelectorAll(".desk-dock").length');
const dockShown = () => vmw.run('document.body.classList.contains("desk-dock-shown")');

// 1. An era that never had a Dock draws none and loads no module: adding a Dock
//    must not restyle Classic.
await vmw.context.AISystem6Theme.applyTheme("classic", { announce: false, persist: false });
await vmw.context.AISystem6Theme.whenReady();
test.assert(dockCount() === 0, "Classic draws no Dock, because its era never had one");
test.assert(
  vmw.run("!window.AISystem6DeskDockLoaded"),
  "and it does not load the Dock module at all, so an era without a Dock pays nothing for it",
);

// 2. NeXTSTEP keeps its own Dock. The `dock` capability is what keeps the two
//    renderers from ever drawing over each other.
await vmw.context.AISystem6Theme.previewExperimentalTheme("nextstep");
await vmw.waitFor(() => vmw.run("!!window.AISystem6NextstepDock"));
await vmw.context.AISystem6Theme.whenReady();
test.assert(
  vmw.run('AISystem6Theme.hasCapability("dock") === false'),
  "NeXTSTEP does not grant the Mac OS X dock capability, because it has its own Dock",
);
test.assert(dockCount() === 0, "and the Snow Leopard Dock renderer draws nothing under NeXTSTEP");

// 3. Snow Leopard, the first era whose Dock ships. The module loads and the
//    root appears, Finder first and Trash last with a separator between the
//    application shelf and the folders / windows / Trash.
await vmw.context.AISystem6Theme.applyTheme("snow-leopard", { persist: false });
await vmw.waitFor(() => vmw.run("!!window.AISystem6DeskDock && !!window.AISystem6DeskDockLoaded"));
await vmw.context.AISystem6Theme.whenReady();

// Owner, 2026-09-25 evening: in the Mac OS X eras the Dock and the yellow lamp
// start OFF ("需要时再打开"), so a writer who never opens the Control Panel sees
// the same WindowShade desk as every other era.
vmw.run('localStorage.removeItem("ai-system-6-dock"); localStorage.removeItem("ai-system-6-minimize")');
await new Promise((resolve) => setTimeout(resolve, 50));
test.assert(
  vmw.run("window.AISystem6WindowMinimize.dockVisible() === false && window.AISystem6WindowMinimize.minimizeEnabled() === false"),
  "with no stored choice, a Mac OS X era starts with the Dock hidden and minimize off",
);
test.assert(dockCount() === 0 && !dockShown(), "so no Dock is drawn and no bottom reserve is claimed");
test.assert(
  vmw.run('document.querySelectorAll(".window .minimize-box").length === 0'),
  "and no window draws a yellow lamp",
);

// The writer turns both on in the Control Panel; from here the Dock contract
// below describes a Dock someone asked for.
vmw.run("window.AISystem6WindowMinimize.setMinimizeEnabled(true); window.AISystem6WindowMinimize.setDockVisible(true)");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 1'));

test.assert(
  vmw.run('AISystem6Theme.hasCapability("dock") === true'),
  "Snow Leopard grants the dock capability",
);
test.assert(dockCount() === 1, "Snow Leopard renders exactly one Dock root");

const structure = vmw.run(`(() => {
  const root = document.querySelector(".desk-dock");
  const items = root?.querySelector(".desk-dock-items");
  const keys = [...(items?.querySelectorAll(".desk-dock-item") || [])].map((cell) => cell.dataset.dockKey);
  const shelf = root?.querySelector(".desk-dock > .desk-dock-shelf");
  return {
    role: items?.getAttribute("role") || "",
    shelfHidden: shelf?.getAttribute("aria-hidden") || "",
    shelfOutsideItems: shelf !== null && shelf !== items,
    keys,
    separators: items?.querySelectorAll(".desk-dock-separator").length || 0,
    trashDropTarget: items?.querySelector('[data-dock-key="trash"]')?.dataset.dropTarget || "",
  };
})()`);

test.assert(structure.role === "toolbar", "the item row is a toolbar");
test.assert(structure.shelfHidden === "true" && structure.shelfOutsideItems, "the painted shelf is a separate, decorative layer");
test.assert(structure.keys[0] === "finder", "Finder is the first cell");
test.assert(structure.keys[structure.keys.length - 1] === "trash", "Trash is the last cell");
test.assert(structure.separators === 1, "a separator divides the application shelf from the folders, windows and Trash");
test.assert(structure.trashDropTarget === "trash", "the Trash cell carries the data-drop-target the desk's drag-drop delegate reads");

// The projection rule: the Dock's application cells are exactly the icon
// column's non-hidden application cells, read as shown-or-not from the DOM.
const desktopAppCellCount = () => vmw.run('document.querySelectorAll(".icon-column .desktop-app-icon").length');
const visibleAppCellCount = () => vmw.run(
  '[...document.querySelectorAll(".icon-column .desktop-app-icon")].filter((c) => !c.classList.contains("is-hidden") && c.hidden !== true).length',
);
const dockFolderWindowCells = () => vmw.run(
  '[...document.querySelectorAll(".desk-dock-items .desk-dock-item")].filter((c) => !c.dataset.dockKey.startsWith("app:") && c.dataset.dockKey !== "finder" && c.dataset.dockKey !== "trash").length',
);

test.assert(desktopAppCellCount() > 0, "the desk's icon column really has application cells");
test.assert(
  vmw.run(
    '[...document.querySelectorAll(".icon-column .desktop-app-icon")].filter((c) => !c.classList.contains("is-hidden") && c.hidden !== true).length',
  ) === vmw.run(
    '[...document.querySelectorAll(".desk-dock-items .desk-dock-item")].filter((c) => c.dataset.dockKey.startsWith("cell:") || c.dataset.dockKey.startsWith("app:")).length',
  ),
  "the Dock's application cells equal the icon column's shown application cells",
);

// Withholding a cell from the desk withholds it from the Dock too, on the next
// sync -- the projection is the DOM's answer, not a second opinion.
const firstAppCellId = vmw.run('document.querySelector(".icon-column .desktop-app-icon")?.id || ""');
vmw.run(`document.getElementById(${JSON.stringify(firstAppCellId)}).classList.add("is-hidden")`);
vmw.run("window.AISystem6DeskDock.sync()");
await vmw.waitFor(() => vmw.run(`document.querySelectorAll(".desk-dock-items .desk-dock-item").length`)
  === vmw.run('1 + [...document.querySelectorAll(".icon-column .desktop-app-icon")].filter((c) => !c.classList.contains("is-hidden") && c.hidden !== true).length + 2'));
test.assert(
  vmw.run(`!document.getElementById(${JSON.stringify(firstAppCellId)}) || [...document.querySelectorAll(".desk-dock-items .desk-dock-item")].every((c) => c.dataset.dockKey !== ${JSON.stringify(`cell:${firstAppCellId}`)})`),
  "a cell the desk withholds disappears from the Dock after a sync",
);
vmw.run(`document.getElementById(${JSON.stringify(firstAppCellId)}).classList.remove("is-hidden")`);
vmw.run("window.AISystem6DeskDock.sync()");

test.assert(dockShown(), "the Dock claims the body class window placement reads");
test.assert(
  vmw.run('document.body.dataset.deskDockOwner === "desk-dock"'),
  "and it records itself as the reserve's owner, so it removes only its own claim",
);

// 4. A put-away window gets one cell, named for its window, and clicking it
//    restores the SAME window node.
vmw.run('runtimeEnvironment = "multifinder"');
await vmw.context.openWindow("notePad");
vmw.run('focusWindow(getWindow("notePad")); minimizeWindow(getWindow("notePad"));');
vmw.run("window.AISystem6DeskDock.sync()");
await vmw.waitFor(() => vmw.run('!!document.querySelector(\'.desk-dock-items [data-miniwindow="notePad"]\')'));
test.assert(
  vmw.run('document.querySelectorAll(\'.desk-dock-items [data-miniwindow="notePad"]\').length === 1'),
  "a put-away window gets exactly one Dock cell, keyed to its window",
);
test.assert(
  vmw.run('document.querySelector(\'.desk-dock-items [data-miniwindow="notePad"]\').classList.contains("is-miniwindow")'),
  "and the cell is marked as a miniwindow",
);
vmw.run(`(() => {
  const win = getWindow("notePad");
  win.__dockContractId = "same-node";
  document.querySelector('.desk-dock-items [data-miniwindow="notePad"]').dispatchEvent(new Event("click"));
})()`);
await vmw.waitFor(() => vmw.run('!getWindow("notePad").classList.contains("is-minimized")'));
test.assert(
  vmw.run('getWindow("notePad").__dockContractId === "same-node"'),
  "clicking the minimized-window cell restores the same window node, not a reopened copy",
);

// 5. An application whose only windows are put away brings the newest one back
//    when its Dock cell is clicked -- the way a person will actually find.
// Note Pad above is a desk accessory, and accessories have no Dock cell of
// their own; an application's cell needs an application, so TeachText.
await vmw.context.openWindow("teachText");
vmw.run(`(() => {
  const win = getWindow("teachText");
  focusWindow(win);
  minimizeWindow(win);
})()`);
const notePadApp = vmw.run('getWindowAppId(getWindow("teachText"))');
vmw.run("window.AISystem6DeskDock.sync()");
test.assert(
  vmw.run(`visibleWindowsForApp(${JSON.stringify(notePadApp)}).length === 0`),
  "the fixture really puts every window of the application away",
);
vmw.run(`document.querySelector('.desk-dock-items [data-dock-key="app:' + ${JSON.stringify(notePadApp)} + '"]').dispatchEvent(new Event("click"))`);
await vmw.waitFor(() => vmw.run(`visibleWindowsForApp(${JSON.stringify(notePadApp)}).length > 0`));
test.assert(
  vmw.run(`visibleWindowsForApp(${JSON.stringify(notePadApp)}).length > 0`),
  "clicking an application cell whose windows are all put away brings one back rather than opening nothing",
);

// 6. The one Writing Studio cell whose action would quit opens the studio's
//    default surface instead: a Dock click never quits.
vmw.run(`(() => {
  const cell = document.getElementById("finder-writing-studio-toggle");
  cell.classList.remove("is-hidden");
  cell.dataset.action = "exit-writing-studio";
})()`);
// Quitting would leave workspaceProfile at the desktop; the studio's default
// surface leaves it at writing.
await vmw.context.AISystem6Theme.whenReady();
vmw.run("window.AISystem6DeskDock.sync()");
await vmw.waitFor(() => vmw.run('!!document.querySelector(\'.desk-dock-items [data-dock-key="app:writingStudio"]\')'));
vmw.run(`document.querySelector('.desk-dock-items [data-dock-key="app:writingStudio"]').dispatchEvent(new Event("click"))`);
await vmw.waitFor(() => vmw.run('workspaceProfile !== "desktop"'), { tries: 400 });
test.assert(
  vmw.run('workspaceProfile !== "desktop"'),
  "clicking the Writing Studio cell whose action is exit-writing-studio opens the studio rather than quitting it",
);
vmw.run("setWorkspaceProfile(\"desktop\", { persist: false })");
vmw.run(`(() => {
  const cell = document.getElementById("finder-writing-studio-toggle");
  cell.dataset.action = "open-writing-studio";
})()`);

// 7. Writer Mode: the Dock is gone and the reserve is released, so no window is
//    placed as if a Dock were still there.
const writerModeBefore = vmw.run("writerMode");
vmw.run("writerMode = true; window.AISystem6DeskDock.sync();");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 0'));
test.assert(dockCount() === 0, "with Writer Mode on the Dock root is gone");
test.assert(!dockShown(), "and the reserve body class is released");
test.assert(
  vmw.run('document.body.dataset.deskDockOwner === undefined'),
  "and the owner claim is removed with it",
);
vmw.run(`writerMode = ${writerModeBefore === true ? "true" : "false"}; window.AISystem6DeskDock.sync();`);
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 1'));

// 8. Switching the Dock off removes it and leaves every put-away window
//    minimized: the Dock is an entry point, never a container of state.
vmw.run(`(() => {
  const win = getWindow("notePad");
  if (!win.classList.contains("is-minimized")) { focusWindow(win); minimizeWindow(win); }
})()`);
vmw.run("window.AISystem6DeskDock.sync()");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 1'));
test.assert(
  vmw.run('getWindow("notePad").classList.contains("is-minimized")'),
  "a window is put away while the Dock is on",
);
vmw.run("window.AISystem6WindowMinimize.setDockVisible(false)");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 0'));
test.assert(dockCount() === 0, "with the Dock switched off the root is gone");
test.assert(!dockShown(), "and the reserve is released with it");
test.assert(
  vmw.run('getWindow("notePad").classList.contains("is-minimized")'),
  "and the put-away window stays put away: the Dock was a way back, not the thing that held it",
);

// The minimize verb itself is a Control Panel switch (owner, 2026-09-25). Off:
// no lamp anywhere, the verb refuses, and a window already put away is rolled
// up where it stood rather than stranded; on again, the lamp returns.
vmw.run("window.AISystem6WindowMinimize.setDockVisible(true)");
const lampsOnDesk = () => vmw.run('document.querySelectorAll(".window[data-window] > .title-bar > .minimize-box").length');
test.assert(lampsOnDesk() > 0, "with minimize on, Snow Leopard's windows carry the yellow lamp");
vmw.run("window.AISystem6WindowMinimize.setMinimizeEnabled(false)");
test.assert(lampsOnDesk() === 0, "switched off, no window draws the lamp");
test.assert(vmw.run('document.body.classList.contains("minimize-off")'), "and the desk says so, for NeXTSTEP's own button");
test.assert(
  !vmw.run('getWindow("notePad").classList.contains("is-minimized")')
    && vmw.run('getWindow("notePad").classList.contains("is-collapsed")'),
  "the window that was put away is rolled up in place, still on the desk",
);
test.assert(
  vmw.run('minimizeWindow(getWindow("teachText")) === false'),
  "and the verb refuses while it is off",
);
test.assert(
  vmw.run('document.getElementById("minimize-enabled")?.checked === false'),
  "the Control Panel row reflects the switch",
);
vmw.run("window.AISystem6WindowMinimize.setMinimizeEnabled(true)");
test.assert(lampsOnDesk() > 0, "switched back on, the lamp returns");

// The writer's order: an application cell dragged before another stays there,
// across a redraw and a hidden-then-shown Dock; Finder stays first.
vmw.run("window.AISystem6DeskDock.sync()");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 1'));
const appKeys = () => vmw.run(`JSON.stringify([...document.querySelectorAll(".desk-dock-item.is-orderable")].map((node) => node.dataset.dockKey))`);
const beforeOrder = JSON.parse(appKeys());
test.assert(beforeOrder.length >= 2, "the Dock has at least two application cells to order");
const last = beforeOrder.at(-1);
vmw.run(`window.AISystem6DeskDock.moveBefore(${JSON.stringify(last)}, ${JSON.stringify(beforeOrder[0])})`);
await vmw.waitFor(() => JSON.parse(appKeys())[0] === last);
test.assert(JSON.parse(appKeys())[0] === last, "a cell dragged before the first application cell is drawn there");
test.assert(
  vmw.run('document.querySelector(".desk-dock-item").dataset.dockKey') === "finder",
  "and Finder is still the first cell of the Dock",
);
vmw.run("window.AISystem6WindowMinimize.setDockVisible(false)");
vmw.run("window.AISystem6WindowMinimize.setDockVisible(true)");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 1'));
test.assert(JSON.parse(appKeys())[0] === last, "the order survives hiding and showing the Dock");

// The application menu names the verb where the lamp is drawn.
vmw.run("renderMultiFinderMenu()");
test.assert(
  vmw.run('document.querySelector(\'#current-app-menu-section [data-action="minimize-window"]\') !== null'),
  "the application menu offers Minimize Window in an era that draws the lamp",
);
vmw.run("window.AISystem6WindowMinimize.setMinimizeEnabled(false)");
test.assert(
  vmw.run('document.querySelector(\'#current-app-menu-section [data-action="minimize-window"]\') === null'),
  "and not once minimizing is switched off",
);
vmw.run("window.AISystem6WindowMinimize.setMinimizeEnabled(true)");

test.assert(
  vmw.run('document.querySelector(\'.desk-dock-items [data-dock-key="folder:applications"]\') !== null'),
  "Snow Leopard's Dock includes the Applications stack (J3, 10.5+)",
);

await vmw.context.AISystem6Theme.applyTheme("aqua", { persist: false });
await vmw.context.AISystem6Theme.whenReady();
vmw.run("window.AISystem6WindowMinimize.setDockVisible(true); window.AISystem6WindowMinimize.setMinimizeEnabled(true)");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 1'));
test.assert(
  vmw.run('document.querySelector(\'.desk-dock-items [data-dock-key="folder:applications"]\') === null'),
  "Jaguar's Dock has no Applications stack — documents and Trash only on the right (J3)",
);

await vmw.context.AISystem6Theme.applyTheme("tiger", { persist: false });
await vmw.context.AISystem6Theme.whenReady();
vmw.run("window.AISystem6WindowMinimize.setDockVisible(true)");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 1'));
test.assert(
  vmw.run('document.querySelector(\'.desk-dock-items [data-dock-key="folder:applications"]\') === null'),
  "Tiger's Dock likewise has no Applications stack (J3)",
);

await vmw.context.AISystem6Theme.applyTheme("snow-leopard", { persist: false });
await vmw.context.AISystem6Theme.whenReady();
vmw.run("window.AISystem6WindowMinimize.setDockVisible(true); window.AISystem6WindowMinimize.setMinimizeEnabled(true)");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 1'));
vmw.run('runtimeEnvironment = "multifinder"');
if (!vmw.run('!!getWindow("notePad")')) await vmw.context.openWindow("notePad");
vmw.run('focusWindow(getWindow("notePad")); minimizeWindow(getWindow("notePad"));');
vmw.run("window.AISystem6DeskDock.sync()");
await vmw.waitFor(() => vmw.run('!!document.querySelector(\'.desk-dock-items [data-miniwindow="notePad"] .desk-dock-miniature\')'));
{
  const j1 = vmw.run(`(() => {
    const cell = document.querySelector('.desk-dock-items [data-miniwindow="notePad"]');
    const photo = cell?.querySelector(".desk-dock-miniature-photo");
    const lamps = cell?.querySelectorAll(".desk-dock-miniature-lamp")?.length || 0;
    const title = cell?.querySelector(".desk-dock-miniature-title")?.textContent || "";
    const badge = !!cell?.querySelector(".desk-dock-miniature-badge");
    return { photo: !!(photo && photo.getAttribute("src")), lamps, titleLen: title.length, badge };
  })()`);
  test.assert(j1.badge, "J1 keeps the application icon badge in the corner");
  test.assert(
    j1.photo || (j1.lamps === 3 && j1.titleLen > 0),
    "J1 shows the minimize-time window paint, or a schematic title bar with three lamps",
  );
}

// 3D minimize / Dock magnification: lazy three.js warp + perspective mag.
{
  const fx = read("app/core/dock-minimize-fx.js");
  const minimize = read("app/core/window-minimize.js");
  const manifest = read("tooling/runtime-manifest.mjs");
  const dockCss = read("styles/88-desk-dock.css");
  const dockJs = read("app/core/desk-dock.js");
  test.assert(fx.includes("genie") && fx.includes("scale") && fx.includes("suck"), "dock-minimize-fx names Genie, Scale and Suck");
  test.assert(fx.includes("/app/vendor/dock-minimize-fx.js?v="), "the three.js vendor URL is versioned");
  test.assert(minimize.includes("dock-minimize-fx.js"), "window-minimize loads the 3D warp lazily");
  test.assert(manifest.includes('"app/core/dock-minimize-fx.js"'), "dock-minimize-fx stays in lazyRuntimePaths");
  test.assert(dockCss.includes("perspective:") && dockJs.includes("applyMagnification"), "the Dock row magnifies in 3D under the pointer");
  test.assert(dockJs.includes("syncShelfCut") && dockCss.includes(".has-cut"), "Jaguar/Tiger punch a 1px desktop cut through the plate at the separator");
  test.assert(dockCss.includes("--desk-dock-mark-width: 8px"), "Tiger's running triangle is the even 8px native width");
  test.assert(dockCss.includes("--desk-dock-gap-below: 5px"), "Big Sur / Tahoe float ~5pt above the screen edge");
  // J1 DOM miniature (foreignObject) + schematic fallback (System 7 / NeXT).
  test.assert(minimize.includes("captureDomWindowBitmap") && minimize.includes("foreignObject"), "minimize prefers a true DOM miniature via SVG foreignObject");
  test.assert(minimize.includes('theme === "system-7"') && minimize.includes("#eeeeee") && minimize.includes("#777777"), "eager minimize paint approximates System 7 title-bar stripes as fallback");
  test.assert(fx.includes('theme === "system-7"') && fx.includes("#ccccff"), "3D capture paint matches System 7 lavender edge");
  test.assert(minimize.includes('theme === "nextstep"') && fx.includes('theme === "nextstep"'), "NeXTSTEP minimize paint uses the grey title bar, not traffic lights");
}

// Exercise the application menu through its real pointer and keyboard handlers.
vmw.run('writerMode = false; window.AISystem6WindowMinimize.setDockVisible(true); window.AISystem6DeskDock.sync()');
await vmw.waitFor(() => vmw.run('!!document.querySelector(".desk-dock-items")'));
vmw.run(`(() => {
  const cell = document.querySelector('.desk-dock-item[data-app-id="quickDraft"]');
  window.__dockMenuCell = cell;
  document.querySelector('.desk-dock').dispatchEvent({type: 'contextmenu', target: cell, clientX: 500, clientY: 900, preventDefault() {}});
})()`);
test.assert(vmw.run('!!document.querySelector(".desk-dock-menu[role=menu]")'), "right click opens the application menu");
test.assert(vmw.run('document.querySelector(".desk-dock-menu").style.display === "block"'), "standalone menu explicitly overrides the shared hidden popover default (style contract, not browser visibility)");
test.assert(vmw.run('!localStorage.getItem("ai-system-6-dock-favorites")'), "opening the menu does not change shortcuts");
vmw.run(`document.querySelector('.desk-dock-menu button').dispatchEvent(new Event('click'))`);
await vmw.waitFor(() => vmw.run(`!document.querySelector('.desk-dock-item[data-app-id="quickDraft"]')`));
test.assert(vmw.run('JSON.parse(localStorage.getItem("ai-system-6-dock-favorites")).remove.includes("quickDraft")'), "Remove from Dock persists a shortcut preference");
vmw.run('window.AISystem6WindowMinimize.setDockVisible(false); window.AISystem6WindowMinimize.setDockVisible(true)');
await new Promise((resolve) => setTimeout(resolve, 20));
test.assert(vmw.run(`!document.querySelector('.desk-dock-item[data-app-id="quickDraft"]')`), "hiding and showing Dock preserves removed shortcuts");
vmw.run(`(() => {
  const cell = document.querySelector('.desk-dock-item[data-app-id="lightroom"]');
  cell.focus(); window.__dockMenuCell = cell;
  document.querySelector('.desk-dock-items').dispatchEvent({type: 'keydown', key: 'F10', shiftKey: true, preventDefault() {}});
})()`);
test.assert(vmw.run('!!document.querySelector(".desk-dock-menu")'), "Shift F10 opens the same application menu");
vmw.run(`document.dispatchEvent({type: 'keydown', key: 'Escape', target: document.activeElement, preventDefault() {}, stopPropagation() {}})`);
test.assert(vmw.run('!document.querySelector(".desk-dock-menu") && document.activeElement === window.__dockMenuCell'), "Escape closes the menu and returns focus to its application icon");

await vmw.context.openWindow("quickDraft");
vmw.run('window.AISystem6DeskDock.sync()');
await vmw.waitFor(() => vmw.run(`!!document.querySelector('.desk-dock-item[data-app-id="quickDraft"]')`));
test.assert(vmw.run('!getWindow("quickDraft").classList.contains("is-hidden")'), "a removed shortcut remains visible while its application runs");
vmw.run(`(() => {
 const win = getWindow('quickDraft'); win.classList.add('is-collapsed');
 window.__dockRestoredWindow = win;
 const cell = document.querySelector('.desk-dock-item[data-app-id="quickDraft"]');
 document.querySelector('.desk-dock').dispatchEvent({type:'contextmenu', target:cell, clientX:400, clientY:800, preventDefault(){}});
})()`);
test.assert(vmw.run('document.querySelector(".desk-dock-menu button").textContent.includes(t("window_state_collapsed"))'), "application menu marks the existing rolled window state");
vmw.run(`document.querySelector('.desk-dock-menu button').dispatchEvent(new Event('click'))`);
test.assert(vmw.run('getWindow("quickDraft") === window.__dockRestoredWindow && getWindow("quickDraft").classList.contains("is-collapsed")'), "choosing a rolled window restores the same window without unfolding it");
vmw.run(`localStorage.setItem('ai-system-6-dock-favorites', '{broken'); window.dispatchEvent({type:'storage', key:'ai-system-6-dock-favorites'})`);
await new Promise((resolve) => setTimeout(resolve, 20));
test.assert(vmw.run(`!!document.querySelector('.desk-dock-item[data-app-id="lightroom"]')`), "corrupt preference falls back to the default application projection");

await vmw.context.AISystem6Theme.applyTheme("liquid-glass", { persist: false });
await vmw.context.AISystem6Theme.whenReady();
vmw.run('window.AISystem6WindowMinimize.setDockVisible(true); window.AISystem6DeskDock.sync()');
await vmw.waitFor(() => vmw.run('!!document.querySelector(".desk-dock-item")'));
// The DOM shim has no input-modality engine: supply only :focus-visible,
// then dispatch the real focus handler into the real shared help implementation.
vmw.run(`(() => {
  balloonHelpEnabled = false;
  hideBalloonHelp();
  const icon = document.querySelector('.desk-dock-item');
  window.__focusNameIcon = icon;
  const matches = icon.matches.bind(icon);
  icon.matches = (selector) => selector === ':focus-visible' || matches(selector);
  icon.focus();
  icon.dispatchEvent({type:'focus', target:icon});
})()`);
test.assert(vmw.run('!document.querySelector("#balloon-help").classList.contains("is-hidden") && document.querySelector("#balloon-help-text").textContent === window.__focusNameIcon.getAttribute("aria-label")'), "keyboard focus shows the application name through existing Balloon Help even when Help is off");
test.assert(vmw.run('balloonHelpEnabled === false'), "name fallback does not switch the global Help preference on");
vmw.run(`window.__focusNameIcon.dispatchEvent({type:'blur', target:window.__focusNameIcon})`);
test.assert(vmw.run('document.querySelector("#balloon-help").classList.contains("is-hidden") && !window.__focusNameIcon.hasAttribute("aria-describedby")'), "blur clears the shared name balloon and its accessible description");

vmw.run(`window.__dockLabelBefore = translations[currentLanguage].dock; translations[currentLanguage].dock = 'Dock label after lazy translation'; window.AISystem6DeskDock.sync()`);
await new Promise((resolve) => setTimeout(resolve, 20));
test.assert(vmw.run('document.querySelector(".desk-dock").getAttribute("aria-label") === t("dock") && document.querySelector(".desk-dock [role=toolbar]").getAttribute("aria-label") === t("dock")'), "existing Dock root and toolbar refresh their accessible names when a translation arrives");
vmw.run('translations[currentLanguage].dock = window.__dockLabelBefore; window.AISystem6DeskDock.sync()');

test.finish();
