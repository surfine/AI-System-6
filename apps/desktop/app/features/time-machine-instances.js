// Time Machine's second window (§3.1, shape (V)): a READ-ONLY snapshot of the
// tab that is open on the desk.
//
// The ruling gives Time Machine a second window in Reader's shape rather than a
// second live browser: two windows are two views of ONE history — no second
// browsing session, no second request stack, no second write path. This module
// builds that view:
//
// 1. WHAT THE SECOND VIEW IS FOR. The main window is a browser: navigating it
//    replaces the page you were reading, and every control above the page area
//    is wired to that one session. The second view is the reading pane you can
//    leave open — the archived page's text, its address and date, and the tab's
//    trail of visits — so a writer can keep reading (and quoting) the page they
//    found while the main window browses on. It is a view of the same history,
//    NOT a second Time Machine.
// 2. It renders through the kind's own view entry (AISystem6TimeMachineView in
//    time-machine.js, which owns the reading text, the archive labels and the
//    measure). It reads; it never writes, and it registers no command.
// 3. It carries no write surface at all: no [data-action] buttons, no
//    [data-requires-write], no input, no textarea, no form. The desk-wide
//    action delegate and the write-lease freeze both key off those. The single
//    interactive affordance is the title bar's own Close / Zoom / WindowShade,
//    which window-manager wires with the instance id (close closes THIS view).
// 4. It builds fresh markup rather than cloning the main window: a clone would
//    duplicate the main instance's element ids (time-machine-frame,
//    time-machine-reader, …) and its data-action controls, and getElementById
//    would keep answering with the main instance's elements.
// 5. The view is a snapshot: it reads the tab once, when the window opens, and
//    never re-reads it. The main window keeps being the one that follows the
//    browser.
//
// Lazily loaded by the identity layer (window-instances.js), which derives this
// module's global and its load flag from the kind, then hands the element to
// openWindow(kind, { instance }) — so placement, focus, chrome and the session
// record are the same path the main instance takes.
//
// Contract: tests/features/multi-instance-view-kinds.test.mjs

(() => {
  if (window.AISystem6TimeMachineInstancesLoaded) return;
  window.AISystem6TimeMachineInstancesLoaded = true;

  // build(kind, instanceId) -> the window element, hidden and unwired. The
  // identity layer stamps data-window-instance; openWindow then reveals it.
  async function build(kind, instanceId) {
    const shell = window.AISystem6ApplicationShell?.createWindow;
    if (typeof shell !== "function") return null;
    // The page's own anatomy lives with the kind, and time-machine.js is lazy:
    // load it before asking it to render, or the module that owns the reading
    // text and the archive labels is not there yet.
    if (typeof ensureTimeMachineModule === "function") await ensureTimeMachineModule();
    const win = shell({
      windowName: kind,
      // The identity, so createWindow's dedupe answers THIS instance and not
      // the main Time Machine already on the desk.
      instance: instanceId,
      windowClass: "time-machine-window",
      labelledBy: `timeMachine-${instanceId}-title`,
      title: typeof t === "function" ? t("time_machine_read_only_view") : "Time Machine — read-only view",
      paneClass: "time-machine-pane",
    });
    if (!win) return null;
    const pane = win.querySelector(".time-machine-pane");
    if (!pane) return null;
    // The main window's own document-pane / stage chain, minus its chrome: the
    // reading view keeps its framed stage, its scroll and its measure, and
    // nothing above it that could act.
    const documentPane = document.createElement("div");
    documentPane.className = "time-machine-document-pane";
    const stage = document.createElement("div");
    stage.className = "time-machine-stage";
    documentPane.append(stage);
    pane.append(documentPane);
    const view = window.AISystem6TimeMachineView;
    if (typeof view?.render !== "function") {
      // No page renderer: the home sentence, never a second birthplace for the
      // reading view. This is the "the module did not arrive" case, and it
      // stays visible instead of hiding as a blank window.
      const note = document.createElement("p");
      note.className = "empty-folder-note empty-next-note";
      note.textContent = typeof t === "function" ? t("time_machine_home_body") : "";
      stage.append(note);
      return win;
    }
    view.render(stage);
    return win;
  }

  window.AISystem6TimeMachineInstances = Object.freeze({ build });
})();
