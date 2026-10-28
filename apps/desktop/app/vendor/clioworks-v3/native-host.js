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

  // The three codecs write the SAME names on window.L — L.preserve is
  // Quire's, Ledger's and Lectern's alike, L.model is Ledger's and Lectern's
  // — and their vendored files read those names at CALL time (docx-write
  // reaches for L.preserve.begin, xlsx-write for L.preserve.begin, lectern's
  // readers walk L.model), so whichever codec loaded LAST owns them for all.
  // The fix is ownership by snapshot, never by re-running module files (that
  // re-created classes under a live document and broke its save). When a
  // format's codec finishes loading, its world — every name on L at that
  // moment — is remembered; before any codec operation the names are pointed
  // back at that world. Live documents keep their own closures and are
  // untouched; the names they read at call time simply belong to their
  // format again.
  const codecWorlds = new Map();
  let activeWorld = '';
  function snapshotCodecWorld(format) {
    if (codecWorlds.has(format)) return;
    const names = new Map();
    for (const key of Object.keys(window.L)) names.set(key, window.L[key]);
    codecWorlds.set(format, names);
  }
  function activateCodecWorld(format) {
    if (activeWorld === format) return;
    const names = codecWorlds.get(format);
    if (!names) { activeWorld = format; return; }
    for (const key of Object.keys(window.L)) if (!names.has(key)) delete window.L[key];
    for (const [key, value] of names) window.L[key] = value;
    activeWorld = format;
  }
  async function ownCodec(format) {
    const factory = await ensureAdapter(format);
    // The adapter's own loader first, so a codec that never loaded loads once
    // (and its completeness check runs); it memoizes, so this is cheap after.
    if (typeof factory.loadCodec === 'function') await factory.loadCodec();
    snapshotCodecWorld(format);
    activateCodecWorld(format);
    return factory;
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
   * Which document an open names. A floppy package is found by its mounted
   * name, a Project Hard Disk document by its project file id (N0): either an
   * explicit `source`, or a chatFiles item of type "office" handed over by the
   * Finder or the application registry.
   * @param {{source?: {kind: string, mountedName?: string, fileId?: string}, type?: string, id?: string, mountedName?: string, name?: string}} item
   */
  function sourceOf(item = {}) {
    if (item.source && item.source.kind === 'project') return { kind: 'project', fileId: item.source.fileId };
    if (item.source && item.source.kind === 'floppy') return { kind: 'floppy', mountedName: item.source.mountedName };
    if (item.type === 'office') return { kind: 'project', fileId: item.id };
    return { kind: 'floppy', mountedName: item.mountedName || item.name };
  }

  async function recordForSource(source) {
    const store = nativeStore();
    if (source.kind === 'project') return store.openProjectDocument(source.fileId);
    return store.recordFor(source.mountedName);
  }

  /**
   * Open a native Office document for editing through the format's real adapter.
   * The adapter's document model rides on the record (liveAdapter). A workbook
   * (xlsx) is mounted into the ClioChart window by the workbook surface, a
   * presentation (pptx) into the ClioStage window by its native surface, a
   * document (docx) into the ClioWrite window (S11 M3).  Read intent never
   * comes here: it stays Reader's text projection (S11-19).
   * @param {{mountedName?: string, name?: string, source?: object, type?: string, id?: string}} item a floppy handle, a source, or a project office item
   * @param {object} context application-registry context (intent, project)
   */
  async function openNativeDocument(item, context = {}) {
    const store = nativeStore();
    const source = sourceOf(item);
    let record = null;
    try { record = await recordForSource(source); } catch (error) { record = null; }
    if (!record) {
      if (source.kind !== 'project') return { ok: false, reason: 'not-native' };
      // The item is on the disk but its bytes are not: say so, never open an empty editor.
      if (typeof setStatus === 'function') setStatus(t('clioworks_native_missing', item.name || ''));
      return { ok: false, reason: 'missing-bytes' };
    }
    // The handle the editors hold and hand back: the mounted name on a floppy,
    // "project-file:<id>" on the Project Hard Disk.
    const mountedName = record.mountedName;
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
      const adapterFactory = await ownCodec(format);
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
        ? { status: 'completed', affectedObjectIds: outcome.affectedObjectIds || [record.id], destination: outcome.destination || (record.source && record.source.kind === 'project' ? record.fileName : record.mountedName) }
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
      // The writer reads shared codec names at call time; make sure they are
      // this document's format's before it encodes.
      await ownCodec(record.format);
      result = await doc.save();
      bytes = new Uint8Array(result.bytes);
    } catch (error) {
      const failure = { ok: false, reason: 'encode-failed', message: String(error && error.message || error) };
      await endSaveReceipt(receiptId, record, failure);
      return failure;
    }
    const sha256 = await sha256Hex(bytes);
    try {
      // A project document's bytes go back to the Project Hard Disk (same row,
      // one put); a floppy package's stay in the floppy's working copy.
      if (record.source && record.source.kind === 'project') await store.writeProjectBytes(mountedName, bytes);
      else store.setWorkingBytes(mountedName, bytes, { dirty: false });
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
      if (record.source && record.source.kind === 'project') {
        if (!(await store.reloadProjectBytes(mountedName))) return { ok: false, reason: 'revert-failed', message: 'missing-bytes' };
      }
      const factory = await ownCodec(record.format);
      const adapter = await openAdapterFor(factory, record, store.workingBytes(mountedName));
      record.liveAdapter = adapter;
      return { ok: true, adapter };
    } catch (error) {
      return { ok: false, reason: 'revert-failed', message: String(error && error.message || error) };
    }
  }

  /* ------------------------------------------------ N0: Save As… (存储为…) */

  // Which window a format's editor lives in: the dialog borrows its app so the
  // menu bar does not jump to ClioTalk while it is open.
  const SURFACE_APPS = { xlsx: 'clioChart', docx: 'clioWrite', pptx: 'clioStage' };

  function surfaceFor(format) {
    if (format === 'xlsx') return workbookSurface();
    if (format === 'pptx') return presentationSurface();
    const write = window.AISystem6ClioWrite;
    return write && typeof write.open === 'function' ? write : null;
  }

  function folderNameOf(record) {
    if (!record.source || record.source.kind !== 'project' || typeof chatFiles === 'undefined') return '';
    const item = chatFiles.find((file) => file && file.id === record.source.fileId);
    const folder = item && item.folderId && typeof chatFolders !== 'undefined'
      ? chatFolders.find((entry) => entry && entry.id === item.folderId) : null;
    if (!folder) return '';
    return typeof displayFolderName === 'function' ? displayFolderName(folder.name) : folder.name;
  }

  let pendingSaveAs = null;

  /**
   * The desk's own Save dialog (the saveChat window: name, folder, the folder
   * suggestions) in a "clioworks" mode, with one more question — where. The
   * destination radios are added for this question and removed after it, so
   * the other modes never see them. Resolves { name, folderName, destination }
   * or null when the dialog was closed without saving.
   */
  function askSaveAs(record) {
    const doc = document;
    const win = typeof getWindow === 'function' ? getWindow('saveChat') : doc.querySelector('[data-window="saveChat"]');
    const form = doc.querySelector('#save-chat-form');
    const nameInput = doc.querySelector('#chat-file-name');
    const folderInput = doc.querySelector('#chat-folder-name');
    const hint = doc.querySelector('#save-chat-hint');
    const title = doc.querySelector('#save-chat-title');
    if (!win || !form || !nameInput || !folderInput) return Promise.resolve(null);
    if (pendingSaveAs) pendingSaveAs(null);

    return new Promise((resolve) => {
      const fieldset = doc.createElement('fieldset');
      fieldset.className = 'clioworks-save-destination';
      fieldset.dataset.clioworksSaveAs = 'true';
      const legend = doc.createElement('legend');
      legend.textContent = t('clioworks_save_as_where');
      fieldset.append(legend);
      for (const [value, labelKey] of [['project', 'clioworks_save_as_project'], ['download', 'clioworks_save_as_download']]) {
        const label = doc.createElement('label');
        label.style.marginInlineEnd = '1.5em';
        const radio = doc.createElement('input');
        radio.type = 'radio';
        radio.name = 'clioworks-save-destination';
        radio.value = value;
        radio.checked = value === 'project';
        const text = doc.createElement('span');
        text.textContent = t(labelKey);
        label.append(radio, ' ', text);
        fieldset.append(label);
      }
      const destination = () => fieldset.querySelector('input:checked')?.value || 'project';
      const syncFolder = () => { folderInput.disabled = destination() === 'download'; };
      fieldset.addEventListener('change', syncFolder);
      form.insertBefore(fieldset, hint || form.querySelector('.button-row'));

      saveDialogMode = 'clioworks';
      win.dataset.app = SURFACE_APPS[record.format] || 'clioWrite';
      if (title) title.textContent = t('clioworks_save_as_title');
      if (hint) hint.textContent = t('clioworks_save_as_hint');
      nameInput.readOnly = false;
      nameInput.classList.remove('is-derived-name');
      nameInput.value = record.fileName || '';
      // The folder the document is in; empty is the top of the Project Hard Disk.
      folderInput.value = folderNameOf(record);
      if (typeof renderFolderSuggestions === 'function') renderFolderSuggestions();

      let observer = null;
      const settle = (value) => {
        if (pendingSaveAs !== settle) return;
        pendingSaveAs = null;
        observer?.disconnect();
        doc.removeEventListener('submit', onSubmit, true);
        fieldset.remove();
        folderInput.disabled = false;
        // Back to the dialog's everyday mode (Save Chat), the way its own close does.
        if (typeof configureSaveDialog === 'function') configureSaveDialog('chat');
        else saveDialogMode = 'chat';
        if (win) win.dataset.app = 'clioTalk';
        resolve(value);
      };
      // Capture on the document, so this answers before the desk's own submit
      // handler (which would save a chat) ever sees the event.
      const onSubmit = (event) => {
        if (event.target !== form) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const answer = { name: nameInput.value.trim(), folderName: folderInput.value.trim(), destination: destination() };
        settle(answer);
        if (typeof closeWindow === 'function') closeWindow('saveChat');
      };
      pendingSaveAs = settle;
      doc.addEventListener('submit', onSubmit, true);
      // Cancel, the close box and Escape all close the window: that is the "no".
      // Only a window that was showing can close; opening it passes through
      // class changes of its own while it is still hidden.
      if (typeof MutationObserver === 'function') {
        let shown = !win.classList.contains('is-hidden');
        observer = new MutationObserver(() => {
          if (!win.classList.contains('is-hidden')) shown = true;
          else if (shown) settle(null);
        });
        observer.observe(win, { attributes: true, attributeFilter: ['class'] });
      }
      if (typeof openWindow === 'function') openWindow('saveChat');
      try { nameInput.focus({ preventScroll: true }); nameInput.select(); } catch (error) { /* focus is a courtesy */ }
    });
  }

  function downloadBytes(bytes, fileName, format) {
    const mimeType = nativeStore().MIME_TYPES[format] || 'application/octet-stream';
    const blob = new Blob([bytes], { type: mimeType });
    const platform = window.AISystem6WebPlatform;
    const saved = platform && typeof platform.saveArtifact === 'function'
      ? platform.saveArtifact({ blob, fileName, mimeType })
      : false;
    return { saved: !!saved, blob, mimeType };
  }

  /**
   * Save As… (存储为…): the open document's current state, encoded by the
   * same preserving writer as Save, either as a NEW Project Hard Disk document
   * that the window then edits (the source — a floppy package or another
   * project file — is left as it was), or downloaded to this computer as a
   * real .docx/.xlsx/.pptx. `options.answer` skips the dialog (tests, scripts).
   */
  async function saveNativeDocumentAs(handle, options = {}) {
    const store = nativeStore();
    const record = store.recordFor(handle);
    if (!record || !ADAPTERS[record.format]) return { ok: false, reason: 'not-native' };
    const doc = record.liveAdapter;
    if (!doc) return { ok: false, reason: 'not-open' };
    const answer = options.answer || await askSaveAs(record);
    if (!answer) return { ok: false, reason: 'cancelled' };
    const fileName = store.nameWithExtension(answer.name || record.fileName, record.format);
    const toProject = answer.destination !== 'download';
    const projectId = typeof activeProjectId !== 'undefined' ? activeProjectId : (record.projectId || '');
    if (toProject && !projectId) {
      if (typeof setStatus === 'function') setStatus(t('no_project_mounted'));
      return { ok: false, reason: 'no-project' };
    }

    const encodedRevision = typeof doc.getEditRevision === 'function' ? doc.getEditRevision() : undefined;
    let bytes;
    try {
      // The writer reads shared codec names at call time; own them for this
      // document's format before it encodes.
      await ownCodec(record.format);
      bytes = new Uint8Array((await doc.save()).bytes);
    } catch (error) {
      const failure = { ok: false, reason: 'encode-failed', message: String(error && error.message || error) };
      if (typeof setStatus === 'function') setStatus(t('clioworks_save_as_failed', fileName, failure.message));
      return failure;
    }

    if (!toProject) {
      // A download changes nothing on the desk: the window keeps its document
      // and its unsaved state.
      const { saved, blob, mimeType } = downloadBytes(bytes, fileName, record.format);
      if (typeof setStatus === 'function') setStatus(saved ? t('clioworks_saved_as_download', fileName) : t('clioworks_save_as_failed', fileName, ''));
      return { ok: saved, destination: 'download', fileName, mimeType, blob, byteLength: bytes.byteLength, sha256: await sha256Hex(bytes) };
    }

    const receiptId = await beginSaveReceipt(record);
    let item;
    try {
      item = await store.createProjectDocument({ projectId, name: fileName, folderName: answer.folderName || '', format: record.format, bytes });
      if (!item) throw new Error('the new document did not reach the Project Hard Disk');
    } catch (error) {
      const failure = { ok: false, reason: 'store-failed', message: String(error && error.message || error) };
      await endSaveReceipt(receiptId, record, failure);
      if (typeof setStatus === 'function') setStatus(t('clioworks_save_as_failed', fileName, failure.message));
      return failure;
    }
    // The live model now belongs to the new document: its edits are saved
    // there, and the source it came from keeps the bytes it had.
    if (typeof doc.markSaved === 'function') doc.markSaved(encodedRevision);
    // The new document is a source too: its own linked text copy.
    try { await store.refreshLinkedReference(item.id, bytes); } catch (error) { /* made again on its next save */ }
    const next = await store.openProjectDocument(item.id);
    next.liveAdapter = doc;
    if (record.liveAdapter === doc) record.liveAdapter = null;
    if (record.source && record.source.kind === 'project') store.forgetProjectDocument(handle);
    const surface = surfaceFor(record.format);
    if (surface) {
      try { await surface.open(next, { mountedName: next.mountedName, fileName: item.name }); } catch (error) { /* the document is saved; the window catches up on the next open */ }
    }
    const saved = { ok: true, destination: 'project', fileId: item.id, fileName: item.name, mountedName: next.mountedName, byteLength: bytes.byteLength, sha256: await sha256Hex(bytes), receiptId };
    await endSaveReceipt(receiptId, record, { ...saved, affectedObjectIds: [item.id], destination: item.name });
    if (typeof setStatus === 'function') setStatus(t('clioworks_saved_as_project', item.name));
    if (typeof renderProjectDisks === 'function') { try { renderProjectDisks(); } catch (error) { /* repaint on the next render */ } }
    return saved;
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
    saveNativeDocumentAs,
    revertNativeDocument,
    openNativeWorkbook,
    saveNativeWorkbook,
    ensureAdapter,
    ownCodec,
    ensureLedgerAdapter,
    FORMATS: Object.freeze(Object.keys(ADAPTERS)),
  });
  window.AISystem6ClioWorksLoaded = true;
})();
