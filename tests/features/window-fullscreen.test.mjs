// Lion's title-bar arrows are real full screen (owner, 2026-09-25).
//
// For a year the appearance drew Lion's two outward arrows at the title bar's
// right end while the button zoomed: a control that said one thing and did
// another. This contract pins the real behaviour and the failures a writer
// would meet: the arrows still zooming; full screen that cannot be left, or
// leaves the window somewhere other than where it was; the Dock drawn over a
// full-screen window; Zoom lost with its old place (Lion draws a green lamp
// at the left instead); and the behaviour leaking into an era whose button
// really is Zoom.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("window-fullscreen");
const vmw = createAppBootVm();
vmw.run(`
  if (typeof document.createComment !== "function") {
    document.createComment = (text) => Object.assign(document.createElement("#comment"), { textContent: text });
  }
  if (typeof queueMicrotask !== "function") queueMicrotask = (fn) => Promise.resolve().then(fn);
`);

await vmw.context.AISystem6Theme.applyTheme("lion", { persist: false, experimental: true });
await vmw.context.AISystem6Theme.whenReady();
await vmw.waitFor(() => vmw.run("!!window.AISystem6WindowFullscreenLoaded"));

// Control Panel is a real window with a static Zoom button in this VM.
await vmw.context.openWindow("control");
vmw.run(`(() => {
  const win = getWindow("control");
  win.style.left = "120px"; win.style.top = "80px"; win.style.width = "480px";
  focusWindow(win);
})()`);
const frameOf = () => vmw.run('JSON.stringify(["left", "top", "width"].map((name) => getWindow("control").style.getPropertyValue(name)))');
const before = frameOf();

test.assert(
  vmw.run('getWindow("control").querySelector(":scope > .title-bar > .zoom-lamp") !== null'),
  "Lion's windows carry the green Zoom lamp at the left, because the right end is the full-screen button",
);

// The arrows enter full screen instead of zooming.
// The boot VM does not run document capture listeners, so the contract uses
// the module's own toggle, the function the arrows' click calls; the click
// path itself is checked in the browser.
vmw.run('window.AISystem6WindowFullscreen.toggle(getWindow("control"))');
test.assert(vmw.run('getWindow("control").classList.contains("is-fullscreen")'), "the arrows put the window into full screen");
test.assert(
  vmw.run('getWindow("control").style.left === "0px" && getWindow("control").style.top === "0px" && getWindow("control").style.width === "100vw"'),
  "and it fills the display",
);
test.assert(vmw.run('document.body.classList.contains("window-fullscreen-active")'), "the desk knows a window is full screen");
vmw.run("window.AISystem6DeskDock?.sync?.()");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 0'));
test.assert(vmw.run('document.querySelectorAll(".desk-dock").length === 0'), "the Dock steps aside for a full-screen window");

// The same button brings it back where it was.
vmw.run('window.AISystem6WindowFullscreen.toggle(getWindow("control"))');
test.assert(!vmw.run('getWindow("control").classList.contains("is-fullscreen")'), "pressing the arrows again leaves full screen");
test.assert(frameOf() === before, "and the window returns to the frame it had");
test.assert(!vmw.run('document.body.classList.contains("window-fullscreen-active")'), "the desk is no longer in full screen");

// The desk sits under the menu bar, so a frame of top 0 inside it hung the
// window 22px below the display and clipped its bottom row (2026-10-08).
// Full screen measures against the display: the top compensates the desk's
// own offset, and Exit still restores the frame.
vmw.run('Object.defineProperty(getWindow("control"), "offsetParent", { configurable: true, value: { getBoundingClientRect: () => ({ top: 22 }) } })');
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("control"))');
test.assert(
  vmw.run('getWindow("control").style.top === "-22px" && getWindow("control").style.height === "100dvh"'),
  "a desk offset under the menu bar is compensated, so the window's bottom stays on the display",
);
vmw.run('window.AISystem6WindowFullscreen.exit(getWindow("control"))');
vmw.run('delete getWindow("control").offsetParent');
test.assert(frameOf() === before, "and Exit still restores the original frame after a compensated full screen");

// --- WM0: the pre-full-screen frame is a read-only projection ---------------
// Full screen is a view, not a saved state, so the Working Session must read
// the frame the window had before it, never the 100vw view it shows now.
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("control"))');
test.assert(
  vmw.run(`(() => {
    const f = window.AISystem6WindowFullscreen.frameForPersistence(getWindow("control"));
    return !!f && f.left === "120px" && f.top === "80px" && f.width === "480px" && !("z-index" in f);
  })()`),
  "frameForPersistence projects the pre-full-screen frame without z-index",
);
// Re-entering the same window must not overwrite the first baseline, or a
// double Enter would save the 100vw view as the frame to come back to.
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("control"))');
vmw.run('window.AISystem6WindowFullscreen.exit(getWindow("control"))');
test.assert(frameOf() === before, "a repeated Enter keeps the first baseline, so Exit restores the original frame");
test.assert(
  vmw.run('window.AISystem6WindowFullscreen.frameForPersistence(getWindow("control")) === null'),
  "a floating window has no persistence projection",
);

