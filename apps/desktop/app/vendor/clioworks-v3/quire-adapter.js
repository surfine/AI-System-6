/* ClioWorks v4 (V4-01): native DOCX open/edit/save adapter around the vendored
 * VibeOffice Quire codec (apps/desktop/app/vendor/vibeoffice/, Apache-2.0,
 * pinned upstream 4c011173838de5d65e8ea0407684ba820a277273).
 *
 * Contract (INTEROPERABILITY.zh-CN) — same shape as the Ledger adapter:
 *  - Unchanged bytes pass through untouched: save() returns the original
 *    ArrayBuffer when the document was never modified (original-bytes mode).
 *  - After a real edit, the Quire preserving writer rebuilds only owned parts;
 *    unknown parts (custom XML, media, thumbnail) keep original bytes
 *    (preserving-edit). w:latentStyles and w:unhideWhenUsed are carried by the
 *    documented vendored deviations instead of being silently dropped.
 *  - This adapter never goes through the plain-text importer and never
 *    overwrites the source record with extracted text.
 *
 * S11-4 / S11-23 narrow write surface (M3 front): one dirty source (isDirty /
 * markSaved(rev) / getEditRevision), transactional undo/redo through the vendored
 * model's D.tx, structure and character edits through the vendored ops.js, and
 * comment add/reply/done. Tables and images are read-only: selectable, never edited.
 * The upstream contentEditable layer (editor.js + layout.js + drawing.js) is a separate
 * lazy point, loadEditor(), used only by the fixture lab; no UI here.
 *
 * Loaded only by the ClioWorks host (lazy, classic script). No UI here. */
