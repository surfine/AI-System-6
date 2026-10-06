// WM4 — Window Shade "glance": a temporary, non-destructive look at a
// collapsed window.
//
// Two parts live here so the hover path, the Escape block, the exact
// inert/aria restore and the peek guard have a single owner:
//   1. GlanceIntent — a behavioural port of the WindowShade prototype
//      prototype/Core/GlanceIntent.swift (MIT), source commit
//      b271fcfb843e5caeb89c4e4960c9c8524f232ed6. Times are MONOTONIC
//      MILLISECONDS here (Swift uses seconds). Pure judgement: no DOM, no
//      timers, no storage, no model or media work.
//   2. The display adapter — it declares which windows may be previewed
//      read-only, drives the eager beginPeek/endPeek/commitPeek path in
//      window-manager, and makes the preview inert without mutating identity.
//
// Lazy module: windowshade-entry loads it on the first title-bar hover, so the
// boot disk never pays for it. Prewarm is deliberately a no-op: no screenshot,
// no parsing, no task.
(() => {
  if (window.AISystem6WindowPeekLoaded) return;

  class GlanceIntent {
    constructor({ intentDelay = 220, leaveGrace = 160, menuHandoffGrace = 1200 } = {}) {
      for (const value of [intentDelay, leaveGrace, menuHandoffGrace]) {
        if (!Number.isFinite(value) || value < 0) throw new RangeError("Invalid glance timing.");
      }
      this.timing = Object.freeze({ intentDelay, leaveGrace, menuHandoffGrace });
      this.phase = { kind: "idle" };
      this.blocked = new Set();
      this.menuHandoffUntil = null;
      this.lastTime = -Infinity;
    }
    time(time) {
      if (!Number.isFinite(time) || time < this.lastTime) throw new RangeError("Monotonic time required.");
      this.lastTime = time;
      return time;
    }
    id(id) {
      if (typeof id !== "string" || !id) throw new TypeError("A nonempty window ID is required.");
      return id;
    }
    get activeID() { return this.phase.id ?? null; }
    get isOpen() { return this.phase.kind === "open"; }
    get needsSampling() { return this.phase.kind !== "idle"; }
    block(id) { this.blocked.add(this.id(id)); return []; }
    unblock(id) { this.blocked.delete(this.id(id)); return []; }
    effect(kind, id) { return { kind, id }; }
    entered(id, time) {
      this.id(id); this.time(time);
      if (this.blocked.has(id)) return [];
      this.menuHandoffUntil = null;
      const old = this.phase;
      if (old.kind === "arming" && old.id === id) return [];
      if (old.kind === "open" && old.id === id) {
        this.phase = { kind: "open", id, leftAt: null }; return [];
      }
      this.phase = { kind: "arming", id, since: time };
      return [
        ...(old.kind === "idle" ? [] : [this.effect(old.kind === "open" ? "close" : "discard", old.id)]),
        this.effect("prewarm", id),
      ];
    }
    clicked(id, time) {
      this.id(id); this.time(time);
      this.blocked.delete(id); this.menuHandoffUntil = null;
      const old = this.phase;
      this.phase = { kind: "open", id, leftAt: null };
      if (old.kind === "open" && old.id === id) return [];
      if (old.kind === "arming" && old.id === id) return [this.effect("open", id)];
      return [
        ...(old.kind === "idle" ? [] : [this.effect(old.kind === "open" ? "close" : "discard", old.id)]),
        this.effect("prewarm", id), this.effect("open", id),
      ];
    }
    menuSelected(id, time) {
      const effects = this.clicked(id, time);
      this.menuHandoffUntil = time + this.timing.menuHandoffGrace;
      return effects;
    }
    sample({ strip = null, overGlance = false, overControls = false } = {}, time) {
      this.time(time);
      if (strip !== null) this.id(strip);
      const phase = this.phase;
      if (phase.kind === "idle") return [];
      const id = phase.id;
      if (phase.kind === "arming") {
        if (strip !== id) { this.phase = { kind: "idle" }; return [this.effect("discard", id)]; }
        if (overControls) { this.phase = { ...phase, since: time }; return []; }
        if (time - phase.since < this.timing.intentDelay) return [];
        this.phase = { kind: "open", id, leftAt: null };
        return [this.effect("open", id)];
      }
      if (strip === id || overGlance) {
        this.menuHandoffUntil = null;
        this.phase = { kind: "open", id, leftAt: null }; return [];
      }
      if (strip !== null && !this.blocked.has(strip)) {
        this.menuHandoffUntil = null;
        this.phase = { kind: "arming", id: strip, since: time };
        return [this.effect("close", id), this.effect("prewarm", strip)];
      }
      if (this.menuHandoffUntil !== null && time < this.menuHandoffUntil) return [];
      this.menuHandoffUntil = null;
      if (phase.leftAt === null) { this.phase = { ...phase, leftAt: time }; return []; }
      if (time - phase.leftAt < this.timing.leaveGrace) return [];
      this.phase = { kind: "idle" }; return [this.effect("close", id)];
    }
    cancel() {
      this.menuHandoffUntil = null;
      const old = this.phase;
      this.phase = { kind: "idle" };
      return old.kind === "idle" ? [] : [this.effect(old.kind === "open" ? "close" : "discard", old.id)];
    }
    forget(id) {
      this.blocked.delete(this.id(id));
      return this.activeID === id ? this.cancel() : [];
    }
    /** Event-driven host: arm one timeout for this instant, never poll at idle. */
    nextDeadline() {
      const p = this.phase;
      if (p.kind === "arming") return p.since + this.timing.intentDelay;
      if (p.kind === "open" && this.menuHandoffUntil !== null) return p.menuHandoffUntil;
      if (p.kind === "open" && p.leftAt !== null) return p.leftAt + this.timing.leaveGrace;
      return null;
    }
  }

  const intent = new GlanceIntent();
  const clock = () => performance.now();
  const windowFor = (id) => (typeof getWindow === "function" ? getWindow(id) : null);

  // The WM4 capability is declared in window-registry: "same-dom-readonly"
  // windows may show their own collapsed body, read-only; everything else is
  // "metadata" (title/icon only) and never opens a DOM preview here.
  function capability(win) {
    const name = win?.dataset?.window;
    if (typeof windowPreviewCapability === "function") return windowPreviewCapability(name);
    return "metadata";
  }
  function canPreview(win) {
    if (!win?.isConnected || !win.classList.contains("is-collapsed")) return false;
    if (win.matches(".is-hidden, .is-app-hidden, .is-minimized, .is-fullscreen, .is-mobile-fullscreen")) return false;
    if (win.dataset.windowShadePeek === "false") return false;
    if (capability(win) !== "same-dom-readonly") return false;
    if (win.querySelector("input[type='password']")) return false;
    if (win.querySelector("iframe")) return false;
    return !!win.querySelector(":scope > .title-bar");
  }

  let activeWindowID = null;
  let activeKind = null;
  let deadline = 0;
  let previousStrip = null;
  let lastSample = Object.freeze({ strip: null, overGlance: false, overControls: false });
  const presentations = new Map();

  // Read-only, identity-preserving presentation: the exact prior inert and
  // aria-hidden of each content node is recorded and restored, never blanket
  // set false. The window remains logically collapsed the whole time.
  function contentNodes(win) {
    return Array.from(win.children).filter((node) => !node.classList.contains("title-bar"));
  }
  function adopt(id, win) {
    const nodes = contentNodes(win).map((node) => ({
      node,
      inert: node.inert === true,
      aria: node.getAttribute("aria-hidden"),
    }));
    presentations.set(id, nodes);
    nodes.forEach(({ node }) => {
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
    });
  }
  function restore(id) {
    const nodes = presentations.get(id) || [];
    presentations.delete(id);
    nodes.forEach(({ node, inert, aria }) => {
      if (!node.isConnected) return;
      node.inert = inert;
      if (aria === null) node.removeAttribute("aria-hidden");
      else node.setAttribute("aria-hidden", aria);
    });
  }

  // A preview must not outlive its window: hide, close, minimize, or a state
  // change into full screen ends the glance. One observer per open preview.
  let guard = null;
  function watch(id) {
    unwatch();
    const win = windowFor(id);
    if (!win || typeof MutationObserver !== "function") return;
    guard = new MutationObserver(() => {
      const target = windowFor(id);
      if (!target || !target.isConnected
        || target.matches(".is-hidden, .is-app-hidden, .is-minimized, .is-fullscreen, .is-mobile-fullscreen")) forget(id);
    });
    guard.observe(win, { attributes: true, attributeFilter: ["class"] });
  }
  function unwatch() {
    guard?.disconnect();
    guard = null;
  }

  function open(id) {
    const win = windowFor(id);
    if (!win || !canPreview(win)) { restore(id); return false; }
    if (activeWindowID && activeWindowID !== id) close(activeWindowID);
    adopt(id, win);
    // The eager geometry lives in window-manager; this never writes style.
    const shown = typeof beginPeek === "function" ? beginPeek(win) : false;
    if (!shown) { restore(id); return false; }
    activeWindowID = id;
    activeKind = capability(win);
    watch(id);
    return true;
  }

  function close(id) {
    if (activeWindowID === id) { activeWindowID = null; activeKind = null; }
    unwatch();
    const win = windowFor(id);
    if (typeof endPeek === "function" && win) endPeek(win);
    else if (typeof cancelAllWindowPeeks === "function") cancelAllWindowPeeks();
    restore(id);
  }

  function apply(effects) {
    (effects || []).forEach(({ kind, id }) => {
      if (kind === "open") open(id);
      else if (kind === "close" || kind === "discard") close(id);
      // prewarm is deliberately a no-op.
    });
  }

  function clearDeadline() {
    clearTimeout(deadline);
    deadline = 0;
  }
  function schedule() {
    clearDeadline();
    const at = intent.nextDeadline();
    if (at === null) return;
    deadline = setTimeout(() => {
      deadline = 0;
      apply(intent.sample(lastSample, clock()));
      schedule();
    }, Math.max(1, at - clock()));
  }
  function sample(next) {
    const value = next || lastSample;
    lastSample = value;
    apply(intent.sample(value, clock()));
    schedule();
    return value;
  }

  // The entry feeds every pointer move here: entering a strip arms the intent,
  // movement between the strip and the temporary surface stays one interaction.
  function move(next) {
    lastSample = next;
    // Blocked after an Escape until the pointer truly leaves that strip once.
    if (previousStrip && previousStrip !== next.strip) intent.unblock(previousStrip);
    previousStrip = next.strip;
    if (next.overControls && next.strip && !intent.isOpen) { cancel({}); return; }
    if (next.strip && !next.overControls && intent.activeID !== next.strip) {
      apply(intent.entered(next.strip, clock()));
    }
    apply(intent.sample(next, clock()));
    schedule();
  }

  function flush() {
    clearDeadline();
    apply(intent.sample(lastSample, clock()));
    schedule();
  }

  function cancel({ blockUntilLeave = false } = {}) {
    const id = intent.activeID;
    // An Escape-driven cancel must not let a pointer that never left the strip
    // restart the intent clock; block that window until it leaves once.
    if (blockUntilLeave && id && lastSample.strip === id) intent.block(id);
    clearDeadline();
    apply(intent.cancel());
  }

  function forget(id) {
    const effects = intent.forget(id);
    apply(effects);
    if (activeWindowID === id) close(id);
  }

  function commit(win) {
    if (!win) return false;
    clearDeadline();
    if (typeof commitPeek === "function") return commitPeek(win);
    return false;
  }

  // Right-click on an open glance hands off to the arrange menu: the intent
  // keeps the preview for the 1200ms handoff window. The last sample is cleared
  // so the handoff clock, not a stale strip hit, decides when to close.
  function menuHandoff(time = clock()) {
    if (!intent.activeID) return [];
    intent.menuSelected(intent.activeID, time);
    lastSample = Object.freeze({ strip: null, overGlance: false, overControls: false });
    schedule();
    return [];
  }

  globalThis.AISystem6WindowPeek = Object.freeze({
    GlanceIntent,
    capability,
    canPreview,
    move,
    sample,
    flush,
    cancel,
    forget,
    commit,
    menuHandoff,
    isPreviewing: (win) => (typeof isWindowPeeking === "function" ? isWindowPeeking(win) : false),
    activeID: () => intent.activeID,
    previewKind: () => activeKind,
    nextDeadline: () => intent.nextDeadline(),
    hasPendingDeadline: () => deadline !== 0,
  });
  window.AISystem6WindowPeekLoaded = true;
})();
