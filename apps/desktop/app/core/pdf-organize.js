// ClioWorks N7: the organizing model behind Reader's 整理页面 mode.
//
// Like the edit kernel, this file is plain, DOM-free and translation-free so
// the executable contract (clioworks-n7-pdf-organize) can run it bare in Node
// against the real corpus PDFs. Three halves:
//
// - a plan: the organized document described before any byte is written. Each
//   entry keeps its 1-based source page, a rotation and a deleted flag, in
//   output order; the summary counts are derived, so undo never leaves a
//   stale total behind.
// - table inference over pdf.js text items inside a dragged rectangle:
//   rows by vertical overlap, columns by the pdfcraft rule -- finish one
//   column before the next. A cell nothing lands in stays null; the window
//   renders that as 尚未识别.
// - assembling the new bytes with the vendored pdf-lib as an incremental
//   update (forIncrementalUpdate + save): the original bytes stay a prefix of
//   the new file and only the changed page tree and pages are appended, so a
//   deleted page's objects remain in the original section (owner ruling
//   SUITE-2: the original stays intact). The prefix is still measured, never
//   assumed.
//
// No UI, no strings, no file access. The window owns all of those.
(function installPdfOrganize(root) {
  if (root.AISystem6PdfOrganize) return;

  const clonePlan = (plan) => JSON.parse(JSON.stringify(plan));

  function createPlan(pageCount) {
    return {
      entries: Array.from({ length: pageCount }, (_, index) => ({
        source: index + 1,
        rotation: 0,
        deleted: false,
      })),
    };
  }

  const normalizeRotation = (rotation) => ((Number(rotation) % 360) + 360) % 360;

  function rotatePages(plan, indices, delta) {
    const step = delta < 0 ? -90 : 90;
    for (const index of indices) {
      const entry = plan.entries[index];
      if (!entry || entry.deleted) continue;
      entry.rotation = normalizeRotation(entry.rotation + step);
    }
    return plan;
  }

  function deletePages(plan, indices) {
    for (const index of indices) {
      const entry = plan.entries[index];
      if (entry && !entry.deleted) entry.deleted = true;
    }
    return plan;
  }

  function movePage(plan, from, to) {
    const entries = plan.entries;
    if (from === to || from < 0 || from >= entries.length || to < 0 || to >= entries.length) return plan;
    entries.splice(to, 0, entries.splice(from, 1)[0]);
    return plan;
  }

  /** Pending-change summary for the bottom bar: 旋转 n · 删除 n · 重排 n. */
  function planSummary(plan) {
    let rotate = 0;
    let deleteCount = 0;
    let reorder = 0;
    let kept = 0;
    for (const entry of plan.entries) {
      if (entry.deleted) { deleteCount += 1; continue; }
      if (entry.rotation !== 0) rotate += 1;
      if (entry.source !== kept + 1) reorder += 1;
      kept += 1;
    }
    return { rotate, delete: deleteCount, reorder };
  }

  /** The pages that survive, in output order, with their rotation. */
  function outputPages(plan) {
    return plan.entries
      .filter((entry) => !entry.deleted)
      .map((entry) => ({ source: entry.source, rotation: entry.rotation }));
  }

  function cloneBytes(bytes) {
    return Uint8Array.from(bytes);
  }

  function startsWithBytes(bytes, prefix) {
    if (bytes.length < prefix.length) return false;
    for (let index = 0; index < prefix.length; index += 1) {
      if (bytes[index] !== prefix[index]) return false;
    }
    return true;
  }

  /**
   * The new bytes for one plan, written as an incremental update of `data`.
   * Kept pages move into output order and the rest fall off the end, so
   * deletion and reorder are one path; a rotation turns the page
   * from the angle it already had. `useObjectStreams: false` keeps the
   * appended section a classic xref table every reader reads.
   */
  async function assemblePdf(PDFLib, data, plan) {
    const pages = outputPages(plan);
    if (!pages.length) throw new Error("pdf-organize: the plan keeps no pages");
    const { PDFDocument, degrees } = PDFLib;
    const doc = await PDFDocument.load(data, { updateMetadata: false, ignoreEncryption: true, forIncrementalUpdate: true });
    const original = doc.getPages();
    // A move takes the page off the tree without removePage, which also
    // deletes the page object, then inserts it back. Positions are tracked
    // here because getPages() caches. Emptying the tree and refilling it
    // instead breaks pdf-lib's nested Count entries.
    const order = original.slice();
    const detach = (index) => {
      doc.catalog.removeLeafNode(index);
      doc.pageCount = doc.getPageCount() - 1;
      doc.pageCache.invalidate();
    };
    pages.forEach((page, index) => {
      const wanted = original[page.source - 1];
      const at = order.indexOf(wanted);
      if (at === index) return;
      detach(at);
      order.splice(at, 1);
      doc.insertPage(index, wanted);
      order.splice(index, 0, wanted);
    });
    for (let index = order.length - 1; index >= pages.length; index -= 1) {
      doc.removePage(index);
      order.pop();
    }
    pages.forEach((page, index) => {
      if (!page.rotation) return;
      const target = order[index];
      target.setRotation(degrees((((target.getRotation().angle + page.rotation) % 360) + 360) % 360));
    });
    const bytes = await doc.save({ useObjectStreams: false });
    return { bytes, incremental: startsWithBytes(bytes, data) };
  }

  // --- table inference ------------------------------------------------------

  const cellBelongs = (item, rect) => (
    item.cx >= rect.x && item.cx <= rect.x + rect.width
    && item.cy >= rect.y && item.cy <= rect.y + rect.height
  );

  /**
   * Cluster pdf.js text items inside one dragged rectangle into a grid.
   * Items are centered in the rectangle; rows group items whose vertical
   * extents overlap; columns are built left to right and one column is
   * finished before the next opens (pdfcraft's rule). A cell no item lands in
   * is null -- the window shows that as 尚未识别, the CSV keeps it empty.
   */
  function inferTable(items, rect) {
    const kept = [];
    for (const item of items || []) {
      const str = String(item?.str ?? "");
      if (!str.trim()) continue;
      const x = Number(item.x);
      const y = Number(item.y);
      const width = Number(item.width);
      const height = Number(item.height);
      if (![x, y, width, height].every(Number.isFinite)) continue;
      const keptItem = { str, x0: x, x1: x + width, y0: y, y1: y + height, height };
      keptItem.cx = x + width / 2;
      keptItem.cy = y + height / 2;
      if (!cellBelongs(keptItem, rect)) continue;
      kept.push(keptItem);
    }
    if (!kept.length) return { columns: 0, rows: [] };

    kept.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    const rows = [];
    for (const item of kept) {
      // Half a line's height of slack keeps a wrapped cell's lines together
      // while rows a line apart stay apart.
      const slack = item.height / 2;
      const row = rows.find((candidate) => item.cy >= candidate.top - slack && item.cy <= candidate.bottom + slack);
      if (row) {
        row.items.push(item);
        row.top = Math.min(row.top, item.y0);
        row.bottom = Math.max(row.bottom, item.y1);
      } else {
        rows.push({ items: [item], top: item.y0, bottom: item.y1 });
      }
    }

    const byCenterX = [...kept].sort((a, b) => a.cx - b.cx || a.x0 - b.x0);
    const columns = [];
    for (const item of byCenterX) {
      const last = columns[columns.length - 1];
      if (last && item.cx <= last.x1) last.x1 = Math.max(last.x1, item.x1);
      else columns.push({ x0: item.x0, x1: item.x1 });
    }

    /** A cell's items read line by line: wrapped cells read top-down, a line left-right. */
    const cellText = (items) => {
      const lines = [];
      for (const item of items) {
        const line = lines.find((candidate) => item.cy >= candidate.top && item.cy <= candidate.bottom);
        if (line) {
          line.items.push(item);
          line.top = Math.min(line.top, item.y0);
          line.bottom = Math.max(line.bottom, item.y1);
        } else {
          lines.push({ items: [item], top: item.y0, bottom: item.y1 });
        }
      }
      lines.sort((a, b) => a.top - b.top);
      return lines.map((line) => line.items.sort((a, b) => a.x0 - b.x0).map((item) => item.str).join(" ")).join(" ");
    };

    const grid = rows.map((row) => {
      const cells = new Array(columns.length).fill(null);
      const landing = new Array(columns.length);
      for (const item of row.items) {
        const index = columns.findIndex((column) => item.cx >= column.x0 && item.cx <= column.x1);
        if (index < 0) continue;
        (landing[index] || (landing[index] = [])).push(item);
      }
      landing.forEach((items, index) => {
        const text = cellText(items);
        if (text.trim()) cells[index] = text;
      });
      return cells;
    });
    return { columns: columns.length, rows: grid };
  }

  const csvCell = (value) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  /** Empty (未识别) cells stay empty in exported text; the preview shows the marker. */
  function tableToCsv(rows) {
    return rows.map((cells) => cells.map(csvCell).join(",")).join("\r\n");
  }

  function tableToTabText(rows) {
    return rows.map((cells) => cells.map((cell) => String(cell ?? "")).join("\t")).join("\n");
  }

  root.AISystem6PdfOrganize = Object.freeze({
    createPlan,
    clonePlan,
    rotatePages,
    deletePages,
    movePage,
    planSummary,
    outputPages,
    normalizeRotation,
    assemblePdf,
    startsWithBytes,
    inferTable,
    tableToCsv,
    tableToTabText,
  });
})(typeof window !== "undefined" ? window : globalThis);
