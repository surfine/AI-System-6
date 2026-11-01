/* V3-B integration lab: a REAL NativeEditorAdapter + HostMenuPort around TeachText.
 * Loaded ONLY by the clioworks-v3 fixture (?fixture=clioworks-v3&adapter=teachtext).
 * Not referenced by any manifest, route or daily boot path. The adapter wraps the
 * real #teachtext-body engine (textarea + mde overlay + saveTextDocument pipeline),
 * gives it the desk's shared edit-history kernel, and mounts ONLY the actual editing
 * content into the ClioWorks editor node. Commands that are not really wired stay
 * disabled (NOT_WIRED) — no fake success. Before user sign-off the ClioWorks UI must
 * not write real project data; evidence runs use a disposable e2e context. */
(function (root) {
  'use strict';

  function createTeachTextIntegration(hostWindow) {
    const doc = hostWindow.document;
    const body = doc.getElementById('teachtext-body');
    const win = doc.querySelector('[data-window="teachText"]');
    if (!body || !win) throw new Error('teachtext-adapter: #teachtext-body / teachText window missing');

    // The real editing content node: textarea + mde overlay + preview, one unit.
    const container = body.closest('.teachtext-editor-container');
    const nativeStrips = [
      win.querySelector('.teachtext-actions'),
      win.querySelector('.teachtext-desk-strip'),
      win.querySelector('.teachtext-body-label'),
    ].filter(Boolean);

    let disposed = false;
    let mounted = false;
    let applying = false;       // history-driven writes must not record themselves
    // The writing editor (CodeMirror behind the textarea) mirrors edits into the
    // textarea as real input events, but with no beforeinput — so the pre-change
    // snapshot for undo comes from the last known value, not a beforeinput read.
    let lastKnown = body.value;
    const listeners = new Set();
    const state = {
      kind: 'write', documentId: 'teachtext-untitled', sessionId: 'cw3-tt-' + Math.random().toString(36).slice(2, 8),
      generation: 1, editRevision: 0, selectionEpoch: 0,
      readonly: false, composing: false, saving: false, closed: false,
      canUndo: false, canRedo: false,
      supported: ['file.save', 'edit.undo', 'edit.redo'],
    };

    const notify = () => { if (!disposed) listeners.forEach((fn) => { try { fn(); } catch (e) { hostWindow.console?.error?.(e); } }); };
    const syncIdentity = () => {
      const tab = typeof hostWindow.getActiveDocumentTab === 'function' ? hostWindow.getActiveDocumentTab('teachText') : null;
      const id = tab?.backing?.id || tab?.id || 'teachtext-untitled';
      if (id !== state.documentId) { state.documentId = id; state.generation += 1; }
      return tab;
    };
    const syncDerived = () => {
      syncIdentity();
      state.readonly = body.readOnly
        || (typeof hostWindow.manuscriptIsLockedProjection === 'function' && hostWindow.manuscriptIsLockedProjection());
      state.closed = win.classList.contains('is-hidden') || win.classList.contains('is-app-hidden');
      state.canUndo = history.canUndo();
      state.canRedo = history.canRedo();
      // file.export is really wired only while the real Word DOCX pipeline is
      // loaded (V3-E-2 WordCraft); otherwise it stays honestly absent.
      state.supported = hostWindow.AISystem6WordExport && typeof hostWindow.parseMarkdownDocument === 'function'
        ? ['file.save', 'file.export', 'edit.undo', 'edit.redo']
        : ['file.save', 'edit.undo', 'edit.redo'];
    };

    const readSelection = () => ({ start: body.selectionStart, end: body.selectionEnd, dir: body.selectionDirection });
    const restoreSelection = (mark) => {
      if (!mark || typeof mark.start !== 'number') return;
      try { body.setSelectionRange(mark.start, typeof mark.end === 'number' ? mark.end : mark.start, mark.dir === 'backward' ? 'backward' : 'forward'); } catch (e) { /* detached */ }
    };

    function writeBody(snapshot, meta) {
      const value = String(snapshot ?? '');
      if (body.value === value) { lastKnown = value; return; }
      const mark = readSelection();
      applying = true;
      try {
        body.value = value; // facade-patched setter carries the write into CodeMirror
        body.dispatchEvent(new hostWindow.Event('input', { bubbles: true }));
        state.editRevision += 1;
        if (meta && meta.kind !== 'preview') restoreSelection(mark);
      } finally { applying = false; }
      lastKnown = value;
    }

    // The desk's one shared undo kernel (edit-history.js), the same shape every
    // other registered editor uses. TeachText has no registered history today;
    // this wires it in fixture mode only, through the sanctioned pattern.
    const history = root.AISystem6EditHistory.createEditHistory({
      read: () => body.value,
      write: writeBody,
      readSelection,
      writeSelection: restoreSelection,
    });

    const inputLabel = (event) => {
      const type = String(event?.inputType || '');
      if (type.includes('insert')) return 'Typing';
      if (type.includes('delete') || type.includes('deleteBy')) return 'Deleting';
      if (type.includes('history')) return 'Edit';
      return 'Editing';
    };

    const bag = [];
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); bag.push(() => target.removeEventListener(type, fn, opts)); };

    on(body, 'input', (event) => {
      if (applying) { lastKnown = body.value; return; }
      const before = lastKnown;
      lastKnown = body.value;
      if (before !== body.value) {
        history.record(inputLabel(event), before, { group: 'teachtext-typing' });
      }
      state.editRevision += 1;
      syncDerived(); notify();
    });
    on(body, 'compositionstart', () => { state.composing = true; notify(); });
    on(body, 'compositionend', () => { state.composing = false; notify(); });
    on(body, 'keyup', () => { state.selectionEpoch += 1; });
    on(body, 'mouseup', () => { state.selectionEpoch += 1; });
    on(doc, 'selectionchange', () => {
      if (hostWindow.getSelection?.()?.anchorNode && body.contains(hostWindow.getSelection().anchorNode)) state.selectionEpoch += 1;
    });

    const adapter = {
      getContext() { syncDerived(); return { ...state }; },
      async execute(command, options) {
        if (disposed) return { status: 'blocked', code: 'DISPOSED' };
        syncDerived();
        if (state.composing) return { status: 'blocked', code: 'IME_COMPOSING', message: '輸入法組字中，命令延後。' };
        if (options?.signal?.aborted) return { status: 'blocked', code: 'ABORTED' };
        if (command === 'file.save') {
          if (state.readonly) return { status: 'blocked', code: 'READONLY' };
          if (typeof hostWindow.saveTextDocument !== 'function') return { status: 'blocked', code: 'NOT_WIRED', message: '主倉保存管線不可用。' };
          state.saving = true; notify();
          try {
            // promptForFolder:false keeps the save on the real pipeline without
            // opening the host dialog; identity checks are the pipeline's own.
            const ok = await hostWindow.saveTextDocument({ promptForFolder: false });
            if (options?.signal?.aborted) return { status: 'blocked', code: 'ABORTED' };
            return ok ? { status: 'ok' } : { status: 'failed', code: 'SAVE_REFUSED', message: '主倉保存管線未完成保存（無作用中專案或身份改變）。' };
          } catch (error) {
            return { status: 'failed', code: error?.code || 'SAVE_FAILED', message: String(error?.message || error) };
          } finally { state.saving = false; syncDerived(); notify(); }
        }
        if (command === 'edit.undo' || command === 'edit.redo') {
          if (state.readonly) return { status: 'blocked', code: 'READONLY' };
          const undo = command === 'edit.undo';
          if (undo ? !history.canUndo() : !history.canRedo()) {
            return { status: 'blocked', code: undo ? 'NOTHING_TO_UNDO' : 'NOTHING_TO_REDO' };
          }
          (undo ? history.undo() : history.redo());
          syncDerived(); notify();
          return { status: 'ok' };
        }
        if (command === 'file.export') {
          // V3-E-2 WordCraft: the REAL DOCX pipeline (word-export.js builds the
          // Office Open XML package by hand and hands the blob to the host's
          // saveArtifact download). No demo conversion models.
          const word = hostWindow.AISystem6WordExport;
          if (!word || typeof hostWindow.parseMarkdownDocument !== 'function') {
            return { status: 'blocked', code: 'NOT_WIRED', message: '真實 DOCX 產線未載入。' };
          }
          if (!body.value.trim()) return { status: 'blocked', code: 'EMPTY_DOCUMENT', message: '空文檔無可導出內容。' };
          state.saving = true; notify();
          try {
            const model = hostWindow.parseMarkdownDocument(body.value);
            const name = (doc.getElementById('teachtext-name')?.value || '').trim() || 'teachtext';
            const result = await word.exportDocumentAsWord({
              tokens: model.tokens,
              title: name,
              fileName: name,
              savedAt: new Date().toISOString(),
            });
            return result.saved
              ? { status: 'ok' }
              : { status: 'failed', code: 'EXPORT_REFUSED', message: JSON.stringify(result.problems || []).slice(0, 160) };
          } catch (error) {
            return { status: 'failed', code: error?.code || 'EXPORT_FAILED', message: String(error?.message || error) };
          } finally { state.saving = false; syncDerived(); notify(); }
        }
        return { status: 'blocked', code: 'NOT_WIRED', message: '此命令尚未接入真實能力，保持停用。' };
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      // Mount ONLY the actual document editing content. TeachText's own action
      // strips stay hidden while ClioWorks owns the window; dispose puts
      // everything back exactly where it was.
      mountEditor(target) {
        if (mounted) throw new Error('teachtext-adapter: editor already mounted');
        mounted = true;
        const marker = doc.createComment('cw3-teachtext-editor-home');
        const parent = container.parentNode;
        const next = container.nextSibling;
        parent.insertBefore(marker, container);
        const restoreStrips = nativeStrips.map((el) => {
          const prev = el.style.display;
          el.style.display = 'none';
          return () => { el.style.display = prev; };
        });
        const prevContainerStyle = container.getAttribute('style');
        target.append(container);
        container.style.margin = '6px';
        try { body.focus({ preventScroll: true }); } catch (e) { /* detached */ }
        return {
          dispose() {
            if (!mounted) return;
            mounted = false;
            container.style.margin = '';
            if (prevContainerStyle === null) container.removeAttribute('style');
            else container.setAttribute('style', prevContainerStyle);
            if (marker.parentNode) {
              marker.parentNode.insertBefore(container, marker);
              marker.remove();
            } else {
              // The home node disappeared (window rebuilt); put the editor back
              // into the teachText pane so it is never orphaned.
              doc.getElementById('teachtext-form')?.prepend(container);
            }
            restoreStrips.forEach((restore) => restore());
          },
        };
      },
      readSelection,
      restoreSelection,
    };

    // HostMenuPort: the desk's real editor-menu integration is window-manager's
    // registered edit histories (Edit > Undo/Redo, step labels, availability).
    // The facade routes menu undo/redo through the SAME dispatch as the toolbar,
    // per the single-dispatch rule. The 更多 popup is the shared host-material
    // menu (port v3.1: extracted to ClioWorksMoreMenu for all adapters).
    let menuActive = true;
    let registered = false;
    const moreMenu = root.ClioWorksMoreMenu.create(hostWindow);
    const menuPort = {
      bind({ getContext, execute }) {
        const facade = {
          undo: () => execute('edit.undo'),
          redo: () => execute('edit.redo'),
          canUndo: () => getContext().canUndo,
          canRedo: () => getContext().canRedo,
          undoLabel: () => (history.canUndo() ? history.undoLabel() : ''),
          redoLabel: () => (history.canRedo() ? history.redoLabel() : ''),
        };
        if (typeof hostWindow.registerEditHistory === 'function') {
          hostWindow.registerEditHistory('teachText', () => (menuActive ? facade : null));
          registered = true;
        }
        return () => {
          menuActive = false;
          moreMenu.remove();
          if (registered) hostWindow.registerEditHistory('teachText', null);
        };
      },
      openMore: moreMenu.openMore,
    };

    function dispose() {
      if (disposed) return;
      disposed = true;
      menuActive = false;
      moreMenu.remove();
      if (registered && typeof hostWindow.registerEditHistory === 'function') hostWindow.registerEditHistory('teachText', null);
      bag.forEach((off) => { try { off(); } catch (e) { /* gone */ } });
      bag.length = 0;
      listeners.clear();
      history.clear();
    }

    return { adapter, menuPort, history, dispose };
  }

  root.ClioWorksTeachText = Object.freeze({ create: createTeachTextIntegration });
})(typeof window !== 'undefined' ? window : globalThis);
