// Reader's 整理页面 mode (ClioWorks N7). Lazy: the loader is
// ensureReaderOrganizeModule in core/config.js and it rides the same lazy
// sheet as the original-page view. The grid, its operations and the dragged
// rectangle live here; the plan, the table inference and the pdf-lib assembly
// live in core/pdf-organize.js so the executable contract can run them bare.
//
// Nothing touches the writer's PDF until 存储 or 存为副本: every grid action
// only moves the plan, and each one is one step in Reader's edit history.
(() => {
  "use strict";

  const THUMB_WIDTH = 108;
  let session = null;

  // The vendored @cantoo/pdf-lib UMD build installs window.PDFLib as a side
  // effect of loading; page operations are its only reader, so the module that
  // owns them loads it, the once it is needed.
  const pdfLibBrowserPath = "/app/vendor/pdf-lib/pdf-lib.min.js";
  let pdfLibBrowserPromise = null;

  function getBrowserPdfLib() {
    if (!pdfLibBrowserPromise) {
      pdfLibBrowserPromise = import(pdfLibBrowserPath).then(() => {
        const PDFLib = window.PDFLib;
        if (!PDFLib || typeof PDFLib.PDFDocument?.load !== "function") {
          throw new Error("pdf-lib did not expose its browser PDF API.");
        }
        return PDFLib;
      });
      pdfLibBrowserPromise.catch(() => {
        if (pdfLibBrowserPromise) pdfLibBrowserPromise = null;
      });
    }
    return pdfLibBrowserPromise;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, onClick, extra = {}) {
    const node = el("button", "btn", label);
    node.type = "button";
    if (extra.title) node.title = extra.title;
    if (extra.aria) node.setAttribute("aria-label", extra.aria);
    node.addEventListener("click", onClick);
    return node;
  }

  function teardown() {
    if (!session) return;
    session.dead = true;
    session.thumbObserver?.disconnect();
    window.AISystem6ReaderOrganize.extraction?.stop?.();
    document.getElementById("reader-organize-table-modal")?.close?.("cancel");
    session = null;
  }

  // --- the grid -----------------------------------------------------------

  function selectedIndices(s) {
    return [...s.selected].sort((a, b) => a - b);
  }

  function syncTiles(s) {
    for (const [index, tile] of s.tiles) {
      const entry = s.plan.entries[index];
      tile.classList.toggle("is-selected", s.selected.has(index));
      tile.setAttribute("aria-selected", String(s.selected.has(index)));
      tile.classList.toggle("is-deleted", Boolean(entry?.deleted));
      if (entry && !entry.deleted) applyTileRotation(tile.firstChild, entry.rotation);
    }
  }

  function dropSlot(s, clientY) {
    let best = null;
    for (const [index, tile] of s.tiles) {
      if (s.plan.entries[index]?.deleted) continue;
      const box = tile.getBoundingClientRect();
      if (!box.height) continue;
      const distance = Math.abs(box.top + box.height / 2 - clientY);
      if (!best || distance < best.distance) best = { index, distance };
    }
    return best;
  }

  function wireTilePointer(s, tile, planIndex) {
    tile.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || s.dead) return;
      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;
      let slot = null;
      const ghost = el("div", "reader-organize-ghost");
      const clearMarks = () => {
        for (const other of s.tiles.values()) other.classList.remove("is-drop-before");
      };
      const move = (moveEvent) => {
        if (!dragging) {
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 6) return;
          dragging = true;
          ghost.append(tile.cloneNode(true));
          // The top layer floats the ghost over every window without owning a
          // z-index (this sheet's budget is zero); older browsers just drop it.
          if (typeof ghost.showPopover === "function") {
            ghost.popover = "manual";
            ghost.showPopover();
          }
          document.body.append(ghost);
          tile.classList.add("is-dragged");
          try { tile.setPointerCapture(moveEvent.pointerId); } catch { /* capture lost */ }
        }
        ghost.style.setProperty("--ghost-x", `${moveEvent.clientX - 34}px`);
        ghost.style.setProperty("--ghost-y", `${moveEvent.clientY - 44}px`);
        slot = dropSlot(s, moveEvent.clientY);
        clearMarks();
        if (slot && slot.index !== planIndex) s.tiles.get(slot.index).classList.add("is-drop-before");
      };
      const finish = () => {
        tile.removeEventListener("pointermove", move);
        tile.removeEventListener("pointerup", finish);
        tile.removeEventListener("pointercancel", finish);
        const moved = dragging;
        const target = slot;
        ghost.remove();
        tile.classList.remove("is-dragged");
        clearMarks();
        if (!moved) {
          // A tap: plain click picks one page, shift-click takes the range.
          if (event.shiftKey && s.anchor >= 0) {
            const from = Math.min(s.anchor, planIndex);
            const to = Math.max(s.anchor, planIndex);
            selectOnly(s, Array.from({ length: to - from + 1 }, (_, step) => from + step));
          } else {
            s.anchor = planIndex;
            selectOnly(s, [planIndex]);
          }
          return;
        }
        if (!target || target.index === planIndex) return;
        // Removing a tile above the target shifts it up one slot.
        const to = planIndex < target.index ? target.index - 1 : target.index;
        if (to === planIndex) return;
        applyChange(s, "reader_organize_reorder", () => {
          window.AISystem6PdfOrganize.movePage(s.plan, planIndex, to);
          s.selected = new Set([to]);
          s.anchor = to;
        });
      };
      tile.addEventListener("pointermove", move);
      tile.addEventListener("pointerup", finish);
      tile.addEventListener("pointercancel", finish);
    });
  }

  function buildTile(s, planIndex) {
    const entry = s.plan.entries[planIndex];
    const tile = el("li", "reader-organize-tile");
    tile.dataset.index = String(planIndex);
    tile.tabIndex = 0;
    tile.setAttribute("role", "option");
    tile.setAttribute("aria-selected", "false");
    const frame = el("div", "reader-organize-frame");
    tile.append(frame, el("span", "reader-organize-number", String(entry.source)));
    wireTilePointer(s, tile, planIndex);
    s.tiles.set(planIndex, tile);
    s.thumbObserver.observe(frame);
    return tile;
  }

  function buildGrid(s) {
    for (const tile of s.tiles.values()) s.thumbObserver.unobserve(tile.firstChild);
    s.grid.replaceChildren();
    s.tiles.clear();
    for (let index = 0; index < s.plan.entries.length; index += 1) {
      if (s.plan.entries[index].deleted) continue;
      s.grid.append(buildTile(s, index));
    }
    syncTiles(s);
  }

  function queueThumb(s, frame) {
    if (frame.dataset.rendered) return;
    frame.dataset.rendered = "pending";
    s.thumbChain = s.thumbChain.then(async () => {
      if (s.dead) return;
      try {
        const tile = frame.closest(".reader-organize-tile");
        const entry = s.plan.entries[Number(tile.dataset.index)];
        const pdfPage = await s.pdf.getPage(entry.source);
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: THUMB_WIDTH / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await pdfPage.render({ canvas, viewport }).promise;
        if (s.dead) return;
        frame.dataset.rendered = "done";
        frame.replaceChildren(canvas);
        applyTileRotation(frame, entry.rotation);
      } catch {
        delete frame.dataset.rendered;
      }
    }).catch(() => {});
  }

  function applyTileRotation(frame, rotation) {
    const canvas = frame.querySelector("canvas");
    if (!canvas) return;
    const turn = { 90: 1, 180: 2, 270: 3 }[window.AISystem6PdfOrganize.normalizeRotation(rotation)] || 0;
    canvas.style.transform = turn % 2 ? "rotate(90deg) scale(0.72)" : `rotate(${turn * 90}deg)`;
  }

  /** One grid action: the plan moves, the tiles follow, the bar recounts. */
  function renderAfterChange(s) {
    for (const [index, tile] of s.tiles) {
      tile.classList.toggle("is-deleted", Boolean(s.plan.entries[index]?.deleted));
    }
    // Deleted pages leave the grid; a reorder moves no pixels, so every tile
    // keeps its thumbnail and only its place follows the plan.
    s.plan.entries.forEach((entry, index) => {
      if (!entry.deleted) s.grid.append(s.tiles.get(index));
    });
    s.selected = new Set([...s.selected].filter((index) => s.plan.entries[index] && !s.plan.entries[index].deleted));
    syncTiles(s);
    updateBar(s);
  }

  // --- history ------------------------------------------------------------

  function applyChange(s, labelKey, mutate) {
    s.history.change(t(labelKey), () => {
      mutate();
      renderAfterChange(s);
    });
  }

  function rotateSelected(s, direction) {
    const indices = selectedIndices(s);
    if (!indices.length) return;
    applyChange(s, "reader_organize_rotate", () => {
      window.AISystem6PdfOrganize.rotatePages(s.plan, indices, direction);
    });
  }

  function deleteSelected(s) {
    const indices = selectedIndices(s);
    if (!indices.length) return;
    applyChange(s, "reader_organize_delete_step", () => {
      window.AISystem6PdfOrganize.deletePages(s.plan, indices);
      s.selected.clear();
      s.anchor = -1;
    });
  }

  // --- the bars -----------------------------------------------------------

  function updateBar(s) {
    const summary = window.AISystem6PdfOrganize.planSummary(s.plan);
    const untouched = !summary.rotate && !summary.delete && !summary.reorder;
    const surviving = s.plan.entries.some((entry) => !entry.deleted);
    s.summary.textContent = untouched
      ? t("reader_organize_unmodified")
      : t("reader_organize_summary", summary.rotate, summary.delete, summary.reorder);
    s.saveButton.disabled = untouched || !surviving;
    s.saveButton.title = s.backup && !s.backupOffered ? t("reader_organize_backup_pending") : "";
    s.copyButton.disabled = !surviving;
    const noneSelected = !s.selected.size;
    s.rotateLeft.disabled = s.rotateRight.disabled = s.deleteButton.disabled = noneSelected;
  }

  function rotateButtons(s) {
    s.rotateLeft = button("⟲", () => rotateSelected(s, -1), { aria: t("reader_organize_rotate_left"), title: t("reader_organize_rotate_left") });
    s.rotateRight = button("⟳", () => rotateSelected(s, 1), { aria: t("reader_organize_rotate_right"), title: t("reader_organize_rotate_right") });
    s.deleteButton = button(t("reader_organize_delete"), () => deleteSelected(s));
    return [s.rotateLeft, s.rotateRight, s.deleteButton];
  }

  // --- saving -------------------------------------------------------------

  function organizedFileName(fileName) {
    const base = String(fileName || "document").replace(/\.pdf$/i, "");
    return t("reader_organize_copy_name", base);
  }

  function assemble(s) {
    return getBrowserPdfLib().then((PDFLib) => window.AISystem6PdfOrganize.assemblePdf(PDFLib, s.originalBytes, s.plan));
  }

  function pdfFileFrom(bytes, fileName) {
    return new File([bytes], fileName, { type: "application/pdf" });
  }

  function reportToReader(message) {
    if (typeof readerStatusEl !== "undefined" && readerStatusEl) readerStatusEl.textContent = message;
  }

  /** 存为副本: the organized bytes as a download, and on a mounted File Floppy as a copy. */
  async function saveCopy(s) {
    let result;
    try {
      result = await assemble(s);
    } catch (error) {
      showSystemModal(t("reader_organize_save_failed", error?.message || ""), "alert");
      return;
    }
    const file = pdfFileFrom(result.bytes, organizedFileName(s.fileName));
    if (!window.AISystem6WebPlatform?.saveArtifact?.({ file })) return;
    const floppyMounted = typeof getMountedTextDiskChunks === "function" && getMountedTextDiskChunks().length > 0;
    if (typeof insertFilesIntoFileFloppy !== "function" || !floppyMounted) {
      reportToReader(t("reader_organize_copy_saved"));
      return;
    }
    const putOnFloppy = await showSystemModal(t("reader_organize_floppy_ask", file.name), "confirm", {
      confirmKey: "reader_organize_floppy_confirm",
    });
    if (putOnFloppy !== "yes") return;
    try {
      const outcome = await insertFilesIntoFileFloppy([file], { source: "readerOrganize" });
      reportToReader(outcome && outcome.ok === false ? t("reader_organize_floppy_refused") : t("reader_organize_floppy_saved"));
    } catch {
      reportToReader(t("reader_organize_floppy_refused"));
    }
  }

  /**
   * 存储. The bytes are whatever pdf-lib wrote; whether the original survives
   * as a prefix is checked, not assumed. pdf-lib rewrites whole documents, so
   * a save that is not incremental keeps the original bytes as a backup copy
   * the writer can still take before it is dismissed.
   */
  async function saveInPlace(s) {
    if (s.saveButton.disabled) return;
    let result;
    try {
      result = await assemble(s);
    } catch (error) {
      showSystemModal(t("reader_organize_save_failed", error?.message || ""), "alert");
      return;
    }
    const incremental = window.AISystem6PdfOrganize.startsWithBytes(result.bytes, s.originalBytes);
    if (!incremental && !s.backup) s.backup = pdfFileFrom(s.originalBytes, s.fileName);
    s.backupOffered = false;
    const file = pdfFileFrom(result.bytes, s.fileName);
    // Reader keeps the opened PDF per project and session (app.js); only the
    // File is swapped, never stored.
    readerPdfSources.set(`${activeProjectId}::${s.fileName}`, file);
    s.originalBytes = result.bytes;
    s.history.clear();
    reportToReader(incremental
      ? t("reader_organize_saved_incremental")
      : t("reader_organize_saved_rewritten", s.backup.name));
    updateBar(s);
  }

  async function offerBackup(s) {
    if (!s.backup) return;
    if (window.AISystem6WebPlatform?.saveArtifact?.({ file: s.backup })) {
      s.backupOffered = true;
      reportToReader(t("reader_organize_backup_saved"));
    }
    updateBar(s);
  }

  // --- table extraction (原页 view) -----------------------------------------

  /**
   * Arm rectangle dragging over the original-page view. One drag draws the
   * rectangle on one page; the preview opens from the pdf.js text items it
   * catches. `done` is called after the drag settles, however it settles.
   */
  function beginTableExtraction(pagesSession, done) {
    const scroll = pagesSession.scroll;
    const stop = () => {
      scroll.classList.remove("is-extracting");
      scroll.removeEventListener("pointerdown", onDown, true);
      window.AISystem6ReaderOrganize.extraction = null;
    };
    const onDown = (event) => {
      const holder = event.target?.closest?.(".reader-page");
      if (!holder || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const box = holder.getBoundingClientRect();
      const x0 = event.clientX - box.left;
      const y0 = event.clientY - box.top;
      const overlay = el("div", "reader-organize-extract-rect");
      overlay.style.setProperty("--rect-x", "0px");
      overlay.style.setProperty("--rect-y", "0px");
      overlay.style.setProperty("--rect-w", "0px");
      overlay.style.setProperty("--rect-h", "0px");
      holder.append(overlay);
      const move = (moveEvent) => {
        const x = Math.min(Math.max(moveEvent.clientX - box.left, 0), box.width);
        const y = Math.min(Math.max(moveEvent.clientY - box.top, 0), box.height);
        overlay.style.setProperty("--rect-x", `${Math.min(x0, x)}px`);
        overlay.style.setProperty("--rect-y", `${Math.min(y0, y)}px`);
        overlay.style.setProperty("--rect-w", `${Math.abs(x - x0)}px`);
        overlay.style.setProperty("--rect-h", `${Math.abs(y - y0)}px`);
      };
      const up = () => {
        holder.removeEventListener("pointermove", move);
        holder.removeEventListener("pointerup", up);
        holder.removeEventListener("pointercancel", up);
        const style = overlay.style;
        const width = Number.parseFloat(style.getPropertyValue("--rect-w") || "0");
        const height = Number.parseFloat(style.getPropertyValue("--rect-h") || "0");
        const left = Number.parseFloat(style.getPropertyValue("--rect-x") || "0");
        const top = Number.parseFloat(style.getPropertyValue("--rect-y") || "0");
        overlay.remove();
        stop();
        done();
        if (width < 8 || height < 8) return;
        extractTable(pagesSession, holder, { x: left, y: top, width, height }).catch(() => {});
      };
      holder.addEventListener("pointermove", move);
      holder.addEventListener("pointerup", up);
      holder.addEventListener("pointercancel", up);
    };
    scroll.classList.add("is-extracting");
    scroll.addEventListener("pointerdown", onDown, true);
    window.AISystem6ReaderOrganize.extraction = { stop };
  }

  async function extractTable(pagesSession, holder, cssRect) {
    const pageNumber = Number(holder.dataset.page);
    const pdfPage = await pagesSession.pdf.getPage(pageNumber);
    const viewport = pdfPage.getViewport({ scale: 1 });
    const box = holder.getBoundingClientRect();
    const scale = viewport.width / (box.width || viewport.width);
    const rect = {
      x: cssRect.x * scale,
      y: cssRect.y * scale,
      width: cssRect.width * scale,
      height: cssRect.height * scale,
    };
    const content = await pdfPage.getTextContent();
    const items = content.items.map((item) => {
      const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      return { str: item.str, x: vx, y: vy - item.height, width: item.width, height: item.height };
    });
    const grid = window.AISystem6PdfOrganize.inferTable(items, rect);
    showTablePreview(pagesSession, pageNumber, grid);
  }

  function tablePreviewDialog() {
    let dialog = document.getElementById("reader-organize-table-modal");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "reader-organize-table-modal";
    dialog.className = "finder-operation-modal app-input-modal reader-organize-preview";
    dialog.innerHTML = `
      <form method="dialog">
        <section class="finder-operation-body">
          <h2 id="reader-organize-table-title"></h2>
          <p id="reader-organize-table-note" class="finder-operation-lede"></p>
          <div id="reader-organize-table-scroll"></div>
        </section>
        <div class="button-row finder-operation-actions">
          <button class="btn" type="button" id="reader-organize-table-copy"></button>
          <button class="btn" type="button" id="reader-organize-table-chart"></button>
          <button class="btn default" value="cancel" id="reader-organize-table-done"></button>
        </div>
      </form>`;
    document.body.append(dialog);
    return dialog;
  }

  function showTablePreview(pagesSession, pageNumber, grid) {
    const dialog = tablePreviewDialog();
    const note = dialog.querySelector("#reader-organize-table-note");
    const scroll = dialog.querySelector("#reader-organize-table-scroll");
    const copy = dialog.querySelector("#reader-organize-table-copy");
    const chart = dialog.querySelector("#reader-organize-table-chart");
    dialog.querySelector("#reader-organize-table-title").textContent = t("reader_organize_table_title", pageNumber);
    const empty = !grid.columns || !grid.rows.length;
    note.textContent = empty ? t("reader_organize_table_empty") : t("reader_organize_table_shape", grid.rows.length, grid.columns);
    scroll.replaceChildren();
    if (!empty) {
      const table = el("table", "reader-organize-table");
      const body = el("tbody");
      for (const cells of grid.rows) {
        const row = el("tr");
        for (const cell of cells) {
          row.append(el("td", cell === null ? "is-unrecognized" : "", cell === null ? t("reader_organize_unrecognized") : cell));
        }
        body.append(row);
      }
      table.append(body);
      scroll.append(table);
    }
    copy.textContent = t("reader_organize_table_copy");
    chart.textContent = t("reader_organize_table_chart");
    dialog.querySelector("#reader-organize-table-done").textContent = t("reader_organize_table_done");
    copy.disabled = chart.disabled = empty;
    const tabText = window.AISystem6PdfOrganize.tableToTabText(grid.rows);
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(tabText);
        note.textContent = t("reader_organize_table_copied");
      } catch {
        note.textContent = t("reader_organize_table_copy_failed");
      }
    };
    chart.onclick = async () => {
      dialog.close("ok");
      if (typeof ensureClioChartModule === "function") {
        try { await ensureClioChartModule(); } catch { /* the import path reports its own failure */ }
      }
      await window.AISystem6ClioChart?.makeFromSource?.({
        text: window.AISystem6PdfOrganize.tableToCsv(grid.rows),
        label: t("reader_organize_table_source", pagesSession.fileName, pageNumber),
        scope: "documents",
        threshold: 1,
      });
    };
    if (!dialog.open) dialog.showModal();
  }

  // --- the view -----------------------------------------------------------

  async function show({ host, file, page, makeBar }) {
    teardown();
    const s = {
      host, file, fileName: page.fileName, dead: false,
      selected: new Set(), anchor: -1,
      tiles: new Map(), thumbChain: Promise.resolve(),
      backup: null, backupOffered: false,
    };
    session = s;
    host.replaceChildren(el("div", "reader-pages-note", t("reader_organize_opening")));
    const model = window.AISystem6PdfOrganize;
    try {
      const [PDFLib, pdfjs] = await Promise.all([getBrowserPdfLib(), getBrowserPdfJs()]);
      const data = new Uint8Array(await file.arrayBuffer());
      const original = await PDFLib.PDFDocument.load(data, { updateMetadata: false, ignoreEncryption: true });
      if (session !== s) return;
      s.originalBytes = data;
      s.plan = model.createPlan(original.getPageCount());
      s.pdf = await pdfjs.getDocument(pdfJsDocumentOptions(data)).promise;
    } catch {
      if (session !== s) return;
      host.replaceChildren(el("div", "reader-pages-note", t("reader_organize_failed")));
      return;
    }
    if (session !== s || s.dead) return;

    s.history = window.AISystem6EditHistory.createEditHistory({
      read: () => model.clonePlan(s.plan),
      write: (snapshot) => {
        s.plan = snapshot;
        buildGrid(s);
        updateBar(s);
      },
      equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    });

    const bar = makeBar("organize");
    bar.append(...rotateButtons(s));

    s.summary = el("span", "reader-organize-summary");
    s.summary.setAttribute("aria-live", "polite");
    s.saveButton = button(t("reader_organize_save"), () => saveInPlace(s));
    s.copyButton = button(t("reader_organize_save_copy"), () => saveCopy(s));
    const foot = el("div", "reader-organize-foot");
    foot.append(s.summary, s.copyButton, s.saveButton);

    s.grid = el("ul", "reader-organize-grid");
    s.grid.setAttribute("role", "listbox");
    s.grid.setAttribute("aria-label", t("reader_organize_grid"));
    s.grid.setAttribute("aria-multiselectable", "true");
    const body = el("div", "reader-organize-body");
    body.append(s.grid);
    host.replaceChildren(bar, body, foot);

    s.thumbObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) queueThumb(s, entry.target);
      }
    }, { root: body, rootMargin: "300px 0px" });
    buildGrid(s);
    updateBar(s);
  }

  window.AISystem6ReaderOrganize = Object.freeze({
    show,
    teardown,
    beginTableExtraction,
    get session() { return session; },
    extraction: null,
  });

  // Edit > Undo follows the view on screen: while a grid is open it is the
  // Reader's editor, and the moment it closes the history answers to nothing.
  registerEditHistory("reader", () => {
    const current = session;
    if (!current || current.dead || !current.history) return null;
    return {
      undo: () => current.history.undo(),
      redo: () => current.history.redo(),
      canUndo: () => current.history.canUndo(),
      canRedo: () => current.history.canRedo(),
      undoLabel: () => current.history.undoLabel(),
      redoLabel: () => current.history.redoLabel(),
    };
  });
})();