(function (root) {
  'use strict';

  const MODULES = [
    'app/vendor/vibeoffice/common/zip.js',
    'app/vendor/vibeoffice/common/sha.js',
    'app/vendor/vibeoffice/common/core.js',
    'app/vendor/vibeoffice/common/xml.js',
    'app/vendor/vibeoffice/common/opc.js',
    'app/vendor/vibeoffice/common/opc-order.js',
    'app/vendor/vibeoffice/common/crypto.js',
    'app/vendor/vibeoffice/common/geometry.js',
    'app/vendor/vibeoffice/common/metafile.js',
    'app/vendor/vibeoffice/common/numfmt.js',
    'app/vendor/vibeoffice/common/charts.js',
    'app/vendor/vibeoffice/common/dml.js',
    'app/vendor/vibeoffice/ledger/xml.js',
    'app/vendor/vibeoffice/quire/dmodel.js',
    'app/vendor/vibeoffice/quire/ops.js',
    'app/vendor/vibeoffice/quire/omml.js',
    'app/vendor/vibeoffice/quire/render.js',
    'app/vendor/vibeoffice/quire/preserve.js',
    'app/vendor/vibeoffice/quire/preserve-drawing.js',
    'app/vendor/vibeoffice/quire/docx-read.js',
    'app/vendor/vibeoffice/quire/docx-write.js',
  ];

  // Second lazy point: the upstream contentEditable layer. Order matters: layout.js
  // defines L.layout, drawing.js defines L.drawing, editor.js reads both at load, fields.js reads layout and editor.
  const EDITOR_MODULES = [
    'app/vendor/vibeoffice/quire/layout.js',
    'app/vendor/vibeoffice/quire/drawing.js',
    'app/vendor/vibeoffice/quire/editor.js',
    // fields.js binds L.layout and L.ed at load, so it follows layout.js and editor.js.
    'app/vendor/vibeoffice/quire/fields.js',
  ];

  let loadPromise = null;
  let editorPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('quire-adapter: failed to load ' + src));
      document.head.appendChild(el);
    });
  }

  /** Load the vendored Quire codec once. Rejects leave no partial retry state. */
  function loadCodec() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      for (const src of MODULES) await loadScript(src);
      const L = root.L;
      if (!L || !L.docx || typeof L.docx.read !== 'function' || typeof L.docx.write !== 'function') {
        throw new Error('quire-adapter: VibeOffice Quire codec incomplete after load');
      }
      return L;
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  /** Load the upstream contentEditable layer on top of the codec (fixture lab only). */
  function loadEditor() {
    if (editorPromise) return editorPromise;
    editorPromise = (async () => {
      const L = await loadCodec();
      for (const src of EDITOR_MODULES) await loadScript(src);
      if (!L.layout || !L.ed) throw new Error('quire-adapter: VibeOffice Quire editor incomplete after load');
      return L;
    })().catch((error) => {
      editorPromise = null;
      throw error;
    });
    return editorPromise;
  }

  function bytesEqual(a, b) {
    if (a === b) return true;
    if (!a || !b || a.byteLength !== b.byteLength) return false;
    const x = new Uint8Array(a);
    const y = new Uint8Array(b);
    for (let i = 0; i < x.length; i += 1) {
      if (x[i] !== y[i]) return false;
    }
    return true;
  }

  function cloneBytes(bytes) {
    return bytes.slice(0);
  }

  function isParagraph(block) {
    return !!block && block.t === 'p';
  }

  function runText(run) {
    return run && run.t === 'text' ? String(run.text || '') : '';
  }

  const IMAGE_TYPES = new Set(['img', 'shape', 'group', 'chart']);
  const blocked = (code, extra) => Object.assign({ status: 'blocked', code }, extra || {});

  function runKind(run) {
    if (!run) return 'other';
    if (run.t === 'text') return 'text';
    if (IMAGE_TYPES.has(run.t)) return 'image';
    if (run.t === 'tab' || run.t === 'br' || run.t === 'ptab') return 'break';
    if (L_isMarker(run)) return 'marker';
    return 'other';
  }
  // Zero-length items (comment ranges, bookmarks, field marks) carry no characters.
  function L_isMarker(run) {
    return ['cs', 'ce', 'bs', 'be', 'fb', 'fs', 'fe', 'perm', 'sdts', 'sdte'].includes(run.t);
  }

  function isoNow() {
    return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  }

  /* S11 M3 F3: an untouched drawing keeps its original bytes. The shared OPC writer
   * hoists every regenerated part's namespace declarations to the root (opc.js
   * K.hoistNamespaces), which strips an inner xmlns:wp / xmlns:a / xmlns:pic that
   * repeats a root binding. Here, after the writer is done, each <w:drawing> in a
   * written story part is put back to its original text when the two differ ONLY by
   * declarations that the written part's root already binds to the same URI — exactly
   * what hoisting removed, so the substitution never changes a name's meaning. A
   * drawing that was edited, renumbered or rebound does not match and stays as written. */
  const DRAWING_RE = /<w:drawing\b[\s\S]*?<\/w:drawing>/g;
  const DECL_RE = /\s+xmlns:([\w.-]+)\s*=\s*(["'])(.*?)\2/g;

  function rootBindings(xml) {
    const start = xml.search(/<(?![?!])/);
    if (start < 0) return null;
    const end = xml.indexOf('>', start);
    const open = xml.slice(start, end + 1);
    const out = new Map();
    for (const m of open.matchAll(DECL_RE)) out.set(m[1], m[3]);
    return out;
  }

  function hoistedForm(fragment, bindings) {
    return fragment.replace(DECL_RE, (all, prefix, quote, uri) => (bindings.get(prefix) === uri ? '' : all));
  }

  async function restoreUntouchedDrawings(L, originalBuffer, writtenBuffer) {
    const before = await L.zip.read(originalBuffer);
    const after = await L.zip.read(writtenBuffer);
    const files = [];
    let changed = false;
    for (const entry of new Set(after.values())) {
      if (entry.name.endsWith('/')) continue;
      let data = await entry.bytes();
      const source = /^word\/[^/]+\.xml$/.test(entry.name) ? before.get(entry.name) : null;
      if (source) {
        const xml = L.zip.decode(data);
        const bindings = xml.includes('<w:drawing') ? rootBindings(xml) : null;
        if (bindings) {
          const originals = new Map();
          for (const m of L.zip.decode(await source.bytes()).matchAll(DRAWING_RE)) {
            const key = hoistedForm(m[0], bindings);
            if (key !== m[0] && !originals.has(key)) originals.set(key, m[0]);
          }
          if (originals.size) {
            const next = xml.replace(DRAWING_RE, (written) => originals.get(written) || written);
            if (next !== xml) { data = L.zip.encode(next); changed = true; }
          }
        }
      }
      files.push({ name: entry.name, data });
    }
    if (!changed) return writtenBuffer;
    const blob = await L.zip.write(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    return blob.arrayBuffer();
  }

  /**
   * Open a native DOCX document.
   * @param {ArrayBuffer|Uint8Array} bytes the untouched original package bytes
   * @param {{name?:string, scopeId?:string, documentId?:string, generation?:number}} meta
   */
  async function open(bytes, meta = {}) {
    const L = await loadCodec();
    const D = L.D;
    const O = L.O;
    if (!O || typeof O.splitPara !== 'function') throw new Error('quire-adapter: VibeOffice Quire ops incomplete after load');
    const original = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes.slice(0);
    const read = await L.docx.read(cloneBytes(original), {});
    const doc = read.doc;
    if (!doc || !doc.main || !Array.isArray(doc.main.blocks)) {
      throw new Error('quire-adapter: document body missing after read');
    }
    // ONE dirty source: isDirty() = editRevision !== savedRevision. "Ever edited"
    // (editRevision > 0) decides save mode and never goes back to false: an undo to the
    // saved state is still an edit.
    let editRevision = 0;
    let savedRevision = 0;
    let encodeMemo = null; // { revision, bytes }
    const touchedRuns = []; // { paragraphId, runIndex, before, after }
    // The vendored model keeps ONE global document and ONE global history (D.doc, D.hist).
    // Each adapter owns its own history slice and swaps it in around every operation, so
    // D.doc is bound from open() on (not only inside save) and two documents never share undo.
    let hist = null;
    const bind = () => { D.doc = doc; D.setHistState(hist); };
    bind();
    hist = D.histState();
    let knownSeq = D.hist.seq;
    // One place counts an edit: the model's history sequence moved. The upstream editor
    // layer (fixture lab) edits the same model outside this adapter, so it reports in
    // through syncExternal() and the revision is still counted exactly once.
    function noteSeq() {
      if (D.hist.seq === knownSeq) return false;
      knownSeq = D.hist.seq;
      editRevision += 1;
      encodeMemo = null;
      return true;
    }

    const mainBlocks = () => (Array.isArray(doc.main.blocks) ? doc.main.blocks : []);
    const paragraphsOf = (story) => (story && Array.isArray(story.blocks) ? story.blocks : []);

    /** Run one model transaction. Counts an edit only when the model recorded a change. */
    function transact(label, fn) {
      bind();
      let result;
      try {
        result = D.tx(label, fn);
      } finally {
        hist = D.histState();
      }
      noteSeq();
      return result;
    }

    /** Resolve an id to a main-story paragraph, or the read-only refusal for a table. */
    function target(id) {
      bind();
      const key = Number(id);
      const info = D.info(doc, key);
      if (info && info.story === doc.main) {
        if (info.parents && info.parents.length) return { blocked: blocked('READ_ONLY_TABLE', { id: String(id) }) };
        return { p: info.p, info };
      }
      if (doc._tbls && doc._tbls.get(key)) return { blocked: blocked('READ_ONLY_TABLE', { id: String(id) }) };
      throw new Error('quire-adapter: unknown paragraph ' + id);
    }

    function resolved(p, run) {
      return D.rProps(doc, p, run && run.t === 'text' ? run : null, null);
    }
    const isOn = (key, r) => (key === 'u' ? !!r.u && r.u !== 'none' : !!r[key]);

    function listOf(p) {
      const pp = D.pProps(doc, p, null);
      const num = pp.num;
      if (!num || !num.id || num.id === '0') return null;
      const lvl = num.lvl || 0;
      const def = D.numLevelDef(doc, num.id, lvl);
      return { kind: def && def.fmt === 'bullet' ? 'bullet' : 'number', level: lvl, numId: String(num.id) };
    }

    function runView(p, run, runIndex) {
      const kind = runKind(run);
      const out = { runIndex, text: runText(run), kind };
      if (kind === 'text') {
        const r = resolved(p, run);
        out.b = isOn('b', r);
        out.i = isOn('i', r);
        out.u = isOn('u', r);
      } else if (kind === 'image') {
        out.readOnly = true;
      }
      return out;
    }

    function paragraphView(p, index) {
      return {
        id: String(p.id),
        index,
        kind: 'paragraph',
        text: p.runs.map(runText).join(''),
        headingLevel: D.headingLevel(doc, p),
        list: listOf(p),
        runs: p.runs.map((run, runIndex) => runView(p, run, runIndex)),
      };
    }

    function tableView(t) {
      return {
        id: String(t.id),
        kind: 'table',
        readOnly: true,
        rows: t.rows.map((row) => row.cells.map((cell) => ({
          text: cell.blocks.filter(isParagraph).map((q) => q.runs.map(runText).join('')).join('\n'),
          paragraphIds: cell.blocks.filter(isParagraph).map((q) => String(q.id)),
        }))),
      };
    }

    /** Walk the paragraph's characters: [{ item, start, end }] for items with length. */
    function spans(p) {
      const out = [];
      let at = 0;
      for (const item of p.runs) {
        const n = D.ilen(item);
        if (n) out.push({ item, start: at, end: at + n });
        at += n;
      }
      return out;
    }

    function anchorOf(id) {
      const key = String(id);
      let start = null; // { p, from }
      for (const p of D.allParas(doc)) {
        let at = 0;
        for (const item of p.runs) {
          if (!start && item.t === 'cs' && String(item.id) === key) start = { p, from: at };
          else if (start && item.t === 'ce' && String(item.id) === key) {
            const same = start.p === p;
            return {
              paragraphId: String(start.p.id), from: start.from, to: same ? at : D.plen(start.p),
              endParagraphId: String(p.id), quote: same ? D.ptext(p, start.from, at) : D.ptext(start.p, start.from),
            };
          }
          at += D.ilen(item);
        }
      }
      return start ? { paragraphId: String(start.p.id), from: start.from, to: D.plen(start.p), endParagraphId: String(start.p.id), quote: D.ptext(start.p, start.from) } : null;
    }

    function initialsOf(who) {
      const latin = (who.match(/\b[A-Za-z]/g) || []).join('').slice(0, 3).toUpperCase();
      return latin || Array.from(who).slice(0, 1).join('');
    }

    function nextCommentId() {
      let n = 0;
      while (doc.comments[String(n)] != null) n += 1;
      return String(n);
    }

    function ensureCommentStyles() {
      if (!doc.styles.CommentText || !doc.styles.CommentReference) {
        D.touchKey(doc, 'styles');
        const built = D.builtinStyles();
        doc.styles.CommentText = doc.styles.CommentText || built.CommentText;
        doc.styles.CommentReference = doc.styles.CommentReference || built.CommentReference;
        D.stylesChanged();
      }
    }

    function commentBody(text) {
      return D.para([D.text(String(text), {})], { style: 'CommentText' });
    }

    function afterHistory(entry, label) {
      hist = D.histState();
      noteSeq();
      const changed = [];
      for (const [obj, e] of entry.objs) if (e.k === 'p') changed.push(String(obj.id));
      return { label, changed, structural: !!entry.struct, global: !!(entry.global || entry.full) };
    }

    function ensureStyle(styleId) {
      if (doc.styles[styleId]) return;
      const built = D.builtinStyles()[styleId];
      if (!built) throw new Error('quire-adapter: no built-in style ' + styleId);
      D.touchKey(doc, 'styles');
      doc.styles[styleId] = built;
      D.stylesChanged();
    }

    function numberingIsKind(numId, kind) {
      const def = D.numLevelDef(doc, numId, 0);
      if (!def) return false;
      return kind === 'bullet' ? def.fmt === 'bullet' : def.fmt !== 'bullet' && def.fmt !== 'none';
    }

    /** The numId a new list of this kind should use; creates the definition when needed. */
    function listNumId(kind) {
      D.touchKey(doc, 'numbering');
      const nb = doc.numbering;
      if (kind === 'bullet') {
        for (const id of Object.keys(nb.nums)) if (numberingIsKind(id, 'bullet')) return id;
        const b = D.BULLET_CHARS[0];
        return D.addNum(doc, D.makeBulletAbs(b[0], b[1], b[2]));
      }
      // A numbered list restarts at 1: reuse a decimal definition with a fresh instance.
      for (const id of Object.keys(nb.nums)) {
        const def = D.numLevelDef(doc, id, 0);
        if (def && def.fmt === 'decimal') return D.addNumInstance(doc, nb.nums[id].abs, true);
      }
      return D.addNum(doc, D.makeNumberAbs('decimal', '%1.'));
    }

    function lossKind(entry) {
      const id = String(entry.id || '');
      if (/^object:/.test(id)) return 'object';
      if (/^table-grid:/.test(id)) return 'table';
      if (/^range:/.test(id)) return 'range';
      if (/^part:/.test(id)) return 'part';
      if (/^signature:/.test(id)) return 'signature';
      if (/^property:/.test(id)) return 'formatting';
      if (/^content:/.test(id)) return 'content';
      return 'other';
    }

    /* The writer-facing half of a loss entry (the codec's own detail is English and names parts):
       `subject` says WHAT in a finer grain than `kind`; `place` says WHERE — a body paragraph by its
       1-based number and the start of its text, a table, or a named part — or null for the whole file. */
    function lossSubject(entry) {
      const id = String(entry.id || '');
      if (/^table-grid:/.test(id)) return { subject: 'table-widths' };
      if (/^range:(bs|be):/.test(id)) return { subject: 'bookmark' };
      if (/^content:.*:bookmarks$/.test(id)) {
        const n = /\((\d+)\)/.exec(String(entry.what || ''));
        return { subject: 'bookmarks', count: n ? Number(n[1]) : 0 };
      }
      return {};
    }
    function lossPlace(entry) {
      const id = String(entry.id || '');
      if (/^table-grid:/.test(id)) return { type: 'table' };
      const hit = /^range:([a-z]+):[^:]*:(.+):([^:]+)$/.exec(id);
      if (hit) {
        const [, token, partPath, rid] = hit;
        if (partPath !== 'word/document.xml') return partPlace(partPath);
        const owns = (p) => p.runs.some((run) => run && run.t === token && String(run.id) === rid);
        let n = 0;
        for (const block of mainBlocks()) {
          if (isParagraph(block)) {
            n += 1;
            if (owns(block)) {
              const text = block.runs.map(runText).join('').trim();
              return { type: 'paragraph', n, quote: text.length > 12 ? text.slice(0, 12) + '…' : text };
            }
          } else if (block.t === 'tbl' && block.rows.some((row) => row.cells.some((cell) => cell.blocks.some((q) => isParagraph(q) && owns(q))))) {
            return { type: 'table' };
          }
        }
        return null;
      }
      const part = /^(?:part|object|signature|property):(.+)$/.exec(id);
      return part ? partPlace(part[1]) : null;
    }
    function partPlace(path) {
      const name = /(header|footer|footnotes|endnotes|comments)/.exec(String(path));
      return name ? { type: 'part', part: name[1] } : null;
    }

    async function encodeCurrent() {
      if (encodeMemo && encodeMemo.revision === editRevision) return encodeMemo;
      const rev = editRevision; // taken before the await: an edit during the encode must leave the memo stale
      bind();
      const blob = await L.docx.write(doc, { format: 'docx' });
      const buffer = await restoreUntouchedDrawings(L, original, await blob.arrayBuffer());
      const memo = { revision: rev, bytes: buffer };
      if (rev === editRevision) encodeMemo = memo;
      return memo;
    }

    const api = {
      kind: 'docx',
      name: meta.name || 'document.docx',
      scopeId: meta.scopeId || '',
      documentId: meta.documentId || '',
      generation: Number.isSafeInteger(meta.generation) ? meta.generation : 1,

      /** The single dirty source: the revision moved since the last markSaved(). */
      isDirty: () => editRevision !== savedRevision,
      // The saved revision is the one that was encoded; edits made while the save ran
      // keep the document dirty.
      markSaved(revision) { savedRevision = Number.isSafeInteger(revision) ? revision : editRevision; },
      getEditRevision: () => editRevision,

      /** The editor layer changed the shared model: take its history and count the edit once. */
      syncExternal() {
        if (D.doc !== doc) return false;
        hist = D.histState();
        return noteSeq();
      },

      document: () => doc,
      warnings: () => (Array.isArray(read.warnings) ? read.warnings.slice() : []),

      /** Paragraph identities over the main story (stable dmodel ids, as strings). */
      paragraphs() {
        return paragraphsOf(doc.main).filter(isParagraph).map((p, index) => paragraphView(p, index));
      },

      /** Every top-level block in order: paragraphs and (read-only) tables. */
      blocks() {
        let index = 0;
        return mainBlocks().map((b) => (isParagraph(b) ? paragraphView(b, index++) : b.t === 'tbl' ? tableView(b) : { id: String(b.id), kind: 'other', readOnly: true }));
      },

      tables: () => mainBlocks().filter((b) => b.t === 'tbl').map(tableView),

      /** Runs of one paragraph (by stable id), exact order, with resolved b/i/u. */
      runs(paragraphId) {
        const p = paragraphsOf(doc.main).find((block) => isParagraph(block) && String(block.id) === String(paragraphId));
        if (!p) throw new Error('quire-adapter: unknown paragraph ' + paragraphId);
        return p.runs.map((run, runIndex) => runView(p, run, runIndex));
      },

      /** Comments with thread parent and where they sit in the body. */
      comments() {
        bind();
        return Object.keys(doc.comments || {}).map((id) => {
          const c = doc.comments[id];
          return {
            id,
            parentId: c.parent != null ? String(c.parent) : null,
            author: c.author || '',
            initials: c.initials || '',
            date: c.date || '',
            done: !!c.done,
            text: (c.blocks || []).map((b) => (isParagraph(b) ? b.runs.map(runText).join('') : '')).join(''),
            anchor: anchorOf(id),
          };
        });
      },

      /** Edit exactly one run's text as one undo step; everything else is untouched. */
      setRunText(paragraphId, runIndex, text) {
        const t = target(paragraphId);
        if (t.blocked) return t.blocked;
        const p = t.p;
        const run = p.runs[runIndex];
        if (!run) throw new Error('quire-adapter: paragraph ' + paragraphId + ' has no run ' + runIndex);
        if (runKind(run) === 'image') return blocked('READ_ONLY_IMAGE', { paragraphId: String(paragraphId), runIndex });
        if (run.t !== 'text') throw new Error('quire-adapter: paragraph ' + paragraphId + ' run ' + runIndex + ' is not a text run');
        const before = runText(run);
        const after = String(text);
        if (before === after) return { paragraphId, runIndex, before, after };
        transact('Typing', () => { D.touch(p); run.text = after; });
        touchedRuns.push({ paragraphId, runIndex, before, after });
        return { paragraphId, runIndex, before, after };
      },

      touched: () => touchedRuns.slice(),

      /** Split a paragraph at a character offset; the tail becomes a new paragraph. */
      splitParagraph(paragraphId, offset) {
        const t = target(paragraphId);
        if (t.blocked) return t.blocked;
        const o = Number(offset);
        if (!Number.isInteger(o) || o < 0 || o > D.plen(t.p)) return blocked('BAD_OFFSET');
        let np = null;
        transact('Split Paragraph', () => { np = O.splitPara(D.pos(t.p, o)).p; });
        return { paragraphId: String(paragraphId), newParagraphId: String(np.id) };
      },

      /** Join a paragraph with the paragraph that follows it. */
      mergeParagraph(paragraphId) {
        const t = target(paragraphId);
        if (t.blocked) return t.blocked;
        const blocks = t.info.cont.blocks;
        const next = blocks[blocks.indexOf(t.p) + 1];
        if (!next) return blocked('NO_NEXT_PARAGRAPH');
        if (next.t === 'tbl') return blocked('READ_ONLY_TABLE', { id: String(next.id) });
        if (next.t !== 'p') return blocked('NEXT_NOT_PARAGRAPH');
        const removedId = String(next.id);
        transact('Join Paragraphs', () => { O.joinNext(t.p); });
        return { paragraphId: String(paragraphId), removedId };
      },

      /** Heading level 1-3, or 0 for body text. */
      setHeading(paragraphId, level) {
        const t = target(paragraphId);
        if (t.blocked) return t.blocked;
        const n = Number(level);
        if (![0, 1, 2, 3].includes(n)) return blocked('BAD_LEVEL');
        if (D.headingLevel(doc, t.p) === n) return { paragraphId: String(paragraphId), level: n };
        transact(n ? 'Heading ' + n : 'Body Text', () => {
          const styleId = n ? 'Heading' + n : 'Normal';
          ensureStyle(styleId);
          O.applyStyle(D.pos(t.p, 0), D.pos(t.p, 0), styleId);
        });
        return { paragraphId: String(paragraphId), level: n };
      },

      /** Toggle bold / italic / underline over a character range (default: whole paragraph). */
      toggleRunStyle(paragraphId, key, range) {
        const t = target(paragraphId);
        if (t.blocked) return t.blocked;
        if (!['b', 'i', 'u'].includes(key)) return blocked('BAD_STYLE_KEY');
        const p = t.p;
        const len = D.plen(p);
        const from = range && Number.isInteger(range.from) ? range.from : 0;
        const to = range && Number.isInteger(range.to) ? range.to : len;
        if (from < 0 || to > len || from >= to) return blocked('BAD_RANGE');
        const inside = spans(p).filter((s) => s.start < to && s.end > from);
        if (inside.some((s) => IMAGE_TYPES.has(s.item.t))) return blocked('READ_ONLY_IMAGE');
        const everyOn = inside.length > 0 && inside.every((s) => isOn(key, resolved(p, s.item)));
        const want = !everyOn;
        transact((want ? 'Apply ' : 'Remove ') + ({ b: 'Bold', i: 'Italic', u: 'Underline' })[key], () => {
          const a = D.pos(p, from);
          const b = D.pos(p, to);
          O.setRunProps(a, b, { [key]: want ? (key === 'u' ? 'single' : true) : undefined });
          if (!want && spans(p).some((s) => s.start < to && s.end > from && isOn(key, resolved(p, s.item)))) {
            // The paragraph style still supplies it: say "off" explicitly.
            O.setRunProps(a, b, { [key]: key === 'u' ? 'none' : false });
          }
        });
        return { paragraphId: String(paragraphId), key, on: want, from, to };
      },

      /** Bullet list, numbered list, or none; one id or an array of ids as one list. */
      setList(paragraphIds, kind) {
        if (!['bullet', 'number', 'none'].includes(kind)) return blocked('BAD_LIST_KIND');
        const ids = Array.isArray(paragraphIds) ? paragraphIds : [paragraphIds];
        const targets = [];
        for (const id of ids) {
          const t = target(id);
          if (t.blocked) return t.blocked;
          targets.push(t.p);
        }
        const current = targets.map(listOf);
        if (kind === 'none' ? current.every((c) => !c) : current.every((c) => c && c.kind === kind)) {
          return { paragraphIds: ids.map(String), kind };
        }
        transact(kind === 'none' ? 'Remove List' : kind === 'bullet' ? 'Bullets' : 'Numbering', () => {
          if (kind === 'none') {
            O.setParaProps(targets, (pPr) => {
              delete pPr.num;
              const styled = D.styleProps(doc, pPr.style || 'Normal').pPr.num;
              if (styled && styled.id && styled.id !== '0') pPr.num = { id: '0', lvl: 0 };
              return pPr;
            });
            return;
          }
          const numId = listNumId(kind);
          O.setParaProps(targets, (pPr) => {
            pPr.num = { id: numId, lvl: (pPr.num && pPr.num.lvl) || 0 };
            return pPr;
          });
        });
        return { paragraphIds: ids.map(String), kind };
      },

      /** New comment on a character range of one paragraph. */
      addComment(paragraphId, range, { author = '', text = '', date = '', initials = '' } = {}) {
        const t = target(paragraphId);
        if (t.blocked) return t.blocked;
        const p = t.p;
        const len = D.plen(p);
        const from = range && Number.isInteger(range.from) ? range.from : 0;
        const to = range && Number.isInteger(range.to) ? range.to : len;
        if (from < 0 || to > len || from > to) return blocked('BAD_RANGE');
        if (!String(text).trim()) return blocked('EMPTY_COMMENT');
        const id = nextCommentId();
        transact('Insert Comment', () => {
          D.touchKey(doc, 'comments');
          ensureCommentStyles();
          const who = String(author);
          doc.comments[id] = {
            kind: 'cmt', id, author: who, initials: initials || initialsOf(who),
            date: String(date || isoNow()), blocks: [commentBody(text)],
          };
          D.touch(p);
          p.runs.splice(D.splitAt(p, to), 0, D.item('ce', { id }));
          p.runs.splice(D.splitAt(p, from), 0, D.item('cs', { id }));
          doc._idxDirty = true;
        });
        return { id, anchor: anchorOf(id) };
      },

      /** Reply into a thread; a reply to a reply joins the root's thread. */
      replyComment(commentId, { author = '', text = '', date = '', initials = '' } = {}) {
        bind();
        const parent = doc.comments[String(commentId)];
        if (!parent) return blocked('NO_SUCH_COMMENT');
        if (!String(text).trim()) return blocked('EMPTY_COMMENT');
        const rootId = parent.parent != null && doc.comments[String(parent.parent)] ? String(parent.parent) : String(commentId);
        const id = nextCommentId();
        transact('Reply to Comment', () => {
          D.touchKey(doc, 'comments');
          ensureCommentStyles();
          const who = String(author);
          doc.comments[id] = {
            kind: 'cmt', id, author: who, initials: initials || initialsOf(who),
            date: String(date || isoNow()), blocks: [commentBody(text)], parent: rootId,
          };
          // The reply shares the root's range.
          D.walk(doc.main, (b) => {
            if (b.t !== 'p') return;
            let changed = false;
            const out = [];
            for (const it of b.runs) {
              out.push(it);
              if ((it.t === 'cs' || it.t === 'ce') && String(it.id) === rootId) { out.push(D.item(it.t, { id })); changed = true; }
            }
            if (changed) { D.touch(b); b.runs = out; }
          });
          doc._idxDirty = true;
        });
        return { id, parentId: rootId };
      },

      setCommentDone(commentId, done) {
        bind();
        const c = doc.comments[String(commentId)];
        if (!c) return blocked('NO_SUCH_COMMENT');
        const value = !!done;
        if (!!c.done === value) return { id: String(commentId), done: value };
        transact(value ? 'Resolve Comment' : 'Reopen Comment', () => {
          D.touchKey(c, 'done');
          c.done = value;
        });
        return { id: String(commentId), done: value };
      },

      /* ---------------------------------------------------------------- undo */
      canUndo: () => { bind(); return D.canUndo(); },
      canRedo: () => { bind(); return D.canRedo(); },
      undoLabel: () => { bind(); return D.canUndo() ? D.undoLabel() : ''; },
      redoLabel: () => { bind(); return D.canRedo() ? D.redoLabel() : ''; },
      undo() {
        bind();
        if (!D.canUndo()) return { changed: [] };
        const entry = D.hist.undo[D.hist.undo.length - 1];
        const label = D.undoLabel();
        D.undo();
        return afterHistory(entry, label);
      },
      redo() {
        bind();
        if (!D.canRedo()) return { changed: [] };
        const entry = D.hist.redo[D.hist.redo.length - 1];
        const label = D.redoLabel();
        D.redo();
        return afterHistory(entry, label);
      },

      /**
       * Serialize. Never edited: byte-identical pass-through (original-bytes). Edited:
       * Quire preserving writer, same package variant as the input. Consecutive calls at
       * the same revision share one encode.
       */
      async save() {
        // A save is an undo boundary: the model merges a run of typing into one step, and
        // typing after this point must not join the step being saved (S11-C2).
        bind();
        const last = D.hist.undo[D.hist.undo.length - 1];
        if (last) last.merge = null;
        hist = D.histState();
        if (editRevision === 0) return { bytes: cloneBytes(original), mode: 'original-bytes' };
        const out = await encodeCurrent();
        return { bytes: out.bytes.slice(0), mode: 'preserving-edit' };
      },

      /**
       * What saving the current model would convert or lose, from the encode path
       * itself: { converted: [...], lost: [...] }. Never edited: save() hands back the
       * original bytes, so nothing is converted or lost.
       */
      async exportReport() {
        const report = { converted: [], lost: [] };
        if (editRevision === 0) return report;
        await encodeCurrent();
        const seen = new Set();
        for (const entry of Array.isArray(doc.losses) ? doc.losses : []) {
          if (entry.phase && entry.phase !== 'save') continue;
          if (entry.action !== 'conversion' && entry.action !== 'drop') continue;
          const kind = lossKind(entry);
          const key = entry.action + '|' + String(entry.id || '');
          if (seen.has(key)) continue;
          seen.add(key);
          const item = { kind, what: kind, where: String(entry.where || ''), detail: String(entry.what || ''), id: String(entry.id || ''), ...lossSubject(entry), place: lossPlace(entry) };
          (entry.action === 'drop' ? report.lost : report.converted).push(item);
        }
        return report;
      },

      /** Feature/loss ledger as the codec reports it. */
      losses: () => (Array.isArray(doc.losses) ? doc.losses.slice() : []),

      originalBytes: () => cloneBytes(original),
      originalBytesEqual: (candidate) => bytesEqual(original, candidate),
    };
    return api;
  }

  root.ClioWorksQuireAdapter = Object.freeze({ open, loadCodec, loadEditor, MODULES: MODULES.slice(), EDITOR_MODULES: EDITOR_MODULES.slice() });
})(typeof window !== 'undefined' ? window : globalThis);