// --- hardening: one owner, held by identity ---------------------------------
await vmw.context.openWindow("calculator");
await vmw.waitFor(() => vmw.run('!!getWindow("calculator")'));
const bystander = () => vmw.run('JSON.stringify(["left", "top", "width"].map((name) => getWindow("calculator").style.getPropertyValue(name)))');
const bystanderFrame = bystander();
// Exiting a window this module never entered must be a no-op, not a wipe of
// that window's inline frame.
vmw.run('window.AISystem6WindowFullscreen.exit(getWindow("calculator"))');
test.assert(
  bystander() === bystanderFrame && !vmw.run('getWindow("calculator").classList.contains("is-fullscreen")'),
  "exiting a window the module never entered is a no-op, not a frame wipe",
);
// A stale is-fullscreen class is not ownership either: the default exit() only
// leaves the window the module actually entered.
vmw.run('getWindow("calculator").classList.add("is-fullscreen")');
test.assert(
  vmw.run('window.AISystem6WindowFullscreen.exit() === false'),
  "a stale full-screen class is not an owner, so the default exit leaves nothing",
);
vmw.run('getWindow("calculator").classList.remove("is-fullscreen")');
// A put-away window is refused: a full-screen layer over a minimized window
// would keep covering the desk after it is gone from view.
vmw.run('getWindow("calculator").classList.add("is-minimized")');
test.assert(
  vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("calculator")) === false'),
  "a minimized window is refused full screen",
);
vmw.run('getWindow("calculator").classList.remove("is-minimized")');
// The layer a window had before full screen is projected separately from the
// geometry, so a refresh never saves the priority-band token as its own layer.
// (The VM's style stub does not round-trip an inline z-index, so this pins the
// refusal: whatever it projects, it is never the full-screen band token.)
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("control"))');
test.assert(
  vmw.run(`(() => {
    const layer = window.AISystem6WindowFullscreen.layerForPersistence(getWindow("control"));
    return layer === null || (typeof layer === "string" && !layer.includes("var("));
  })()`),
  "layerForPersistence never projects the full-screen priority-band token",
);
test.assert(
  vmw.run('window.AISystem6WindowFullscreen.layerForPersistence(getWindow("calculator")) === null'),
  "a floating window has no layer projection",
);
test.assert(
  vmw.run('window.AISystem6WindowFullscreen.exit() === true'),
  "the default exit leaves the window the module actually entered",
);

// Escape leaves it too, unless the writer is typing.
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("control"))');
vmw.run('document.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true }), { key: "Escape" }))');
test.assert(!vmw.run('getWindow("control").classList.contains("is-fullscreen")'), "Escape outside a text field leaves full screen");

// Zoom is still there: the green lamp zooms.
test.assert(
  vmw.run('typeof zoomWindow === "function" && getWindow("control").querySelector(":scope > .title-bar > .zoom-lamp")?.dataset.balloonHelp === "balloon_zoom_box"'),
  "the green lamp is Zoom, with Zoom's own Balloon Help",
);

// An era whose button is Zoom keeps it Zoom.
await vmw.context.AISystem6Theme.applyTheme("snow-leopard", { persist: false });
await vmw.context.AISystem6Theme.whenReady();
vmw.run('window.AISystem6WindowFullscreen.toggle(getWindow("control"))');
test.assert(!vmw.run('getWindow("control").classList.contains("is-fullscreen")'), "in Snow Leopard the module refuses full screen: its green button is Zoom");
test.assert(
  vmw.run('getWindow("control").querySelector(":scope > .title-bar > .zoom-lamp") === null'),
  "and Snow Leopard draws no extra green lamp",
);

// Full screen reached Yosemite, Big Sur and Liquid Glass too, but Lion's
// extra Zoom lamp is not their anatomy: their green lamp is already the
// right-end full-screen button. Without a grid slot the extra button fell
// into an implicit second title-bar row and painted as an unstyled native
// button under Close.
for (const theme of ["yosemite", "big-sur", "liquid-glass"]) {
  await vmw.context.AISystem6Theme.applyTheme(theme, { persist: false });
  await vmw.context.AISystem6Theme.whenReady();
  test.assert(
    vmw.run('getWindow("control").querySelector(":scope > .title-bar > .zoom-lamp") === null'),
    `${theme} adds no second Zoom lamp beside the green full-screen button`,
  );
  test.assert(
    vmw.run('getWindow("control").querySelector(":scope > .title-bar > .resize-box") !== null'),
    `${theme} keeps its own right-end green button`,
  );
}

