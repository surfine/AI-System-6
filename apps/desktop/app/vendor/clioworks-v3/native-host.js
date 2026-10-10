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

  /**
   * Open a native Office document for editing through the format's real adapter.
   * The adapter's document model rides on the record (liveAdapter); an approved
   * editor surface for each format arrives with the S11 screens — no upstream
   * window and no text-projection editor is substituted in the meantime.
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

    const adapterFactory = await ensureAdapter(format);
    const bytes = store.workingBytes(mountedName);
    const doc = await adapterFactory.open(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
      name: record.fileName,
      scopeId: record.projectId || '',
      documentId: record.id,
      generation: 1,
    });

    // Keep the live adapter on the record so later edit/save commands reuse
    // the same in-memory model instead of re-parsing.
    record.liveAdapter = doc;
    if (format === 'xlsx') openWindow('clioChart');
    if (typeof setStatus === 'function') {
      setStatus(t('clioworks_native_opened', record.fileName));
    }
    return { ok: true, documentId: record.id, mountedName, format };
  }

  /** Save intent: untouched → original bytes; edited → preserving writer. */
  async function saveNativeDocument(mountedName) {
    const store = nativeStore();
    const record = store.recordFor(mountedName);
    if (!record || !ADAPTERS[record.format]) return { ok: false, reason: 'not-native' };
    const doc = record.liveAdapter;
    if (!doc) return { ok: false, reason: 'not-open' };
    const result = await doc.save();
    const bytes = new Uint8Array(result.bytes);
    store.setWorkingBytes(mountedName, bytes, { dirty: false });
    return { ok: true, mode: result.mode, byteLength: bytes.byteLength };
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
    saveNativeDocument,
    openNativeWorkbook,
    saveNativeWorkbook,
    ensureAdapter,
    ensureLedgerAdapter,
    FORMATS: Object.freeze(Object.keys(ADAPTERS)),
  });
  window.AISystem6ClioWorksLoaded = true;
})();
