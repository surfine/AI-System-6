// Shared executing harness: boots the REAL eager module set (the same files
// index.html loads before any lazy module, via the single concatenated
// app.bundle.js) in one VM context with a minimal DOM shim, so a test can
// call the app's own functions instead of reading their source. This is what
// makes "every action id dispatches to something callable" or "a route stop
// opens its own window" a real assertion instead of a string search.
//
// Three things make this match production instead of quietly diverging from
// it, all found empirically while building it (see the fail/fix transcript
// in the report):
//
// 1. `window` IS the VM's global object, not a separate stub passed in as a
//    property. In a real browser `window === globalThis`, so `window.foo = x`
//    at the top of one file makes the bare identifier `foo` resolve in every
//    file after it — including files that load earlier in this list, because
//    a `function foo(){}` declaration hoists across the whole script. A
//    harness that gives `window` its own object breaks that: `window.foo`
//    lands on the stub while the bare identifier still says undefined, so
//    real wiring reads as broken that isn't.
// 2. All eager sources run as ONE script (one vm.runInContext call), not one
//    per file. index.html never loads these as separate <script> tags in
//    production — it loads the single concatenated bundle — so a function
//    declared in a file late in appModulePaths is still hoisted and callable
//    from a top-level statement in a file that loads earlier. Splitting the
//    files into separate runInContext calls breaks that hoisting the same
//    way (1) does, and for the same underlying reason.
// 3. The DOM starts as the REAL static markup, read from
//    apps/desktop/index.html (see createDomShim's materialize step and
//    index-html-dom.mjs). Nothing is invented on demand any more. The shim
//    used to answer an unknown `#id` or `[data-window="x"]` with a bare empty
//    div, which answers a lookup but not a SHAPE: boot-time code asks a
//    window for its own parts, gets null from an empty stub, and stops or
//    throws. It also produced the worst kind of green — a module that guards
//    its construction with "does my window exist yet" found the invented stub
//    and skipped building anything, in 13 windows at once. What index.html
//    declares exists here; what it does not declare does not exist until the
//    module that owns it really builds it.
//
// Scope: boot-time only. Nothing here calls boot() itself (it drives real
// IndexedDB, timers and animation) — tests call the specific functions they
// need (getApplicationActionHandlers, openWindow, handleAction, …) after the
// module graph has loaded.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { read, windowRegistryRecords } from "./feature-test-harness.mjs";
import { indexHtmlTree, findNode, parseFragment } from "./index-html-dom.mjs";
import { appRuntimePaths } from "../../tooling/runtime-manifest.mjs";

// appRuntimePaths, not appModulePaths: the real eager bundle is
// `[...appModulePaths, "app.js", "app/features/cloud-model.js"]` (see
// tooling/runtime-manifest.mjs). A first draft of this harness used
// appModulePaths alone and reported insertFileFloppyFromWindow — defined in
// app.js — as a dangling reference purely because the harness left app.js
// out, not because the app does.
const sources = appRuntimePaths.map((path) => [path, read(path)]);

function classList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((n) => values.add(n)),
    remove: (...names) => names.forEach((n) => values.delete(n)),
    contains: (name) => values.has(name),
    toggle(name, force) {
      const next = force === undefined ? !values.has(name) : Boolean(force);
      if (next) values.add(name); else values.delete(name);
      return next;
    },
    values: () => [...values],
    toString: () => [...values].join(" "),
  };
}

// Real listener storage for document/window, the same reasoning as
// makeElement's own addEventListener below: a no-op here would make it
// impossible to prove whether e.g. a real document-level keydown listener
// (runShortcut's own wiring) actually fires.
function createEventTarget() {
  const listeners = {};
  return {
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    removeEventListener(type, handler) {
      const list = listeners[type];
      if (list) listeners[type] = list.filter((entry) => entry !== handler);
    },
    dispatchEvent(event) {
      (listeners[event?.type] || []).slice().forEach((handler) => handler.call(this, event));
      return true;
    },
  };
}

