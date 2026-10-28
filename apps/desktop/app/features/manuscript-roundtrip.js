/* ClioWorks N14 (UI half): the 送审 dialog (TeachText File › 送审…) and the
 * 回稿 windoid (Review Desk Commands › 回稿…). The engine — round naming,
 * manuscript cleaning, paragraph alignment — is vendor/clioworks-v3/
 * manuscript-roundtrip.js, which loads first in the same loader
 * (config.js ensureManuscriptRoundTripModule); this file holds no model code.
 *
 * What the two surfaces do, and deliberately stop at:
 *  - 送审 asks 送给谁, names the round from the 来回 folder's own files, shows
 *    exactly what goes into the .docx and what never does (AI traces, review
 *    marks, version history), then stores 「<标题>-送审-第N轮.docx」 on the
 *    Project Hard Disk through the N0 store (storage confirmed before the
 *    download leaves) and downloads it through saveArtifact. Replies the
 *    writer left on a 回稿 ride along as Word comments through word-export's
 *    findings pipeline (N8's record; no comment renderer of its own).
 *  - 回稿 picks the .docx the other side changed, pairs it with the latest
 *    same-title send round, aligns paragraph by paragraph, and stores the
 *    ORIGINAL bytes as 「<标题>-回稿-第N轮.docx」. It shows one summary line.
 *    It never touches the manuscript: per-paragraph candidates, the message
 *    column and the three-way compare are N8's work.
 *
 * System 6 originals only: the dialog reuses the finder-operation-modal
 * pattern (office-new.js precedent), the windoid the shared .windoid classes
 * (styles/84-windoid.css, riding the ClioWrite lazy sheet), the file picker a
 * native input behind the Choose button. Strings live in the two translation
 * files and pass through t(). Desk globals (chatFiles, the lazy loaders) are
 * lexical bindings of other classic scripts, so they are read bare behind
 * typeof guards, never as window properties. */
