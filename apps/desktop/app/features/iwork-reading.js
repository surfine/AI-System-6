/* ClioWorks N9 — iWork 静态阅读 + 建副本 (lazy).
 *
 * The server importer owns both conversions (apps/server/server/importers/
 * iwork.js and iwork-convert.js); this module is only the desk's side of the
 * wire:
 *   - openPages: an open Pages/Numbers/Keynote file in Reader gets its
 *     QuickLook preview PDF from the server and hands it to Reader's own
 *     original-page view (features/reader-pages.js, pdf.js legacy); a
 *     conversion that fails leaves the text view on screen with a bar that
 *     says what to do instead (open it in Pages/Numbers/Keynote, or export
 *     a PDF). No iWork rendering happens in the browser.
 *   - makeOfficeCopy: the Reader menu's 「建副本…」 asks the same importer
 *     for the Office counterpart (Pages→docx, Numbers→xlsx, Keynote→pptx),
 *     shows the first-save list — what the copy carries and the lossy items
 *     the importer could actually see — and only on 存副本 writes it through
 *     the N0 channel (core/native-binaries.js createProjectDocument) and
 *     opens it in ClioWrite / ClioChart / ClioStage. The iWork original is
 *     read-only and stays where it is; nothing writes the iWork formats back.
 *
 * Lazy module — config.js's ensureIworkReadingModule loads it on the first
 * iWork original-page view or 建副本 command, never at boot. The original
 * File objects live in reader.js's readerIworkSources for the session only.
 * No UI chrome here beyond the one failure bar and the System 6 modal; every
 * user-facing string lives in the two translation files. */
