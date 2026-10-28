/* ClioWrite font-substitution note (N12): what a docx names that this machine
 * cannot draw itself, what draws each one instead, and the line height the
 * layout pins to the REQUESTED font (SUITE-6, quire/render.js's
 * R.fontSubstitutions). The display reads of that data live here so the
 * ClioWrite status note, Get Info's 「字体」 row and N2b's print preview
 * speak the same words. Like clio-write-review.js this file holds no model
 * code: substitutions() reads the codec already in memory (root.L.R), and
 * officeNote(item) reads only what the session already holds. Loaded lazily —
 * it rides config.js's ClioWrite loader; Get Info calls it only when it is
 * already loaded (its cheap sources exist only then). */
(function (root) {
  'use strict';
  if (root.AISystem6ClioWriteFonts) return;

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);

  /* R.fontSubstitutions through the loaded codec; null when the codec (and so
     the real availability check) is not in memory. `available` passes through
     so tests can inject what this machine has. */
  function substitutions(doc, available) {
    const R = root.L && root.L.R;
    if (!doc || !R || typeof R.fontSubstitutions !== 'function') return null;
    try { return R.fontSubstitutions(doc, available) || []; } catch (error) { console.warn('ClioWrite fonts:', error); return null; }
  }

  /* One display row per substituted font: 「宋体 → 由 Songti SC 代为显示（行高按宋体度量）」. */
  function rows(subs) {
    return (Array.isArray(subs) ? subs : []).map((sub) => ({
      requested: sub.requested,
      used: sub.used,
      text: tr('clio_write_fonts_row', sub.requested, sub.used),
    }));
  }

  /* The one-line count: 「2 种字体由本机字体代替」; nothing when none. */
  function summary(subs) {
    const count = Array.isArray(subs) ? subs.length : 0;
    return count ? tr('clio_write_fonts_summary', count) : '';
  }

  /* The note the three readers draw: null when no font was substituted. */
  function note(subs) {
    const count = Array.isArray(subs) ? subs.length : 0;
    if (!count) return null;
    return { count, summary: summary(subs), rows: rows(subs) };
  }

  /* A document big enough that parsing it just to name a Get Info row would be
     a real cost; below this the record's own in-memory bytes are cheap. */
  const CHEAP_BYTES = 1024 * 1024;

  /* Get Info's sources, in order. Nothing here fetches, loads the codec or
     reads the store just for the note:
     1. the parsed model this session already holds — record.liveAdapter, the
        document open in ClioWrite (or one whose live model is still cached);
     2. the record's own in-memory bytes while the codec is ALREADY loaded and
        the file is small — one bounded parse of bytes in RAM.
     Otherwise null: Get Info shows no fonts row at all. `available` passes
     through to the availability check (the browser's own probe in prod, an
     injection in tests). */
  async function officeNote(item, available) {
    const store = root.AISystem6NativeBinaries;
    if (!item || !store || typeof store.projectHandle !== 'function' || typeof store.recordFor !== 'function') return null;
    const handle = item.nativeDocumentId ? store.projectHandle(item.id) : String(item.mountedName || '');
    const record = handle ? store.recordFor(handle) : null;
    if (!record) return null;
    if (record.liveAdapter && typeof record.liveAdapter.document === 'function') {
      return note(substitutions(record.liveAdapter.document(), available));
    }
    const L = root.L;
    const bytes = record.working || record.original || null;
    if (!bytes || !L || !L.R || typeof L.R.fontSubstitutions !== 'function' || !(L.docx && typeof L.docx.read === 'function')) return null;
    if (Number(record.byteLength || bytes.byteLength || 0) > CHEAP_BYTES) return null;
    try {
      const read = await L.docx.read(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {});
      return note(substitutions(read && read.doc, available));
    } catch (error) { console.warn('ClioWrite fonts:', error); return null; }
  }

  /* Get Info's 「字体」 row: created only when a note exists, inserted before
     the Description row of the info window's list. The eager hook has already
     removed any row a previous item left, so an office document without a note
     simply shows none. The dt carries data-i18n, so a later language switch
     repaints it like every static row. `available` passes through to the
     availability check (null = the browser's own probe; tests inject). */
  function fillInfo(item, sameItem, available) {
    // The previous item's row goes first, whatever this item turns out to be.
    const d0 = root.document;
    if (d0 && typeof d0.querySelector === 'function') {
      for (const id of ['#info-file-fonts', '#info-file-fonts-label']) d0.querySelector(id)?.remove?.();
    }
    return officeNote(item, available === undefined ? null : available).then((note) => {
      const doc = root.document;
      if (!note || !doc || typeof doc.querySelector !== 'function' || typeof sameItem !== 'function' || !sameItem()) return;
      const descLabel = doc.querySelector('#info-file-description-label');
      const dl = (descLabel && typeof descLabel.closest === 'function' && descLabel.closest('dl'))
        || doc.querySelector('.info-stats');
      if (!dl || typeof dl.insertBefore !== 'function') return;
      const dt = doc.createElement('dt');
      dt.id = 'info-file-fonts-label';
      dt.setAttribute('data-i18n', 'info_fonts');
      dt.textContent = tr('info_fonts');
      const rowEl = doc.createElement('dd');
      rowEl.id = 'info-file-fonts';
      rowEl.append(doc.createTextNode(note.summary));
      for (const row of note.rows) rowEl.append(doc.createElement('br'), doc.createTextNode(row.text));
      dl.insertBefore(dt, descLabel);
      dl.insertBefore(rowEl, descLabel);
    }).catch(() => {});
  }

  root.AISystem6ClioWriteFonts = Object.freeze({ substitutions, rows, summary, note, officeNote, fillInfo });
  root.AISystem6ClioWriteFontsLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