(function (root) {
  'use strict';
  if (root.AISystem6ManuscriptRoundTripUI) return;

  const ENGINE = root.AISystem6ManuscriptRoundTrip;
  const RECIPIENT_KEY = 'ai-system6-roundtrip-recipient';
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);
  const status = (text) => { if (typeof setStatus === 'function') setStatus(text); };

  function h(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of [].concat(children)) if (child != null) node.append(child.nodeType ? child : document.createTextNode(String(child)));
    return node;
  }

  /* ------------------------------------------------- the 来回 folder, as it is */

  function activeProjectIdOf() {
    return typeof activeProjectId !== 'undefined' ? activeProjectId : '';
  }

  function roundFolder(projectId) {
    const folders = typeof chatFolders !== 'undefined' && Array.isArray(chatFolders) ? chatFolders : [];
    const display = (value) => (typeof displayFolderName === 'function' ? displayFolderName(value) : value);
    return folders.find((folder) => folder && folder.projectId === projectId && !folder.parentId
      && (String(folder.name || '') === ENGINE.ROUND_FOLDER_NAME
        || String(display(folder.name) || '') === ENGINE.ROUND_FOLDER_NAME)) || null;
  }

  function roundFolderFiles(projectId) {
    const folder = roundFolder(projectId);
    if (!folder) return [];
    return (typeof chatFiles !== 'undefined' && Array.isArray(chatFiles) ? chatFiles : [])
      .filter((file) => file && file.projectId === projectId && file.folderId === folder.id);
  }

  function currentManuscript() {
    const body = typeof teachTextBodyInput !== 'undefined' ? teachTextBodyInput : null;
    if (!body || !String(body.value || '').trim()) return null;
    return {
      markdown: String(body.value || ''),
      name: typeof getTeachTextDocumentName === 'function' ? getTeachTextDocumentName() : '',
    };
  }

  /* ------------------------------------------------------------- 送审 dialog */

  let sendDialog = null;

  function applyLanguageToDialog(dialog) {
    if (typeof translateWithin === 'function') {
      translateWithin(dialog);
      return;
    }
    dialog.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = tr(element.dataset.i18n); });
  }

  function ensureSendDialog() {
    if (sendDialog) return sendDialog;
    const dialog = h('dialog', { id: 'manuscript-roundtrip-send-modal', class: 'finder-operation-modal' });
    const form = h('form', { method: 'dialog' });
    const body = h('section', { class: 'finder-operation-body' });
    body.append(h('h2', { 'data-i18n': 'roundtrip_send_title' }));

    const recipientInput = h('input', { id: 'roundtrip-recipient', type: 'text', autocomplete: 'off', style: 'flex:1;min-width:0;' });
    const recipientRow = h('label', { for: 'roundtrip-recipient', style: 'display:flex;gap:6px;align-items:center;margin-block:5px;' }, [
      h('span', { text: '', 'data-i18n': 'roundtrip_send_recipient', style: 'flex:none;' }),
      recipientInput,
    ]);
    body.append(recipientRow);

    const roundRow = h('p', { style: 'margin-block:6px;display:flex;gap:8px;align-items:baseline;' }, [
      h('b', { id: 'roundtrip-round-label' }),
      h('span', { id: 'roundtrip-round-previous' }),
    ]);
    const includeBody = h('input', { type: 'checkbox', id: 'roundtrip-include-body', checked: true });
    const bodyRow = h('label', { for: 'roundtrip-include-body', style: 'display:block;margin-block:5px;' }, [
      includeBody, ' ', h('span', { 'data-i18n': 'roundtrip_send_body' }),
    ]);
    const includeCitations = h('input', { type: 'checkbox', id: 'roundtrip-include-citations', checked: true });
    const citationsLabel = h('span', { id: 'roundtrip-citations-label' });
    const citationsRow = h('label', { for: 'roundtrip-include-citations', style: 'display:block;margin-block:5px;' }, [
      includeCitations, ' ', citationsLabel,
    ]);
    body.append(roundRow, bodyRow, citationsRow);
    body.append(h('p', { class: 'finder-operation-lede', 'data-i18n': 'roundtrip_send_excluded' }));
    body.append(h('p', { id: 'roundtrip-unresolved', class: 'finder-operation-lede', hidden: true, role: 'status' }));
    body.append(h('p', { style: 'margin-block:6px;word-break:break-all;' }, [
      h('span', { 'data-i18n': 'roundtrip_send_store_to', style: 'margin-inline-end:6px;' }),
      h('span', { id: 'roundtrip-path' }),
    ]));

    const actions = h('div', { class: 'button-row finder-operation-actions' });
    const cancel = h('button', { type: 'submit', value: 'cancel', class: 'btn', 'data-i18n': 'cancel' });
    const ok = h('button', { type: 'submit', value: 'ok', class: 'btn default', id: 'roundtrip-send-ok', 'data-i18n': 'roundtrip_send_save_download' });
    actions.append(cancel, ok);
    form.append(body, actions);
    dialog.append(form);
    document.body.append(dialog);
    // The dialog is built once and reopened; the wire is too. A send with no
    // body has nothing to carry, so the box's state gates the OK button.
    const syncOk = () => { ok.disabled = !includeBody.checked; };
    includeBody.addEventListener('change', syncOk);
    applyLanguageToDialog(dialog);
    sendDialog = dialog;
    return dialog;
  }

  /** The plan, the dialog, and the export — one 送审 from menu row to download. */
  async function openSendReview() {
    const manuscript = currentManuscript();
    if (!manuscript) {
      status(tr('no_document_export'));
      return false;
    }
    const projectId = activeProjectIdOf();
    const folderFiles = roundFolderFiles(projectId);
    const folderNames = folderFiles.map((file) => String(file.name || ''));
    const sources = typeof buildSourceBibliography === 'function' ? buildSourceBibliography(manuscript.markdown) : [];
    const plan = ENGINE.planSendReview({
      markdown: manuscript.markdown,
      documentName: manuscript.name,
      folderFileNames: folderNames,
      sources,
    });

    const dialog = ensureSendDialog();
    let lastRecipient = '';
    try { lastRecipient = localStorage.getItem(RECIPIENT_KEY) || ''; } catch (error) { /* a preference, not a fact */ }
    const recipientInput = dialog.querySelector('#roundtrip-recipient');
    recipientInput.value = lastRecipient;
    const previousFile = plan.previousRound
      ? folderFiles.find((file) => String(file.name || '') === ENGINE.sendFileName(plan.title, plan.previousRound))
      : null;
    const previousDate = previousFile?.createdAt ? String(previousFile.createdAt).slice(5, 10) : '';
    dialog.querySelector('#roundtrip-round-label').textContent = tr('roundtrip_send_round', plan.round);
    dialog.querySelector('#roundtrip-round-previous').textContent = plan.previousRound
      ? tr('roundtrip_send_round_previous', plan.previousRound, previousDate)
      : '';
    dialog.querySelector('#roundtrip-citations-label').textContent = tr('roundtrip_send_citations', plan.footnotes.length);
    const unresolvedLine = dialog.querySelector('#roundtrip-unresolved');
    unresolvedLine.hidden = !plan.unresolvedMarks.length;
    unresolvedLine.textContent = plan.unresolvedMarks.length
      ? tr('roundtrip_send_unresolved', plan.unresolvedMarks.length, plan.unresolvedMarks.join('、'))
      : '';
    dialog.querySelector('#roundtrip-path').textContent = tr('roundtrip_send_path', ENGINE.ROUND_FOLDER_NAME, plan.fileName);
    const includeBody = dialog.querySelector('#roundtrip-include-body');
    const includeCitations = dialog.querySelector('#roundtrip-include-citations');
    includeBody.checked = true;
    includeCitations.checked = true;
    const okButton = dialog.querySelector('#roundtrip-send-ok');
    okButton.disabled = !includeBody.checked;

    if (typeof closeMenus === 'function') closeMenus();
    document.body.classList.add('has-system-modal');
    if (typeof modalScrim !== 'undefined' && modalScrim) modalScrim.classList.remove('is-hidden');
    const choice = await new Promise((resolve) => {
      const settle = () => {
        dialog.onclose = null;
        document.body.classList.remove('has-system-modal');
        if (typeof modalScrim !== 'undefined' && modalScrim) modalScrim.classList.add('is-hidden');
        // method=dialog submits with the pressed button's value; anything else
        // (Cancel, the close box, Escape) is a no.
        resolve(dialog.returnValue === 'ok'
          ? { recipient: recipientInput.value.trim(), includeCitations: includeCitations.checked }
          : null);
      };
      dialog.onclose = settle;
      if (dialog.open) dialog.close('cancel');
      dialog.showModal();
      recipientInput.focus();
    });
    if (!choice) return false;
    try { localStorage.setItem(RECIPIENT_KEY, choice.recipient); } catch (error) { /* a preference, not a fact */ }

    const finalPlan = choice.includeCitations
      ? plan
      : ENGINE.planSendReview({
        markdown: manuscript.markdown,
        documentName: manuscript.name,
        folderFileNames: folderNames,
        convertCitations: false,
      });
    return sendReviewDocument(finalPlan, choice.recipient);
  }

  /**
   * Build the .docx with the shared headless pipeline (one token stream, no
   * preview), store it in 来回, and download only after the store confirmed.
   * word-export.js is used as-is; nothing here edits it.
   */
  async function sendReviewDocument(plan, recipient) {
    const projectId = activeProjectIdOf();
    if (!projectId || typeof getActiveProject !== 'function' || !getActiveProject()) {
      status(tr('no_project_mounted'));
      return false;
    }
    if (typeof ensureWordExportModule === 'function') await ensureWordExportModule();
    const word = root.AISystem6WordExport;
    if (!word || typeof parseMarkdownDocument !== 'function') {
      status(tr('roundtrip_send_failed'));
      return false;
    }
    const model = parseMarkdownDocument(plan.markdown);
    const inspection = word.inspectWordDocumentStructure(model.tokens);
    if (!inspection.ok) {
      status(tr('word_export_refused') + ' '
        + inspection.problems.map((problem) => tr(`word_export_problem_${problem.code}`, problem.detail)).join('；'));
      return false;
    }
    // N8: replies the writer left on a 回稿 and that round has not yet carried
    // back ride the existing findings pipeline as Word comments (word-export's
    // own renderer; nothing here builds a second one). A reply the pipeline
    // cannot anchor is reported by its plan and stays pending on the record.
    let replyFindings = [];
    try {
      if (typeof ensureRoundtripReviewModule === 'function') await ensureRoundtripReviewModule();
      replyFindings = root.AISystem6RoundtripReview?.pendingReplyFindings?.() || [];
    } catch (error) { /* replies ride only when the 回稿 tab's module can load */ }
    // buildWordDocumentPackage answers { parts, comments }; the package is
    // packed from .parts (exportDocumentAsWord's own shape).
    const built = word.buildWordDocumentPackage(model.tokens, {}, {
      title: plan.title,
      language: typeof currentLanguage !== 'undefined' && currentLanguage === 'zh' ? 'zh' : 'en',
      commentAuthor: tr('review_comment_writer'),
      savedAt: new Date().toISOString(),
    }, replyFindings.length ? { findings: replyFindings } : {});
    const bytes = await word.packWordDocument(built.parts);

    if (typeof ensureNativeBinariesModule === 'function') await ensureNativeBinariesModule();
    const store = root.AISystem6NativeBinaries;
    if (!store) {
      status(tr('roundtrip_send_failed'));
      return false;
    }
    let item = null;
    try {
      item = await store.createProjectDocument({
        projectId,
        name: plan.fileName,
        folderName: ENGINE.ROUND_FOLDER_NAME,
        format: 'docx',
        bytes,
      });
    } catch (error) {
      console.warn('AI System 6: storing the send-review document failed.', error);
      status(tr('roundtrip_send_failed'));
      return false;
    }
    if (!item) {
      status(tr('roundtrip_send_failed'));
      return false;
    }
    // 存储成功才下载；item.name is the store's own word (a same-name sibling
    // dedupes it), so what downloads is exactly what was stored.
    if (typeof root.AISystem6WebPlatform?.saveArtifact === 'function') {
      root.AISystem6WebPlatform.saveArtifact({
        blob: new Blob([bytes], { type: DOCX_MIME }),
        fileName: item.name,
        mimeType: DOCX_MIME,
      });
    }
    // Only the replies the pipeline actually placed are marked carried; the
    // skipped ones (an anchor the manuscript no longer holds) stay pending on
    // the 回稿 record, visibly waiting for the writer.
    if (replyFindings.length) {
      const skippedNotes = new Set((built.comments?.skipped || []).map((entry) => String(entry.note || '')));
      const carried = replyFindings.map((finding) => String(finding.note || '')).filter((note) => note && !skippedNotes.has(note));
      root.AISystem6RoundtripReview?.markRepliesCarried?.(item.name, carried);
    }
    status(tr('roundtrip_send_saved', item.name, recipient));
    return true;
  }

  /* ------------------------------------------------------- 回稿 import windoid */

  let windoid = null;   // { handle, pairing, file, busy, summary, failure, record }

  // The Quire adapter reads the .docx the other side changed; odf-import.js's
  // on-demand script pattern loads it (the adapter owns its codec list).
  // quire-review.js rides along so revisions() is there to count the other
  // side's tracked changes — its own loader may never have run on the desk.
  let quirePromise = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('manuscript-roundtrip: failed to load ' + src));
      document.head.append(el);
    });
  }
  function ensureQuireAdapter() {
    if (quirePromise) return quirePromise;
    quirePromise = (async () => {
      if (!root.ClioWorksQuireAdapter) await loadScript('app/vendor/clioworks-v3/quire-adapter.js');
      if (typeof root.ClioWorksQuireAdapter?.loadCodec !== 'function') throw new Error('manuscript-roundtrip: the Quire adapter did not install');
      if (!root.ClioWorksQuireReview) await loadScript('app/vendor/clioworks-v3/quire-review.js');
      await root.ClioWorksQuireAdapter.loadCodec();
      return root.ClioWorksQuireAdapter;
    })().catch((error) => {
      quirePromise = null;
      throw error;
    });
    return quirePromise;
  }

  function reviewDeskHost() {
    return document.querySelector('.window[data-window="reviewDesk"] .review-desk-pane');
  }

  function createWindoid(host, { title, onClose }) {
    // The shared windoid frame (styles/84-windoid.css): title bar, close box,
    // body — the same shape clio-write.js draws for its own windoids.
    const rootEl = h('div', { class: 'windoid manuscript-roundtrip-windoid', role: 'dialog', 'aria-label': title });
    const closeBox = h('button', { type: 'button', class: 'windoid-close', 'aria-label': tr('close') });
    const titleEl = h('span', { class: 'windoid-title', text: title });
    const body = h('div', { class: 'windoid-body' });
    rootEl.append(h('div', { class: 'windoid-titlebar' }, [closeBox, titleEl]), body);
    host.append(rootEl);
    host.classList.add('has-windoid');
    let closed = false;
    const place = () => {
      // The shared placement rule when ClioChart's factory already loaded;
      // clio-write.js's fallback pair otherwise. The review desk's reports
      // area is its 「main」, so a floating windoid starts below the bars.
      const width = host.clientWidth || 0;
      const height = host.clientHeight || 0;
      const shared = root.AISystem6Windoid && root.AISystem6Windoid.placement;
      const main = host.querySelector('.review-desk-results');
      const top = main && Number.isFinite(main.offsetTop) ? Math.max(0, main.offsetTop) : 0;
      rootEl.style.setProperty('--windoid-main-top', `${top}px`);
      const fallback = width >= 640 ? 'float-right' : 'swap';
      rootEl.dataset.windoidPlacement = typeof shared === 'function'
        ? (shared(width, height ? height - top - 188 : undefined) || fallback)
        : fallback;
      host.dataset.windoidPlacement = rootEl.dataset.windoidPlacement;
    };
    const handle = {
      root: rootEl,
      body,
      setTitle(text) { titleEl.textContent = text; rootEl.setAttribute('aria-label', text); },
      place,
      close() {
        if (closed) return;
        closed = true;
        rootEl.remove();
        host.classList.remove('has-windoid');
        delete host.dataset.windoidPlacement;
        if (typeof onClose === 'function') onClose();
      },
    };
    closeBox.addEventListener('click', () => handle.close());
    rootEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.stopPropagation();
        handle.close();
      }
    });
    place();
    return handle;
  }

  /** The round a 回稿 would answer now: the latest same-title send in 来回. */
  function currentPairing(projectId) {
    const manuscript = currentManuscript();
    if (!manuscript) return { title: '', send: null, reason: 'no-manuscript' };
    const title = ENGINE.manuscriptTitle(manuscript.markdown, manuscript.name);
    const files = roundFolderFiles(projectId);
    const names = files.map((file) => String(file.name || ''));
    const send = ENGINE.latestSendRound(names, title);
    if (!send) return { title, send: null, reason: 'no-send-round' };
    const item = files.find((file) => String(file.name || '') === send.name) || null;
    return { title, send: { ...send, item }, reason: '' };
  }

  function drawWindoid() {
    if (!windoid) return;
    const { handle, pairing } = windoid;
    handle.body.replaceChildren();
    const busy = !!windoid.busy;
    handle.setTitle(tr('roundtrip_return_title'));

    const pairLine = pairing.send
      ? h('p', { class: 'windoid-note', text: tr('roundtrip_return_paired', pairing.send.name) })
      : pairing.reason === 'no-manuscript'
        ? h('p', { class: 'windoid-empty', text: tr('roundtrip_return_no_manuscript') })
        : h('p', { class: 'windoid-empty', text: tr('roundtrip_return_pair_none', pairing.title) });
    handle.body.append(pairLine);

    // The native file input stays behind its Choose button (repo rule).
    const picker = h('input', { type: 'file', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', style: 'display:none;' });
    picker.addEventListener('change', () => {
      windoid.file = picker.files && picker.files[0] ? picker.files[0] : null;
      windoid.summary = '';
      drawWindoid();
    });
    const choose = h('button', { type: 'button', class: 'btn', text: tr('roundtrip_return_choose'), disabled: busy || !pairing.send });
    choose.addEventListener('click', () => picker.click());
    const chosen = h('span', {
      class: 'windoid-note',
      text: windoid.file ? tr('roundtrip_return_selected', windoid.file.name) : '',
    });
    handle.body.append(h('div', { class: 'windoid-actions' }, [choose, chosen, picker]));

    const importButton = h('button', {
      type: 'button',
      class: 'btn default',
      text: tr('roundtrip_return_import'),
      disabled: busy || !pairing.send || !windoid.file,
    });
    importButton.addEventListener('click', () => importReturn());
    handle.body.append(h('div', { class: 'windoid-actions' }, [importButton]));

    if (windoid.summary) {
      handle.body.append(h('p', { class: 'windoid-note', role: 'status', text: windoid.summary }));
    }
    if (windoid.failure) {
      handle.body.append(h('p', { class: 'windoid-empty', role: 'alert', text: windoid.failure }));
    }
    handle.place();
  }

  /** Commands › 回稿…: raise the windoid on the Review Desk it belongs to. */
  function openReturnImport() {
    if (typeof openWindow === 'function') openWindow('reviewDesk');
    const host = reviewDeskHost();
    if (!host || !ENGINE) return false;
    const projectId = activeProjectIdOf();
    if (windoid) {
      windoid.pairing = currentPairing(projectId);
      windoid.file = null;
      windoid.summary = '';
      windoid.failure = '';
      drawWindoid();
      return true;
    }
    const pairing = currentPairing(projectId);
    const handle = createWindoid(host, {
      title: tr('roundtrip_return_title'),
      onClose: () => { windoid = null; },
    });
    windoid = { handle, pairing, projectId, file: null, summary: '', failure: '', busy: false, record: null };
    drawWindoid();
    return true;
  }

  /**
   * Read the chosen .docx, align it against the paired send round, and store
   * its ORIGINAL bytes as 「回稿-第N轮」. The manuscript is not touched; the
   * rows stay on the record for N8's candidates and message column.
   */
  async function importReturn() {
    if (!windoid || !windoid.file || windoid.busy) return;
    const session = windoid; // the close box stays live while the read runs
    const { pairing, projectId } = session;
    if (!pairing.send || !pairing.send.item) {
      // The round paired by name, but its file row is gone (a hand edit on the
      // Project Hard Disk). That is said aloud, not answered with silence.
      session.failure = tr('roundtrip_return_failed', tr('roundtrip_return_pair_none', pairing.title));
      drawWindoid();
      return;
    }
    session.busy = true;
    session.failure = '';
    drawWindoid();
    try {
      if (typeof ensureNativeBinariesModule === 'function') await ensureNativeBinariesModule();
      const store = root.AISystem6NativeBinaries;
      if (!store) throw new Error('the native document store did not load');
      const sentRow = await store.readDocumentBytes(pairing.send.item.nativeDocumentId);
      if (!sentRow || !sentRow.bytes) throw new Error('the paired send round has no stored bytes');

      const file = session.file; // a reopen mid-read cannot swap the bytes
      const originalBytes = new Uint8Array(await file.arrayBuffer());
      const adapter = await ensureQuireAdapter();
      const sentDoc = await adapter.open(sentRow.bytes, { name: pairing.send.name });
      const returnedDoc = await adapter.open(originalBytes.slice(), { name: file.name });
      const rows = ENGINE.alignParagraphs(sentDoc.paragraphs(), returnedDoc.paragraphs());
      // 修订记录只是辅助标注：tracked changes the reviewer left mark their
      // rows, so N8's candidates can say 落落改了 1 处 rather than re-diffing.
      let revisionCount = 0;
      if (root.ClioWorksQuireReview && typeof root.ClioWorksQuireReview.revisions === 'function') {
        try {
          revisionCount = root.ClioWorksQuireReview.revisions(returnedDoc).length;
        } catch (error) { /* revisions are an aid, not a gate */ }
      }
      const comments = returnedDoc.comments();
      const unplacedComments = ENGINE.attachComments(rows, comments);
      const summary = ENGINE.summarizeReturn(rows, comments.length);

      const item = await store.createProjectDocument({
        projectId,
        name: ENGINE.returnFileName(pairing.title, pairing.send.round),
        folderName: ENGINE.ROUND_FOLDER_NAME,
        format: 'docx',
        bytes: originalBytes,
      });
      if (!item) throw new Error('the return document was not stored');
      session.file = null;
      session.pairing = currentPairing(projectId);
      session.summary = tr('roundtrip_return_saved', pairing.send.round, summary.changedParagraphs, summary.comments);
      // unplaced carries the comments whose anchor paragraph the reviewer
      // deleted; N8 hangs them on the tab's 「未挂上」 group, reported not lost.
      session.record = { rows, summary, revisionCount, item, unplacedComments };
      status(session.summary);
    } catch (error) {
      console.warn('AI System 6: importing the return document failed.', error);
      session.failure = tr('roundtrip_return_failed', String(error && error.message || error));
    } finally {
      session.busy = false;
      // The close box may have closed the windoid mid-read; its handle is
      // gone with it, and a fresh open starts from a clean state.
      if (windoid === session) drawWindoid();
    }
  }

  root.AISystem6ManuscriptRoundTripUI = Object.freeze({
    openSendReview,
    openReturnImport,
    /** The last import's alignment rows and counts, for N8's candidates. */
    lastImport: () => (windoid && windoid.record ? windoid.record : null),
    closeReturnImport() { if (windoid) windoid.handle.close(); },
  });
  root.AISystem6ManuscriptRoundTripUILoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
