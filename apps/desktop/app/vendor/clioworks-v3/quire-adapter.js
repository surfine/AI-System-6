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
    'app/vendor/vibeoffice/quire/omml.js',
    'app/vendor/vibeoffice/quire/render.js',
    'app/vendor/vibeoffice/quire/preserve.js',
    'app/vendor/vibeoffice/quire/preserve-drawing.js',
    'app/vendor/vibeoffice/quire/fields.js',
    'app/vendor/vibeoffice/quire/docx-read.js',
    'app/vendor/vibeoffice/quire/docx-write.js',
  ];

  let loadPromise = null;

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

  /**
   * Open a native DOCX document.
   * @param {ArrayBuffer|Uint8Array} bytes the untouched original package bytes
   * @param {{name?:string, scopeId?:string, documentId?:string, generation?:number}} meta
   */
  async function open(bytes, meta = {}) {
    const L = await loadCodec();
    const original = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes.slice(0);
    const read = await L.docx.read(cloneBytes(original), {});
    const doc = read.doc;
    if (!doc || !doc.main || !Array.isArray(doc.main.blocks)) {
      throw new Error('quire-adapter: document body missing after read');
    }
    let dirty = false;
    let editRevision = 0;
    const touchedRuns = []; // { paragraphId, runIndex, before, after }

    const paragraphsOf = (story) => (story && Array.isArray(story.blocks) ? story.blocks : []);

    const api = {
      kind: 'docx',
      name: meta.name || 'document.docx',
      scopeId: meta.scopeId || '',
      documentId: meta.documentId || '',
      generation: Number.isSafeInteger(meta.generation) ? meta.generation : 1,

      /** True when no edit has touched the model; save() then returns original bytes. */
      isDirty: () => dirty,
      getEditRevision: () => editRevision,

      document: () => doc,
      warnings: () => (Array.isArray(read.warnings) ? read.warnings.slice() : []),

      /** Paragraph identities over the main story (stable dmodel ids, as strings). */
      paragraphs() {
        return paragraphsOf(doc.main)
          .filter(isParagraph)
          .map((p, index) => ({ id: String(p.id), index, text: p.runs.map(runText).join('') }));
      },

      /** Text runs of one paragraph (by stable id), exact order. */
      runs(paragraphId) {
        const p = paragraphsOf(doc.main).find((block) => isParagraph(block) && String(block.id) === String(paragraphId));
        if (!p) throw new Error('quire-adapter: unknown paragraph ' + paragraphId);
        return p.runs.map((run, runIndex) => ({ runIndex, text: runText(run) }));
      },

      comments() {
        const out = [];
        const comments = doc.comments || {};
        for (const id of Object.keys(comments)) {
          const c = comments[id];
          out.push({
            id,
            author: c.author || '',
            initials: c.initials || '',
            date: c.date || '',
            done: !!c.done,
            text: (c.blocks || []).map((b) => (isParagraph(b) ? b.runs.map(runText).join('') : '')).join(''),
          });
        }
        return out;
      },

      /** Edit exactly one run's text; everything else in the model is untouched. */
      setRunText(paragraphId, runIndex, text) {
        const p = paragraphsOf(doc.main).find((block) => isParagraph(block) && String(block.id) === String(paragraphId));
        if (!p) throw new Error('quire-adapter: unknown paragraph ' + paragraphId);
        const run = p.runs[runIndex];
        if (!run || run.t !== 'text') throw new Error('quire-adapter: paragraph ' + paragraphId + ' run ' + runIndex + ' is not a text run');
        const before = runText(run);
        run.text = String(text);
        dirty = true;
        editRevision += 1;
        touchedRuns.push({ paragraphId, runIndex, before, after: run.text });
        return { paragraphId, runIndex, before, after: run.text };
      },

      touched: () => touchedRuns.slice(),

      /**
       * Serialize. Unmodified: byte-identical pass-through. Modified: Quire
       * preserving writer, same package variant as the input.
       */
      async save() {
        if (!dirty) return { bytes: cloneBytes(original), mode: 'original-bytes' };
        L.D.doc = doc;
        const blob = await L.docx.write(doc, { format: 'docx' });
        const buffer = await blob.arrayBuffer();
        return { bytes: buffer, mode: 'preserving-edit' };
      },

      /** Feature/loss ledger as the codec reports it. */
      losses: () => (Array.isArray(doc.losses) ? doc.losses.slice() : []),

      originalBytes: () => cloneBytes(original),
      originalBytesEqual: (candidate) => bytesEqual(original, candidate),
    };
    return api;
  }

  root.ClioWorksQuireAdapter = Object.freeze({ open, loadCodec, MODULES: MODULES.slice() });
})(typeof window !== 'undefined' ? window : globalThis);
