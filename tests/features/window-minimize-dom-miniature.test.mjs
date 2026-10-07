// Does a minimized window's Dock tile show the WINDOW, or a stand-in wearing a
// photo's clothes?
//
// The J1 work (owner decision 2B) captures a true DOM miniature: it clones the
// live window into an SVG <foreignObject>, rasterizes that, and stores the
// pixels for the Dock tile. A fast contract cannot rasterize CSS, so this one
// pins the two properties that decide whether the real capture can survive at
// all, using a browser-like decode:
//
//   - the SVG the capture rasterizes is a data: URL, not a blob: URL. A blob
//     URL makes Chromium treat a foreignObject SVG as cross-origin data, so
//     drawing it taints the canvas and toDataURL throws -- the picture silently
//     falls back to schematic paint. (Measured in Chromium: this file's sibling
//     probe, tests/e2e/probe-dock-dom-miniature.spec.mjs, reads the tile's
//     pixels back from a real browser.)
//   - the Dock tile upgrades to the DOM bitmap whenever it lands, even though
//     the schematic paint is stored first and the warp race is short. The
//     bitmap is part of the Dock's redraw signature, so the late picture is not
//     swallowed by a signature that already looked settled.
//
// The assertion that the pixels are really the window's -- not a schematic --
// lives in the real-browser probe, because no headless canvas here draws.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("window-minimize-dom-miniature");
const vmw = createAppBootVm();

// The boot shim has neither SVG serialization nor an <img> that decodes. Both
// are declared here, next to the contract that needs them, following the same
// rule as the desk-dock contract's createComment/queueMicrotask shims.
//
// The decode is deterministic and browser-shaped: a data:image/svg+xml source
// settles as "load" (or "error" when a test asks for the fallback), and a
// canvas remembers whether the DOM path called drawImage on it. The picture is
// therefore distinguishable from schematic paint by identity, not by truthiness.
vmw.run(`
  if (typeof document.createComment !== "function") {
    document.createComment = (text) => Object.assign(document.createElement("#comment"), { textContent: text });
  }
  if (typeof queueMicrotask !== "function") queueMicrotask = (fn) => Promise.resolve().then(fn);
  window.XMLSerializer = class { serializeToString(node) { return node?.__html || "<div></div>"; } };
  window.__miniatureHarness = (() => {
    const DOM_URL = "data:image/jpeg;base64,REAL-DOM-MINIATURE-0123456789-abcdef";
    const SCHEMATIC_URL = "data:image/png;base64,SCHEMATIC-PAINT-0123456789-abcdef";
    const realCreateElement = document.createElement.bind(document);
    // The shared boot shim intentionally makes shallow cloneNode stubs. This
    // contract needs a real deep clone so no descendant silently disappears.
    const originalWindows = document.querySelectorAll(".window[data-window]");
    const cloneTree = (source, deep) => {
      const copy = realCreateElement(source.tagName);
      copy.className = source.className;
      Object.assign(copy.style, source.style);
      Object.assign(copy.dataset, source.dataset);
      copy.textContent = source.textContent;
      if (deep) [...source.children].forEach((child) => copy.append(cloneTree(child, true)));
      return copy;
    };
    originalWindows.forEach((win) => { win.cloneNode = (deep) => cloneTree(win, deep); });

    const decode = { mode: "load" };
    const pending = [];
    document.createElement = (tag) => {
      const el = realCreateElement(tag);
      if (String(tag).toLowerCase() === "canvas") {
        const realGetContext = el.getContext.bind(el);
        el.getContext = (...args) => {
          const ctx = realGetContext(...args);
          return new Proxy(ctx, {
            get(target, prop) {
              if (prop === "drawImage") return (...rest) => { el.__drewImage = true; return target.drawImage?.(...rest); };
              return target[prop];
            },
          });
        };
        el.toDataURL = () => (el.__drewImage ? DOM_URL : SCHEMATIC_URL);
      }
      return el;
    };
    window.Image = function ImageProbe() {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", {
        configurable: true,
        get() { return img.__miniatureSrc || ""; },
        set(value) {
          img.__miniatureSrc = String(value);
          const mode = decode.mode;
          const settle = () => {
            if (mode !== "error" && img.__miniatureSrc.startsWith("data:image/svg+xml")) img.onload?.();
            else img.onerror?.(new Error("window-minimize-dom-miniature: decode disabled"));
          };
          if (mode === "pending") pending.push(settle);
          else Promise.resolve().then(settle);
        },
      });
      return img;
    };
    return {
      DOM_URL,
      SCHEMATIC_URL,
      setDecode: (next) => { decode.mode = next; },
      flushDecode: () => { pending.splice(0).forEach((settle) => settle()); },
    };
  })();
`);

// A Snow Leopard desk with the Dock and the yellow lamp on -- the only state a
// J1 tile exists in.
await vmw.context.AISystem6Theme.applyTheme("snow-leopard", { persist: false });
await vmw.waitFor(() => vmw.run("!!window.AISystem6DeskDock && !!window.AISystem6WindowMinimize && !!window.AISystem6WindowMinimizeLoaded"));
await vmw.context.AISystem6Theme.whenReady();
vmw.run('localStorage.setItem("ai-system-6-dock", JSON.stringify({ visible: true })); localStorage.setItem("ai-system-6-minimize", JSON.stringify({ enabled: true }))');
vmw.run("window.AISystem6WindowMinimize.setMinimizeEnabled(true); window.AISystem6WindowMinimize.setDockVisible(true)");
vmw.run('runtimeEnvironment = "multifinder"');
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 1'));

