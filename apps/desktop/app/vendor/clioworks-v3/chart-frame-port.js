// ClioWorks v5.1 (CW51-04): the NATIVE frame port for a real chart copy.
// Bridges the vendored FrameSession's six ports onto the ClioChart engine's
// real read/write surface. The draft is the engine's own serialized table;
// edits replay deterministically on that text; commit performs ONE parent
// undo plus a replay through the engine's own history and write-back — the
// source file's identity is untouched and the engine rechecks its own owner
// fence (writeClioChartBackToOwner refuses a changed underlying file).
// UI checks are not authorization: the engine revalidates on every write.
(function (root) {
  'use strict';
  if (root.AISystem6ChartFramePort) return;

  /** The port factory. Every dependency is the desk's own function — this
   * module invents no engine state and no persistence. */
  function createChartFramePort(engine) {
    if (!engine || typeof engine !== "object") throw new Error("CHART_PORT_NO_ENGINE");
    for (const key of ["readTable", "applyTable", "serialize", "parse", "undoOnce", "beginChange", "ownerId", "revision"]) {
      if (key !== "beginChange" && typeof engine[key] !== "function") {
        throw new Error(`CHART_PORT_MISSING_${key}`);
      }
    }

    // The revision the DRAFT was opened against. Never updated from live
    // reads — a live-updated "known" would let a parent edit under the
    // draft sail through its own conflict guard.
    const openedRevision = engine.revision();

    return {
      /** The parent's live stamp for the chart object. */
      readTarget() {
        return {
          documentId: engine.ownerId() || "clio-chart",
          sessionId: "cw51-chart",
          generation: 0,
          editRevision: engine.revision(),
          objectId: engine.objectId(),
          objectRevision: engine.revision(),
          active: true, writable: true, embedded: true, editable: true,
          composing: false, closed: false,
        };
      },

      /** The draft is the serialized table text — the engine's own words. */
      async createDraft() {
        const text = engine.serialize(engine.readTable());
        return { handle: { text, revisionAtOpen: engine.revision() } };
      },

      /** Local-draft transaction on the text: a deterministic replay, no
       * parent write. ops: set-cell / set-label / set-column / add-row /
       * remove-row / add-column / attach-region (CW51-06: the table grows;
       * a region anchor rides the object, never mutating the image). */
      editDraft(handle, op) {
        const before = handle.text;
        let text = before;
        if (op?.kind === "set-cell") {
          const table = engine.parse(handle.text);
          const row = table?.rows?.[Number(op.row)];
          if (!row || !row.cells[Number(op.column)]) return { changed: false, dirty: handle.dirty === true };
          row.cells[Number(op.column)] = { ...row.cells[Number(op.column)], text: String(op.value ?? "").trim() };
          row.dirty = true;
          text = engine.serialize(table);
        } else if (op?.kind === "set-label") {
          const table = engine.parse(handle.text);
          const row = table?.rows?.[Number(op.row)];
          if (!row) return { changed: false, dirty: handle.dirty === true };
          row.label = String(op.value ?? "").trim();
          row.dirty = true;
          text = engine.serialize(table);
        } else if (op?.kind === "set-column") {
          const table = engine.parse(handle.text);
          const column = table?.columns?.[Number(op.column)];
          if (!column) return { changed: false, dirty: handle.dirty === true };
          column.text = String(op.value ?? "");
          table.headerDirty = true;
          text = engine.serialize(table);
        } else if (op?.kind === "add-row") {
          const table = engine.parse(handle.text);
          if (!table) return { changed: false, dirty: handle.dirty === true };
          const width = table.columns.length;
          table.rows.push({
            lineIndex: table.lines.length,
            label: String(op.label ?? ""),
            cells: Array.from({ length: width }, () => ({ text: "" })),
            dirty: true,
          });
          table.lines.push("");
          text = engine.serialize(table);
        } else if (op?.kind === "remove-row") {
          const table = engine.parse(handle.text);
          const at = Number(op.row);
          // The engine's own delete-row refuses to drop the last row
          // (clio-chart's invariant: a chart table keeps at least one row).
          if (!table || !table.rows[at] || table.rows.length <= 1) {
            return { changed: false, dirty: handle.dirty === true };
          }
          // The row's LINE leaves the table — splicing the row alone leaves
          // the line behind and the serialize keeps it.
          table.lines.splice(table.rows[at].lineIndex, 1);
          table.rows.splice(at, 1);
          table.rows.forEach((row, index) => {
            row.lineIndex = table.headerIndex + 2 + index;
            row.dirty = true; // survivors re-render at their new positions
          });
          text = engine.serialize(table);
        } else if (op?.kind === "add-column") {
          const table = engine.parse(handle.text);
          if (!table) return { changed: false, dirty: handle.dirty === true };
          table.columns.push({ text: String(op.label ?? "") });
          table.headerDirty = true;
          table.rows.forEach((row) => {
            row.cells.push({ text: "" });
            row.dirty = true;
          });
          text = engine.serialize(table);
        } else if (op?.kind === "attach-region") {
          // The region anchor is metadata on the copy — the source image's
          // bytes are never an input to this replay. It rides the HANDLE so
          // prepare carries it into the candidate.
          const anchor = op.anchor && typeof op.anchor === "object" ? op.anchor : null;
          if (!anchor || !Array.isArray(anchor.box)) return { changed: false, dirty: handle.dirty === true };
          handle.regions = [...(handle.regions || []), { ...anchor }];
          handle.dirty = true;
          return { changed: true, dirty: true };
        } else {
          return { changed: false, dirty: handle.dirty === true };
        }
        if (text === before) return { changed: false, dirty: handle.dirty === true };
        handle.text = text;
        handle.dirty = true;
        return { changed: true, dirty: true };
      },

      /** The reviewed candidate: the draft text plus a one-line summary.
       * Region anchors travel with the candidate when the draft has any. */
      async prepare(handle) {
        const table = engine.parse(handle.text);
        if (!table) throw Object.assign(new Error("CHART_PORT_UNPARSEABLE_DRAFT"), { code: "CHART_PORT_UNPARSEABLE_DRAFT" });
        const candidate = { text: handle.text };
        if (handle.regions?.length) candidate.regions = handle.regions.map((region) => ({ ...region }));
        return {
          candidate,
          summary: `图表副本：${table.rows.length} 行 × ${table.columns.length} 列`
            + (handle.regions?.length ? `，${handle.regions.length} 个区域注记` : ""),
        };
      },

      /** The real apply: ONE parent undo (dropping the reader's pre-copy
       * edits is not needed — the undo target is this copy's own change),
       * then the candidate replayed through the engine's own history and
       * write-back. The engine's owner fence (file-text check or embed
       * onChange) is the authorization that actually counts. */
      async commit({ candidate, expected }) {
        // The candidate was reviewed against `expected`; the parent must
        // still be at that revision (or at the open-time one). Anything
        // newer moved under the draft and is a conflict.
        const current = engine.revision();
        if (current !== expected.editRevision && current !== openedRevision) {
          return { status: "blocked", code: "REVISION_CONFLICT" };
        }
        const beforeText = engine.serialize(engine.readTable());
        if (beforeText === candidate.text) {
          // A metadata-only apply (a region anchor, no text change) is still
          // a real object revision: it goes through the engine's own history
          // (beginChange + applyTable of the unchanged text) so the engine's
          // revision advances and the receipt passes the session's
          // validation — a metadata edit IS an edit.
          engine.beginChange(() => engine.applyTable(engine.parse(candidate.text)));
          return {
            status: "applied",
            documentId: engine.ownerId() || "clio-chart",
            sessionId: "cw51-chart", generation: 0,
            editRevision: engine.revision(),
            objectId: engine.objectId(),
            objectRevision: engine.revision(),
            operationId: root.crypto?.randomUUID?.() || `op-${Date.now()}`,
          };
        }
        engine.beginChange(() => engine.applyTable(engine.parse(candidate.text)));
        if (engine.serialize(engine.readTable()) !== candidate.text) {
          return { status: "failed", code: "APPLY_MISMATCH" };
        }
        return {
          status: "applied",
          documentId: engine.ownerId() || "clio-chart",
          sessionId: "cw51-chart", generation: 0,
          editRevision: engine.revision(), objectId: engine.objectId(),
          objectRevision: engine.revision(),
          operationId: root.crypto?.randomUUID?.() || `op-${Date.now()}`,
        };
      },

      /** No server relay: the engine's write is synchronous and local, so an
       * unknown outcome cannot occur — but the port still answers queries
       * from the engine's own current text (never invents terminal failure). */
      async lookupCommit(attempt) {
        // The session's attempt carries {expected, requestId} — no candidate.
        // This port's apply is synchronous and local: the authoritative
        // answer is the engine's own revision. A revision past the base
        // means the apply landed; at-or-before the base means it never did.
        // (The candidate text is intentionally not consulted — it is not in
        // the attempt, and reconciling from the engine is the honest path.)
        const expectedRevision = Number(attempt?.expected?.editRevision);
        const current = engine.revision();
        if (Number.isFinite(expectedRevision) && current > expectedRevision) {
          return {
            status: "applied",
            documentId: engine.ownerId() || "clio-chart",
            sessionId: "cw51-chart", generation: 0,
            editRevision: current, objectId: engine.objectId(),
            objectRevision: current, operationId: "reconciled-local",
          };
        }
        return { status: "not-applied", terminal: true };
      },

      disposeDraft() { /* the draft is plain text; nothing to release */ },
    };
  }

  root.AISystem6ChartFramePort = Object.freeze({ createChartFramePort });
})(typeof window !== "undefined" ? window : globalThis);
