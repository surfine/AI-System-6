/* ClioWorks v4 (V4-01 host): the desk-facing native Office host.
 * Loads the vendored codecs on demand, opens a native package from the desk's
 * native-binaries store, and routes "edit" intent through the real adapter for
 * the record's format (xlsx → Ledger, docx → Quire, pptx → Lectern). The text
 * projection (File Floppy) stays a reading aid — this host never overwrites a
 * native source with extracted text.
 *
 * Lazy classic script; installed as window.AISystem6ClioWorks. Loaded only by
 * ensureClioWorksLedgerModule() when a native edit intent actually fires. */
(function () {
  'use strict';
  if (window.AISystem6ClioWorks) return;

  const ADAPTERS = {
    xlsx: { script: 'app/vendor/clioworks-v3/ledger-adapter.js', global: 'ClioWorksLedgerAdapter' },
    docx: { script: 'app/vendor/clioworks-v3/quire-adapter.js', global: 'ClioWorksQuireAdapter' },
    pptx: { script: 'app/vendor/clioworks-v3/lectern-adapter.js', global: 'ClioWorksLecternAdapter' },
  };

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-clioworks-src="${CSS.escape(src)}"]`);
      if (existing?.dataset.loaded === 'true') { resolve(true); return; }
      const el = existing || document.createElement('script');
      el.dataset.clioworksSrc = src;
      el.addEventListener('load', () => { el.dataset.loaded = 'true'; resolve(true); }, { once: true });
      el.addEventListener('error', () => reject(new Error(`clioworks: failed to load ${src}`)), { once: true });
      if (!existing) {
        el.src = src;
        document.head.appendChild(el);
      }
    });
  }

  async function ensureAdapter(format) {
    const spec = ADAPTERS[format];
    if (!spec) throw new Error('clioworks: unsupported native format ' + format);
    if (window[spec.global]) return window[spec.global];
    await loadScriptOnce(spec.script);
    if (!window[spec.global]) throw new Error(`clioworks: ${format} adapter did not install`);
    return window[spec.global];
  }

  function ensureLedgerAdapter() {
    return ensureAdapter('xlsx');
  }

  function nativeStore() {
    if (!window.AISystem6NativeBinaries) throw new Error('clioworks: native-binaries store not loaded');
    return window.AISystem6NativeBinaries;
  }

  function sliceBuffer(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  function openAdapterFor(factory, record, bytes) {
    return factory.open(sliceBuffer(bytes), {
      name: record.fileName,
      scopeId: record.projectId || '',
      documentId: record.id,
      generation: 1,
    });
  }

  function workbookSurface() {
    const surface = window.AISystem6ClioChartWorkbook;
    return surface && typeof surface.open === 'function' ? surface : null;
  }

  function presentationSurface() {
    const surface = window.AISystem6ClioStageNative;
    return surface && typeof surface.open === 'function' ? surface : null;
  }

  /**
   * Open a native Office document for editing through the format's real adapter.
   * The adapter's document model rides on the record (liveAdapter). A workbook
   * (xlsx) is mounted into the ClioChart window by the workbook surface, a
   * presentation (pptx) into the ClioStage window by its native surface, a
   * document (docx) into the ClioWrite window (S11 M3).  Read intent never
   * comes here: it stays Reader's text projection (S11-19).
   * @param {{mountedName: string, name?: string}} item the desk's native-binary record handle
   * @param {object} context application-registry context (intent, project)
   */
  async function openNativeDocument(item, context = {}) {
    const store = nativeStore();
    const mountedName = item.mountedName || item.name;
    const record = store.recordFor(mountedName);
    if (!record) return { ok: false, reason: 'not-native' };
    const format = record.format;
    if (!ADAPTERS[format]) return { ok: false, reason: `unsupported-format:${format}` };

    const isXlsx = format === 'xlsx';
    const isPptx = format === 'pptx';
    // The same document opened twice is one session: never re-parse over a
    // model that may hold unsaved edits, only bring its window forward.
    const surfaceGlobal = isXlsx ? window.AISystem6ClioChartWorkbook : isPptx ? window.AISystem6ClioStageNative : window.AISystem6ClioWrite;
    const sameSession = !!surfaceGlobal
      && record.liveAdapter
      && surfaceGlobal.current?.()?.mountedName === mountedName;

    if (!sameSession) {
      const adapterFactory = await ensureAdapter(format);
      // Keep the live adapter on the record so later edit/save commands reuse
      // the same in-memory model instead of re-parsing.
      record.liveAdapter = await openAdapterFor(adapterFactory, record, store.workingBytes(mountedName));
    }

    if (isXlsx) {
      if (typeof ensureClioChartWorkbookModule === 'function') await ensureClioChartWorkbookModule();
      const surface = workbookSurface();
      if (!surface) {
        if (typeof setStatus === 'function') setStatus(t('clio_chart_workbook_unavailable'));
        return { ok: false, reason: 'unavailable' };
      }
      const opened = await surface.open(record, { mountedName, fileName: record.fileName });
      if (opened && opened.ok === false) return { ok: false, reason: opened.reason || 'open-failed' };
    } else if (isPptx) {
      // ClioStage itself first (its window, its menus, its edit history), then the native surface.
      if (typeof ensureClioStageModule === 'function') await ensureClioStageModule();
      if (typeof ensureClioStageNativeModule === 'function') await ensureClioStageNativeModule();
      const surface = presentationSurface();
      if (!surface) {
        if (typeof setStatus === 'function') setStatus(t('clio_stage_native_unavailable'));
        return { ok: false, reason: 'unavailable' };
      }
      const opened = await surface.open(record, { mountedName, fileName: record.fileName });
      if (opened && opened.ok === false) return { ok: false, reason: opened.reason || 'open-failed' };
    } else {
      // A Word document: the ClioWrite window, its menus and its edit history.
      if (typeof ensureClioWriteModule === 'function') await ensureClioWriteModule();
      const surface = window.AISystem6ClioWrite && typeof window.AISystem6ClioWrite.open === 'function' ? window.AISystem6ClioWrite : null;
      if (!surface) {
        if (typeof setStatus === 'function') setStatus(t('clio_write_unavailable'));
        return { ok: false, reason: 'unavailable' };
      }
      const opened = await surface.open(record, { mountedName, fileName: record.fileName });
      if (opened && opened.ok === false) return { ok: false, reason: opened.reason || 'open-failed' };
    }
    return { ok: true, documentId: record.id, mountedName, format };
  }

  async function sha256Hex(bytes) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      return '';
    }
  }

  // A real save is an `edit` run and leaves one run receipt, the same record the
  // application registry makes for an edit dispatch. A receipt that cannot be
  // written never fails the save; a save that changes nothing leaves none.
  const RECEIPT_APPS = { xlsx: ['clioWorksLedger', 'clioworks_ledger_label'], docx: ['clioWorksQuire', 'clioworks_quire_label'], pptx: ['clioWorksLectern', 'clioworks_lectern_label'] };
  async function beginSaveReceipt(record) {
    const receipts = window.AISystem6RunReceipts;
    if (typeof receipts?.createReceipt !== 'function') return '';
    const [appId, labelKey] = RECEIPT_APPS[record.format] || RECEIPT_APPS.xlsx;
    try {
      const created = await receipts.createReceipt({
        projectId: record.projectId || '',
        sourceAppId: appId,
        intent: 'edit',
        inputObjectIds: [record.id],
        options: { labelKey },
        replayContract: { appId, intent: 'edit', inputObjectIds: [record.id] },
      });
      return created?.ok ? created.receiptId : '';
    } catch (error) {
      return '';
    }
  }

  async function endSaveReceipt(receiptId, record, outcome) {
    if (!receiptId || typeof window.AISystem6RunReceipts?.finishReceipt !== 'function') return;
    try {
      await window.AISystem6RunReceipts.finishReceipt(receiptId, outcome.ok
        ? { status: 'completed', affectedObjectIds: [record.id], destination: record.mountedName }
        : { status: 'failed', publicErrorReason: outcome.message || outcome.reason });
    } catch (error) { /* the save result stands */ }
  }

  /**
   * Save intent: untouched → original bytes; edited → preserving writer.
   * Never throws: an encoder failure comes back as { ok:false, reason:'encode-failed' }
   * and leaves both the live model (still dirty) and the stored bytes alone.
   * There is no browser-side semantic guard on the written package; the
   * preserving writer's own contract is the only check.
   */
  async function saveNativeDocument(mountedName) {
    const store = nativeStore();
    const record = store.recordFor(mountedName);
    if (!record || !ADAPTERS[record.format]) return { ok: false, reason: 'not-native' };
    const doc = record.liveAdapter;
    if (!doc) return { ok: false, reason: 'not-open' };

    const hadEdits = typeof doc.isDirty === 'function' ? doc.isDirty() !== false : true;
    const receiptId = hadEdits ? await beginSaveReceipt(record) : '';
    let result;
    let bytes;
    // The revision being encoded: typing that lands while the save runs stays unsaved.
    const encodedRevision = typeof doc.getEditRevision === 'function' ? doc.getEditRevision() : undefined;
    try {
      result = await doc.save();
      bytes = new Uint8Array(result.bytes);
    } catch (error) {
      const failure = { ok: false, reason: 'encode-failed', message: String(error && error.message || error) };
      await endSaveReceipt(receiptId, record, failure);
      return failure;
    }
    const sha256 = await sha256Hex(bytes);
    try {
      store.setWorkingBytes(mountedName, bytes, { dirty: false });
      if (typeof doc.markSaved === 'function') doc.markSaved(encodedRevision);
    } catch (error) {
      const failure = { ok: false, reason: 'store-failed', message: String(error && error.message || error) };
      await endSaveReceipt(receiptId, record, failure);
      return failure;
    }
    let report = { converted: [], lost: [] };
    if (typeof doc.exportReport === 'function') {
      try {
        const r = (await doc.exportReport()) || {};
        report = { converted: r.converted || [], lost: r.lost || [] };
      } catch (error) { /* an unreadable report is an empty one; the save stands */ }
    }
    const saved = { ok: true, mode: result.mode, byteLength: bytes.byteLength, sha256, report, receiptId };
    await endSaveReceipt(receiptId, record, saved);
    return saved;
  }

  /**
   * Revert to the last stored bytes: parse a fresh adapter from workingBytes and
   * swap it onto the record. The old adapter is left alone until the new one
   * exists, so a failed revert loses nothing. The caller (the workbook surface)
   * re-reads record.liveAdapter, which is also returned.
   */
  async function revertNativeDocument(mountedName) {
    const store = nativeStore();
    const record = store.recordFor(mountedName);
    if (!record || !ADAPTERS[record.format]) return { ok: false, reason: 'not-native' };
    if (!record.liveAdapter) return { ok: false, reason: 'not-open' };
    try {
      const factory = await ensureAdapter(record.format);
      const adapter = await openAdapterFor(factory, record, store.workingBytes(mountedName));
      record.liveAdapter = adapter;
      return { ok: true, adapter };
    } catch (error) {
      return { ok: false, reason: 'revert-failed', message: String(error && error.message || error) };
    }
  }

  /**
   * The application registry's intent split for Word and PowerPoint packages
   * (moved here from the eager registry, S11 M2): read opens the text
   * projection in Reader and never touches the native bytes; edit and open go
   * through the real adapter to the format's surface.
   */
  function dispatchIntent(file, context = {}) {
    if (context.intent === 'read') {
      if (typeof createReaderFileDocumentTab === 'function' && typeof openReaderDocumentTab === 'function') {
        const tab = createReaderFileDocumentTab(file.name);
        openReaderDocumentTab(tab.id);
        openWindow('reader');
        return { ok: true };
      }
      return { ok: false, reason: 'reader-unavailable' };
    }
    if (context.intent === 'edit' || context.intent === 'open') return openNativeDocument(file, context);
    return { ok: false, reason: 'unsupported-intent' };
  }

  /** Back-compat alias for the first (XLSX) increment's callers. */
  function openNativeWorkbook(item, context) {
    return openNativeDocument(item, context);
  }

  function saveNativeWorkbook(mountedName) {
    return saveNativeDocument(mountedName);
  }

  window.AISystem6ClioWorks = Object.freeze({
    openNativeDocument,
    dispatchIntent,
    saveNativeDocument,
    revertNativeDocument,
    openNativeWorkbook,
    saveNativeWorkbook,
    ensureAdapter,
    ensureLedgerAdapter,
    FORMATS: Object.freeze(Object.keys(ADAPTERS)),
  });
  window.AISystem6ClioWorksLoaded = true;
})();
