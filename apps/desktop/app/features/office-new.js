// Lazy feature module: ClioWorks N4 — 新建 (New) and 文具 (Stationery) for
// Office documents.
//
// A writer can start a new Office document without already having one, the
// System 6 way: 新建… (⌘N) in the three editors and 新建 Office 文稿… in the
// Finder's File menu open a small dialog of three blanks (docx/xlsx/pptx) plus
// this project's stationery pads. A blank is built from the vendored codec
// models (never from shipped template files), written to the Project Hard Disk
// through the N0 store (bytes first, item second — a failure leaves nothing),
// and opened in its editor. 存为文具… marks the open document as a stationery
// pad; opening a pad never edits it (finder-objects.js makes the 未命名 copy).
//
// Loaded on demand through ensureOfficeNewModule() (which awaits
// window.AISystem6OfficeNew); the floppy budget only counts the startup
// bundle, so the codec loading and the dialog live here.

(function (root) {
  'use strict';

  const FORMATS = ['docx', 'xlsx', 'pptx'];

  function tr(key, ...args) {
    return typeof t === 'function' ? t(key, ...args) : key;
  }
  function status(text) {
    if (typeof setStatus === 'function') setStatus(text);
  }

  /** The front application names the format its own 新建 starts from. */
  function defaultFormatForFrontApp() {
    const appId = typeof activeAppId !== 'undefined' ? activeAppId : '';
    if (appId === 'clioChart') return 'xlsx';
    if (appId === 'clioStage') return 'pptx';
    return 'docx';
  }

  function isZh() {
    return typeof currentLanguage !== 'undefined' && currentLanguage === 'zh';
  }

  /* --------------------------------------------- the vendored codecs, on demand */

  async function clioworksHost() {
    if (typeof ensureClioWorksLedgerModule === 'function') await ensureClioWorksLedgerModule();
    if (!root.AISystem6ClioWorks) throw new Error('office-new: the ClioWorks host did not load');
    return root.AISystem6ClioWorks;
  }

  /**
   * One blank document's bytes, straight from the codec models — no shipped
   * template file. The defaults follow the UI language the way its Office
   * would: 宋体 East Asian fonts and A4 for a Chinese writer, 16:9 slides, and
   * the first sheet named 工作表1 / Sheet1.
   * @returns {Promise<Uint8Array>}
   */
  async function blankBytes(format) {
    const host = await clioworksHost();
    if (format === 'docx') {
      await host.ownCodec('docx');
      const L = root.L;
      const doc = L.D.newDoc();
      // A4, the paper size both languages write on here (the codec default is US Letter).
      doc.sect.pgW = 595.3;
      doc.sect.pgH = 841.9;
      if (isZh()) {
        doc.defaults.rPr = { ...doc.defaults.rPr, fontEA: '宋体', langEA: 'zh-CN' };
      }
      const blob = await L.docx.write(doc, { format: 'docx' });
      return new Uint8Array(await blob.arrayBuffer());
    }
    if (format === 'xlsx') {
      await host.ownCodec('xlsx');
      const workbook = new root.L.model.Workbook();
      workbook.addSheet(isZh() ? '工作表1' : 'Sheet1');
      return root.L.xlsxWrite.bytes(workbook, { type: 'xlsx' });
    }
    if (format === 'pptx') {
      await host.ownCodec('pptx');
      // 16:9 is the codec's own default size; empty — the deck starts bare.
      const pres = root.L.model.newPresentation({ empty: true });
      if (isZh()) {
        const design = Object.values(pres.designs)[0];
        if (design) Object.assign(design.fonts, { majorEA: '宋体', minorEA: '宋体' });
      }
      root.L.pres = pres;
      const blob = await root.L.pptx.write(pres, { format: 'pptx' });
      return new Uint8Array(await blob.arrayBuffer());
    }
    throw new Error('office-new: unsupported format ' + format);
  }

  /* -------------------------------------------------- create + open the document */

  async function ensureStore() {
    if (typeof ensureNativeBinariesModule === 'function') await ensureNativeBinariesModule();
    const store = root.AISystem6NativeBinaries;
    if (!store) throw new Error('office-new: the native document store did not load');
    return store;
  }

  async function openInEditor(item) {
    const host = await clioworksHost();
    return host.openNativeDocument(item);
  }

  // 未命名 1, 未命名 2 … counted here the way nextAvailableFileName counts a
  // name (first free index from 1); the store's own uniqueName stays behind it
  // as the last guard against a race.
  function untitledName({ projectId, folderId, format }) {
    const files = typeof chatFiles !== 'undefined' && Array.isArray(chatFiles) ? chatFiles : [];
    const taken = new Set(files
      .filter((file) => file && file.projectId === projectId && (file.folderId || null) === (folderId || null))
      .map((file) => String(file.name || '').trim().toLowerCase()));
    const ext = `.${format}`;
    for (let index = 1; index < 1000; index += 1) {
      if (!taken.has(`${tr('untitled')} ${index}${ext}`.toLowerCase())) return `${tr('untitled')} ${index}`;
    }
    return `${tr('untitled')} ${Date.now()}`;
  }

  /**
   * Create one untitled blank on the Project Hard Disk and open it in its
   * editor. Bytes first, item second (the N0 store's order): a failure throws
   * with nothing left behind. `options.folderId` is the folder the Finder is
   * showing; null is the top level.
   * @returns {Promise<{ok: boolean, item?: object, reason?: string}>}
   */
  async function createBlank(format, options = {}) {
    if (!FORMATS.includes(format)) return { ok: false, reason: 'unsupported-format' };
    if (typeof getActiveProject === 'function' && !getActiveProject()) {
      if (typeof openWindow === 'function') openWindow('projects');
      status(tr('no_project_mounted'));
      return { ok: false, reason: 'no-project' };
    }
    const projectId = typeof activeProjectId !== 'undefined' ? activeProjectId : '';
    if (!projectId) {
      if (typeof openWindow === 'function') openWindow('projects');
      status(tr('no_project_mounted'));
      return { ok: false, reason: 'no-project' };
    }
    let bytes;
    try {
      bytes = await blankBytes(format);
    } catch (error) {
      status(tr('office_new_failed', tr(`office_new_blank_${format}`), String((error && error.message) || error)));
      return { ok: false, reason: 'encode-failed', message: String((error && error.message) || error) };
    }
    const store = await ensureStore();
    const name = untitledName({ projectId, folderId: options.folderId || null, format });
    try {
      const item = await store.createProjectDocument({
        projectId,
        name,
        folderId: options.folderId || null,
        format,
        bytes,
      });
      if (!item) throw new Error('the new document did not reach the Project Hard Disk');
      // The document's linked hidden text source, exactly as N0 makes it for a saved document.
      try { await store.refreshLinkedReference(item.id, bytes); } catch (error) { /* made again on its first save */ }
      const opened = await openInEditor(item).catch(() => ({ ok: false }));
      if (typeof renderProjectDisks === 'function') { try { renderProjectDisks(); } catch (error) { /* repaints on the next render */ } }
      if (typeof renderDocuments === 'function') { try { renderDocuments(); } catch (error) { /* repaints on the next render */ } }
      status(tr('office_new_created', item.name));
      return { ok: true, item, opened: opened.ok !== false };
    } catch (error) {
      const failure = String((error && error.message) || error);
      status(tr('office_new_failed', name, failure));
      return { ok: false, reason: 'store-failed', message: failure };
    }
  }

  /* ----------------------------------------------------------- the System 6 dialog */

  // The dialog is built here, not in index.html: the boot budget counts every
  // byte of the page, and this surface exists only once a writer asks for it.
  function ensureDialog() {
    let dialog = document.getElementById('office-new-modal');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'office-new-modal';
    dialog.className = 'finder-operation-modal office-new-modal';
    const form = document.createElement('form');
    form.method = 'dialog';
    const body = document.createElement('section');
    body.className = 'finder-operation-body';
    const title = document.createElement('h2');
    title.dataset.i18n = 'office_new_title';
    body.append(title);
    const lede = document.createElement('p');
    lede.className = 'finder-operation-lede';
    lede.dataset.i18n = 'office_new_lede';
    body.append(lede);
    const blanks = document.createElement('fieldset');
    blanks.className = 'office-new-choices';
    const blanksLegend = document.createElement('legend');
    blanksLegend.dataset.i18n = 'office_new_section_blank';
    blanks.append(blanksLegend);
    for (const format of FORMATS) {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.marginBlock = '4px';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'office-new-choice';
      radio.value = format;
      const text = document.createElement('span');
      text.dataset.i18n = `office_new_blank_${format}`;
      label.append(radio, ' ', text);
      blanks.append(label);
    }
    body.append(blanks);
    const padsField = document.createElement('fieldset');
    padsField.className = 'office-new-stationery';
    const padsLegend = document.createElement('legend');
    padsLegend.dataset.i18n = 'office_new_section_stationery';
    padsField.append(padsLegend);
    const padsList = document.createElement('div');
    padsList.dataset.officeNewPads = '';
    padsField.append(padsList);
    body.append(padsField);
    const actions = document.createElement('div');
    actions.className = 'button-row finder-operation-actions';
    const cancel = document.createElement('button');
    cancel.type = 'submit';
    cancel.value = 'cancel';
    cancel.className = 'btn';
    cancel.dataset.i18n = 'cancel';
    const create = document.createElement('button');
    create.type = 'submit';
    create.value = 'ok';
    create.className = 'btn default';
    create.dataset.i18n = 'office_new_create';
    actions.append(cancel, create);
    form.append(body, actions);
    dialog.append(form);
    document.body.append(dialog);
    applyLanguageToDialog(dialog);
    return dialog;
  }

  // A window built after the boot sweep translates itself through the scoped
  // helper, never through applyLanguage() (that one re-renders half the desk).
  function applyLanguageToDialog(dialog) {
    if (typeof translateWithin === 'function') {
      translateWithin(dialog);
      return;
    }
    dialog.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = tr(element.dataset.i18n); });
  }

  function officeStationeryPads() {
    const files = typeof chatFiles !== 'undefined' && Array.isArray(chatFiles) ? chatFiles : [];
    const active = typeof isInActiveProject === 'function'
      ? (file) => isInActiveProject(file)
      : (file) => file && file.projectId === (typeof activeProjectId !== 'undefined' ? activeProjectId : '');
    return files.filter((file) => file && file.type === 'office' && file.stationery === true && active(file));
  }

  /**
   * The 新建 dialog: three blanks plus this project's Office stationery pads,
   * the format of the app in front preselected. Resolves
   * { kind: "blank", format } | { kind: "stationery", fileId } | null.
   */
  function askChoice(defaultFormat) {
    const dialog = ensureDialog();
    const chosen = FORMATS.includes(defaultFormat) ? defaultFormat : 'docx';
    dialog.querySelectorAll('input[name="office-new-choice"]').forEach((radio) => {
      radio.checked = radio.value === chosen;
    });
    const padsList = dialog.querySelector('[data-office-new-pads]');
    padsList.replaceChildren();
    const pads = officeStationeryPads();
    if (!pads.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.dataset.i18n = 'office_new_no_stationery';
      empty.textContent = tr('office_new_no_stationery');
      padsList.append(empty);
    } else {
      pads.forEach((pad) => {
        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.marginBlock = '4px';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'office-new-choice';
        radio.value = `stationery:${pad.id}`;
        const text = document.createElement('span');
        text.textContent = pad.name;
        label.append(radio, ' ', text);
        padsList.append(label);
      });
    }
    if (typeof closeMenus === 'function') closeMenus();
    if (typeof playSystemSound === 'function') { try { playSystemSound('save'); } catch (error) { /* a sound is a courtesy */ } }
    document.body.classList.add('has-system-modal');
    if (typeof modalScrim !== 'undefined' && modalScrim) modalScrim.classList.remove('is-hidden');
    return new Promise((resolve) => {
      const settle = () => {
        dialog.onclose = null;
        const value = dialog.querySelector('input[name="office-new-choice"]:checked')?.value || chosen;
        document.body.classList.remove('has-system-modal');
        if (typeof modalScrim !== 'undefined' && modalScrim) modalScrim.classList.add('is-hidden');
        // The form's method=dialog submit closes with the pressed button's
        // value; anything else (Cancel, the close box, Escape) is a no.
        resolve(dialog.returnValue === 'ok'
          ? (value.startsWith('stationery:')
            ? { kind: 'stationery', fileId: value.slice('stationery:'.length) }
            : { kind: 'blank', format: value })
          : null);
      };
      dialog.onclose = settle;
      if (dialog.open) dialog.close('cancel');
      dialog.showModal();
      dialog.querySelector(`input[value="${chosen}"]`)?.focus();
    });
  }

  /**
   * 新建… / 新建 Office 文稿…: open the dialog, then make what it names. A
   * blank goes to createBlank; a stationery pad opens as its 未命名 copy
   * through the same helper the Finder's open uses.
   */
  async function open(defaultFormat) {
    const choice = await askChoice(defaultFormat || defaultFormatForFrontApp());
    if (!choice) return { ok: false, reason: 'cancelled' };
    if (choice.kind === 'blank') return createBlank(choice.format, { folderId: finderTargetFolderId() });
    const files = typeof chatFiles !== 'undefined' ? chatFiles : [];
    const pad = files.find((file) => file && file.id === choice.fileId && file.type === 'office');
    if (!pad) return { ok: false, reason: 'missing-pad' };
    if (typeof ensureFinderObjectsModule === 'function') await ensureFinderObjectsModule().catch(() => {});
    if (typeof openProjectFileWithStationery !== 'function') return { ok: false, reason: 'stationery-unavailable' };
    const copy = await openProjectFileWithStationery(pad);
    return copy ? { ok: true, item: copy } : { ok: false, reason: 'copy-failed' };
  }

  // The folder the Finder is showing, where the Finder's own 新建 lands;
  // an editor's 新建 starts at the top of the Project Hard Disk.
  function finderTargetFolderId() {
    if (typeof activeAppId === 'undefined' || activeAppId !== 'finder') return null;
    if (typeof getCurrentFinderParentId !== 'function') return null;
    try { return getCurrentFinderParentId(); } catch (error) { return null; }
  }

  /* ------------------------------------------------------------ 存为文具… */

  function frontOfficeFileId() {
    const surfaces = [root.AISystem6ClioWrite, root.AISystem6ClioChartWorkbook, root.AISystem6ClioStageNative];
    for (const surface of surfaces) {
      const mountedName = surface?.current?.()?.mountedName || '';
      if (!mountedName || !root.AISystem6NativeBinaries) continue;
      const record = root.AISystem6NativeBinaries.recordFor(mountedName);
      if (record && record.source && record.source.kind === 'project') return record.source.fileId;
    }
    return '';
  }

  /**
   * 存为文具…: mark an Office document as a stationery pad — the same flag the
   * Get Info checkbox writes. With no fileId, the document in the front editor.
   */
  async function saveAsStationery(fileId = '') {
    await ensureStore();
    const id = String(fileId || '') || frontOfficeFileId();
    const files = typeof chatFiles !== 'undefined' ? chatFiles : [];
    const item = files.find((file) => file && file.id === id && file.type === 'office');
    if (!item) {
      status(tr('office_stationery_need_document'));
      return { ok: false, reason: 'no-document' };
    }
    item.stationery = true;
    item.updatedAt = new Date().toISOString();
    const saved = typeof saveDeskState === 'function' ? await saveDeskState() : true;
    if (saved && typeof renderProjectDisks === 'function') { try { renderProjectDisks(); } catch (error) { /* repaints on the next render */ } }
    if (saved && typeof renderDocuments === 'function') { try { renderDocuments(); } catch (error) { /* repaints on the next render */ } }
    status(saved ? tr('stationery_enabled', item.name) : tr('office_stationery_unsaved', item.name));
    return { ok: saved !== false, item };
  }

  // The desk's two commands (actions.js loads this module on demand through
  // registerLazyCommand): the handlers live here with the codecs they drive.
  if (root.AISystem6Runtime && typeof root.AISystem6Runtime.registerCommand === 'function') {
    root.AISystem6Runtime.registerCommand('new-office-document', {
      handler: () => open(defaultFormatForFrontApp()),
      isAvailable: () => true,
    });
    // Grey until an Office document is open in one of the three editors.
    root.AISystem6Runtime.registerCommand('office-save-as-stationery', {
      handler: () => saveAsStationery(),
      isAvailable: () => !!frontOfficeFileId(),
    });
  }

  root.AISystem6OfficeNew = Object.freeze({ open, createBlank, saveAsStationery });
})(typeof window !== 'undefined' ? window : globalThis);
