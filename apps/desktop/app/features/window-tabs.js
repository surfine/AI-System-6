// Window tabs (P3, WINDOW-TABS-SPEC P0): Sierra's window-tab verbs, wired to the
// tab strip the desk already draws.
//
// The spec's §3 is the shape of this file. macOS tabs group an application's
// document windows; this desk keeps one managed window per kind and draws its
// "documents" as a tab strip INSIDE it (renderTdiTabStrip, project-disk.js).
// So of the four macOS commands, two families map onto what exists — walking the
// strip, and showing or hiding it — and the other two needed a second window to
// exist before they could mean anything. It does now: Merge All Windows and Move
// Tab to New Window live here too, over the tab store's window dimension
// (project-disk.js, §4.1).
//
// What they mean on this desk:
//   Move Tab to New Window — the key window's active tab opens in a new second
//   window of the same kind and belongs to it from then on. One tab per new
//   window: a shape (V) second window shows one document, so the set of tabs a
//   window can hold is the shape (I) question, not this one.
//   Merge All Windows — every tab a second instance of the key window's kind
//   holds comes back to the main instance and those windows close. Explicit on
//   purpose: closing a second window drops its tab set (§4.2's ruling), and the
//   desk does not quietly undo that on its own.
//
// The three walking/visibility verbs reuse the existing landing: a step "clicks"
// the neighbouring tab button, so whichever window owns the strip runs its own
// onOpen (which is what calls setActiveDocumentTab and re-renders) — no second
// way to change tabs. Hiding is a marker on the strip element (`hidden`) and
// nothing else: no new storage, no new component, no new z layer (§4).
//
// Availability is decided eagerly (windowshade-entry.js) so the rows can grey
// with a reason without loading this module; by the time a handler runs, the
// strip is known to exist.

(() => {
  if (window.AISystem6WinTabs) return;
  window.AISystem6WinTabs = true;

  // The strip of the key window: tabs live inside the window that draws them,
  // never beside it.
  function keyTabStrip() {
    return document.querySelector(".window.is-active[data-window] .tdi-tabs");
  }

  function tabButtons(strip) {
    return [...strip.querySelectorAll(".tdi-tab")];
  }

  // Previous / next with wrap at both ends — the strip is a ring, which is
  // macOS's own rule (Show Next Tab at the last tab returns to the first).
  function step(delta) {
    const strip = keyTabStrip();
    if (!strip) return false;
    const tabs = tabButtons(strip);
    if (tabs.length < 2) return false;
    const at = tabs.findIndex((button) => button.classList.contains("is-active"));
    tabs[(at + delta + tabs.length) % tabs.length].click();
    return true;
  }

  // Show / hide the bar. The marker is the element's own `hidden` attribute:
  // the renderer only ever rewrites the strip's children and its count
  // classes, so the writer's choice survives a re-render until they change it.
  function toggleTabBar() {
    const strip = keyTabStrip();
    if (!strip) return false;
    if (strip.hasAttribute("hidden")) { strip.removeAttribute("hidden"); return true; }
    strip.setAttribute("hidden", "");
    return false;
  }

  // The predicate ⌘W reads (WINDOW-TABS-SPEC §7B): the key window has a tab
  // strip that is shown (not hidden by toggle-tab-bar) and carries at least
  // one tab. Unknown kind or hidden bar → false, and ⌘W stays "close window".
  function tabBarShown() {
    const strip = keyTabStrip();
    return !!strip && !strip.hasAttribute("hidden") && tabButtons(strip).length > 0;
  }

  // The kind of the window the desk has key: a name is a kind (§2.1).
  function keyWindowKind() {
    return document.querySelector(".window.is-active[data-window]")?.dataset?.window || "";
  }

  // The kind's own rail renderer, by the name its module uses. Nothing on the
  // desk renders every rail, and this command changed one kind's storage, so it
  // asks that kind. A lazy kind's renderer exists because its window is open.
  const RAIL_RENDERERS = {
    docMap: "renderDocMapTabs",
    reader: "renderReaderTabs",
    teachText: "renderTeachTextTabs",
    timeMachine: "renderTimeMachineTabs",
  };

  function renderRailFor(kind) {
    const name = RAIL_RENDERERS[kind];
    if (name && typeof window[name] === "function") window[name]();
  }

  // Move a tab into a window of its own (§4.2). The command moves the key
  // window's active tab; the rail's drag-out gesture names the tab it was given
  // and the rail it came from, because a drag can start in a window that is not
  // the key one. The tab changes hands first and the rail is redrawn after: the
  // new window's own build reads the document, not the tab, so nothing about
  // the order is load bearing — what matters is that the tab never belongs to
  // two windows at once.
  //
  // The window is what is read, never its drawn rail: the rail is a view of the
  // store, and a verb that refused to work until a view had been painted would
  // be answering the wrong question.
  async function moveTabToNewWindow(tabId = "", context = {}) {
    const win = context?.rail?.closest?.(".window")
      || document.querySelector(".window.is-active[data-window]");
    const kind = win?.dataset?.window || "";
    if (!kind) return false;
    const project = getActiveProject();
    const from = win.dataset.windowInstance || documentTabMainInstance;
    const tab = tabId
      ? getWindowDocumentTabs(kind, project, from).find((item) => item.id === tabId) || null
      : getActiveDocumentTab(kind, project, from);
    if (!tab) return false;
    // The identity layer builds second windows and may not have been needed yet
    // on this desk — the first thing that would have loaded it is opening one.
    // Without this the verb is dead exactly when it is the user's first move.
    if (typeof ensureLazySystemModule === "function") {
      await ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst");
    }
    const view = await window.AISystem6WindowInstances?.open?.(kind);
    const instance = view?.dataset?.windowInstance;
    if (!instance) return false;
    assignDocumentTabWindow(kind, tab.id, instance, project);
    setActiveDocumentTab(kind, tab.id, project, instance);
    renderRailFor(kind);
    await saveDeskState();
    return true;
  }

  // Bring a second window's tabs back and close it (§4.2). Each tab returns to
  // the main instance before its window closes, so the close's own "the set goes
  // with the window" rule has nothing left to drop.
  async function mergeAllWindows() {
    const kind = keyWindowKind();
    if (!kind) return false;
    const windows = [...document.querySelectorAll(`.window[data-window="${kind}"][data-window-instance]`)];
    if (!windows.length) return false;
    const project = getActiveProject();
    let moved = 0;
    for (const win of windows) {
      const instance = win.dataset.windowInstance;
      getWindowDocumentTabs(kind, project, instance)
        .forEach((tab) => { if (assignDocumentTabWindow(kind, tab.id, documentTabMainInstance, project)) moved += 1; });
      await closeWindow(kind, false, instance);
    }
    renderRailFor(kind);
    if (moved) await saveDeskState();
    return moved > 0;
  }

  window.AISystem6WindowTabs = Object.freeze({
    step,
    tabBarShown,
    stepPrevious: () => step(-1),
    stepNext: () => step(1),
    toggleTabBar,
    keyTabStrip,
    tabButtons,
    moveTabToNewWindow,
    mergeAllWindows,
  });
})();
