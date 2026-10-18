// A vm in which the REAL vendored Quire editor (layout.js, drawing.js, editor.js) and the real
// clio-write.js run over a linkedom document, so a contract can dispatch beforeinput / keydown /
// pointerdown / composition events down the same listener chain the browser uses.
//
// What is real: the Quire model and adapter, layout.js (DOM render, domToPos / posToDom),
// drawing.js, editor.js (every upstream listener), and clio-write.js with its capture gate.
// What is a stand-in: the DOM (linkedom, no layout engine: every rect is zero), the Selection
// object, and the event dispatcher. linkedom has no capture phase, so dispatchEvent is replaced
// by a spec-shaped one (capture from the document down, target, bubble back up, stopPropagation
// and stopImmediatePropagation honoured); that ordering is the whole point of a gate that sits
// ahead of the editor's own listeners.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "desktop");
const readApp = (path) => readFileSync(join(desktop, path), "utf8");

export async function createQuireEditorVm({ docx, name = "写作.docx" }) {
  const { window: dom, document } = parseHTML("<!doctype html><html><head></head><body></body></html>");

  /* -- a spec-shaped event dispatcher over linkedom nodes -- */
  const store = new WeakMap();
  const listenersOf = (target, type) => {
    let map = store.get(target);
    if (!map) { map = new Map(); store.set(target, map); }
    if (!map.has(type)) map.set(type, []);
    return map.get(type);
  };
  const windowTarget = {};
  const probe = document.createElement("div");
  let proto = Object.getPrototypeOf(probe);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, "dispatchEvent")) proto = Object.getPrototypeOf(proto);
  const capture = (options) => (typeof options === "boolean" ? options : !!(options && options.capture));
  const add = function (type, listener, options) {
    const list = listenersOf(this, type);
    if (!list.some((entry) => entry.listener === listener && entry.capture === capture(options))) list.push({ listener, capture: capture(options), once: !!(options && options.once) });
  };
  const remove = function (type, listener, options) {
    const list = listenersOf(this, type);
    const index = list.findIndex((entry) => entry.listener === listener && entry.capture === capture(options));
    if (index >= 0) list.splice(index, 1);
  };
  const parentOf = (node) => (node === document ? windowTarget : node.parentNode || (node === windowTarget ? null : null));
  function dispatch(event) {
    const target = this;
    event.target = target;
    event.defaultPrevented = false;
    event._stop = false;
    event._stopNow = false;
    event.preventDefault = function preventDefault() { if (this.cancelable) this.defaultPrevented = true; };
    event.stopPropagation = function stopPropagation() { this._stop = true; };
    event.stopImmediatePropagation = function stopImmediatePropagation() { this._stop = true; this._stopNow = true; };
    const path = [];
    for (let node = target; node; node = parentOf(node)) path.push(node);
    const fire = (node, phase, wantCapture) => {
      if (event._stop && node !== event.currentTarget) return;
      const list = listenersOf(node, event.type).slice();
      event.currentTarget = node;
      event.eventPhase = phase;
      for (const entry of list) {
        if (phase !== 2 && entry.capture !== wantCapture) continue;
        if (entry.once) remove.call(node, event.type, entry.listener, entry.capture);
        if (typeof entry.listener === "function") entry.listener.call(node, event); else entry.listener.handleEvent(event);
        if (event._stopNow) return;
      }
    };
    for (let i = path.length - 1; i > 0 && !event._stop; i -= 1) fire(path[i], 1, true);
    if (!event._stop) fire(path[0], 2, undefined);
    if (event.bubbles) for (let i = 1; i < path.length && !event._stop; i += 1) fire(path[i], 3, false);
    event.currentTarget = null;
    return !event.defaultPrevented;
  }
  proto.addEventListener = add;
  proto.removeEventListener = remove;
  proto.dispatchEvent = dispatch;
  windowTarget.addEventListener = add;
  windowTarget.removeEventListener = remove;
  windowTarget.dispatchEvent = dispatch;

  /* -- the Selection object -- */
  const selection = {
    anchorNode: null, anchorOffset: 0, focusNode: null, focusOffset: 0,
    get rangeCount() { return this.anchorNode ? 1 : 0; },
    setBaseAndExtent(an, ao, fn, fo) { Object.assign(this, { anchorNode: an, anchorOffset: ao, focusNode: fn, focusOffset: fo }); },
    removeAllRanges() { Object.assign(this, { anchorNode: null, anchorOffset: 0, focusNode: null, focusOffset: 0 }); },
    collapse(node, offset) { this.setBaseAndExtent(node, offset, node, offset); },
    addRange() {},
    modify() {},
  };
  const range = () => ({ setStart() {}, setEnd() {}, collapse() {}, getClientRects: () => [], getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }) });
  document.createRange = range;
  document.elementFromPoint = () => null;
  const rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
  Object.defineProperty(proto, "getBoundingClientRect", { configurable: true, value() { return rect; } });
  if (typeof document.createElement("div").getClientRects !== "function") Object.defineProperty(proto, "getClientRects", { configurable: true, value() { return []; } });

  const timers = [];
  const context = {
    console, crypto, TextEncoder, TextDecoder, DecompressionStream, CompressionStream,
    clearTimeout, queueMicrotask, structuredClone, URL, URLSearchParams, Blob,
    ArrayBuffer, Uint8Array, DataView, Promise, Map, Set, WeakMap, JSON, Math, Date, Intl,
    RegExp, Error, Object, Array, String, Number, Boolean, Symbol, Proxy, Reflect,
    navigator: { platform: "MacIntel", userAgent: "quire-editor-vm" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "http://localhost/" },
    document,
    Node: dom.Node,
    Element: dom.Element,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    getSelection: () => selection,
    requestAnimationFrame: (callback) => { timers.push(callback); return timers.length; },
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    addEventListener: add.bind(windowTarget),
    removeEventListener: remove.bind(windowTarget),
  };
  context.globalThis = context;
  context.window = context;
  context.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
  // Scripts load the way the browser loads them: through document.head.appendChild.
  document.head.appendChild = function appendChild(el) {
    queueMicrotask(() => {
      try { vm.runInContext(readApp(el.getAttribute("src")), context, { filename: el.getAttribute("src") }); el.onload(); } catch (error) { el.onerror(new Error(String(error && error.message || error))); }
    });
    return el;
  };
  vm.createContext(context);
  const run = (code) => vm.runInContext(code, context);
  const flush = () => { while (timers.length) timers.shift()(); };

  /* -- the desk's parts the ClioWrite window needs -- */
  const opened = [];
  context.openWindow = async (nameOfWindow) => { opened.push(nameOfWindow); };
  const modal = { answers: [], asked: [] };
  context.showSystemModal = async (message, kind, options) => { modal.asked.push({ message, kind, options }); return modal.answers.length ? modal.answers.shift() : "cancel"; };
  context.AISystem6ApplicationShell = {
    createWindow() {
      const win = document.createElement("section");
      win.setAttribute("data-window", "clioWrite");
      win.innerHTML = '<h2 id="clio-write-title"></h2><div class="cw-ruler" hidden></div><div class="clio-write-pane"></div><div class="details-bar"></div>';
      document.body.appendChild(win);
      return win;
    },
  };
  context.updateMenuState = () => {};

  const load = (paths) => { for (const path of paths) vm.runInContext(readApp(path), context, { filename: path }); };
  load(["app/vendor/clioworks-v3/quire-adapter.js", "app/vendor/clioworks-v3/native-host.js"]);
  let working = new Uint8Array(docx);
  const record = { id: "doc-1", fileName: name, mountedName: name, format: "docx", projectId: "" };
  context.AISystem6NativeBinaries = {
    recordFor: (n) => (n === record.mountedName ? record : null),
    workingBytes: () => working,
    setWorkingBytes: (n, bytes) => { working = new Uint8Array(bytes); },
  };
  const openAdapter = async (bytes = docx, nameOfFile = name) => {
    context.__bytes = bytes;
    return vm.runInContext(`ClioWorksQuireAdapter.open(globalThis.__bytes.slice().buffer, { name: ${JSON.stringify(nameOfFile)} })`, context);
  };
  record.liveAdapter = await openAdapter();
  load(["app/features/clio-write.js"]);

  /* -- events -- */
  const make = (type, props = {}) => ({ type, bubbles: true, cancelable: true, eventPhase: 0, defaultPrevented: false, isComposing: false, keyCode: 0, ...props });
  const fire = (target, type, props) => { const event = make(type, props); target.dispatchEvent(event); return event; };

  return { context, document, selection, record, openAdapter, run, flush, modal, opened, make, fire, load, working: () => working, window: context };
}
