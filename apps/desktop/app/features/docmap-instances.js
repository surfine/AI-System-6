// DocMap's second window (§3.1, shape (V)): a READ-ONLY view of the same map.
//
// The ruling (§3.1, 2026-10-14) gives DocMap a second window in Reader's shape
// rather than a second live instance: two windows are two views of ONE map — no
// second map owner, no second write path. This module builds that view:
//
// 1. It renders from the map that is on the desk (currentDocMap) through the
//    kind's own view entry (AISystem6DocMapView in docmap.js, which owns the
//    transform and the Markmap the main window already draws). It reads; it
//    never writes, and it registers no command.
// 2. It carries no write surface at all: no [data-action] buttons, no
//    [data-requires-write], no input, no textarea, no form. The desk-wide
//    action delegate and the write-lease freeze both key off those, so a view
//    without them cannot move a tab, cannot clip, cannot take the pen. The
//    single interactive affordance is the title bar's own Close / Zoom /
//    WindowShade, which window-manager wires with the instance id (close closes
//    THIS view).
// 3. It builds fresh markup rather than cloning the main window: the clone
//    would duplicate the main instance's element ids (docmap-tree,
//    docmap-count, …) and its data-action controls, and getElementById would
//    keep answering with the main instance's elements. Classes, not ids, are
//    what 23-docmap.css keys off, so a fresh view wears the same cloth.
// 4. The view is a snapshot: it reads the map once, when the window opens, and
//    never re-reads it. The main window keeps being the one that follows edits.
//
// Lazily loaded by the identity layer (window-instances.js), which derives this
// module's global and its load flag from the kind, then hands the element to
// openWindow(kind, { instance }) — so placement, focus, chrome and the session
// record are the same path the main instance takes.
//
// Contract: tests/features/multi-instance-view-kinds.test.mjs

(() => {
  if (window.AISystem6DocMapInstancesLoaded) return;
  window.AISystem6DocMapInstancesLoaded = true;

  // build(kind, instanceId) -> the window element, hidden and unwired. The
  // identity layer stamps data-window-instance; openWindow then reveals it.
  async function build(kind, instanceId) {
    const shell = window.AISystem6ApplicationShell?.createWindow;
    if (typeof shell !== "function") return null;
    // The map's view lives with the map's kind, and docmap.js is lazy: load it
    // before asking it to render, or the module that owns the transform is not
    // there yet. openWindow() would have loaded it anyway, one step too late.
    if (typeof ensureDocMapModule === "function") await ensureDocMapModule();
    const win = shell({
      windowName: kind,
      // The identity, so createWindow's dedupe answers THIS instance and not
      // the main DocMap already on the desk.
      instance: instanceId,
      windowClass: "docmap-window",
      labelledBy: `docmap-${instanceId}-title`,
      title: typeof t === "function" ? t("docmap_read_only_view") : "DocMap — read-only view",
      paneClass: "docmap-pane",
    });
    if (!win) return null;
    const pane = win.querySelector(".docmap-pane");
    if (!pane) return null;
    const view = window.AISystem6DocMapView;
    if (typeof view?.render !== "function") {
      // No map renderer: an empty note, never a second birthplace for the
      // graph. This is the "the module did not arrive" case, and it stays
      // visible instead of hiding as a blank window.
      const note = document.createElement("p");
      note.className = "empty-folder-note docmap-empty-note";
      note.textContent = typeof t === "function" ? t("docmap_empty") : "";
      pane.append(note);
      return win;
    }
    // The frame — or the idle note — is in the pane by the time this returns.
    // The DRAWING is not awaited: markmap arrives as a lazy vendor script, and
    // the open path must not wait on a visual engine, exactly as the main
    // window's render does not. A failure keeps the frame and says so in the
    // console rather than taking the window down.
    Promise.resolve(view.render(pane)).catch((error) => console.warn("DocMap view failed to draw", error));
    return win;
  }

  window.AISystem6DocMapInstances = Object.freeze({ build });
})();
