/* ClioWorks v4 (V4-01): native PPTX open/edit/save adapter around the vendored
 * VibeOffice Lectern codec (apps/desktop/app/vendor/vibeoffice/, Apache-2.0,
 * pinned upstream 4c011173838de5d65e8ea0407684ba820a277273).
 *
 * Contract (INTEROPERABILITY.zh-CN) — same shape as the Ledger/Quire adapters:
 *  - Unchanged bytes pass through untouched: save() returns the original
 *    ArrayBuffer when the presentation was never modified (original-bytes mode).
 *  - After a real edit, the Lectern preserving writer rebuilds only owned parts
 *    (slides, presentation-level rels); media, theme, layouts, masters and notes
 *    slides keep original bytes (preserving-edit).
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
    'app/vendor/vibeoffice/lectern/model.js',
    'app/vendor/vibeoffice/lectern/comments.js',
    'app/vendor/vibeoffice/lectern/designs.js',
    'app/vendor/vibeoffice/lectern/frames.js',
    'app/vendor/vibeoffice/lectern/properties.js',
    'app/vendor/vibeoffice/lectern/slideshow.js',
    'app/vendor/vibeoffice/lectern/preserve.js',
    'app/vendor/vibeoffice/lectern/pptx-read.js',
    'app/vendor/vibeoffice/lectern/pptx-write.js',
  ];

  let loadPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('lectern-adapter: failed to load ' + src));
      document.head.appendChild(el);
    });
  }

  /** Load the vendored Lectern codec once. Rejects leave no partial retry state. */
  function loadCodec() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      for (const src of MODULES) await loadScript(src);
      const L = root.L;
      if (!L || !L.pptx || typeof L.pptx.read !== 'function' || typeof L.pptx.write !== 'function') {
        throw new Error('lectern-adapter: VibeOffice Lectern codec incomplete after load');
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

  function slideRuns(slide) {
    const out = [];
    const shapes = (slide && Array.isArray(slide.shapes)) ? slide.shapes : [];
    for (const shape of shapes) {
      const ps = shape && shape.tx && Array.isArray(shape.tx.ps) ? shape.tx.ps : [];
      for (const para of ps) {
        const rs = Array.isArray(para.rs) ? para.rs : [];
        for (const run of rs) {
          if (run && typeof run.t === 'string') {
            out.push({ shapeId: shape.id, shapeName: shape.name || '', run });
          }
        }
      }
    }
    return out;
  }

  /**
   * Open a native PPTX presentation.
   * @param {ArrayBuffer|Uint8Array} bytes the untouched original package bytes
   * @param {{name?:string, scopeId?:string, documentId?:string, generation?:number}} meta
   */
  async function open(bytes, meta = {}) {
    const L = await loadCodec();
    const original = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes.slice(0);
    const doc = await L.pptx.read(cloneBytes(original));
    if (!doc || !Array.isArray(doc.slides)) {
      throw new Error('lectern-adapter: presentation model missing after read');
    }
    let dirty = false;
    let editRevision = 0;
    const touchedRuns = [];

    const api = {
      kind: 'pptx',
      name: meta.name || 'presentation.pptx',
      scopeId: meta.scopeId || '',
      documentId: meta.documentId || '',
      generation: Number.isSafeInteger(meta.generation) ? meta.generation : 1,

      /** True when no edit has touched the model; save() then returns original bytes. */
      isDirty: () => dirty,
      getEditRevision: () => editRevision,

      presentation: () => doc,
      slideCount: () => doc.slides.length,

      /** Slide identities with their text runs (stable shape ids, exact order). */
      runs(slideIndex) {
        const slide = doc.slides[slideIndex];
        if (!slide) throw new Error('lectern-adapter: unknown slide index ' + slideIndex);
        return slideRuns(slide).map((entry, i) => ({ index: i, shapeId: entry.shapeId, shapeName: entry.shapeName, text: entry.run.t }));
      },

      /** Speaker notes text of a slide (never shown on the audience screen). */
      notes(slideIndex) {
        const slide = doc.slides[slideIndex];
        if (!slide) throw new Error('lectern-adapter: unknown slide index ' + slideIndex);
        return typeof slide.notes === 'string' ? slide.notes : '';
      },

      /** Edit exactly one run's text; everything else in the model is untouched. */
      setRunText(slideIndex, runListIndex, text) {
        const slide = doc.slides[slideIndex];
        if (!slide) throw new Error('lectern-adapter: unknown slide index ' + slideIndex);
        const entry = slideRuns(slide)[runListIndex];
        if (!entry) throw new Error('lectern-adapter: slide ' + slideIndex + ' has no run ' + runListIndex);
        const before = entry.run.t;
        entry.run.t = String(text);
        dirty = true;
        editRevision += 1;
        touchedRuns.push({ slideIndex, runListIndex, shapeId: entry.shapeId, before, after: entry.run.t });
        return { slideIndex, runListIndex, shapeId: entry.shapeId, before, after: entry.run.t };
      },

      touched: () => touchedRuns.slice(),

      /**
       * Serialize. Unmodified: byte-identical pass-through. Modified: Lectern
       * preserving writer, same package variant as the input.
       */
      async save() {
        if (!dirty) return { bytes: cloneBytes(original), mode: 'original-bytes' };
        L.pres = doc;
        if (L.hist && typeof L.hist.clear === 'function') L.hist.clear();
        const blob = await L.pptx.write(doc, { format: 'pptx' });
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

  root.ClioWorksLecternAdapter = Object.freeze({ open, loadCodec, MODULES: MODULES.slice() });
})(typeof window !== 'undefined' ? window : globalThis);