// The lamp belongs to Lion's anatomy, so returning to Lion puts it back.
await vmw.context.AISystem6Theme.applyTheme("lion", { persist: false });
await vmw.context.AISystem6Theme.whenReady();
test.assert(
  vmw.run('getWindow("control").querySelector(":scope > .title-bar > .zoom-lamp") !== null'),
  "returning to Lion restores the green Zoom lamp",
);

// --- the menu bar hides in full screen, and the top edge brings it back -----
// 10.7 hides the bar with the window's own title bar and slides it back over
// the full-screen window while the pointer is at the top edge (macOS). The
// failure this pins: the bar could not be summoned at all, because the hot
// zone was a 4px strip with no stacking rung of its own -- a pointer aimed at
// where the bar appears hit nothing, and dipping below the strip during the
// slide hid the bar again mid-flight.
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("control"))');
test.assert(vmw.run('document.body.classList.contains("window-fullscreen-active")'), "full screen takes the menu bar off the desk");
test.assert(
  vmw.run('document.querySelectorAll(".fullscreen-reveal").length === 1'),
  "one top-edge hot zone exists while a window is full screen (the bar is a single global object)",
);
// Pointer into the band reveals the bar over the full-screen window.
vmw.run('document.querySelector(".fullscreen-reveal").dispatchEvent(new Event("pointerenter"))');
test.assert(
  vmw.run('document.body.classList.contains("fullscreen-menu-revealed")'),
  "the pointer at the top edge reveals the menu bar",
);
// A document pointerover names its target by hand: the VM's Event, like the
// browser's, owns a getter-only target a plain Object.assign cannot write.
const pointerOver = (targetScript) => vmw.run(`(() => {
  const event = new Event("pointerover", { bubbles: true });
  Object.defineProperty(event, "target", { value: ${targetScript} });
  document.dispatchEvent(event);
})()`);
// Resting inside the zone's band under the bar keeps it: leaving must mean
// leaving the bar AND the band.
pointerOver('document.querySelector(".fullscreen-reveal")');
test.assert(
  vmw.run('document.body.classList.contains("fullscreen-menu-revealed")'),
  "the pointer resting in the band under the revealed bar does not dismiss it",
);
// So does the bar itself and an open menu popover.
pointerOver('document.querySelector(".menu-bar .apple")');
test.assert(
  vmw.run('document.body.classList.contains("fullscreen-menu-revealed")'),
  "the pointer over the revealed bar keeps it revealed",
);
// Moving onto the full-screen window's content hides it again.
pointerOver('getWindow("control")');
test.assert(
  !vmw.run('document.body.classList.contains("fullscreen-menu-revealed")'),
  "leaving the bar for the window hides it again",
);
// Leaving full screen returns the resident bar: no zone, no reveal state.
vmw.run('window.AISystem6WindowFullscreen.exit(getWindow("control"))');
test.assert(
  vmw.run('document.querySelectorAll(".fullscreen-reveal").length === 0 && !document.body.classList.contains("window-fullscreen-active") && !document.body.classList.contains("fullscreen-menu-revealed")'),
  "exiting full screen removes the zone and restores the resident menu bar",
);

// The zone's stacking and geometry are the fix's other half, and they live in
// the sheets: a rung above every window and the Control Strip, under the bar
// it summons, and a band as tall as the bar plus a 4px trigger strip.
const foundation = read("styles/00-foundation.css");
const deskDock = read("styles/88-desk-dock.css");
const zValue = (token) => Number((foundation.match(new RegExp(`--${token}:\\s*(\\d+)`)) || [])[1]);
test.assert(
  zValue("z-fullscreen-reveal") > zValue("z-window-priority")
    && zValue("z-fullscreen-reveal") > zValue("z-control-strip")
    && zValue("z-fullscreen-reveal") < zValue("z-system-menu"),
  "the hot zone stacks above a full-screen window and the strip, under the menu bar it reveals",
);
test.assert(
  deskDock.includes("height: calc(var(--menu-bar-height) + 4px)"),
  "the hot band is the menu bar's own height plus a 4px trigger strip, as macOS's top-edge zone is",
);
test.assert(
  deskDock.includes("z-index: var(--z-fullscreen-reveal)"),
  "the hot zone claims its stacking rung by token",
);
test.assert(
  deskDock.includes("body.window-fullscreen-active .menu-bar") && deskDock.includes("fullscreen-menu-revealed .menu-bar"),
  "full screen hides the bar by transform and the reveal state brings it back, overlaying the window",
);
// The phone's own full-screen shell is a different mechanism: its classes and
// sheets never meet the desktop reveal (is-mobile-fullscreen stays as it was).
const responsive = read("styles/60-responsive.css");
test.assert(
  !responsive.includes("fullscreen-reveal") && !responsive.includes("fullscreen-menu-revealed"),
  "the mobile full-screen shell keeps its own rules, untouched by the desktop reveal",
);

test.finish();