// A 2D drawing context that accepts every call and keeps nothing. Any
// property read gives back a no-op function or an empty value, so a module
// can set styles, draw, and measure without a special case for each method.
function canvasContextStub() {
  const target = {
    canvas: null,
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    createImageData: (w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x = 0, y = 0, w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    createPattern: () => ({}),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
  };
  return new Proxy(target, {
    get(store, property) {
      if (property in store) return store[property];
      if (typeof property !== "string") return undefined;
      // A style property that was written keeps its value; anything else
      // reads as a method that does nothing.
      return store[`__${property}`] !== undefined ? store[`__${property}`] : () => {};
    },
    set(store, property, value) { store[`__${property}`] = value; return true; },
  });
}

// One flat registry of every element ever asked for, keyed by id. Real
// elements form a tree; this shim does not, so descendant selectors resolve
// against the whole registry rather than genuine ancestry — enough for
// boot-time code, which overwhelmingly looks elements up by id.
//
// `contextRef` is a mutable `{ current }` box: the VM context does not exist
// yet when the DOM shim is built (the shim's document is one of the context's
// own globals), so the real script-tag loader below — which needs to run
// code INTO that context — reads it lazily, once the caller fills it in.
function createDomShim(contextRef) {
  const byId = new Map();
  const registry = []; // every TRACKED element, for the selector matcher below
  const windowsByName = new Map(); // data-window value -> its static .window element
  // document.activeElement, kept by the elements' own focus()/blur(). The
  // `:focus` pseudo-class reads it, and so does app code that asks where the
  // caret is.
  let activeElement = null;
  // Every real script load is chained onto this one Promise — see
  // triggerScriptLoad below for why a per-script microtask does not honour
  // insertion order and this does.
  let scriptLoadChain = Promise.resolve();

  // Promotion: an element becomes queryable (added to `registry`) only once
  // it is actually inserted under a tracked container — the same rule a real
  // DOM follows (document.querySelector never sees a node that was created
  // but never attached). `makeElement`'s own append/appendChild/prepend call
  // this on every child when `this` is already tracked; a subtree built
  // bottom-up (leaf appended to a still-untracked wrapper, wrapper appended
  // to a still-untracked wrapper, ..., outermost wrapper finally appended to
  // a tracked root) only gets promoted at that last step, so promotion walks
  // the whole existing `children` array recursively rather than promoting
  // just the one node handed to it.
  function promote(el) {
    if (!el || el.__tracked || !el.tagName) return;
    el.__tracked = true;
    registry.push(el);
    // An element that carries an id or a data-window becomes reachable by the
    // two fast lookups the moment it is attached, exactly like a real DOM.
    // This is how a window that its own module BUILDS becomes findable: not
    // by the shim inventing it, but by ApplicationShell.createWindow() really
    // running and really appending it.
    if (el.id && !byId.has(el.id)) byId.set(el.id, el);
    const windowName = el.dataset?.window;
    if (windowName && !windowsByName.has(windowName)) windowsByName.set(windowName, el);
    (el.children || []).forEach(promote);
  }

  // A removed element must stop answering queries. `remove()` was once a
  // no-op here, which meant a surface that closes by deleting its own markup
  // still matched every selector afterwards.
  function detach(el) {
    if (!el) return;
    const parent = el.parentElement;
    if (parent) parent.children = parent.children.filter((child) => child !== el);
    el.parentElement = null;
    el.parentNode = null;
    const untrack = (node) => {
      if (!node || !node.__tracked) return;
      node.__tracked = false;
      if (byId.get(node.id) === node) byId.delete(node.id);
      const name = node.dataset?.window;
      if (name && windowsByName.get(name) === node) windowsByName.delete(name);
      (node.children || []).forEach(untrack);
    };
    untrack(el);
  }

  // Appending a node that already has a parent MOVES it, the way a real DOM
  // does. application-shell.js's createWindow() relies on exactly that:
  // `while (slot.firstChild) win.append(slot.firstChild)` empties a scratch
  // div into the window. With a shim that copied instead of moved, the loop
  // never ended, and with no firstChild at all it never started — the whole
  // tool strip of Cover Glass was dropped, and the module then threw on the
  // first control it went to wire.
  function adopt(parent, child) {
    if (!child) return;
    const previous = child.parentElement;
    if (previous && previous !== parent) previous.children = previous.children.filter((node) => node !== child);
    if (!child.tagName) return;
    child.parentElement = parent;
    child.parentNode = parent;
    if (parent.__tracked) promote(child);
  }

  function elementChildren(el) {
    return (el?.children || []).filter((child) => child && child.tagName);
  }

  function siblingsOf(el) {
    return el?.parentElement ? elementChildren(el.parentElement) : [];
  }

  // `trackForQuery` is false for plain document.createElement(tag) calls: a
  // real DOM never returns an element from document.querySelector until it
  // is actually inserted into the tree, and this shim does not model
  // insertion at all. The app renders lots of throwaway nodes at runtime
  // (markdown output, list rows, …) via createElement, and the first version
  // of this shim pushed every single one into the same flat registry that
  // queryOne/queryAll scan — turning boot-time rendering into an
  // O(elements-ever-created) scan on every subsequent selector call. Only
  // named, tracked elements (by id, data-window, or real DOM insertion under
  // a tracked container — see `promote` above) go in the registry.
  function makeElement(tag = "div", id = "", trackForQuery = false) {
    const el = {
      tagName: String(tag).toUpperCase(),
      id,
      __tracked: false,
      value: "",
      innerText: "",
      __text: "",
      __html: "",
      get textContent() {
        return this.__text + (this.children || []).map((child) => child?.textContent || "").join("");
      },
      set textContent(value) {
        [...(this.children || [])].forEach(detach);
        this.children = [];
        this.__text = value === null || value === undefined ? "" : String(value);
      },
      // A module that builds its own window writes the window's parts as one
      // markup string. The shim used to keep that string and make no
      // children, so `root.querySelector("#todo-da-list")` inside the window
      // the module had just built answered null and the module threw while
      // wiring its own controls — a harness failure that reads exactly like
      // an app failure. The string is still kept for the getter (a real
      // browser serializes the tree instead; nothing here needs that
      // difference).
      get innerHTML() { return this.__html; },
      set innerHTML(value) {
        this.__html = value === null || value === undefined ? "" : String(value);
        [...(this.children || [])].forEach(detach);
        this.children = [];
        this.__text = "";
        if (this.__html) materializeFragment(this.__html, this);
      },
      hidden: false,
      disabled: false,
      open: false,
      checked: false,
      scrollTop: 0,
      scrollHeight: 0,
      selectionStart: 0,
      selectionEnd: 0,
      selectionDirection: "none",
      // style and dataset are built on first use, not on creation. The shim
      // now materializes the whole of index.html — about 2,500 elements — and
      // a Proxy for each of two bags on every one of them was the largest
      // single cost in a boot. Most of those elements are never asked for
      // either bag.
      get style() {
        if (!this.__style) {
          this.__style = new Proxy({}, {
            get: (target, prop) => {
              if (prop === "setProperty") return (name, value) => { target[name] = value; };
              if (prop === "removeProperty") return (name) => { delete target[name]; };
              if (prop === "getPropertyValue") return (name) => target[name] || "";
              return target[prop] || "";
            },
            set: (target, prop, value) => { target[prop] = value; return true; },
          });
        }
        return this.__style;
      },
      set style(value) { this.attributes.style = String(value ?? ""); },
      children: [],
      // Real parent links. The shim used to hold elements in a flat list with
      // no tree at all, so a scoped query (`win.querySelector(".window-pane")`)
      // searched the whole document and could answer with ANOTHER window's
      // pane — two windows that must stay independent collapsing into one,
      // which is the class of defect an executing test exists to catch.
      parentElement: null,
      parentNode: null,
      get childNodes() { return this.children; },
      get firstChild() { return this.children[0] || null; },
      get lastChild() { return this.children[this.children.length - 1] || null; },
      get firstElementChild() { return elementChildren(this)[0] || null; },
      get lastElementChild() { return elementChildren(this).slice(-1)[0] || null; },
      get nextElementSibling() {
        const siblings = siblingsOf(this);
        return siblings[siblings.indexOf(this) + 1] || null;
      },
      get previousElementSibling() {
        const siblings = siblingsOf(this);
        const at = siblings.indexOf(this);
        return at > 0 ? siblings[at - 1] : null;
      },
      normalize: () => {},
      options: [],
      isConnected: true,
      offsetParent: {},
      classList: classList(),
      // `className` is a plain string assignment in real DOM code —
      // application-shell.js's createWindow() does exactly that
      // (`win.className = classNames("window", options.windowClass,
      // "is-hidden")`) rather than calling classList.add(). Without this
      // accessor pair, that assignment lands on an ordinary property nobody
      // reads, classList stays permanently empty, and every
      // classList.contains("window") check downstream — including this
      // harness's own registry lookups — silently sees nothing.
      get className() { return this.classList.toString(); },
      set className(value) {
        const list = this.classList;
        [...list.values()].forEach((name) => list.remove(name));
        String(value || "").trim().split(/\s+/).filter(Boolean).forEach((name) => list.add(name));
      },
      attributes: {},
      // setAttribute must reach dataset and classList, not only the attribute
      // bag. Bonsai City builds its window with
      // `win.setAttribute("data-window", "bonsaiCity")`, and while the two
      // were separate the window it really built stayed invisible to
      // `[data-window="bonsaiCity"]` — the module then rebuilt it on every
      // open and no test could see it at all.
      setAttribute(name, v) {
        const value = String(v);
        this.attributes[name] = value;
        if (name === "id") this.id = value;
        else if (name === "class") this.className = value;
        else if (name.startsWith("data-")) this.dataset[dataAttrKey(name)] = value;
      },
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; },
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
      removeAttribute(name) {
        delete this.attributes[name];
        if (name === "class") this.className = "";
        else if (name.startsWith("data-")) delete this.dataset[dataAttrKey(name)];
      },
      // Real listener storage, not a no-op: a first version of this shim
      // discarded every addEventListener call, which made it impossible to
      // prove or disprove the specific class of defect named in the task
      // ("Control Panel could not be typed into") — a real input handler
      // that never fires reads identically to a fake input handler that was
      // never wired, unless something actually calls it back.
      __listeners: {},
      addEventListener(type, handler) { (this.__listeners[type] ||= []).push(handler); },
      removeEventListener(type, handler) {
        const list = this.__listeners[type];
        if (list) this.__listeners[type] = list.filter((entry) => entry !== handler);
      },
      dispatchEvent(event) {
        const type = event?.type;
        if (event && event.target === undefined) event.target = this;
        (this.__listeners[type] || []).slice().forEach((handler) => handler.call(this, event));
        return true;
      },
      // Real insertion, not a no-op: application-shell.js's createWindow()
      // builds a window's title bar / status bar / pane as separate elements
      // and .append()s each into the section it returns, then appends that
      // section into document.querySelector(".desktop") — a no-op append
      // here would build the window in memory and then drop it, which reads
      // identically to createWindow() never having been called at all. Real
      // DOM insertion promotes into the queryable registry (see `promote`
      // above) exactly when — and only when — the parent is itself already
      // reachable from a tracked root.
      append(...nodes) { nodes.forEach((node) => { this.children.push(node); adopt(this, node); }); },
      prepend(...nodes) { nodes.forEach((node) => { this.children.unshift(node); adopt(this, node); }); },
      before: () => {},
      after: () => {},
      appendChild(child) { this.children.push(child); adopt(this, child); return child; },
      insertBefore(child, before) {
        const at = before ? this.children.indexOf(before) : -1;
        if (at < 0) this.children.push(child);
        else this.children.splice(at, 0, child);
        adopt(this, child);
        return child;
      },
      insertAdjacentElement: () => {},
      insertAdjacentHTML: () => {},
      insertAdjacentText: () => {},
      removeChild(child) { detach(child); return child; },
      replaceChildren(...nodes) {
        [...this.children].forEach(detach);
        this.children = [];
        nodes.forEach((node) => { this.children.push(node); adopt(this, node); });
      },
      replaceWith: () => {},
      cloneNode: () => makeElement(tag, id),
      remove() { detach(this); },
      click: () => {},
      focus() { this.__focused = true; activeElement = this; },
      blur() { this.__focused = false; if (activeElement === this) activeElement = null; },
      closest(sel) {
        let node = this;
        while (node) {
          if (matchesSelector(node, sel, node)) return node;
          node = node.parentElement;
        }
        return null;
      },
      matches(sel) { return matchesSelector(this, sel, this); },
      contains(node) {
        let walk = node;
        while (walk) {
          if (walk === this) return true;
          walk = walk.parentElement;
        }
        return false;
      },
      getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      // A shape stub for <canvas>, like the Audio stub below: enough that a
      // module which prepares its brushes or its cover art at open time gets
      // through, NOT a renderer. It draws nothing and records nothing, so a
      // test must never read a pixel back from it and call that proof.
      getContext: () => canvasContextStub(),
      toDataURL: () => "data:image/png;base64,",
      scrollIntoView: () => {},
      setSelectionRange(start, end, direction = "none") {
        this.selectionStart = start;
        this.selectionEnd = end;
        this.selectionDirection = direction;
      },
      querySelector(sel) { return queryOne(sel, this); },
      querySelectorAll(sel) { return queryAll(sel, this); },
    };
    // An <img> must settle. The harness has no network, so a picture can
    // never really arrive; a real browser always ends the wait one way or the
    // other, and code written against that wraps it in a Promise. Bureaucracy
    // Meme does exactly this — `new Promise(... img.onload / img.onerror ...)`
    // — and with a shim that answered neither, opening its window left a
    // promise pending forever and stopped the whole test process rather than
    // failing it. The failure branch is the honest one: nothing loaded, and
    // saying "loaded" would let a test assert over a picture that is not
    // there.
    // dataset writes back into the attribute bag, so `el.dataset.window = x`
    // and `el.setAttribute("data-window", x)` say the same thing, as they do
    // in a browser.
    let datasetProxy = null;
    Object.defineProperty(el, "dataset", {
      configurable: true,
      get() {
        if (!datasetProxy) {
          datasetProxy = new Proxy({}, {
            set(store, key, value) {
              if (typeof key !== "string") return true;
              store[key] = String(value);
              el.attributes[`data-${dashedAttrKey(key)}`] = String(value);
              return true;
            },
            deleteProperty(store, key) {
              delete store[key];
              delete el.attributes[`data-${dashedAttrKey(key)}`];
              return true;
            },
          });
        }
        return datasetProxy;
      },
    });
    if (el.tagName === "IMG") {
      let source = "";
      Object.defineProperty(el, "src", {
        configurable: true,
        get: () => source,
        set(value) {
          source = value === null || value === undefined ? "" : String(value);
          if (!source) return;
          Promise.resolve().then(() => {
            el.onerror?.(new Error(`app-boot-vm: no network, cannot load ${source}`));
            el.dispatchEvent({ type: "error", target: el });
          });
        },
      });
    }
    if (trackForQuery) promote(el);
    return el;
  }

  // No auto-vivification any more. index.html is now read for real (see
  // materializeIndexHtml below), so every id the static markup declares
  // already exists here; an id it does NOT declare belongs to markup that
  // some module has to build first, and production answers null for it until
  // that module runs. Handing back an invented stub instead is the same
  // mistake this file already records for windows: the caller sees an
  // element, takes the "it is there" branch, and reports green over code that
  // never ran.
  function getElementById(id) {
    const known = byId.get(id);
    if (known && known.__tracked) return known;
    // An element that was given its id AFTER it was attached is not in the
    // map; find it once and remember it.
    const found = registry.find((el) => el.__tracked && el.id === id);
    if (found) byId.set(id, found);
    return found || null;
  }

  // A `.window[data-window="name"]` element is what getWindow(name) and
  // openWindow/focusWindow all key off. This creates NOTHING. It answers with
  // the element index.html declares (materialized below), or with the element
  // a module really built and really attached (promote() puts it in the map),
  // or with null.
  //
  // A `builtByModule: true` window (window-registry.js) has NO markup in
  // index.html at all — nothing exists until its own module calls
  // ApplicationShell.createWindow(), which is exactly the call this harness
  // needs to prove actually ran. Inventing a stub for one was a real bug in
  // this file: 13 module-built windows (doom, bureaucracyMeme, todoDa,
  // projectPeek, …) each guard their own construction with
  // `if (document.querySelector('[data-window="name"]')) return;`, and that
  // guard always found the invented stub and skipped construction —
  // ApplicationShell.createWindow() had never once actually run in any test
  // that used this harness, while every one of them reported green. The same
  // reasoning now covers static windows too, which is why nothing here is
  // invented for either kind.
  function windowElement(name) {
    const known = windowsByName.get(name);
    if (known && known.__tracked) return known;
    const found = registry.find((el) => el.__tracked && el.classList?.contains("window") && el.dataset.window === name);
    if (found) windowsByName.set(name, found);
    return found || null;
  }

  const dataAttrKey = (attr) => attr.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const dashedAttrKey = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

  // --- selector engine ---------------------------------------------------
  //
  // The tree is real now, so the matcher is a real one: a selector is a list
  // of compound tokens joined by combinators, matched right to left up the
  // parent chain. The earlier matcher looked at the LAST token only, against
  // a flat list, which made ".window .title" match any .title anywhere.
  //
  // Supported: tag, #id, .class, [attr], [attr=value] with the ^= $= *= ~=
  // operators, :not(...), the combinators " " > + ~, and the pseudo-classes
  // this app's own selectors use (:scope :checked :disabled :enabled :focus
  // :first-child :last-child :only-child :empty). An unknown pseudo-class
  // matches NOTHING, the way a browser rejects a selector it cannot parse —
  // a visible null is safer here than a quiet over-match.
  //
  // Two caches carry the cost. updateMenuState() alone calls the
  // querySelector family for a large fraction of the ~350 registered commands
  // on every action dispatch, and a version of this shim that re-parsed the
  // selector for every (element, selector) PAIR cost a measured ~150 ms per
  // action. Parsing each distinct selector once turns the inner loop into
  // plain property comparisons.
  const compoundCache = new Map();
  const selectorCache = new Map();

  function parseCompound(text) {
    const key = text;
    const cached = compoundCache.get(key);
    if (cached) return cached;
    let rest = String(text).trim();
    const attrs = [];
    rest = rest.replace(/\[([\w:-]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g, (_, attr, op, dq, sq, bare) => {
      const value = dq ?? sq ?? (bare === undefined ? undefined : bare.trim());
      // The dataset key is worked out here, once for each distinct selector,
      // rather than for every element the matcher compares.
      attrs.push({ attr, op: op || null, value, datasetKey: attr.startsWith("data-") ? dataAttrKey(attr) : null });
      return "";
    });
    const nots = [];
    rest = rest.replace(/:not\(([^()]*)\)/g, (_, inner) => {
      inner.split(",").forEach((part) => { if (part.trim()) nots.push(parseCompound(part.trim())); });
      return "";
    });
    const pseudos = [];
    rest = rest.replace(/::?([\w-]+)(\([^()]*\))?/g, (_, name) => { pseudos.push(name.toLowerCase()); return ""; });
    const classes = [];
    rest = rest.replace(/\.([\w-]+)/g, (_, name) => { classes.push(name); return ""; });
    let id = null;
    rest = rest.replace(/#([\w-]+)/g, (_, name) => { id = name; return ""; });
    const tag = rest.trim().toLowerCase().replace(/\*/g, "") || null;
    const compound = { tag, id, classes, attrs, nots, pseudos };
    compoundCache.set(key, compound);
    return compound;
  }

  function attributeMatches(el, { attr, op, value, datasetKey }) {
    const actual = datasetKey ? el.dataset[datasetKey] : el.getAttribute(attr);
    if (actual === undefined || actual === null) return false;
    if (value === undefined) return true;
    const text = String(actual);
    if (op === "^=") return text.startsWith(value);
    if (op === "$=") return text.endsWith(value);
    if (op === "*=") return text.includes(value);
    if (op === "~=") return text.split(/\s+/).includes(value);
    return text === value;
  }

  function pseudoMatches(el, name, scopeRoot) {
    switch (name) {
      case "scope": return el === scopeRoot;
      case "checked": return Boolean(el.checked);
      case "disabled": return Boolean(el.disabled);
      case "enabled": return !el.disabled;
      case "focus":
      case "focus-visible":
        return activeElement === el;
      case "focus-within": {
        let node = activeElement;
        while (node) { if (node === el) return true; node = node.parentElement; }
        return false;
      }
      case "hover":
      case "active":
      case "visited":
      case "target":
        return false;
      case "first-child": return siblingsOf(el)[0] === el;
      case "last-child": return siblingsOf(el).slice(-1)[0] === el;
      case "only-child": return siblingsOf(el).length === 1;
      case "empty": return elementChildren(el).length === 0 && !String(el.textContent || "");
      default: return false;
    }
  }

  function compoundMatches(el, compound, scopeRoot) {
    if (!el || !el.tagName) return false;
    if (compound.tag && el.tagName.toLowerCase() !== compound.tag) return false;
    if (compound.id && el.id !== compound.id) return false;
    for (const cls of compound.classes) if (!el.classList.contains(cls)) return false;
    for (const attr of compound.attrs) if (!attributeMatches(el, attr)) return false;
    for (const pseudo of compound.pseudos) if (!pseudoMatches(el, pseudo, scopeRoot)) return false;
    for (const not of compound.nots) if (compoundMatches(el, not, scopeRoot)) return false;
    return true;
  }

  // Splits "a > b c" into [{combinator:null,…a}, {combinator:">",…b},
  // {combinator:" ",…c}]. Quotes and brackets are tracked so a space inside
  // [data-x="two words"] does not become a combinator.
  function parseSelector(sel) {
    const key = String(sel);
    const cached = selectorCache.get(key);
    if (cached) return cached;
    const steps = [];
    let buffer = "";
    let combinator = null;
    let depth = 0;
    let quote = null;
    for (const character of key.trim()) {
      if (quote) {
        buffer += character;
        if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") { quote = character; buffer += character; continue; }
      if (character === "[" || character === "(") depth += 1;
      if (character === "]" || character === ")") depth -= 1;
      if (depth === 0 && (character === " " || character === ">" || character === "+" || character === "~")) {
        if (buffer) { steps.push({ combinator, compound: parseCompound(buffer) }); buffer = ""; combinator = " "; }
        if (character !== " ") combinator = character;
        continue;
      }
      buffer += character;
    }
    if (buffer) steps.push({ combinator, compound: parseCompound(buffer) });
    selectorCache.set(key, steps);
    return steps;
  }

  // Right-to-left match. The descendant walk takes the FIRST matching
  // ancestor and does not backtrack — enough for this app's selectors, and
  // noted here so nobody reads it as a full CSS engine.
  function chainMatches(el, steps, scopeRoot) {
    if (!steps.length) return false;
    if (!compoundMatches(el, steps[steps.length - 1].compound, scopeRoot)) return false;
    let current = el;
    for (let index = steps.length - 1; index > 0; index -= 1) {
      const combinator = steps[index].combinator || " ";
      const target = steps[index - 1].compound;
      if (combinator === ">") {
        current = current.parentElement;
        if (!compoundMatches(current, target, scopeRoot)) return false;
      } else if (combinator === "+") {
        current = current.previousElementSibling;
        if (!compoundMatches(current, target, scopeRoot)) return false;
      } else {
        const step = combinator === "~" ? (node) => node.previousElementSibling : (node) => node.parentElement;
        let candidate = step(current);
        while (candidate && !compoundMatches(candidate, target, scopeRoot)) candidate = step(candidate);
        if (!candidate) return false;
        current = candidate;
      }
    }
    return true;
  }

  // A comma is a selector LIST — "a, b" means "matches a OR b" — and is split
  // out before anything else, the same way a real browser treats it as N
  // independent selectors. Found via window-frame-bars.js's
  // `bar.querySelector(".is-up, .is-left")`: read as one compound, "is-up"
  // and "is-left" become two classes the same button must carry, which no
  // real arrow button does.
  const selectorListCache = new Map();
  function splitSelectorList(sel) {
    const key = String(sel);
    const cached = selectorListCache.get(key);
    if (cached) return cached;
    const parts = [];
    let buffer = "";
    let depth = 0;
    let quote = null;
    for (const character of String(sel)) {
      if (quote) { buffer += character; if (character === quote) quote = null; continue; }
      if (character === '"' || character === "'") { quote = character; buffer += character; continue; }
      if (character === "[" || character === "(") depth += 1;
      if (character === "]" || character === ")") depth -= 1;
      if (character === "," && depth === 0) { parts.push(buffer); buffer = ""; continue; }
      buffer += character;
    }
    if (buffer.trim()) parts.push(buffer);
    const trimmed = parts.map((part) => part.trim()).filter(Boolean);
    selectorListCache.set(key, trimmed);
    return trimmed;
  }

  function matchesSelector(el, sel, scopeRoot) {
    return splitSelectorList(sel).some((part) => chainMatches(el, parseSelector(part), scopeRoot));
  }

  // Candidates: the document scope scans the tracked registry; an element
  // scope walks its own descendants only, so one window can never answer with
  // another window's part.
  function collectDescendants(root, out) {
    for (const child of root.children || []) {
      if (!child || !child.tagName) continue;
      out.push(child);
      collectDescendants(child, out);
    }
    return out;
  }

  function candidatesFor(root) {
    if (!root) return registry;
    return collectDescendants(root, []);
  }

  function query(sel, root, all) {
    const results = all ? [] : null;
    const seen = all ? new Set() : null;
    for (const part of splitSelectorList(sel)) {
      const steps = parseSelector(part);
      // Fast paths, document scope only: a bare "#id" and a bare
      // [data-window="name"] are the two lookups the app makes most.
      if (!root && steps.length === 1) {
        const only = steps[0].compound;
        const plainId = only.id && !only.tag && !only.classes.length && !only.attrs.length && !only.nots.length && !only.pseudos.length;
        if (plainId) {
          const el = getElementById(only.id);
          if (el) { if (!all) return el; if (!seen.has(el)) { seen.add(el); results.push(el); } }
          continue;
        }
        const onlyWindowAttr = !only.tag && !only.id && !only.classes.length && !only.nots.length && !only.pseudos.length
          && only.attrs.length === 1 && only.attrs[0].attr === "data-window" && only.attrs[0].value !== undefined
          && (!only.attrs[0].op || only.attrs[0].op === "=");
        if (onlyWindowAttr) {
          const el = windowElement(only.attrs[0].value);
          if (el) { if (!all) return el; if (!seen.has(el)) { seen.add(el); results.push(el); } }
          continue;
        }
      }
      for (const el of candidatesFor(root)) {
        if (root === undefined || root === null) { if (!el.__tracked) continue; }
        if (!chainMatches(el, steps, root)) continue;
        if (!all) return el;
        if (!seen.has(el)) { seen.add(el); results.push(el); }
      }
    }
    return all ? results : null;
  }

  function queryOne(sel, root = null) { return query(sel, root, false); }
  function queryAll(sel, root = null) { return query(sel, root, true); }

  // The app's own lazy-module loader (app/core/config.js:loadClassicScriptOnce)
  // creates a real <script src="app/features/x.js?v=…">, sets its onload
  // /onerror, and appends it to <head> — a real browser then fetches and
  // executes it, firing onload. Nothing here does that automatically, so a
  // naive shim leaves the loader's Promise unsettled forever (its own
  // timeout is inert too, see the setTimeout stub below), which hangs any
  // test that awaits a lazy command's `.ensure()`. This intercepts exactly
  // the trigger point a real browser uses — insertion into <head> — reads
  // the real source file with the same `read()` every static contract uses,
  // and runs it into the SAME VM context so the lazy module's functions
  // become callable exactly the way loading it for real would make them.
  // Query-string cache-busters (the "?v=<build>" suffix) are stripped back
  // to the plain relative path first.
  //
  // Every load is chained onto ONE shared `scriptLoadChain`, not scheduled on
  // its own independent `Promise.resolve().then()`. This is load-bearing:
  // createLazyModuleLoader() in config.js sequences a module's own sources
  // strictly serially (shell before feature, e.g. application-shell.js then
  // clio-paint.js — 14 module-built windows depend on that order), and a
  // per-script microtask does not reproduce that guarantee on its own. Two
  // scripts inserted into <head> before either's microtask has run land two
  // callbacks on the queue in insertion order, which usually looks fine —
  // until anything (another concurrent lazy load, a slow read()) interleaves
  // between them, and the second script's top-level code runs against a
  // global its dependency has not installed yet. Chaining through one
  // Promise removes the ambiguity entirely: script N's read+run cannot start
  // until script N-1's has fully finished, exactly like the real serial
  // reduce it exists to mirror.
  function triggerScriptLoad(scriptEl) {
    const rawSrc = String(scriptEl.src || "").split("?")[0];
    scriptLoadChain = scriptLoadChain.then(() => {
      const context = contextRef?.current;
      if (!context) {
        scriptEl.onerror?.(new Error("app-boot-vm: no VM context to load into yet"));
        return;
      }
      try {
        const source = read(rawSrc);
        vm.runInContext(source, context, { filename: rawSrc });
        scriptEl.dataset.loaded = "true";
        scriptEl.onload?.();
      } catch (error) {
        // The real loadClassicScriptOnce's own script.onerror discards
        // whatever it is given and reports a fixed "Could not load <src>" —
        // real browsers cannot see inside a failed script's execution
        // either, and the app is not wrong to do the same. But this harness
        // is not a browser and a test author debugging a lazy-load failure
        // needs the real cause, not a rediscovery project: print it here,
        // unconditionally, before handing the generic path its opaque
        // failure.
        console.error(`[app-boot-vm] ${rawSrc} threw while loading:`, error);
        error.message = `[lazy load ${rawSrc}] ${error.message}`;
        scriptEl.onerror?.(error);
      }
    });
  }

  // Stylesheets: content never matters to a headless test, so a lazy CSS
  // request just succeeds without reading the file. This still exercises the
  // real Promise-based loadStylesheetOnce() code path in config.js — only the
  // browser-only "did the network deliver bytes" half is skipped.
  function triggerStyleLoad(linkEl) {
    Promise.resolve().then(() => {
      linkEl.dataset.loaded = "true";
      linkEl.onload?.();
    });
  }

  const head = makeElement("head", "", true);
  const headAppend = (...nodes) => nodes.forEach((node) => {
    const tag = String(node?.tagName || "").toLowerCase();
    if (tag === "script") triggerScriptLoad(node);
    else if (tag === "link") triggerStyleLoad(node);
  });
  head.append = headAppend;
  head.appendChild = (node) => { headAppend(node); return node; };
  head.prepend = headAppend;

  const body = makeElement("body", "", true);
  const documentElementEl = makeElement("html", "", true);

  // --- the static markup, read from index.html ---------------------------
  //
  // WHY this exists. index.html is where the app declares the SHAPE of its
  // static surfaces, and boot-time code reads that shape all the time:
  // renderStaticFinderWindow() does `win.querySelector(".window-pane")` and
  // then writes into what comes back. An invented empty stub has no pane, so
  // the query gave null and the render threw — a harness failure that looked
  // exactly like an app failure, and that forced contracts to be scoped
  // around ordinary calls such as applyLanguage().
  //
  // WHY it is safe to build the whole tree, when inventing single elements
  // was not. The two are opposites. Inventing answers a lookup for markup
  // that does NOT exist, so code skips its own construction and reports
  // green over work that never ran. This copies markup that DOES exist,
  // element for element, from the one file the browser reads. Nothing that
  // index.html does not declare is created — which is why the 17
  // module-built windows still start out absent, and their own
  // ApplicationShell.createWindow() call is still the only thing that can
  // bring them into being.
  const SKIPPED_TAGS = new Set(["script", "style", "link", "meta", "base", "title"]);
  const BOOLEAN_ATTRIBUTES = new Set(["hidden", "disabled", "checked", "open", "selected", "multiple", "required"]);
  const PROPERTY_ATTRIBUTES = new Set(["type", "name", "href", "src", "placeholder", "title", "alt", "role", "rel", "lang", "step", "min", "max"]);

  function applyAttribute(el, name, value) {
    el.attributes[name] = value;
    if (name === "id") el.id = value;
    else if (name === "class") el.className = value;
    else if (name.startsWith("data-")) el.dataset[dataAttrKey(name)] = value;
    else if (name === "value") el.value = value;
    else if (name === "for") el.htmlFor = value;
    else if (name === "readonly") el.readOnly = true;
    else if (BOOLEAN_ATTRIBUTES.has(name)) el[name] = true;
    else if (PROPERTY_ATTRIBUTES.has(name)) el[name] = value;
  }

  function materialize(node, parent) {
    if (SKIPPED_TAGS.has(node.tag)) return null;
    const el = makeElement(node.tag, node.attrs.id || "");
    for (const [name, value] of Object.entries(node.attrs)) applyAttribute(el, name, value);
    if (node.text) el.textContent = node.text;
    parent.appendChild(el);
    node.children.forEach((child) => materialize(child, el));
    if (el.tagName === "OPTION" && el.attributes.value === undefined) el.value = el.textContent;
    if (el.tagName === "SELECT") {
      // A real <select> reports its options and reads its value from the
      // selected one — or from the first one, when the markup marks none.
      el.options = elementChildren(el).filter((child) => child.tagName === "OPTION");
      const chosen = el.options.find((option) => option.attributes.selected !== undefined) || el.options[0];
      if (chosen) el.value = chosen.value;
    }
    return el;
  }

  function materializeFragment(html, parent) {
    parseFragment(html).forEach((node) => materialize(node, parent));
  }

  const parsedIndexHtml = indexHtmlTree();
  const htmlNode = findNode(parsedIndexHtml, (node) => node.tag === "html");
  const bodyNode = findNode(parsedIndexHtml, (node) => node.tag === "body");
  if (htmlNode) Object.entries(htmlNode.attrs).forEach(([name, value]) => applyAttribute(documentElementEl, name, value));
  if (bodyNode) {
    Object.entries(bodyNode.attrs).forEach(([name, value]) => applyAttribute(body, name, value));
    bodyNode.children.forEach((child) => materialize(child, body));
  }
  documentElementEl.appendChild(head);
  documentElementEl.appendChild(body);

  // application-shell.js's createWindow() appends every module-built window
  // to `options.host || document.querySelector(".desktop")` — the one real
  // `<main class="desktop">` index.html always has. If the read above ever
  // stops delivering it, that append lands on null and every module-built
  // window is silently dropped. Fail loudly here instead: a harness that is
  // broken must say so, not report green.
  if (!queryOne(".desktop")) {
    throw new Error("app-boot-vm: apps/desktop/index.html gave no .desktop host; the DOM read is broken");
  }

  const documentStub = {
    body,
    head,
    documentElement: documentElementEl,
    get activeElement() { return activeElement; },
    set activeElement(el) { activeElement = el; },
    visibilityState: "visible",
    hidden: false,
    getElementById,
    querySelector: (sel) => queryOne(sel),
    querySelectorAll: (sel) => queryAll(sel),
    createElement: (tag) => makeElement(tag),
    // SVG elements are ordinary shim elements: this shim has no namespaces,
    // and nothing on these paths reads one back.
    createElementNS: (_ns, tag) => makeElement(tag),
    createDocumentFragment: () => ({ append: () => {}, appendChild: () => {}, children: [] }),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    ...createEventTarget(),
  };

  return { documentStub, getElementById, makeElement, windowElement };
}

export function createAppBootVm(overrides = {}) {
  const contextRef = {};
  const { documentStub, getElementById, makeElement, windowElement } = createDomShim(contextRef);
  const storageMap = new Map();
  let fakeTimerHandle = 1;

  // Real console, filtered: app.js unconditionally calls boot() at its own
  // top level (see the file banner) — a real, intentional production
  // behavior, not a harness artifact — and boot() reaches for indexedDB,
  // which this harness deliberately leaves unavailable (like fetch) rather
  // than emulating. The app's own try/catch already handles that gracefully;
  // only its console.error is noisy, and identically on every single test
  // that boots this harness. Genuine errors — anything not matching this one
  // well-known boot-time shape — still print normally.
  const expectedBootNoise = /Could not read app version|Failed to load state from IDB|Failed to save state to IDB|Working Session storage failed|AI System 6 (boot failed|failed to start)/;
  const filteredConsole = {
    ...console,
    error: (...args) => { if (!expectedBootNoise.test(String(args[0]))) console.error(...args); },
    warn: (...args) => { if (!expectedBootNoise.test(String(args[0]))) console.warn(...args); },
  };

  // This object becomes the VM's global object. `window` is added as a
  // self-reference AFTER contextifying, so `window === globalThis` inside
  // the VM exactly as it does in a browser — see the file banner.
  const globalObject = {
    console: filteredConsole,
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    Blob,
    Event,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    // Soundscape (app/features/soundscape.js) constructs `new Audio()` at its
    // own top level. A real HTMLMediaElement has no headless equivalent, so
    // this is a shape stub — enough that constructing one and calling the
    // handful of methods a lazy module's top level might reach for does not
    // throw, not a working audio player.
    Audio: class Audio {
      constructor(src) { this.src = src || ""; this.volume = 1; this.loop = false; this.paused = true; }
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
      addEventListener() {}
      removeEventListener() {}
      load() {}
    },
    CSS: { supports: () => false, escape: (v) => String(v) },
    // Element constructors, as names only. Two kinds of app code want them:
    // an `instanceof` test, and `Object.getOwnPropertyDescriptor(
    // HTMLTextAreaElement.prototype, "value")` — input-guard.js reads that to
    // wrap a control's own value setter. The shim's elements are plain
    // objects, not instances of these, so `instanceof` answers false and the
    // descriptor read answers undefined. Both are honest here: input-guard.js
    // already returns early when the descriptor has no setter, so nothing
    // pretends the guard was installed. Before these existed the whole boot
    // stopped with a ReferenceError as soon as the DOM held a real textarea.
    ...Object.fromEntries([
      "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement",
      "HTMLSelectElement", "HTMLButtonElement", "HTMLImageElement", "HTMLCanvasElement",
      "HTMLVideoElement", "HTMLMediaElement", "HTMLDialogElement", "HTMLAnchorElement",
      "SVGElement",
    ].map((name) => [name, class {}])),
    MutationObserver: class MutationObserver { observe() {} disconnect() {} takeRecords() { return []; } },
    ResizeObserver: class ResizeObserver { observe() {} disconnect() {} unobserve() {} },
    IntersectionObserver: class IntersectionObserver { observe() {} disconnect() {} unobserve() {} },
    structuredClone,
    performance,
    // A real AbortController; node has one. Its absence stopped CMF Studio
    // in its own capability check the moment the window really opened.
    AbortController,
    AbortSignal,
    // `new Image()` is `document.createElement("img")` in a browser, so this
    // gives back the shim's own element rather than a second kind of stub.
    Image: function ImageStub() { return documentStub.createElement("img"); },
    // Inert, not real Node timers: boot-time code (heartbeats, autosave
    // watchers, the clock) schedules setInterval/setTimeout as a side effect
    // of loading, and a real timer scheduled before an unrelated later
    // statement throws stays alive and keeps the whole test process from
    // exiting — the first version of this harness hung for exactly that
    // reason. Nothing here calls boot() itself, so nothing needs these to
    // actually fire; a fake, ever-increasing handle is enough for callers
    // that only check truthiness or pass it to clearTimeout/clearInterval.
    setTimeout: () => fakeTimerHandle++,
    clearTimeout: () => {},
    setInterval: () => fakeTimerHandle++,
    clearInterval: () => {},
    requestAnimationFrame: (cb) => { cb(); return 1; },
    cancelAnimationFrame: () => {},
    fetch: async () => { throw new Error("fetch is not available in the boot VM"); },
    document: documentStub,
    navigator: { userAgent: "node", platform: "MacIntel", language: "en-US", sendBeacon: () => false, clipboard: { writeText: async () => {} } },
    // Speech: a shape stub with no voices. The listening surface reads
    // `window.speechSynthesis.getVoices()` with no guard, so its absence
    // stopped every window whose open path touches that surface.
    speechSynthesis: { getVoices: () => [], speak: () => {}, cancel: () => {}, pause: () => {}, resume: () => {}, addEventListener: () => {}, removeEventListener: () => {} },
    SpeechSynthesisUtterance: class SpeechSynthesisUtterance {
      constructor(text) { this.text = text || ""; }
      addEventListener() {}
      removeEventListener() {}
    },
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k),
    },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    indexedDB: undefined,
    location: { href: "http://localhost/", reload: () => {}, search: "" },
    getComputedStyle: () => ({ getPropertyValue: () => "", display: "block" }),
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    innerWidth: 1024,
    innerHeight: 768,
    devicePixelRatio: 1,
    open: () => null,
    scrollTo: () => {},
    getSelection: () => ({ toString: () => "", rangeCount: 0, removeAllRanges: () => {}, addRange: () => {}, getRangeAt: () => null }),
    ...createEventTarget(),
    ...overrides,
  };

  const context = vm.createContext(globalObject);
  context.window = context;
  context.self = context;
  context.top = context;
  context.parent = context;
  contextRef.current = context;

  // One script, not one vm.runInContext call per file — see the file banner
  // for why splitting them breaks cross-file function hoisting that
  // production relies on.
  const boundaries = [];
  let lineNo = 1;
  const combined = sources.map(([path, source]) => {
    boundaries.push({ path, startLine: lineNo });
    lineNo += source.split("\n").length;
    return source;
  }).join("\n");

  try {
    vm.runInContext(combined, context, { filename: "app.boot-vm.js" });
  } catch (error) {
    const at = typeof error.stack === "string" ? error.stack.match(/app\.boot-vm\.js:(\d+)/) : null;
    if (at) {
      const line = Number(at[1]);
      let culprit = "(unknown file)";
      for (const boundary of boundaries) if (boundary.startLine <= line) culprit = boundary.path;
      error.message = `[near ${culprit}] ${error.message}`;
    }
    throw error;
  }

  // Several top-level `let`/`const` bindings in app.js (projects,
  // activeProjectId, activeProject, …) are lexical script-scope variables,
  // not properties of the global object — real browsers behave the same way
  // for top-level let/const across multiple <script> tags in one document.
  // `context.projects` is therefore undefined even though the app's own
  // functions see it fine; `run(code)` evaluates a snippet in the SAME
  // lexical scope (Node's vm shares that scope across runInContext calls
  // against one context) so a test can read or seed that state directly —
  // the same thing draft-desk-vm.mjs does by putting `projects` straight on
  // its sandbox object, which this harness cannot do because it does not own
  // that declaration.
  function run(code) {
    return vm.runInContext(code, context);
  }

  // Route-open handlers call `openWindow(name)` without awaiting it (see the
  // report's fail/fix transcript — openQuestionSheetSurface does this for
  // real, it is not a harness artifact), so the DOM update a test wants to
  // assert on can land one or more turns after the action's own promise
  // settles. Everything that eventually resolves in this VM does so through
  // a real microtask chain (the lazy script loader's Promise.resolve().then()
  // — see triggerScriptLoad above); nothing here relies on a real macrotask,
  // because the VM's setTimeout/setInterval are deliberately inert. Polling
  // with a microtask (`await Promise.resolve()`) rather than setImmediate
  // drains that chain just as reliably and roughly a hundred times faster —
  // setImmediate forces a full event-loop turn per attempt, which is what
  // made the first version of this helper cost whole seconds per test file.
  async function waitFor(predicate, { tries = 2000 } = {}) {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (predicate()) return true;
      await Promise.resolve();
    }
    return predicate();
  }

  // Simulates a user typing into a text-like control the way wireup.js's own
  // real listeners expect: set .value, then fire real "input" and "change"
  // events through the element's own listener list (see makeElement's real
  // addEventListener/dispatchEvent above). A field whose handler was never
  // wired, or whose element carries `disabled`, is indistinguishable from a
  // working one by reading .value alone — only firing the event and reading
  // back whatever state the real handler is supposed to update proves it.
  function typeInto(el, text) {
    el.value = text;
    el.dispatchEvent(new context.Event("input"));
    el.dispatchEvent(new context.Event("change"));
  }

  // Simulates a keyboard shortcut through document-level dispatch, the same
  // path wireup.js's own keydown listener uses to call runShortcut(). A
  // plain object, not `new Event("keydown")`: Node's real Event class makes
  // defaultPrevented a read-only getter (preventDefault() is the only way to
  // flip it), so runShortcut's own `event.preventDefault()` call still works
  // here, but a test cannot pre-seed or inspect the modifier keys
  // (key/metaKey/shiftKey/...) on a real Event instance the way KeyboardEvent
  // would allow — this shim's dispatchEvent only ever reads properties off
  // whatever object it is given, so a plain object works exactly as well.
  function fireKeydown(target, init = {}) {
    const event = {
      type: "keydown",
      key: "",
      code: "",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      target,
      ...init,
    };
    documentStub.dispatchEvent(event);
    return event;
  }

  return {
    context,
    document: documentStub,
    typeInto,
    fireKeydown,
    window: context,
    getElementById,
    makeElement,
    windowElement,
    storageMap,
    run,
    waitFor,
  };
}
