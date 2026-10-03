// Feature module: 明文 / Plaintext visual-novel host.
//
// The novel itself lives in assets/mingwen/ — a same-origin static page that
// carries its own scripts and pictures, about 21 MB, fetched only when the
// window opens. This thin host owns the AI System 6 window, the iframe
// lifetime, the application menus, and a desk-status receipt if the page
// fails to load. There is no window details bar: the novel is the interior.
// Debug tools live in the menu bar, not as a floating overlay by default.
window.AISystem6MingwenLoaded = true;

(function initMingwenFeature() {
  "use strict";

  function installMingwenWindow() {
    if (typeof document === "undefined") return;
    if (document.querySelector('[data-window="mingwen"]')) return;
    window.AISystem6ApplicationShell.createWindow({
      windowName: "mingwen",
      windowClass: "mingwen-window openttd-window",
      labelledBy: "mingwen-title",
      titleKey: "mingwen_title",
      title: t("mingwen_title"),
      paneClass: "mingwen-pane openttd-pane",
    });
  }

  installMingwenWindow();

  const MINGWEN_SHELL_PATH = "assets/mingwen/index.html";
  // A landscape novel reads best in a 16:9 box: 1024x576 is the starting size,
  // clamped into whatever desk is actually available so the window never opens
  // past the edges of a small display. The window stays resizable (its row in
  // app-admissions.js carries tile/grow), and the pane keeps this ratio.
  const MINGWEN_CONTENT_ASPECT = 16 / 9;
  const MINGWEN_PREFERRED_WIDTH = 1024;

  const mingwenState = {
    frame: null,
    statusKey: "",
    retryNonce: 0,
    readyTimer: 0,
    sized: false,
  };

  function mingwenWindow() {
    return document.querySelector('[data-window="mingwen"]');
  }

  function mingwenPane() {
    return mingwenWindow()?.querySelector(".mingwen-pane") || null;
  }

  function setMingwenStatus(key) {
    const next = key || "";
    const previous = mingwenState.statusKey;
    mingwenState.statusKey = next;
    if (typeof setStatus !== "function") return;
    // Loading and failure belong on the desk's status line. An empty details
    // bar under the title was a chrome strip with nothing to say.
    if (next) setStatus(t(next), { windowName: "mingwen" });
    else if (previous) setStatus("");
  }

  function mingwenFrameWindow() {
    return mingwenState.frame?.contentWindow || null;
  }

  function mingwenSnapshot() {
    try {
      return mingwenFrameWindow()?.MingwenDesk?.snapshot?.() || null;
    } catch {
      return null;
    }
  }

  function callMingwen(command, arg) {
    const frameWindow = mingwenFrameWindow();
    const desk = frameWindow?.MingwenDesk;
    if (desk && typeof desk.command === "function") return desk.command(command, arg);
    frameWindow?.postMessage({ type: "mingwen-command", command, arg }, location.origin);
    return false;
  }

  function mingwenReady() {
    return !!mingwenSnapshot()?.ready;
  }

  function clearTimer(name) {
    if (!mingwenState[name]) return;
    window.clearTimeout(mingwenState[name]);
    mingwenState[name] = 0;
  }

  function mingwenShellSrc() {
    const language = typeof currentLanguage === "string" && currentLanguage === "en" ? "en" : "zh";
    const separator = MINGWEN_SHELL_PATH.includes("?") ? "&" : "?";
    const src = `${MINGWEN_SHELL_PATH}${separator}lang=${language}&r=${mingwenState.retryNonce}`;
    return typeof lazyScriptUrl === "function" ? lazyScriptUrl(src) : src;
  }

  function removeMingwenFrame(frame = mingwenState.frame) {
    clearTimer("readyTimer");
    if (frame) frame.remove();
    if (mingwenState.frame === frame) mingwenState.frame = null;
  }

  // The load receipt belongs to exactly one frame: every handler closes over
  // its own element and stands down as soon as that element is not the current
  // one, so a replaced frame can never clear the status of its successor.
  function watchMingwenFrame(frame) {
    frame.addEventListener("load", () => {
      if (mingwenState.frame !== frame) return;
      clearTimer("readyTimer");
      setMingwenStatus("");
    });
  }

  function attachMingwen() {
    const pane = mingwenPane();
    if (!pane) return;
    if (mingwenState.frame && pane.contains(mingwenState.frame)) return;

    const frame = document.createElement("iframe");
    // Reuse the OpenTTD frame class so the pane styling fills the container.
    frame.className = "openttd-frame";
    frame.title = t("mingwen_title");
    frame.setAttribute("width", "100%");
    frame.setAttribute("height", "100%");
    frame.setAttribute("frameborder", "0");
    // Register the load listener before src is set: assigning src can start a
    // load immediately, and a listener added afterwards would miss it.
    watchMingwenFrame(frame);
    // Claim the slot before append: appending fires synchronously enough that a
    // very fast load could otherwise resolve against a still-empty state.
    pane.textContent = "";
    mingwenState.frame = frame;
    frame.src = mingwenShellSrc();
    pane.appendChild(frame);
    setMingwenStatus("mingwen_status_loading");
    clearTimer("readyTimer");
    // The page is a single same-origin document that loads on its own. If it
    // has not reported in by the deadline, say so instead of pretending it
    // worked.
    mingwenState.readyTimer = window.setTimeout(() => {
      if (mingwenState.frame !== frame) return;
      setMingwenStatus("mingwen_status_failed");
    }, 60000);
  }

  function handleMingwenQuit() {
    const frame = mingwenState.frame;
    if (!frame) return;
    removeMingwenFrame(frame);
    const pane = mingwenPane();
    if (pane) pane.textContent = "";
    setMingwenStatus("");
  }

  function refreshMingwenLanguage() {
    setMingwenStatus(mingwenState.statusKey);
    const frame = mingwenState.frame;
    if (frame) frame.title = t("mingwen_title");
  }

  window.AISystem6RegisterApplicationMenuSet?.("mingwen", [{
    id: "file",
    labelKey: "menu_file",
    items: [
      { type: "item", action: "mingwen-new", labelKey: "mingwen_menu_new", conditionId: "mingwen-new" },
      { type: "item", action: "mingwen-continue", labelKey: "mingwen_menu_continue", conditionId: "mingwen-continue" },
      { type: "item", action: "mingwen-load", labelKey: "mingwen_menu_load", conditionId: "mingwen-load" },
      { type: "item", action: "mingwen-save", labelKey: "mingwen_menu_save", conditionId: "mingwen-save" },
      { type: "separator" },
      {
        type: "item",
        action: "close-active-window",
        labelKey: "close",
        shortcutId: "close-window",
        conditionId: "close-active-window",
      },
    ],
  }, {
    id: "story",
    labelKey: "mingwen_menu_story",
    items: [
      { type: "item", action: "mingwen-chapters", labelKey: "mingwen_menu_chapters", conditionId: "mingwen-chapters" },
      { type: "item", action: "mingwen-archive", labelKey: "mingwen_menu_archive", conditionId: "mingwen-archive" },
      { type: "item", action: "mingwen-hidden", labelKey: "mingwen_menu_hidden", conditionId: "mingwen-hidden" },
      { type: "separator" },
      { type: "item", action: "mingwen-log", labelKey: "mingwen_menu_log", conditionId: "mingwen-log" },
      { type: "item", action: "mingwen-ledger", labelKey: "mingwen_menu_ledger", conditionId: "mingwen-ledger" },
      { type: "separator" },
      { type: "item", action: "mingwen-pause", labelKey: "mingwen_menu_pause", conditionId: "mingwen-pause" },
      { type: "item", action: "mingwen-title", labelKey: "mingwen_menu_title", conditionId: "mingwen-title" },
      { type: "separator" },
      { type: "item", action: "mingwen-settings", labelKey: "mingwen_menu_settings", conditionId: "mingwen-settings" },
      { type: "item", action: "mingwen-help", labelKey: "mingwen_menu_help", conditionId: "mingwen-help" },
    ],
  }, {
    id: "debug",
    labelKey: "mingwen_menu_debug",
    items: [
      { type: "item", action: "mingwen-debug-overlay", labelKey: "mingwen_menu_debug_overlay", conditionId: "mingwen-debug-overlay", dataset: { mingwenCheck: "overlay" } },
      {
        type: "submenu",
        labelKey: "mingwen_menu_jump",
        items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((no) => ({
          type: "item",
          action: `mingwen-jump-${no}`,
          labelKey: `mingwen_jump_${no}`,
          conditionId: `mingwen-jump-${no}`,
        })),
      },
      { type: "separator" },
      { type: "item", action: "mingwen-new-state", labelKey: "mingwen_menu_new_state", conditionId: "mingwen-new-state" },
      { type: "item", action: "mingwen-end-chapter", labelKey: "mingwen_menu_end_chapter", conditionId: "mingwen-end-chapter" },
      { type: "item", action: "mingwen-ending", labelKey: "mingwen_menu_ending", conditionId: "mingwen-ending" },
      { type: "item", action: "mingwen-skip-all", labelKey: "mingwen_menu_skip_all", conditionId: "mingwen-skip-all", dataset: { mingwenCheck: "skip-all" } },
    ],
  }]);

  const mingwenMenuHandlers = {
    "mingwen-new": () => callMingwen("start"),
    "mingwen-continue": () => callMingwen("continue"),
    "mingwen-load": () => callMingwen("load"),
    "mingwen-save": () => callMingwen("save"),
    "mingwen-chapters": () => callMingwen("chapters"),
    "mingwen-archive": () => callMingwen("archive"),
    "mingwen-log": () => callMingwen("log"),
    "mingwen-ledger": () => callMingwen("ledger"),
    "mingwen-hidden": () => callMingwen("hidden"),
    "mingwen-pause": () => callMingwen("pause"),
    "mingwen-title": () => callMingwen("title"),
    "mingwen-settings": () => callMingwen("settings"),
    "mingwen-help": () => callMingwen("help"),
    "mingwen-debug-overlay": () => callMingwen("overlay"),
    "mingwen-new-state": () => callMingwen("new-state"),
    "mingwen-end-chapter": () => callMingwen("end-chapter"),
    "mingwen-ending": () => callMingwen("ending"),
    "mingwen-skip-all": () => callMingwen("skip-all"),
  };
  for (let no = 1; no <= 11; no += 1) {
    mingwenMenuHandlers[`mingwen-jump-${no}`] = () => callMingwen("jump", no);
  }

  function mingwenCommandAvailable(action) {
    if (mingwenWindow()?.classList.contains("is-hidden")) return false;
    if (!mingwenReady()) return action === "close-active-window";
    const snap = mingwenSnapshot() || {};
    if (action === "mingwen-continue") return !!snap.hasSave;
    if (action === "mingwen-save" || action === "mingwen-pause" || action === "mingwen-end-chapter" || action === "mingwen-log" || action === "mingwen-ledger") return !!snap.inGame;
    if (action === "mingwen-hidden") return !!snap.hidden;
    if (action === "mingwen-title") return !!snap.inGame;
    return true;
  }

  Object.entries(mingwenMenuHandlers).forEach(([action, handler]) => {
    window.AISystem6Runtime?.registerCommand?.(action, {
      handler: () => {
        if (!mingwenState.frame) attachMingwen();
        handler();
      },
      isAvailable: () => mingwenCommandAvailable(action),
    });
  });

  window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("mingwen", {
    onDispose: () => {
      handleMingwenQuit();
    },
  });

  function mingwenMenuChecked(kind) {
    const snap = mingwenSnapshot() || {};
    if (kind === "overlay") return !!snap.overlay;
    if (kind === "skip-all") return !!snap.skipAll;
    return false;
  }

  window.AISystem6Mingwen = Object.freeze({
    attach: attachMingwen,
    handleQuit: handleMingwenQuit,
    refreshLanguage: refreshMingwenLanguage,
    isLoaded: () => !!mingwenState.frame,
    call: callMingwen,
    menuChecked: mingwenMenuChecked,
  });
  window.AISystem6Runtime?.registerApplication({
    id: "mingwen",
    windowName: "mingwen",
    mount: attachMingwen,
    restore: attachMingwen,
    commands: {
      "open-mingwen": { handler: () => openWindow("mingwen"), isAvailable: () => true },
    },
  });
})();
