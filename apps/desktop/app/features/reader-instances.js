// Reader's second window (P1): a READ-ONLY view of the same document.
//
// The ruling (§9C) is that Reader opens the first multi-instance kind because
// two Reader windows are two views of one document — no second document
// owner, no second write path. This module builds that view:
//
// 1. It renders from the CURRENT document snapshot (currentReaderPage) — the
//    same page the main instance shows. It reads; it never writes, and it
//    registers no command.
// 2. It carries no write surface at all: no [data-action] buttons, no
//    [data-requires-write], no input, no textarea, no form. The desk-wide
//    action delegate and the write-lease freeze both key off those, so a view
//    without them cannot clip, cannot save, cannot take the pen. The single
//    interactive affordance is the title bar's own Close / Zoom / WindowShade,
//    which window-manager wires with the instance id (close closes THIS view).
// 3. It builds fresh markup rather than cloning the main window: a clone would
//    duplicate the main instance's element ids (reader-url-input, reader-tabs,
//    …) and its data-action controls, and getElementById would keep answering
//    with the main instance's elements — the §2.7 problem this phase does not
//    solve. Classes, not ids, are what the reader stylesheet keys off, so a
//    fresh view wears the same cloth.
//
// Lazily loaded by the identity layer (window-instances.js), which hands the
// element to openWindow(kind, { instance }) afterwards — so placement, focus,
// chrome and the session record are the same path the main instance takes.

(() => {
  if (window.AISystem6ReaderInstancesLoaded) return;
  window.AISystem6ReaderInstancesLoaded = true;

  function readOnlyNote() {
    return typeof t === "function" ? t("reader_read_only_view") : "Read-only view";
  }

  function documentHeader(page) {
    const header = document.createElement("header");
    header.className = "reader-document-header";
    const title = document.createElement("h1");
    title.textContent = typeof readerDocumentTitle === "function" ? readerDocumentTitle(page) : (page.title || "");
    header.append(title);
    const meta = document.createElement("p");
    meta.className = "reader-meta";
    meta.textContent = readOnlyNote();
    header.append(meta);
    return header;
  }

  // The page's body. `readerBodyMarkdown` is the Reader's own rule for
  // dropping a duplicated title line, and `markdownToSystemHtml` is the shared
  // renderer — the view shows exactly what the main instance shows.
  function documentBody(page) {
    const body = document.createElement("div");
    body.className = "reader-body-content";
    const markdown = typeof readerBodyMarkdown === "function" ? readerBodyMarkdown(page) : String(page.text || "");
    body.innerHTML = markdownToSystemHtml(markdown);
    return body;
  }

  // build(kind, instanceId) -> the window element, hidden and unwired. The
  // identity layer stamps data-window-instance; openWindow then reveals it.
  function build(kind, instanceId) {
    const shell = window.AISystem6ApplicationShell?.createWindow;
    if (typeof shell !== "function") return null;
    const page = typeof currentReaderPage !== "undefined" ? currentReaderPage : null;
    const win = shell({
      windowName: kind,
      // The identity, so createWindow's dedupe answers THIS instance and not
      // the main Reader already on the desk (§5.4).
      instance: instanceId,
      windowClass: "reader-window",
      labelledBy: `reader-${instanceId}-title`,
      title: typeof t === "function" ? t("reader") : "Reader",
      paneClass: "reader-pane",
    });
    if (!win) return null;
    const pane = win.querySelector(".reader-pane");
    if (!pane) return null;
    pane.dataset.readerState = page ? "loaded" : "empty";
    const content = document.createElement("div");
    content.className = "reader-content";
    if (page) {
      content.append(documentHeader(page), documentBody(page));
    } else {
      const note = document.createElement("div");
      note.className = "empty-folder-note";
      note.textContent = typeof t === "function" ? t("reader_empty_hint") : "";
      content.append(note);
    }
    pane.append(content);
    return win;
  }

  window.AISystem6ReaderInstances = Object.freeze({ build });
})();
