// Time Machine's live engines: real pages with their own scripts running.
//
// Time Machine used to show only a snapshot: the server fetched one HTML
// document, removed every script and drew what was left. That is still the
// fallback. When the deployment offers more, a page is opened in one of two
// live engines, and the window itself does not change:
//
//   native  The Mac app on macOS 26 and later draws the page with the
//           system's own WebKit (WebPage + WebView), positioned over this
//           window's page area. See platform/macos/shell/…/TimeMachineBrowser.swift.
//   web     Everywhere else with a browse origin (the public site, Pages, a
//           Mac opened in a browser): the page runs in an iframe on a
//           separate origin, served through the relay by a service worker.
//           See apps/browse/ and apps/server/server/browse/.
//
// Both engines answer the same small set of calls, so time-machine.js does
// not care which one is drawing. The page they show is always data: its
// title, address and text are displayed and clipped, never obeyed.

const TimeMachineEngines = (() => {
  "use strict";

  /** @type {null | { kind: "native" | "web" | "snapshot", origin?: string, reason?: string }} */
  let detected = null;
  /** @type {Promise<any> | null} */
  let detecting = null;
  const hooks = {
    onState: (_tabId, _state) => {},
    onLoadFailed: (_tabId, _detail) => {},
    onOpen: (_url) => {},
    onKey: (_key, _shift) => {},
    onFocus: () => {},
    onSelection: (_tabId, _selection) => {},
    onUnavailable: (_tabId, _reason) => {},
  };
  const ADBLOCK_KEY = "aiSystem6.timeMachine.blockAds";

  function adblockEnabled() {
    try {
      return localStorage.getItem(ADBLOCK_KEY) !== "0";
    } catch {
      return true;
    }
  }

  // --- Detection ------------------------------------------------------------

  async function detect() {
    if (detected) return detected;
    detecting ||= (async () => {
      if (window.AISystem6Native?.browser && window.webkit?.messageHandlers?.aisystem6Browser) {
        detected = { kind: "native" };
        return detected;
      }
      let capabilities = null;
      try {
        capabilities = await window.AISystem6PublicAccess?.getCapabilities?.();
      } catch {
        capabilities = null;
      }
      const browse = capabilities?.browse;
      if (browse?.available && browse.origin && "serviceWorker" in navigator) {
        try {
          const origin = new URL(browse.origin).origin;
          if (origin !== location.origin) {
            detected = { kind: "web", origin };
            return detected;
          }
        } catch {}
      }
      detected = { kind: "snapshot", reason: browse?.reason || "no-browse-origin" };
      return detected;
    })();
    return detecting;
  }

  function kind() {
    return detected?.kind || "snapshot";
  }

  /** Falls back to the snapshot for the rest of this visit, with a reason. */
  function demote(reason) {
    detected = { kind: "snapshot", reason: reason || "engine-unavailable" };
  }

  // --- Web engine ------------------------------------------------------------

  const frames = new Map();
  let token = "";
  let tokenSid = "";
  let tokenExpiresAt = 0;
  let tokenTimer = 0;
  let requestSeq = 0;
  const pending = new Map();
  // Frames the window does not show (Reader's rendered rung) report here
  // instead of to Time Machine.
  const privateStateListeners = new Map();
  const MAX_LIVE_FRAMES = 6;

  async function browseToken(force = false) {
    if (!force && token && Date.now() < tokenExpiresAt - 5 * 60 * 1000) return token;
    const response = await window.AISystem6Capabilities.requestService("browse.token", { sid: tokenSid });
    if (!response.ok) {
      const error = new Error(t("time_machine_engine_unavailable"));
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    token = String(payload.token || "");
    tokenSid = String(payload.sid || "");
    tokenExpiresAt = Number(payload.expiresAt) || Date.now() + 25 * 60 * 1000;
    scheduleTokenRefresh();
    return token;
  }

  function scheduleTokenRefresh() {
    window.clearTimeout(tokenTimer);
    if (!frames.size) return;
    const delay = Math.max(30 * 1000, tokenExpiresAt - Date.now() - 8 * 60 * 1000);
    tokenTimer = window.setTimeout(async () => {
      try {
        await browseToken(true);
        for (const entry of frames.values()) postToFrame(entry, { type: "token", token });
      } catch {}
    }, delay);
  }

  function stage() {
    return document.getElementById("time-machine-stage");
  }

  function frameEntry(tabId, create, offscreen = false) {
    let entry = frames.get(tabId);
    if (entry || !create) return entry || null;
    const iframe = document.createElement("iframe");
    iframe.className = "time-machine-live-frame is-hidden";
    iframe.title = t("time_machine_live_frame_title");
    // allow-same-origin here is the browse origin's own, never this desk's:
    // the frame's address is always on a different origin (checked below),
    // and the service worker it needs exists only with it.
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock");
    iframe.setAttribute("allow", "fullscreen; clipboard-write; autoplay; encrypted-media; picture-in-picture");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    if (offscreen) {
      // Drawn at a desktop size but off screen, not display:none: pages that
      // load their text as it scrolls into view need a real viewport.
      iframe.className = "time-machine-live-frame";
      iframe.setAttribute("aria-hidden", "true");
      iframe.tabIndex = -1;
      iframe.style.cssText = "position:fixed;left:-20000px;top:0;width:1280px;height:900px;pointer-events:none;";
      document.body.append(iframe);
    } else {
      stage()?.append(iframe);
    }
    entry = { tabId, iframe, state: null, selection: null, usedAt: Date.now() };
    frames.set(tabId, entry);
    // A window full of tabs keeps at most a handful of live pages; the
    // oldest hidden one is closed and reopens from its address when chosen.
    if (frames.size > MAX_LIVE_FRAMES) {
      const oldest = [...frames.values()]
        .filter((candidate) => candidate.tabId !== tabId)
        .sort((left, right) => left.usedAt - right.usedAt)[0];
      if (oldest) close(oldest.tabId);
    }
    return entry;
  }

  function postToFrame(entry, message) {
    if (!entry?.iframe?.contentWindow || !detected?.origin) return;
    entry.iframe.contentWindow.postMessage({ ais6: 1, ...message }, detected.origin);
  }

  function request(tabId, type, timeoutMs = 8000) {
    const entry = frames.get(tabId);
    if (!entry) return Promise.reject(new Error(t("time_machine_reader_unavailable")));
    const id = `r${(requestSeq += 1)}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error(t("time_machine_engine_no_answer")));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer, tabId });
      postToFrame(entry, { type, id });
    });
  }

  const eventTimes = new Map();
  function allowEvent(kind, count, windowMs) {
    const now = Date.now();
    const recent = (eventTimes.get(kind) || []).filter((time) => now - time < windowMs);
    if (recent.length >= count) return false;
    recent.push(now);
    eventTimes.set(kind, recent);
    return true;
  }

  function onWebMessage(event) {
    if (!detected?.origin || event.origin !== detected.origin) return;
    const data = event.data;
    if (!data || data.ais6 !== 1 || typeof data.type !== "string") return;
    const tabId = String(data.tab || "");
    const entry = frames.get(tabId);
    // Answers and state come from the tab's own frame; requests a page makes
    // (open a link in a new tab, a token) may come from a frame inside it,
    // which the desk cannot see across origins, so they are matched by tab
    // and limited to what a page could ask of the window anyway.
    const fromTabFrame = !!entry && event.source === entry.iframe.contentWindow;
    if (data.reply && fromTabFrame && pending.has(data.reply)) {
      const waiter = pending.get(data.reply);
      pending.delete(data.reply);
      window.clearTimeout(waiter.timer);
      waiter.resolve(data);
      return;
    }
    switch (data.type) {
      case "state":
        if (!fromTabFrame) return;
        entry.state = {
          url: String(data.url || "").slice(0, 4096),
          title: String(data.title || "").slice(0, 400),
          loading: !!data.loading,
          canGoBack: !!data.canGoBack,
          canGoForward: !!data.canGoForward,
        };
        if (privateStateListeners.has(tabId)) privateStateListeners.get(tabId)(entry.state);
        else hooks.onState(tabId, entry.state);
        break;
      case "selection":
        if (!fromTabFrame) return;
        entry.selection = {
          text: String(data.text || "").slice(0, 20000),
          before: String(data.before || "").slice(0, 400),
          after: String(data.after || "").slice(0, 400),
        };
        hooks.onSelection(tabId, entry.selection);
        break;
      case "load-failed":
        if (!fromTabFrame) return;
        hooks.onLoadFailed(tabId, { url: String(data.url || ""), code: String(data.code || ""), message: String(data.message || "").slice(0, 400) });
        break;
      case "open":
        if (!entry) return;
        // A page can ask for a new tab, not for a dozen: real popups need a
        // click, and the desk cannot see the click across origins.
        if (!allowEvent("open", 2, 5000)) return;
        if (/^https?:\/\//i.test(String(data.url || ""))) hooks.onOpen(String(data.url));
        break;
      case "external":
        // mailto:, tel: and the like belong to the writer's own apps.
        break;
      case "need-token":
        if (!allowEvent("need-token", 1, 20000)) return;
        browseToken(true).then(() => {
          for (const candidate of frames.values()) postToFrame(candidate, { type: "token", token });
        }).catch(() => {});
        break;
      case "key":
        if (fromTabFrame) hooks.onKey(String(data.key || ""), !!data.shift);
        break;
      case "focus":
        if (entry) hooks.onFocus();
        break;
      case "engine-unavailable": {
        // The bootstrap page could not install the service worker (a private
        // window, a browser without workers). Its frame has no tab id yet,
        // so it is found by its window.
        const owner = [...frames.values()].find((candidate) => candidate.iframe.contentWindow === event.source);
        demote(String(data.reason || "engine-unavailable"));
        if (owner) hooks.onUnavailable(owner.tabId, String(data.reason || ""));
        break;
      }
      default:
        break;
    }
  }
  window.addEventListener("message", onWebMessage);

  async function openWeb(tabId, url, options = {}) {
    const entry = frameEntry(tabId, true, !!options.offscreen);
    entry.usedAt = Date.now();
    entry.state = { url, title: "", loading: true, canGoBack: false, canGoForward: false };
    entry.selection = null;
    const key = await browseToken();
    const address = new URL("/__ais6/go", detected.origin);
    if (address.origin === location.origin) throw new Error(t("time_machine_engine_unavailable"));
    address.searchParams.set("u", url);
    address.searchParams.set("k", key);
    address.searchParams.set("tab", tabId);
    address.searchParams.set("d", location.origin);
    entry.iframe.src = address.href;
    if (!adblockEnabled()) {
      entry.iframe.addEventListener("load", () => postToFrame(entry, { type: "adblock", enabled: false }), { once: true });
    }
    return entry;
  }

  // --- Native engine (Mac app, macOS 26+) ------------------------------------

  let nativeSeq = 0;
  const nativeState = new Map();
  const lastNativeSelection = new Map();

  async function native(method, payload = {}) {
    const handler = window.webkit?.messageHandlers?.aisystem6Browser;
    if (!handler) throw new Error(t("time_machine_engine_unavailable"));
    return handler.postMessage({ method, ...payload, seq: (nativeSeq += 1) });
  }

  // The shell calls this with events from its WebKit pages.
  function receiveNative(event) {
    if (!event || typeof event !== "object") return;
    const tabId = String(event.tab || "");
    switch (event.type) {
      case "state": {
        const state = {
          url: String(event.url || "").slice(0, 4096),
          title: String(event.title || "").slice(0, 400),
          loading: !!event.loading,
          canGoBack: !!event.canGoBack,
          canGoForward: !!event.canGoForward,
        };
        nativeState.set(tabId, state);
        hooks.onState(tabId, state);
        break;
      }
      case "selection": {
        const value = {
          text: String(event.text || "").slice(0, 20000),
          before: String(event.before || "").slice(0, 400),
          after: String(event.after || "").slice(0, 400),
        };
        lastNativeSelection.set(tabId, value);
        hooks.onSelection(tabId, value);
        break;
      }
      case "load-failed":
        hooks.onLoadFailed(tabId, { url: String(event.url || ""), code: String(event.code || ""), message: String(event.message || "").slice(0, 400) });
        break;
      case "open":
        if (/^https?:\/\//i.test(String(event.url || ""))) hooks.onOpen(String(event.url));
        break;
      case "key":
        hooks.onKey(String(event.key || ""), !!event.shift);
        break;
      case "focus":
        hooks.onFocus();
        break;
      default:
        break;
    }
  }

  // --- Layout for the native view -------------------------------------------

  let layoutFrame = 0;
  let activeTab = "";

  function nativeLayout() {
    window.cancelAnimationFrame(layoutFrame);
    layoutFrame = window.requestAnimationFrame(() => {
      if (kind() !== "native") return;
      const host = stage();
      const win = host?.closest(".window");
      const visible = !!(activeTab && host && win && !win.classList.contains("is-hidden") && !win.classList.contains("is-shaded")
        && host.getClientRects().length && !host.closest(".is-hidden"));
      const rect = host ? host.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
      native("layout", {
        tab: activeTab,
        visible,
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        occluders: visible ? occludersAbove(win, rect) : [],
        moving: !!win?.classList.contains("is-dragging") || document.body.classList.contains("is-dragging-window"),
      }).catch(() => {});
    });
  }

  /** Everything drawn over the page area: windows above, menus, balloons. */
  function occludersAbove(win, rect) {
    const out = [];
    const ownZ = Number.parseInt(getComputedStyle(win).zIndex, 10) || 0;
    const candidates = document.querySelectorAll(".window, .menu-popover, .menu-dropdown, .balloon, .alert-overlay, .modal-overlay, [role='menu'], [role='dialog'], .system-select-popover");
    for (const element of candidates) {
      if (element === win || win.contains(element) && !element.matches("[role='menu'], .menu-popover, .system-select-popover")) continue;
      if (element.classList.contains("is-hidden") || element.hidden) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      if (element.classList.contains("window")) {
        const z = Number.parseInt(style.zIndex, 10) || 0;
        if (z <= ownZ) continue;
      }
      const box = element.getBoundingClientRect();
      if (box.right <= rect.left || box.left >= rect.right || box.bottom <= rect.top || box.top >= rect.bottom) continue;
      out.push({ x: box.left, y: box.top, width: box.width, height: box.height });
      if (out.length >= 40) break;
    }
    return out;
  }

  let layoutObserver = null;
  function watchNativeLayout() {
    if (layoutObserver) return;
    layoutObserver = new MutationObserver(nativeLayout);
    layoutObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "style", "hidden"], subtree: true, childList: true });
    window.addEventListener("resize", nativeLayout);
    const host = stage();
    if (host && "ResizeObserver" in window) new ResizeObserver(nativeLayout).observe(host);
  }

  // --- The common surface ----------------------------------------------------

  async function open(tabId, url) {
    const engine = await detect();
    if (engine.kind === "native") {
      watchNativeLayout();
      activeTab = tabId;
      await native("open", { tab: tabId, url, blockAds: adblockEnabled() });
      nativeLayout();
      return true;
    }
    if (engine.kind === "web") {
      await openWeb(tabId, url);
      show(tabId);
      return true;
    }
    return false;
  }

  function has(tabId) {
    if (kind() === "native") return nativeState.has(tabId);
    return frames.has(tabId);
  }

  function state(tabId) {
    if (kind() === "native") return nativeState.get(tabId) || null;
    return frames.get(tabId)?.state || null;
  }

  function show(tabId) {
    activeTab = tabId || "";
    if (kind() === "native") {
      nativeLayout();
      return;
    }
    for (const entry of frames.values()) {
      const visible = entry.tabId === tabId;
      entry.iframe.classList.toggle("is-hidden", !visible);
      if (visible) entry.usedAt = Date.now();
    }
  }

  function hide() {
    activeTab = "";
    if (kind() === "native") {
      nativeLayout();
      return;
    }
    for (const entry of frames.values()) entry.iframe.classList.add("is-hidden");
  }

  function close(tabId) {
    if (kind() === "native") {
      nativeState.delete(tabId);
      native("close", { tab: tabId }).catch(() => {});
      if (activeTab === tabId) activeTab = "";
      nativeLayout();
      return;
    }
    const entry = frames.get(tabId);
    if (!entry) return;
    entry.iframe.remove();
    frames.delete(tabId);
    if (!frames.size) window.clearTimeout(tokenTimer);
  }

  function command(tabId, type) {
    if (kind() === "native") {
      native("history", { tab: tabId, action: type }).catch(() => {});
      return;
    }
    const entry = frames.get(tabId);
    if (entry) postToFrame(entry, { type });
  }

  async function readDocument(tabId) {
    if (kind() === "native") return native("readDOM", { tab: tabId });
    return request(tabId, "read-dom", 10000);
  }

  function selection(tabId) {
    if (kind() === "native") return lastNativeSelection.get(tabId) || null;
    return frames.get(tabId)?.selection || null;
  }

  function setAdblock(enabled) {
    try {
      localStorage.setItem(ADBLOCK_KEY, enabled ? "1" : "0");
    } catch {}
    if (kind() === "native") {
      native("setBlocking", { enabled: !!enabled }).catch(() => {});
      return;
    }
    for (const entry of frames.values()) postToFrame(entry, { type: "adblock", enabled: !!enabled });
  }

  async function clearData() {
    const engine = await detect();
    if (engine.kind === "native") return native("clearData", {});
    if (engine.kind !== "web") return false;
    // The clearing runs on the browse origin itself, in a page the worker
    // controls; the desk cannot reach that origin's storage directly.
    await browseToken();
    const iframe = document.createElement("iframe");
    iframe.className = "time-machine-live-frame is-hidden";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    iframe.title = t("time_machine_live_frame_title");
    const done = new Promise((resolve) => {
      const listener = (event) => {
        if (event.origin !== detected.origin || event.source !== iframe.contentWindow) return;
        if (event.data?.ais6 !== 1 || event.data.type !== "cleared") return;
        window.removeEventListener("message", listener);
        resolve(true);
      };
      window.addEventListener("message", listener);
      window.setTimeout(() => {
        window.removeEventListener("message", listener);
        resolve(false);
      }, 8000);
    });
    iframe.src = new URL(`/__ais6/clear.html?d=${encodeURIComponent(location.origin)}`, detected.origin).href;
    document.body.append(iframe);
    const result = await done;
    iframe.remove();
    for (const tabId of [...frames.keys()]) close(tabId);
    return result;
  }

  /**
   * Reader's rendered rung: the page drawn with its scripts, off screen, read
   * once and closed. Nothing about it is shown or kept.
   */
  let readerSeq = 0;
  async function renderForReader(url) {
    const engine = await detect();
    if (engine.kind === "native") return native("renderForReader", { url });
    if (engine.kind !== "web") return null;
    const tabId = `reader-render-${(readerSeq += 1)}`;
    try {
      const loaded = new Promise((resolve) => {
        const timer = window.setTimeout(() => resolve(false), 25000);
        privateStateListeners.set(tabId, (state) => {
          if (state.loading) return;
          window.clearTimeout(timer);
          resolve(true);
        });
      });
      await openWeb(tabId, url, { offscreen: true });
      await loaded;
      // Text a page fetches after it loads usually lands within a second.
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      return await request(tabId, "read-dom", 10000);
    } catch {
      return null;
    } finally {
      privateStateListeners.delete(tabId);
      close(tabId);
    }
  }

  return {
    hooks,
    detect,
    renderForReader,
    kind,
    demote,
    open,
    has,
    state,
    show,
    hide,
    close,
    command,
    readDocument,
    selection,
    setAdblock,
    adblockEnabled,
    clearData,
    receiveNative,
    nativeLayout,
  };
})();

window.AISystem6TimeMachineEngines = TimeMachineEngines;
// The Mac shell delivers WebKit events here.
window.AISystem6TimeMachineNative = Object.freeze({
  receive: (event) => TimeMachineEngines.receiveNative(event),
});
