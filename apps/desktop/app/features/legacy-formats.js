/* Legacy binary Office formats (N15b): .doc / .xls / .ppt — and the WPS family
 * .wps / .et / .dps — cannot be read here. Today such a drop either failed
 * with an extractor error or, worse, mounted the raw bytes as "text". This
 * module answers one question the desk asks once per import batch: which of
 * these files cannot be read, what is each one, and what should the writer do
 * instead (open it in Word/WPS/LibreOffice and 另存为 the matching .docx/
 * .xlsx/.pptx, then drop that).
 *
 * Detection is by name first and by magic bytes second: a Word 97–2003 file
 * saved without its extension is still an OLE2 compound file, and its first
 * eight bytes are D0 CF 11 E0 A1 B1 1A E1. A file whose name already names a
 * format the desk reads (.docx/.xlsx/.pptx/.odt/…) is never flagged, whatever
 * its bytes look like — those have their own honest failure paths.
 *
 * Pure logic only: no DOM, no codecs, no user-visible strings of its own. The
 * caller maps the verdicts through t() (the keys below), shows ONE alert for
 * the batch, and never mounts the flagged files.
 */
(function (root) {
  'use strict';

  /* kind → { labelKey, noticeKey, saveAs } — the tri-state the notice needs. */
  const KINDS = Object.freeze({
    word: { exts: ['doc'], labelKey: 'legacy_format_kind_word', noticeKey: 'legacy_format_notice_word', saveAs: '.docx' },
    sheet: { exts: ['xls'], labelKey: 'legacy_format_kind_sheet', noticeKey: 'legacy_format_notice_sheet', saveAs: '.xlsx' },
    slides: { exts: ['ppt'], labelKey: 'legacy_format_kind_slides', noticeKey: 'legacy_format_notice_slides', saveAs: '.pptx' },
    'wps-text': { exts: ['wps'], labelKey: 'legacy_format_kind_wps_text', noticeKey: 'legacy_format_notice_wps_text', saveAs: '.docx' },
    'wps-sheet': { exts: ['et'], labelKey: 'legacy_format_kind_wps_sheet', noticeKey: 'legacy_format_notice_wps_sheet', saveAs: '.xlsx' },
    'wps-slides': { exts: ['dps'], labelKey: 'legacy_format_kind_wps_slides', noticeKey: 'legacy_format_notice_wps_slides', saveAs: '.pptx' },
    // OLE2 bytes under a name that names no old family: say it is old Office
    // bytes and point at the new formats without claiming which app made it.
    unknown: { exts: [], labelKey: 'legacy_format_kind_unknown', noticeKey: 'legacy_format_notice_unknown', saveAs: '' },
  });
  const EXT_TO_KIND = {};
  Object.keys(KINDS).forEach((kind) => KINDS[kind].exts.forEach((ext) => { EXT_TO_KIND[ext] = kind; }));

  // Names the desk already reads through its own paths; the magic-byte rule
  // never overrides them.
  const READABLE_EXTS = new Set(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp']);

  const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

  function extensionOf(name) {
    return (String(name || '').match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  }

  function isOle2Bytes(bytes) {
    if (!bytes || bytes.length < OLE2_MAGIC.length) return false;
    return OLE2_MAGIC.every((byte, index) => bytes[index] === byte);
  }

  /**
   * One file's verdict: { name, kind } when it cannot be read, null when this
   * module has nothing to say about it. `bytes` may be null (name-only check)
   * or just the file's first bytes — only the 8-byte header is read.
   */
  function detect(name, bytes) {
    const ext = extensionOf(name);
    if (EXT_TO_KIND[ext]) return { name: String(name || ''), kind: EXT_TO_KIND[ext] };
    if (!READABLE_EXTS.has(ext) && isOle2Bytes(bytes)) return { name: String(name || ''), kind: 'unknown' };
    return null;
  }

  /**
   * The batch alert's text, once per batch, listing every flagged file. One
   * file gets the full 「…」是 … 格式 … 另存为 … sentence on its own; several
   * share a header, one line each, and one tail that names all three targets.
   * `tr` is the desk's t() (a test may pass its own).
   */
  function message(verdicts, tr) {
    const say = tr || ((key, ...args) => args.join(' '));
    const list = (Array.isArray(verdicts) ? verdicts : []).filter(Boolean);
    if (!list.length) return '';
    if (list.length === 1) {
      const kind = KINDS[list[0].kind] || KINDS.unknown;
      return say(kind.noticeKey, list[0].name);
    }
    return [
      say('legacy_format_batch_header', list.length),
      ...list.map((verdict) => {
        const kind = KINDS[verdict.kind] || KINDS.unknown;
        return say('legacy_format_batch_line', verdict.name, say(kind.labelKey));
      }),
      say('legacy_format_batch_tail'),
    ].join('\n');
  }

  /**
   * One batch's screen: split the files into kept and flagged, push one
   * failure entry per flagged file into `sink` (the caller's failures list)
   * in its own language (`tr` is the desk's t(); a test may pass its own),
   * and return the alert text. Only the first 8 bytes of each file are read.
   */
  async function screen(files, tr, sink) {
    const say = tr || ((key, ...args) => args.join(' '));
    const kept = [];
    const flagged = [];
    for (const file of Array.from(files || [])) {
      let head = null;
      try {
        head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      } catch (headError) {
        head = null;
      }
      const verdict = detect(file.name, head);
      if (verdict) flagged.push(verdict);
      else kept.push(file);
    }
    if (Array.isArray(sink)) {
      for (const verdict of flagged) sink.push({ name: verdict.name, message: message([verdict], say) });
    }
    const notice = message(flagged, say);
    return { kept, flagged, notice, oneLine: notice.replace(/\n/g, ' ') };
  }

  /**
   * The desk's whole import gate in one call (the eager side of app.js is one
   * line): screen the batch, push one failure entry per flagged file into
   * `sink` (the caller's failures list, in its own language via `tr`), show
   * the ONE alert and the one-line status in the desk's own voice — guarded,
   * so a bare vm context with neither can still drive it — then shrink the
   * caller's array to the kept files in place (the eager line spends no bytes
   * on a reassignment) and return them.
   */
  async function gateImportBatch(files, tr, sink) {
    const screened = await screen(files, tr, sink);
    if (!screened.flagged.length) return screened.kept;
    if (typeof root.showSystemModal === 'function') await root.showSystemModal(screened.notice, 'alert');
    if (typeof root.setStatus === 'function') root.setStatus(screened.oneLine);
    if (Array.isArray(files) && screened.kept.length !== files.length) {
      files.length = 0;
      for (const kept of screened.kept) files.push(kept);
    }
    return screened.kept;
  }

  root.AISystem6LegacyFormats = Object.freeze({ detect, message, screen, gateImportBatch });
  // One lazy bundle, one face: the batch gate rides the object the ODF import
  // loader resolves to (this file loads after odf-import.js in the same
  // sources list; the module's own object is frozen, so the gate joins a
  // shallow wrapper — copy/convert keep working, AISystem6LegacyFormats stays
  // the direct face for bare vm contexts).
  if (root.AISystem6OdfImport) {
    root.AISystem6OdfImport = { ...root.AISystem6OdfImport, gate: gateImportBatch };
  }
  root.AISystem6LegacyFormatsLoaded = true;
  root.AISystem6LegacyFormatsLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