(function (root) {
  'use strict';

  const KIND_BY_EXT = { pages: 'pages', numbers: 'numbers', key: 'keynote' };

  function kindFor(fileName) {
    const ext = (String(fileName || '').match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
    return KIND_BY_EXT[ext] || '';
  }

  function appName(fileName) {
    const kind = kindFor(fileName);
    return kind ? root.t(kind === 'pages' ? 'iwork_app_pages' : kind === 'numbers' ? 'iwork_app_numbers' : 'iwork_app_keynote') : '';
  }

  function base64ToBytes(base64) {
    const binary = atob(String(base64 || ''));
    const out = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
    return out;
  }

  function sources() {
    return typeof readerIworkSources !== 'undefined' ? readerIworkSources : null;
  }

  async function convert(original, target) {
    const data = typeof arrayBufferToBase64 === 'function'
      ? arrayBufferToBase64(await original.arrayBuffer())
      : '';
    const response = await root.AISystem6Capabilities.requestService('artifact.import.iwork', {
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: original.name, type: '', target, data }),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.detail || payload.error || 'conversion failed');
      error.code = payload.code || '';
      throw error;
    }
    return payload;
  }

  /* ---------------------------------------------------------- 原页阅读 */

  const pdfPromises = new Map();

  function failureBar(page, errorCode) {
    const host = typeof readerContentEl !== 'undefined' ? readerContentEl : null;
    if (!host || host.querySelector('.reader-pages-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'reader-pages-bar';
    const note = document.createElement('span');
    note.textContent = root.t(
      errorCode === 'iwork_no_preview_pdf' ? 'iwork_pages_no_preview' : 'iwork_pages_failed',
      appName(page.fileName)
    );
    bar.append(note);
    host.prepend(bar);
  }

  async function pdfFileFor(page) {
    const key = `${typeof activeProjectId !== 'undefined' ? activeProjectId : ''}::${page.fileName}`;
    let promise = pdfPromises.get(key);
    if (!promise) {
      promise = (async () => {
        const original = sources()?.get(key);
        if (!original) throw Object.assign(new Error('original file is gone'), { code: 'iwork_original_gone' });
        const payload = await convert(original, 'pdf');
        const bytes = base64ToBytes(payload.pdf);
        if (!bytes.byteLength) throw Object.assign(new Error('empty PDF'), { code: 'iwork_no_preview_pdf' });
        const file = new File([bytes], `${String(page.fileName || 'document').replace(/\.[^.]+$/, '')}.pdf`, { type: 'application/pdf' });
        if (typeof readerPdfSources !== 'undefined') readerPdfSources.set(key, file);
        return file;
      })();
      pdfPromises.set(key, promise);
      promise.catch(() => pdfPromises.delete(key));
    }
    return promise;
  }

  async function openPages({ page, jump }) {
    try {
      const file = await pdfFileFor(page);
      await ensureReaderPagesModule();
      if (typeof currentReaderPage !== 'undefined' && currentReaderPage === page) {
        await window.AISystem6ReaderPages.show(file, page, jump);
      }
    } catch (error) {
      if (typeof console !== 'undefined') console.warn('iWork original pages unavailable:', error?.code || error?.message);
      failureBar(page, error?.code || '');
    }
  }

  /* ----------------------------------------------------------- 建副本 */

  const LOSS_KEYS = {
    iwork_loss_layout: 'iwork_loss_layout',
    iwork_loss_media: 'iwork_loss_media',
    iwork_loss_formulas: 'iwork_loss_formulas',
    iwork_loss_slide_design: 'iwork_loss_slide_design',
  };

  function lossName(item, report) {
    const key = LOSS_KEYS[item] || item;
    if (key === 'iwork_loss_media') return root.t(key, report?.mediaObjects || 0);
    return root.t(key);
  }

  /** The first-save list, one line per fact. Pure so a contract can read it. */
  function firstSaveMessage(report, fileName) {
    const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);
    const carried = report?.kind === 'pages'
      ? tr('iwork_copy_carried_pages', report.paragraphs || 0)
      : report?.kind === 'numbers'
        ? tr('iwork_copy_carried_numbers', report.tables || 0, report.rows || 0)
        : report?.kind === 'keynote'
          ? tr('iwork_copy_carried_keynote', report.slides || 0)
          : '';
    const lost = (report?.notCarried || []).map((item) => lossName(item, report));
    return [
      tr('iwork_copy_first_save_title', fileName || ''),
      carried,
      tr('iwork_copy_lost_title', lost.length),
      lost.join(tr('iwork_copy_list_separator')),
      tr('iwork_copy_note'),
    ].filter(Boolean).join('\n');
  }

  /** The failure line for a conversion the server refused or could not do.
   * The server's detail strings are for the log; the writer gets the desk's
   * own copy, keyed by the route's error code. */
  function convertFailureKey(error) {
    if (error?.code === 'IWORK_CONVERT_EMPTY' || error?.code === 'IWORK_UNSUPPORTED_NAME') return 'iwork_copy_failed_empty';
    return 'iwork_copy_failed';
  }

  async function makeOfficeCopy() {
    const page = typeof currentReaderPage !== 'undefined' ? currentReaderPage : null;
    const fileName = page?.fileName || '';
    const projectId = typeof activeProjectId !== 'undefined' ? activeProjectId : null;
    const original = sources()?.get(`${projectId}::${fileName}`);
    if (!original) {
      if (typeof setStatus === 'function') setStatus(root.t('iwork_copy_needs_original'));
      return null;
    }

    if (typeof setStatus === 'function') setStatus(root.t('iwork_copy_converting'));
    let converted;
    try {
      converted = await convert(original, 'office');
    } catch (error) {
      if (typeof setStatus === 'function') setStatus(root.t(convertFailureKey(error), appName(fileName)));
      return null;
    }

    // The first-save list asks before anything is written; Cancel writes nothing.
    const answer = typeof root.showSystemModal === 'function'
      ? await root.showSystemModal(firstSaveMessage(converted.report, converted.fileName), 'confirm', {
        defaultAction: 'cancel',
        confirmKey: 'iwork_copy_save_button',
        reading: true,
      })
      : 'cancel';
    if (answer !== 'yes') {
      if (typeof setStatus === 'function') setStatus(root.t('iwork_copy_canceled'));
      return null;
    }

    let item = null;
    try {
      if (typeof ensureNativeBinariesModule === 'function') await ensureNativeBinariesModule();
      const store = root.AISystem6NativeBinaries;
      if (!store?.createProjectDocument) throw new Error('the native store is unavailable');
      item = await store.createProjectDocument({
        projectId,
        name: converted.fileName,
        format: converted.format,
        bytes: base64ToBytes(converted.data),
      });
    } catch (error) {
      if (typeof console !== 'undefined') console.warn('iWork copy save failed:', error?.message);
      if (typeof setStatus === 'function') setStatus(root.t('iwork_copy_save_failed', item?.name || converted.fileName));
      return null;
    }

    // The same native-host open the Finder uses: docx → ClioWrite, xlsx →
    // ClioChart, pptx → ClioStage, each through its real adapter. A copy that
    // saved but could not open still saved: say that, never imply a loss.
    let opened = null;
    let openError = null;
    try {
      if (typeof ensureClioWorksLedgerModule === 'function') await ensureClioWorksLedgerModule();
      opened = await root.AISystem6ClioWorks?.openNativeDocument?.(item);
    } catch (error) {
      openError = error;
      if (typeof console !== 'undefined') console.warn('iWork copy saved but not opened:', error?.message);
    }
    if (typeof setStatus === 'function') {
      setStatus(openError || !opened || opened.ok === false
        ? root.t('iwork_copy_saved_unopened', item?.name || converted.fileName)
        : root.t('iwork_copy_saved', item?.name || converted.fileName));
    }
    return item;
  }

  root.AISystem6IworkReading = Object.freeze({
    openPages,
    makeOfficeCopy,
    firstSaveMessage,
    kindFor,
  });
})(typeof window !== 'undefined' ? window : globalThis);