// The shim's windows have a zero box; a capture needs a real one, and so does
// the schematic stand-in.
const giveWindowABox = (name) => vmw.run(`getWindow(${JSON.stringify(name)}).getBoundingClientRect = () => ({ top: 40, left: 60, right: 400, bottom: 486, width: 340, height: 446 });`);

const tileSrc = (name) => vmw.run(`(() => {
  const photo = document.querySelector('.desk-dock-items [data-miniwindow="' + ${JSON.stringify(name)} + '"] .desk-dock-miniature-photo');
  return photo ? photo.src : "";
})()`);

// 1. The DOM capture lands late: the tile first shows the schematic stand-in
//    stored synchronously, then upgrades to the DOM bitmap when it decodes.
//    This is the ordering that used to lose the real picture -- the Dock's
//    redraw signature saw nothing new and kept the schematic tile.
await vmw.context.openWindow("notePad");
giveWindowABox("notePad");
vmw.run("window.__miniatureHarness.setDecode('pending')");
vmw.run('focusWindow(getWindow("notePad")); minimizeWindow(getWindow("notePad"));');
// No DOM capture has settled, so the tile is built from the schematic stand-in.
vmw.run("window.AISystem6DeskDock.sync()");
await vmw.waitFor(() => vmw.run('!!document.querySelector(\'.desk-dock-items [data-miniwindow="notePad"]\')'));
await vmw.waitFor(() => tileSrc("notePad") === vmw.run("window.__miniatureHarness.SCHEMATIC_URL"));
test.assert(tileSrc("notePad") === vmw.run("window.__miniatureHarness.SCHEMATIC_URL"), "before the DOM capture decodes, the tile shows the schematic stand-in stored at minimize time");

// Now the decode settles: the DOM bitmap is stored and the Dock re-syncs.
vmw.run("window.__miniatureHarness.flushDecode()");
await vmw.waitFor(() => tileSrc("notePad") === vmw.run("window.__miniatureHarness.DOM_URL"));

const domTile = vmw.run(`(() => {
  const figure = document.querySelector('.desk-dock-items [data-miniwindow="notePad"] .desk-dock-miniature');
  return {
    isPhoto: !!figure?.classList.contains("is-photo"),
    schematic: !!figure?.querySelector(".desk-dock-miniature-bar"),
    stored: window.AISystem6WindowMinimize.getMiniatureDataUrl(getWindow("notePad")) || "",
    domUrl: window.__miniatureHarness.DOM_URL,
    schematicUrl: window.__miniatureHarness.SCHEMATIC_URL,
  };
})()`);
test.assert(domTile.isPhoto, "a minimized window's Dock tile is a photo, not a drawn document");
test.assert(domTile.stored === domTile.domUrl, "the stored miniature is the DOM capture's own bitmap");
test.assert(tileSrc("notePad") === domTile.domUrl, "and the tile upgrades to that bitmap when it lands, not staying on the schematic stand-in");
test.assert(tileSrc("notePad") !== domTile.schematicUrl && !domTile.schematic, "the tile is not the schematic fallback once the DOM capture is there");

// 2. The DOM path fails: the tile honestly shows the schematic stand-in, and it
//    is a DIFFERENT picture from the DOM bitmap -- a fallback, not a photo the
//    capture never produced.
vmw.run("window.AISystem6WindowMinimize.restore(getWindow('notePad'))");
await vmw.waitFor(() => vmw.run('!getWindow("notePad").classList.contains("is-minimized")'));
test.assert(vmw.run('window.AISystem6WindowMinimize.getMiniatureDataUrl(getWindow("notePad")) === null'), "restoring forgets the stored bitmap, so the next minimize captures afresh");
vmw.run("window.__miniatureHarness.setDecode('error')");
vmw.run('focusWindow(getWindow("notePad")); minimizeWindow(getWindow("notePad"));');
await vmw.waitFor(() => vmw.run('!!document.querySelector(\'.desk-dock-items [data-miniwindow="notePad"]\')'));
await vmw.waitFor(() => tileSrc("notePad") === vmw.run("window.__miniatureHarness.SCHEMATIC_URL"));
test.assert(tileSrc("notePad") === vmw.run("window.__miniatureHarness.SCHEMATIC_URL"), "when the DOM capture cannot decode, the tile falls back to the schematic stand-in");
test.assert(tileSrc("notePad") !== vmw.run("window.__miniatureHarness.DOM_URL"), "and it never pretends the schematic is the DOM bitmap");

// 3. The two source properties that make the real capture possible.
const minimizeSource = read("app/core/window-minimize.js");
const dockSource = read("app/core/desk-dock.js");
test.assert(
  minimizeSource.includes("data:image/svg+xml;charset=utf-8,") && !minimizeSource.includes("createObjectURL(new Blob([svg]"),
  "the foreignObject SVG is rasterized from a data: URL; a blob: URL is what taints the canvas in Chromium and silently forces the schematic fallback",
);
test.assert(
  /toDataURL\(\s*"image\/jpeg"/.test(minimizeSource) && minimizeSource.includes("source: \"dom\""),
  "the DOM capture proves it can export the bitmap before it resolves, so a tainted canvas reads as a failed capture rather than a photo",
);
test.assert(
  dockSource.includes("getMiniatureDataUrl?.(win)") && dockSource.includes("nextSignature"),
  "the Dock's redraw signature includes the miniature bitmap, so a late DOM capture redraws the tile it upgrades",
);

test.finish();
